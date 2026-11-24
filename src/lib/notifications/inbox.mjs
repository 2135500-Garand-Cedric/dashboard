import { DateTime } from "luxon";
import { reminderSources, resolveReminder } from "./sources.mjs";
import { reminderCandidate } from "./rules.mjs";

export const DAY_MS = 86400000;
export const CATCHUP_MS = 7 * DAY_MS;
export const CATEGORIES = [
  "events",
  "sessions",
  "deadlines",
  "followUps",
  "milestones",
  "weeklyReports",
];

export function activeInboxWhere(userId, now = new Date()) {
  return {
    userId,
    lifecycle: "ACTIVE",
    dismissedAt: null,
    snoozedUntil: null,
    dueAt: { lte: now },
  };
}
export function inboxWhere(userId, view, now = new Date()) {
  if (view === "history")
    return { userId, OR: [{ lifecycle: { not: "ACTIVE" } }, { dismissedAt: { not: null } }] };
  if (view === "snoozed")
    return { userId, lifecycle: "ACTIVE", dismissedAt: null, snoozedUntil: { not: null } };
  return { ...activeInboxWhere(userId, now), ...(view === "unread" ? { readAt: null } : {}) };
}

export async function materializeInbox(db, userId, state, now) {
  const sources = await reminderSources(db, userId, now, CATCHUP_MS);
  for (const source of sources) {
    if (!state.settings[source.option]) continue;
    const candidate = reminderCandidate(source, state.settings, state.zone);
    const cutoff = Math.max(
      new Date(state.settings.inboxStartedAt).getTime(),
      new Date(state.settings.categoryStartedAt?.[source.option] || 0).getTime(),
    );
    if (
      !candidate ||
      candidate.sendAt > now ||
      candidate.sendAt.getTime() < Math.max(now.getTime() - CATCHUP_MS, cutoff)
    )
      continue;
    await db.userNotification.createMany({
      skipDuplicates: true,
      data: {
        userId,
        occurrenceKey: candidate.occurrenceKey,
        sourceKind: source.kind,
        sourceId: source.id,
        category: source.option,
        titleSnapshot: source.title.slice(0, 150),
        labelSnapshot: source.label,
        sourceDate: source.date || null,
        targetAt: candidate.targetAt,
        dueAt: candidate.sendAt,
        createdAt: now,
      },
    });
  }
}

export async function reconcileItem(db, item, state, now) {
  const resolved = await resolveReminder(db, item.userId, item.sourceKind, item.sourceId, now);
  const source = resolved.source;
  const candidate = source ? reminderCandidate(source, state.settings, state.zone) : null;
  let reason = resolved.reason;
  if (!reason && (!state.settings[source.option] || source.minutes === -1))
    reason = "REMINDERS_DISABLED";
  if (
    !reason &&
    candidate &&
    candidate.sendAt < new Date(state.settings.categoryStartedAt?.[source.option] || 0)
  )
    reason = "REMINDERS_DISABLED";
  if (!reason && !candidate) reason = "DATE_REMOVED";
  if (!reason && candidate.occurrenceKey !== item.occurrenceKey) reason = "DATE_CHANGED";
  if (!reason && now.getTime() - item.createdAt.getTime() >= 180 * DAY_MS)
    reason = "RETENTION_EXPIRED";
  if (item.lifecycle !== "ACTIVE") return { item, source: reason ? null : source };
  const changes = {};
  if (reason)
    Object.assign(changes, {
      lifecycle:
        reason === "DATE_CHANGED"
          ? "SUPERSEDED"
          : reason === "RETENTION_EXPIRED"
            ? "EXPIRED"
            : "RESOLVED",
      retiredReason: reason,
      retiredAt: now,
      snoozedUntil: null,
    });
  else {
    if (item.titleSnapshot !== source.title.slice(0, 150))
      changes.titleSnapshot = source.title.slice(0, 150);
    if (item.labelSnapshot !== source.label) changes.labelSnapshot = source.label;
    if (item.targetAt.getTime() !== candidate.targetAt.getTime())
      changes.targetAt = candidate.targetAt;
    if (item.generation === 0 && item.dueAt.getTime() !== candidate.sendAt.getTime())
      changes.dueAt = candidate.sendAt;
    if (item.snoozedUntil && item.snoozedUntil <= now)
      Object.assign(changes, { snoozedUntil: null, readAt: null });
  }
  if (Object.keys(changes).length) {
    const updated = await db.userNotification.updateMany({
      where: { id: item.id, userId: item.userId, revision: item.revision },
      data: { ...changes, revision: { increment: 1 } },
    });
    if (updated.count) item = { ...item, ...changes, revision: item.revision + 1 };
    else item = await db.userNotification.findUnique({ where: { id: item.id } });
  }
  if (item.lifecycle !== "ACTIVE" || item.dismissedAt || item.snoozedUntil) {
    await db.pushDelivery.updateMany({
      where: { notificationId: item.id, status: "PENDING" },
      data: { status: "SKIPPED", errorCode: "CHANGED", leaseUntil: null },
    });
  }
  return { item, source: reason ? null : source };
}

export async function reconcileInbox(db, userId, state, now) {
  // Batch the reads; no long transaction or network send is held during reconciliation.
  let cursor;
  for (;;) {
    const rows = await db.userNotification.findMany({
      where: { userId, lifecycle: "ACTIVE" },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const item of rows) await reconcileItem(db, item, state, now);
    if (rows.length < 100) break;
    cursor = rows.at(-1).id;
  }
}
export async function cleanupInbox(db, userId, now) {
  const before = new Date(now.getTime() - 90 * DAY_MS);
  await db.userNotification.deleteMany({
    where: { userId, OR: [{ retiredAt: { lt: before } }, { dismissedAt: { lt: before } }] },
  });
  await db.pushDelivery.deleteMany({
    where: { subscription: { userId }, status: { not: "PENDING" }, updatedAt: { lt: before } },
  });
}

export function snoozeInstant(value, zone, now = new Date()) {
  if (!value || typeof value !== "object") throw new Error("Choose a reminder time.");
  let target;
  if (value.preset === "hour") target = new Date(now.getTime() + 3600000);
  else {
    const local =
      value.preset === "tomorrow"
        ? DateTime.fromJSDate(now, { zone }).plus({ days: 1 }).toFormat("yyyy-MM-dd") + "T09:00"
        : value.local;
    if (typeof local !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local))
      throw new Error("Enter a valid date and time.");
    const dt = DateTime.fromISO(local, { zone });
    if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== local)
      throw new Error("This local time does not exist. Choose another time.");
    const offsets = dt.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
    if (offsets.length > 1 && !["earlier", "later"].includes(value.occurrence))
      throw new Error("This time occurs twice. Choose the earlier or later occurrence.");
    target = offsets[value.occurrence === "later" ? offsets.length - 1 : 0].toJSDate();
  }
  if (target <= now || target.getTime() > now.getTime() + 30 * DAY_MS)
    throw new Error("Choose a future time within 30 days.");
  return target;
}
