import { occasionSource } from "@/lib/calendar-occasion-core";
import { occasionHref } from "@/lib/calendar-annual";
import { logDateDefaults, logDateRange } from "./dates.mjs";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { AUDIT_CATEGORIES, AUDIT_OUTCOMES } from "./writer.mjs";
import { activityHref } from "@/lib/finance/activity-links";
export class AuditQueryError extends Error {}
export function logFilters(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuditQueryError("Choose valid log filters.");
  const b = value as Record<string, unknown>;
  if (
    Object.keys(b).some(
      (key) => !["from", "to", "category", "action", "outcome", "search", "cursor"].includes(key),
    )
  )
    throw new AuditQueryError("Unsupported log filters.");
  const defaults = logDateDefaults(getAppTimeZone());
  const from = String(b.from || defaults.from),
    to = String(b.to || defaults.to);
  if (!logDateRange(from, to, getAppTimeZone()))
    throw new AuditQueryError("Choose an ordered date range of at most ten years.");
  for (const key of ["category", "action", "outcome", "search", "cursor"])
    if (b[key] !== undefined && typeof b[key] !== "string")
      throw new AuditQueryError("Choose valid log filters.");
  const category = String(b.category || ""),
    action = String(b.action || ""),
    outcome = String(b.outcome || ""),
    search = String(b.search || "").trim();
  if (
    (category && !AUDIT_CATEGORIES.includes(category)) ||
    (outcome && !AUDIT_OUTCOMES.includes(outcome)) ||
    (action && !/^[a-z][a-z0-9_.-]{1,99}$/.test(action)) ||
    search.length > 120 ||
    /[\u0000-\u001f]/.test(search)
  )
    throw new AuditQueryError("Choose valid log filters.");
  const signature = createHash("sha256")
    .update(JSON.stringify([from, to, category, action, outcome, search]))
    .digest("hex");
  let cursor: { at: string; id: string } | null = null;
  if (b.cursor) {
    if (String(b.cursor).length > 400) throw new AuditQueryError("Invalid page cursor.");
    try {
      const parsed = JSON.parse(Buffer.from(String(b.cursor), "base64url").toString());
      if (
        parsed.signature !== signature ||
        !/^\d{4}-\d{2}-\d{2}T/.test(parsed.at) ||
        !Number.isFinite(Date.parse(parsed.at)) ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(parsed.id)
      )
        throw new Error();
      cursor = parsed;
    } catch {
      throw new AuditQueryError("The filters changed. Start from the first page.");
    }
  }
  return { from, to, category, action, outcome, search, cursor, signature };
}
export async function listLogs(value: unknown) {
  const f = logFilters(value),
    zone = getAppTimeZone();
  const rows = await prisma.auditEvent.findMany({
    where: {
      OR: [{ userId: owner }, { category: "AUTH" }],
      occurredAt: logDateRange(f.from, f.to, zone)!,
      ...(f.category ? { category: f.category } : {}),
      ...(f.action ? { action: f.action } : {}),
      ...(f.outcome ? { outcome: f.outcome } : {}),
      AND: [
        ...(f.search
          ? [
              {
                OR: [
                  { summary: { contains: f.search, mode: "insensitive" as const } },
                  { entityReference: { contains: f.search, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
        ...(f.cursor
          ? [
              {
                OR: [
                  { occurredAt: { lt: new Date(f.cursor.at) } },
                  { occurredAt: new Date(f.cursor.at), id: { lt: f.cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 31,
    select: {
      id: true,
      occurredAt: true,
      category: true,
      action: true,
      outcome: true,
      entityType: true,
      entityReference: true,
      summary: true,
      actorKind: true,
    },
  });
  const items = rows.slice(0, 30),
    last = items.at(-1);
  const coverage = await prisma.user.findUnique({
    where: { id: owner },
    select: { auditStartedAt: true },
  });
  return {
    items,
    startedAt: coverage?.auditStartedAt ?? null,
    nextCursor:
      rows.length > 30 && last
        ? Buffer.from(
            JSON.stringify({
              at: last.occurredAt.toISOString(),
              id: last.id,
              signature: f.signature,
            }),
          ).toString("base64url")
        : null,
  };
}
export async function logDetail(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return null;
  const event = await prisma.auditEvent.findFirst({
    where: { id, OR: [{ userId: owner }, { category: "AUTH" }] },
  });
  if (!event) return null;
  const source =
    event.category === "AUTH" && event.userId !== owner
      ? { href: "/admin/users", sourceState: "available" }
      : await resolveSource(event.entityType, event.entityId);
  const related = (event.changes as { related?: { type: string; id: string }[] }).related ?? [];
  const links = await Promise.all(
    related
      .slice(0, 8)
      .map(async (ref) => ({ ...ref, ...(await resolveSource(ref.type, ref.id)) })),
  );
  return { ...event, ...source, relatedLinks: links.filter((row) => row.href) };
}
async function resolveSource(
  type: string,
  id: string | null,
): Promise<{ href: string | null; sourceState: string }> {
  const known: Record<string, { table: string; href: string }> = {
    task: { table: "todo", href: "/todos/" },
    project: { table: "workProject", href: "/projects/" },
    event: { table: "event", href: "/events/" },
    article: { table: "knowledgeArticle", href: "/knowledge/" },
    vocabulary: { table: "vocabulary", href: "/japanese/vocabulary/" },
    person: { table: "workContact", href: "/settings/people?person=" },
    account: { table: "financialAccount", href: "/finance/settings/accounts" },
    "income-source": { table: "financialIncomeSource", href: "/finance/settings/income-sources" },
    "income-type": {
      table: "financialIncomeSourceType",
      href: "/finance/settings/income-source-types",
    },
    "deduction-type": {
      table: "financialDeductionType",
      href: "/finance/settings/deduction-types",
    },
    category: { table: "financeCategory", href: "/finance/settings/categories" },
    statement: { table: "financialImport", href: "/finance/imports/" },
    folder: { table: "knowledgeFolder", href: "/knowledge" },
    template: { table: "knowledgeTemplate", href: "/knowledge/templates" },
    birthday: { table: "calendarBirthday", href: "/settings/birthdays" },
    holiday: { table: "calendarHoliday", href: "/settings/holidays" },
    transaction: { table: "financialTransaction", href: "" },
    income: { table: "financialIncomeRecord", href: "" },
    receipt: { table: "financialReceipt", href: "" },
    balance: { table: "financialAccountBalance", href: "/finance/settings/accounts" },
    reimbursement: { table: "financialReimbursement", href: "" },
    "reimbursement-plan": { table: "financialReimbursementPlan", href: "" },
    note: { table: "workNote", href: "" },
    attachment: { table: "workAttachment", href: "" },
    "activity-type": { table: "activityType", href: "/calendar" },
    subtask: { table: "subtask", href: "" },
    recurrence: { table: "recurrenceSeries", href: "/calendar" },
    "vocab-category": { table: "category", href: "/japanese/vocabulary" },
    practice: { table: "practice", href: "" },
  };
  if (type === "settings" || type === "auth")
    return { href: "/settings", sourceState: "available" };
  if (["notification", "email", "device", "delivery"].includes(type)) {
    if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))
      return { href: null, sourceState: "unavailable" };
    const row =
      type === "notification"
        ? await prisma.userNotification.findFirst({
            where: { id, userId: owner },
            select: { id: true },
          })
        : type === "email"
          ? await prisma.emailDelivery.findFirst({
              where: { id, userId: owner },
              select: { id: true },
            })
          : type === "device"
            ? await prisma.pushSubscription.findFirst({
                where: { id, userId: owner },
                select: { id: true },
              })
            : await prisma.pushDelivery.findFirst({
                where: { id, subscription: { userId: owner } },
                select: { id: true },
              });
    return {
      href: row
        ? type === "notification"
          ? `/notifications/${id}`
          : type === "email"
            ? "/settings/email"
            : "/settings/notifications"
        : null,
      sourceState: row ? "available" : "deleted",
    };
  }
  const spec = known[type];
  if (!spec || !id || !/^\d+$/.test(id) || Number(id) > 2147483647)
    return { href: null, sourceState: "unavailable" };
  const table = (
    prisma as unknown as Record<
      string,
      { findFirst: (args: unknown) => Promise<Record<string, unknown> | null> }
    >
  )[spec.table];
  const row = await table.findFirst({
    where: {
      id: Number(id),
      ...(["activityType", "category"].includes(spec.table)
        ? {}
        : spec.table === "subtask"
          ? { todo: { userId: owner } }
          : { userId: owner }),
    },
  });
  if (!row || row.removedAt) return { href: null, sourceState: "deleted" };
  let href = spec.href;
  if (type === "transaction") href = activityHref(Number(row.id), String(row.type));
  if (["receipt", "income", "reimbursement", "reimbursement-plan"].includes(type)) {
    const target = row.transactionId ?? row.paymentId ?? row.expenseId;
    const tx =
      typeof target === "number"
        ? await prisma.financialTransaction.findFirst({
            where: { id: target, userId: owner, account: { userId: owner } },
            select: { id: true, type: true },
          })
        : null;
    href = tx ? activityHref(tx.id, tx.type) : "";
  }
  if (["note", "attachment", "subtask"].includes(type)) {
    const parent = row.todoId
      ? { table: "todo", id: row.todoId, path: "/todos/" }
      : row.projectId
        ? { table: "workProject", id: row.projectId, path: "/projects/" }
        : row.knowledgeArticleId
          ? { table: "knowledgeArticle", id: row.knowledgeArticleId, path: "/knowledge/" }
          : null;
    const delegate = parent
      ? (prisma as unknown as Record<string, { findFirst: (args: unknown) => Promise<unknown> }>)[
          parent.table
        ]
      : null;
    href =
      parent && (await delegate!.findFirst({ where: { id: parent.id, userId: owner } }))
        ? `${parent.path}${parent.id}`
        : "";
  }
  if (type === "birthday" || type === "holiday") {
    try {
      const source = await occasionSource(prisma, type, Number(id));
      href = occasionHref(source.kind, source.id, source.date);
    } catch {
      href = spec.href;
    }
  }
  if (type === "practice") href = `/japanese/practice/history/${row.id}`;
  if (spec.href.endsWith("/") || spec.href.endsWith("=")) href += id;
  return { href: href || null, sourceState: href ? "available" : "unavailable" };
}
