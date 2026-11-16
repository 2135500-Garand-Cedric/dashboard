import type { Prisma } from "@/generated/prisma";
import { WORK_KINDS, WORK_PRIORITIES, WORK_STATUSES } from "./types";
import { WorkValidationError, workId } from "./validation";

import { getAppTimeZone } from "@/lib/time-zone-context";
import { calendarDate, localToday, dayStart, nextCalendarDate } from "./dates";

import { PLANNING_SECTIONS, planningWhere } from "./planning-rules";
export const WORK_PAGE_SIZE = 30;
export function parseWorkQuery(params: URLSearchParams) {
  const choice = (name: string, values: readonly string[], fallback: string) => {
    const value = params.get(name) || fallback;
    if (!values.includes(value)) throw new WorkValidationError(`Choose a valid ${name} filter.`);
    return value;
  };
  const text = (name: string, max: number) => {
    const value = (params.get(name) || "").trim();
    if (value.length > max) throw new WorkValidationError(`The ${name} filter is too long.`);
    return value;
  };
  const id = (name: string, unclassified = false) => {
    const value = params.get(name) || "";
    return value === "" || (unclassified && value === "none") ? value : String(workId(value));
  };
  return {
    q: text("q", 500),
    planning: choice("planning", ["", ...PLANNING_SECTIONS], ""),
    view: choice("view", ["active", "history", "archived", "all"], "active"),
    activityType: id("activityType", true),
    project: id("project", true),
    stage: id("stage"),
    person: id("person"),
    system: text("system", 120),
    status: choice("status", ["", ...WORK_STATUSES], ""),
    priority: choice("priority", ["", "none", ...WORK_PRIORITIES], ""),
    kind: choice("kind", ["", "none", ...WORK_KINDS], ""),
    due: choice("due", ["", "overdue", "today", "upcoming", "none"], ""),
    followup: choice("followup", ["", "due", "scheduled", "none"], ""),
    deadlineFrom: params.get("deadlineFrom") ? calendarDate(params.get("deadlineFrom")) : "",
    deadlineTo: params.get("deadlineTo") ? calendarDate(params.get("deadlineTo")) : "",
    sort: choice(
      "sort",
      ["updated", "created", "priority", "title", "deadline", "followup"],
      "updated",
    ),
    page: params.has("page") ? workId(params.get("page")) : 1,
  };
}
export type WorkQuery = ReturnType<typeof parseWorkQuery>;
export function workQueryWhere(
  query: WorkQuery,
  userId: number,
  now = new Date(),
  zone = getAppTimeZone(),
): Prisma.TodoWhereInput {
  const AND: Prisma.TodoWhereInput[] = [
    { userId },
    ...(query.view === "history"
      ? []
      : [{ archivedAt: query.view === "archived" ? { not: null } : null }]),
  ];
  if (query.planning)
    AND.push(
      { archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] } },
      planningWhere(
        query.planning as import("./planning-rules").PlanningSection,
        localToday(now, zone),
        zone,
        now,
        userId,
      ),
    );
  if (query.view === "active") AND.push({ status: { notIn: ["DONE", "CANCELLED"] } });
  if (query.view === "history") AND.push({ status: { in: ["DONE", "CANCELLED"] } });
  if (query.project)
    AND.push(
      query.project === "none"
        ? { projectId: null }
        : { projectId: Number(query.project), project: { userId } },
    );
  if (query.stage) AND.push({ stageId: Number(query.stage), stage: { project: { userId } } });
  if (query.activityType)
    AND.push({ activityTypeId: query.activityType === "none" ? null : Number(query.activityType) });
  for (const field of ["system"] as const)
    if (query[field]) AND.push({ [field]: { contains: query[field], mode: "insensitive" } });
  if (query.status) AND.push({ status: query.status as Prisma.EnumTodoStatusFilter["equals"] });
  if (query.priority)
    AND.push({
      priorityLevel:
        query.priority === "none"
          ? null
          : (query.priority as Prisma.EnumWorkPriorityNullableFilter["equals"]),
    });
  if (query.kind)
    AND.push({
      kind:
        query.kind === "none"
          ? null
          : (query.kind as Prisma.EnumWorkTaskKindNullableFilter["equals"]),
    });
  if (query.person) {
    const id = Number(query.person);
    AND.push({
      OR: [
        { requesterId: id },
        { affectedPeople: { some: { contactId: id, contact: { userId } } } },
      ],
    });
  }
  const dateFilters: Prisma.TodoWhereInput[] = [];
  if (query.due || query.followup || query.deadlineFrom || query.deadlineTo) {
    const today = localToday(now, zone);
    const actionable = {
      status: { notIn: ["DONE", "CANCELLED"] as ("DONE" | "CANCELLED")[] },
      archivedAt: null,
    };
    if (query.due === "none") dateFilters.push({ deadlineDate: null, deadlineAt: null });
    if (query.due && query.due !== "none") {
      dateFilters.push(actionable);
      if (query.due === "overdue")
        dateFilters.push({ OR: [{ deadlineDate: { lt: today } }, { deadlineAt: { lt: now } }] });
      if (query.due === "today")
        dateFilters.push({
          OR: [
            { deadlineDate: today },
            {
              deadlineAt: {
                gte: dayStart(today, zone),
                lt: dayStart(nextCalendarDate(today), zone),
              },
            },
          ],
        });
      if (query.due === "upcoming")
        dateFilters.push({ OR: [{ deadlineDate: { gte: today } }, { deadlineAt: { gte: now } }] });
    }
    if (query.followup === "none") dateFilters.push({ followUps: { none: { status: "ACTIVE" } } });
    if (query.followup && query.followup !== "none")
      dateFilters.push(actionable, {
        followUps: {
          some: {
            status: "ACTIVE",
            ...(query.followup === "due"
              ? { OR: [{ date: { lte: today } }, { at: { lte: now } }] }
              : {}),
          },
        },
      });
    if (query.deadlineFrom && query.deadlineTo && query.deadlineFrom > query.deadlineTo)
      throw new WorkValidationError("The deadline range start must be before its end.");
    if (query.deadlineFrom || query.deadlineTo)
      dateFilters.push({
        OR: [
          {
            deadlineDate: {
              ...(query.deadlineFrom ? { gte: query.deadlineFrom } : {}),
              ...(query.deadlineTo ? { lte: query.deadlineTo } : {}),
            },
          },
          {
            deadlineAt: {
              ...(query.deadlineFrom ? { gte: dayStart(query.deadlineFrom, zone) } : {}),
              ...(query.deadlineTo
                ? { lt: dayStart(nextCalendarDate(query.deadlineTo), zone) }
                : {}),
            },
          },
        ],
      });
  }
  AND.push(...dateFilters);
  if (query.q) {
    const reference = /^TASK-0*(\d+)$/i.exec(query.q),
      id = reference ? Number(reference[1]) : 0;
    AND.push({
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
        ...(id > 0 && id <= 2147483647 ? [{ id }] : []),
      ],
    });
  }
  return { AND };
}
export function workQueryOrder(sort: string): Prisma.TodoOrderByWithRelationInput[] {
  return sort === "priority"
    ? [{ priorityLevel: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "desc" }]
    : sort === "title"
      ? [{ title: "asc" }, { id: "asc" }]
      : [{ [sort === "created" ? "createdAt" : "updatedAt"]: "desc" }, { id: "desc" }];
}
