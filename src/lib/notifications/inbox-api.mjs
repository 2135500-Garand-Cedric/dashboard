import { OWNER_GITHUB_ID } from "../owner-identity.mjs";
import { appendAudit, auditSnapshot } from "../audit/writer.mjs";
import { resolveReminder } from "./sources.mjs";
import { createHash } from "node:crypto";
import { activeInboxWhere, inboxWhere, reconcileItem, snoozeInstant } from "./inbox.mjs";
import { reminderCandidate } from "./rules.mjs";
import { reminderState } from "./engine.mjs";

export class InboxError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function notificationId(value) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
  )
    throw new InboxError("Choose a valid notification.");
  return value;
}
export async function inboxCount(db, userId, now = new Date()) {
  return {
    unread: await db.userNotification.count({
      where: { ...activeInboxWhere(userId, now), readAt: null },
    }),
  };
}
export async function notificationDetail(db, userId, id, state = null) {
  const item = await db.userNotification.findFirst({
    where: { id: notificationId(id), userId },
    include: {
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          status: true,
          sentAt: true,
          generation: true,
          subscription: { select: { label: true } },
        },
      },
    },
  });
  if (!item) throw new InboxError("Notification not found.", 404);
  state ||= await reminderState(db, userId);
  const resolved = await resolveReminder(db, userId, item.sourceKind, item.sourceId);
  const candidate =
    resolved.source && reminderCandidate(resolved.source, state.settings, state.zone);
  const valid = !resolved.reason && candidate?.occurrenceKey === item.occurrenceKey;
  const { deliveries, ...fields } = item;
  return {
    ...fields,
    url: valid ? resolved.source.url : null,
    color:
      valid && /^#[a-f\d]{6}$/i.test(resolved.source.color || "") ? resolved.source.color : null,
    deliveries: deliveries.map((delivery) => ({
      status: delivery.status,
      sentAt: delivery.sentAt,
      generation: delivery.generation,
      device: delivery.subscription.label,
    })),
  };
}
export async function listInbox(db, userId, params, now = new Date()) {
  const view = params.get("view") || "active";
  if (!["active", "unread", "history", "snoozed"].includes(view))
    throw new InboxError("Choose a valid inbox view.");
  const limit = Number(params.get("limit") || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new InboxError("Choose a page size between 1 and 50.");
  let after;
  if (params.get("cursor")) {
    try {
      const cursor = JSON.parse(Buffer.from(params.get("cursor"), "base64url").toString());
      notificationId(cursor.id);
      const dueAt = new Date(cursor.dueAt);
      if (!Number.isFinite(dueAt.getTime())) throw new Error();
      after = { OR: [{ dueAt: { lt: dueAt } }, { dueAt, id: { lt: cursor.id } }] };
    } catch {
      throw new InboxError("Invalid page cursor.");
    }
  }
  const where = inboxWhere(userId, view, now);
  const [rows, count, state] = await Promise.all([
    db.userNotification.findMany({
      where: { AND: [where, ...(after ? [after] : [])] },
      orderBy: [{ dueAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: { id: true, dueAt: true },
    }),
    inboxCount(db, userId, now),
    reminderState(db, userId),
  ]);
  const items = await Promise.all(
    rows.slice(0, limit).map((row) => notificationDetail(db, userId, row.id, state)),
  );
  const last = rows[limit - 1];
  return {
    items,
    ...count,
    cutoff: now.toISOString(),
    nextCursor:
      rows.length > limit ? Buffer.from(JSON.stringify(last)).toString("base64url") : null,
  };
}

// Owner-scoped replay receipts are reused from the existing work command system.
// The lock also serializes settings transitions and commands across devices.
/** @param {any} db
 * @param {number} userId
 * @param {{id?: string | null, key: string, revision?: number | null, body: any, action: string}} command
 */
export async function inboxCommand(
  db,
  userId,
  { id = null, key, revision, body, action },
  now = new Date(),
) {
  notificationId(key);
  if (id) notificationId(id);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new InboxError("Enter a valid request.");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([id, revision, action, body]))
    .digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(94722, ${userId}::integer)`;
    const prior = await tx.workMutationReceipt.findUnique({
      where: { userId_requestKey: { userId, requestKey: key } },
    });
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new InboxError("This request key was already used for another change.", 409);
      return prior.result;
    }
    let result = { ok: true };
    let auditBefore = null,
      auditAfter = null,
      auditChanged = false;
    if (action === "read-all") {
      const cutoff = new Date(body.cutoff);
      if (typeof body.cutoff !== "string" || !Number.isFinite(cutoff.getTime()) || cutoff > now)
        throw new InboxError("Reload the inbox before marking all read.");
      const updated = await tx.userNotification.updateMany({
        where: {
          ...activeInboxWhere(userId, cutoff),
          readAt: null,
          createdAt: { lte: cutoff },
          updatedAt: { lte: cutoff },
        },
        data: { readAt: now, revision: { increment: 1 } },
      });
      result = { ok: true, count: updated.count };
      auditChanged = updated.count > 0;
      auditAfter = { count: updated.count };
    } else {
      if (!Number.isInteger(revision) || revision < 1)
        throw new InboxError("Reload this notification before changing it.", 428);
      let item = await tx.userNotification.findFirst({ where: { id, userId } });
      if (!item) throw new InboxError("Notification not found.", 404);
      const state = await reminderState(tx, userId);
      ({ item } = await reconcileItem(tx, item, state, now));
      if (item.revision !== revision)
        throw new InboxError("This notification changed. Reload it and try again.", 409);
      let data;
      auditBefore = {
        readAt: item.readAt,
        dismissedAt: item.dismissedAt,
        snoozedUntil: item.snoozedUntil,
      };
      if (action === "snooze") {
        if (item.lifecycle !== "ACTIVE")
          throw new InboxError("This reminder is no longer active.", 409);
        let until;
        try {
          until = snoozeInstant(body, state.zone, now);
        } catch (error) {
          throw new InboxError(error.message);
        }
        data = {
          snoozedUntil: until,
          dueAt: until,
          generation: { increment: 1 },
          dismissedAt: null,
        };
      } else if (body.action === "read") data = { readAt: now };
      else if (body.action === "unread") data = { readAt: null };
      else if (body.action === "dismiss") data = { dismissedAt: now, snoozedUntil: null };
      else if (body.action === "undo") data = { dismissedAt: null };
      else throw new InboxError("Choose a valid notification action.");
      const updated = await tx.userNotification.updateMany({
        where: { id, userId, revision },
        data: { ...data, revision: { increment: 1 } },
      });
      if (!updated.count)
        throw new InboxError("This notification changed. Reload it and try again.", 409);
      auditAfter = { ...auditBefore, ...data };
      auditChanged = JSON.stringify(auditBefore) !== JSON.stringify(auditAfter);
      if (action === "snooze" || body.action === "dismiss")
        await tx.pushDelivery.updateMany({
          where: { notificationId: id, status: "PENDING" },
          data: { status: "SKIPPED", errorCode: "CHANGED", leaseUntil: null },
        });
    }
    if (auditChanged)
      await appendAudit(tx, {
        userId,
        actorKind: "OWNER",
        actorGithubId: OWNER_GITHUB_ID,
        category: "NOTIFICATIONS",
        entityType: "notification",
        entityId: id,
        action: `notification.${action === "read-all" ? "read-all" : action === "snooze" ? "snoozed" : body.action}`,
        summary: action === "read-all" ? "Notifications marked read" : "Notification changed",
        before: auditSnapshot(auditBefore),
        after: auditSnapshot(auditAfter),
        eventKey: `notification:${key}`,
        operationKey: key,
      });
    await tx.workMutationReceipt.create({
      data: { userId, requestKey: key, fingerprint, operation: `notification:${action}`, result },
    });
    return result;
  });
}
