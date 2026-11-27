import { OWNER_GITHUB_ID, OWNER_DATABASE_USER_ID } from "../owner-identity.mjs";
import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
const operation = new AsyncLocalStorage();
export function withinAuditCommand(action) {
  return operation.run(true, action);
}

export const AUDIT_CATEGORIES = [
  "WORK",
  "CALENDAR",
  "FINANCE",
  "PEOPLE",
  "KNOWLEDGE",
  "JAPANESE",
  "SETTINGS",
  "NOTIFICATIONS",
  "EMAIL",
  "AUTH",
  "SYSTEM",
];
export const AUDIT_OUTCOMES = [
  "SUCCESS",
  "DENIED",
  "FAILED",
  "QUEUED",
  "ACCEPTED",
  "UNKNOWN",
  "SKIPPED",
];
const PUBLIC = new Set([
  "title",
  "name",
  "status",
  "active",
  "archivedAt",
  "completed",
  "date",
  "occurredOn",
  "purchasedOn",
  "paidOn",
  "periodStart",
  "periodEnd",
  "deadlineDate",
  "deadlineAt",
  "deadlineTimeZone",
  "followUpDate",
  "followUpAt",
  "targetDate",
  "startDate",
  "endDate",
  "allDayStart",
  "allDayEnd",
  "amount",
  "currency",
  "type",
  "kind",
  "typeId",
  "accountId",
  "categoryId",
  "sourceId",
  "projectId",
  "stageId",
  "parentId",
  "requesterId",
  "contactId",
  "expenseId",
  "paymentId",
  "planId",
  "expectedAmount",
  "timeZone",
  "month",
  "day",
  "revision",
  "balanceRevision",
  "enabled",
  "leadMinutes",
  "dateOnlyTime",
  "showDetails",
  "minutes",
  "reminderMinutes",
  "priorityLevel",
  "recurrenceId",
  "starred",
  "wordCount",
  "count",
  "color",
  "icon",
  "inlineImage",
  "errorCode",
  "currentBalance",
  "closingBalance",
  "previousClosingDate",
  "weakCount",
  "goodCount",
  "perfectCount",
  "xpEarned",
  "goldEarned",
  "activityName",
  "grossAmount",
  "netAmount",
  "subtotal",
  "tax",
  "tip",
  "total",
  "busy",
  "pinned",
  "folderId",
  "position",
  "done",
  "removedAt",
  "completedAt",
  "cancelledAt",
  "activityTypeId",
  "dependsOnId",
  "label",
  "country",
  "frequency",
  "anchor",
  "until",
  "completionType",
  "reminderMinutes",
  "occurredAt",
  "readAt",
  "dismissedAt",
  "snoozedUntil",
]);
const PRIVATE = new Set([
  "body",
  "contentHash",
  "notes",
  "description",
  "summary",
  "objective",
  "email",
  "phone",
  "recipient",
  "template",
  "readings",
  "japanese",
  "hiragana",
  "english",
  "deductions",
  "links",
  "selectedCategories",
  "settings",
  "desiredOutcome",
  "nextAction",
  "completionSummary",
  "waitingOn",
  "waitingReason",
  "workaround",
  "company",
]);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function scalar(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : String(value);
  if (typeof value === "string") return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
  if (typeof value.toFixed === "function") return value.toFixed(4);
  return null;
}
// Digests are comparison-only. No private values or their hashes enter the log.
export function auditSnapshot(row) {
  if (!row) return null;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (PUBLIC.has(key))
      result[key] =
        value instanceof Date &&
        ["occurredOn", "purchasedOn", "paidOn", "periodStart", "periodEnd"].includes(key)
          ? value.toISOString().slice(0, 10)
          : scalar(value);
    else if (PRIVATE.has(key))
      result[key] = value == null || value === "" ? null : { private: digest(value) };
  }
  return result;
}
export function auditDifferences(before, after) {
  const result = {};
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const left = before?.[key] ?? null,
      right = after?.[key] ?? null;
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    if (PRIVATE.has(key)) result[key] = { changed: true };
    else if (PUBLIC.has(key)) result[key] = { before: scalar(left), after: scalar(right) };
  }
  return result;
}
export async function appendAudit(db, event) {
  if (operation.getStore()) return null;
  if (
    !Number.isInteger(event.userId) ||
    event.userId < 1 ||
    (event.actorKind === "OWNER" && event.actorGithubId !== OWNER_GITHUB_ID) ||
    !AUDIT_CATEGORIES.includes(event.category) ||
    !AUDIT_OUTCOMES.includes(event.outcome ?? "SUCCESS") ||
    !["OWNER", "SYSTEM", "ANONYMOUS"].includes(event.actorKind)
  )
    throw new Error("Invalid audit event.");
  if (
    !/^[a-z][a-z0-9_.-]{1,99}$/.test(event.action) ||
    !/^[a-z][a-z0-9-]{0,49}$/.test(event.entityType)
  )
    throw new Error("Invalid audit identity.");
  const changes = auditDifferences(event.before ?? null, event.after ?? null);
  if (
    event.before &&
    event.after &&
    !Object.keys(changes).some((key) => !["revision", "balanceRevision"].includes(key)) &&
    !event.force
  )
    return null;
  const related = (event.related ?? [])
    .filter((row) => /^[a-z][a-z0-9-]{0,49}$/.test(row.type))
    .slice(0, 8)
    .map((row) => ({ type: String(row.type).slice(0, 50), id: String(row.id).slice(0, 128) }));
  if (related.length) changes.related = related;
  const key = event.eventKey ?? randomUUID();
  if (
    key.length > 240 ||
    (event.operationKey?.length ?? 0) > 240 ||
    Buffer.byteLength(JSON.stringify(changes)) > 12000
  )
    throw new Error("Audit event is too large.");
  let summary = String(event.summary);
  const title =
    event.after?.title ?? event.after?.name ?? event.before?.title ?? event.before?.name;
  if (typeof title === "string" && title) summary += ` — ${title}`;
  if (changes.status && changes.status.before !== null && changes.status.after !== null)
    summary += ` · ${changes.status.before} → ${changes.status.after}`;
  const data = {
    userId: event.userId,
    occurredAt: event.occurredAt ?? new Date(),
    actorKind: event.actorKind,
    actorGithubId: event.actorKind === "OWNER" ? event.actorGithubId : null,
    category: event.category,
    action: event.action,
    outcome: event.outcome ?? "SUCCESS",
    entityType: event.entityType,
    entityId: event.entityId == null ? null : String(event.entityId).slice(0, 128),
    entityReference: scalar(String(event.entityReference ?? "")).slice(0, 160),
    summary: summary.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300),
    changes,
    operationKey: event.operationKey ?? key,
    eventKey: key,
    originType: event.originType?.slice(0, 50) ?? null,
    originId: event.originId == null ? null : String(event.originId).slice(0, 128),
  };
  // ON CONFLICT avoids poisoning the caller's transaction on a replay.
  const saved = await db.auditEvent.createMany({ data, skipDuplicates: true });
  return saved.count ? data : null;
}
export async function pruneAudit(db, now = new Date(), limit = 500) {
  const old = new Date(now.getTime() - 180 * 86400000),
    denied = new Date(now.getTime() - 30 * 86400000);
  const rows = await db.auditEvent.findMany({
    where: {
      userId: OWNER_DATABASE_USER_ID,
      OR: [
        { occurredAt: { lt: old } },
        { category: "AUTH", outcome: "DENIED", occurredAt: { lt: denied } },
      ],
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: Math.min(500, Math.max(1, limit)),
    select: { id: true },
  });
  if (!rows.length) return 0;
  return (await db.auditEvent.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } }))
    .count;
}
