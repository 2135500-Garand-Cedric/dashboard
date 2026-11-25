import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { localToday } from "@/lib/work-management/date-format";
import { displayAmount } from "@/lib/finance/transactions";
import { activityHref } from "@/lib/finance/activity-links";
import { nextHolidayDate } from "@/lib/holidays";
import { nextBirthdayDate, occasionHref } from "@/lib/calendar-annual";
import {
  SEARCH_KINDS,
  searchReady,
  canonicalQuery,
  type SearchInput,
  type SearchResponse,
  type SearchKind,
  type SearchGroup,
  type SearchResult,
} from "./types";
import { argumentsSQL, resultsSQL, type SearchRow } from "./adapters/shared";
import { tasksSQL, projectsSQL } from "./adapters/work";
import { knowledgeSQL } from "./adapters/knowledge";
import { calendarSQL } from "./adapters/calendar";
import { financeSQL } from "./adapters/finance";
import { peopleSQL, vocabularySQL } from "./adapters/people-vocabulary";

const adapters: Record<SearchKind, string> = {
  tasks: tasksSQL,
  projects: projectsSQL,
  knowledge: knowledgeSQL,
  calendar: calendarSQL,
  finance: financeSQL,
  people: peopleSQL,
  vocabulary: vocabularySQL,
};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const writtenDate = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
function writtenTime(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(value));
}
function label(value: unknown) {
  return text(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toUpperCase());
}

export function searchResult(
  kind: SearchKind,
  row: SearchRow,
  today: string,
  now: Date,
  zone: string,
): SearchResult {
  const e = row.extra;
  const badges: string[] = [];
  let href = "",
    context: string[] = [];
  if (row.archived) badges.push(kind === "people" ? "Inactive" : "Archived");
  if (kind === "tasks" || kind === "projects") {
    href = `/${kind === "tasks" ? "todos" : "projects"}/${row.id}`;
    context = [row.reference, label(e.status), text(e.project)];
    if (text(e.date))
      context.push(`${kind === "tasks" ? "Due" : "Target"} ${writtenDate(text(e.date))}`);
    else if (text(e.at)) context.push(`Due ${writtenTime(text(e.at), zone)}`);
    else if (text(e.occurrence)) context.push(`Occurrence ${writtenDate(text(e.occurrence))}`);
  } else if (kind === "knowledge") {
    href = `/knowledge/${row.id}`;
    context = [label(e.type), text(e.folder)];
  } else if (kind === "people") {
    href = `/settings/people?person=${row.id}`;
    context = [text(e.company), text(e.email)];
  } else if (kind === "vocabulary") {
    href = `/japanese/vocabulary/${row.id}`;
    const readings = [...new Set(text(e.reading).split(" / ").filter(Boolean))].join(" / ");
    context = [text(e.japanese), readings, text(e.category)];
  } else if (kind === "finance") {
    if (row.entity === "statement") {
      href = `/finance/imports/${row.id}`;
      badges.push(e.type === "COMPLETED" ? "Saved statement" : "Draft statement");
      context = [
        text(e.account),
        text(e.date) ? writtenDate(text(e.date)) : "",
        text(e.through) ? `to ${writtenDate(text(e.through))}` : "",
      ];
    } else {
      href = activityHref(row.id, text(e.type));
      const typeLabel = e.type === "REFUND" ? "Refund / reimbursement" : label(e.type);
      badges.push(typeLabel);
      context = [
        text(e.date) ? writtenDate(text(e.date)) : "",
        text(e.account),
        displayAmount(text(e.amount), text(e.currency)),
        text(e.category),
      ];
    }
  } else if (row.entity === "event") {
    href = `/events/${row.id}`;
    badges.push(e.type === "WORK_SESSION" ? "Work session" : "Event");
    if (e.completed) badges.push("Completed");
    if (text(e.date)) {
      context = [writtenDate(text(e.date))];
      if (text(e.through) ? text(e.through) <= today : text(e.date) < today) badges.push("Past");
    } else if (text(e.at)) {
      context = [writtenTime(text(e.at), zone)];
      if (new Date(text(e.endAt) || text(e.at)) < now) badges.push("Past");
    } else badges.push("Unscheduled");
  } else {
    let date: string | null;
    if (row.entity === "birthday") {
      date = nextBirthdayDate(Number(e.month), Number(e.day), today);
      badges.push("Birthday");
    } else {
      date = nextHolidayDate(
        {
          country: text(e.country),
          state: text(e.state),
          region: text(e.region),
          rule: text(e.rule),
          options: e.options as Record<string, never>,
        },
        today,
      );
      badges.push(
        e.type === "bank" ? "Bank holiday" : e.type === "important" ? "Important date" : "Holiday",
      );
    }
    href = date ? occasionHref(row.entity, row.id, date) : "/settings/holidays";
    context = [date ? `Next ${writtenDate(date)}` : "No upcoming occurrence"];
  }
  if (e.repeats) badges.push("Repeats");
  return {
    key: `${kind}:${row.entity}:${row.id}`,
    kind,
    entity: row.entity,
    id: row.id,
    title: row.title.slice(0, 500),
    href,
    subtitle: context.filter(Boolean).join(" · ").slice(0, 600),
    snippet: (row.reason || (row.rank >= 4 ? row.snippet : "")).slice(0, 220),
    badges,
    ...(/^#[a-f\d]{6}$/i.test(text(e.color)) ? { color: text(e.color) } : {}),
  };
}

// Each adapter is a bounded, database-enforced read-only transaction. Failed
// groups never masquerade as empty groups and never log request/private values.
export async function searchDashboard(
  input: SearchInput,
  db = prisma,
  now = new Date(),
  zone = getAppTimeZone(),
): Promise<SearchResponse> {
  if (!searchReady(input.query)) return { groups: [] };
  const kinds = input.kind === "all" ? [...SEARCH_KINDS] : [input.kind];
  const groups: SearchGroup[] = new Array(kinds.length);
  const limit = input.view === "dialog" ? 3 : 25;
  const today = localToday(now, zone);
  let next = 0;
  async function worker() {
    while (next < kinds.length) {
      const index = next++,
        kind = kinds[index];
      try {
        const rows = await db.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '1500ms'");
            return tx.$queryRawUnsafe<SearchRow[]>(
              argumentsSQL + adapters[kind] + resultsSQL,
              OWNER_DATABASE_USER_ID,
              canonicalQuery(input.query),
              input.includeArchived,
              limit + 1,
              (input.page - 1) * limit,
              input.view === "dialog",
              today,
              now,
            );
          },
          { timeout: 2400, maxWait: 1200, isolationLevel: "RepeatableRead" },
        );
        groups[index] = {
          kind,
          page: input.page,
          hasMore: rows.length > limit,
          items: rows.slice(0, limit).map((row) => searchResult(kind, row, today, now, zone)),
        };
      } catch {
        groups[index] = {
          kind,
          page: input.page,
          hasMore: false,
          items: [],
          error: "Unavailable — Retry",
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, kinds.length) }, () => worker()));
  return { groups };
}
