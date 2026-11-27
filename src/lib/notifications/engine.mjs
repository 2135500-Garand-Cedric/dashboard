import { updateDelivery } from "../audit/delivery.mjs";
import { reminderSources, resolveReminder } from "./sources.mjs";
export { reminderSources } from "./sources.mjs";
import { materializeInbox, reconcileInbox, cleanupInbox, activeInboxWhere } from "./inbox.mjs";
import * as webpush from "web-push";
import { DEFAULTS, GRACE_MS, reminderCandidate, reminderPayload } from "./rules.mjs";

export async function sendPush({ subscription, payload, config, ttl = 3600 }) {
  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject: config.subject,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      },
      TTL: ttl,
      urgency: "normal",
      timeout: 10000,
    },
  );
}

/** @param {import('../../generated/prisma/index.js').PrismaClient} db */
export async function reminderState(db, userId) {
  const [user, saved] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { timeZone: true } }),
    db.notificationSettings.findUnique({ where: { userId } }),
  ]);
  if (!user) return null;
  return {
    settings: { ...DEFAULTS, ...saved },
    zone: user.timeZone || process.env.APP_TIME_ZONE || "America/Toronto",
  };
}

/** @param {import('../../generated/prisma/index.js').PrismaClient} db */
export async function runReminderPass(
  db,
  { userId = 1, now = new Date(), config = null, send = sendPush } = {},
) {
  if (!(await db.user.count({ where: { id: userId } }))) return { sent: 0 };
  await db.notificationSettings.upsert({
    where: { userId },
    create: { userId, workerSeenAt: now, workerError: config ? null : "NOT_CONFIGURED" },
    update: { workerSeenAt: now, workerError: config ? null : "NOT_CONFIGURED" },
  });
  const state = await reminderState(db, userId);
  await materializeInbox(db, userId, state, now);
  await reconcileInbox(db, userId, state, now);
  await cleanupInbox(db, userId, now);
  await updateDelivery(db, "pushDelivery", {
    where: {
      subscription: { userId },
      status: "PENDING",
      sendAt: { lt: new Date(now.getTime() - GRACE_MS) },
    },
    data: { status: "SKIPPED", errorCode: "EXPIRED", leaseUntil: null },
  });
  if (!config || !state?.settings.enabled) return { sent: 0 };
  const { settings, zone } = state;
  const devices = await db.pushSubscription.findMany({
    where: { userId, active: true, vapidPublicKey: config.publicKey },
  });
  if (!devices.length) return { sent: 0 };
  const pending = await db.pushDelivery.findMany({
    where: { subscription: { userId, active: true }, status: "PENDING" },
  });
  const pendingByKey = new Map(
    pending
      .filter((job) => job.generation === 0)
      .map((job) => [`${job.subscriptionId}:${job.occurrenceKey}`, job]),
  );
  const sources = await reminderSources(db, userId, now);
  for (const source of sources) {
    if (!settings[source.option]) continue;
    const candidate = reminderCandidate(source, settings, zone);
    if (candidate)
      for (const device of devices) {
        const old = pendingByKey.get(`${device.id}:${candidate.occurrenceKey}`);
        if (
          old &&
          (old.sendAt.getTime() !== candidate.sendAt.getTime() ||
            old.targetAt.getTime() !== candidate.targetAt.getTime())
        ) {
          await updateDelivery(db, "pushDelivery", {
            where: {
              id: old.id,
              status: "PENDING",
              OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
            },
            data: {
              sendAt: candidate.sendAt,
              targetAt: candidate.targetAt,
              nextAttemptAt: new Date(Math.max(now.getTime(), candidate.sendAt.getTime())),
            },
          });
        }
      }
    if (
      !candidate ||
      candidate.sendAt > now ||
      candidate.sendAt.getTime() < now.getTime() - GRACE_MS ||
      candidate.sendAt < new Date(settings.categoryStartedAt?.[source.option] || 0)
    )
      continue;
    const notification = await db.userNotification.findUnique({
      where: { userId_occurrenceKey: { userId, occurrenceKey: candidate.occurrenceKey } },
    });
    if (
      notification &&
      (notification.lifecycle !== "ACTIVE" ||
        notification.dismissedAt ||
        notification.snoozedUntil ||
        notification.generation > 0)
    )
      continue;
    for (const device of devices) {
      // Newly registered devices never get a backlog of old reminders.
      if (candidate.sendAt < device.createdAt || candidate.sendAt < settings.enabledAt) continue;
      await db.pushDelivery.createMany({
        skipDuplicates: true,
        data: {
          subscriptionId: device.id,
          notificationId: notification?.id ?? null,
          occurrenceKey: candidate.occurrenceKey,
          sourceKind: source.kind,
          sourceId: source.id,
          targetAt: candidate.targetAt,
          sendAt: candidate.sendAt,
          nextAttemptAt: now,
        },
      });
    }
  }
  const cycles = await db.userNotification.findMany({
    where: {
      ...activeInboxWhere(userId, now),
      generation: { gt: 0 },
      dueAt: { gte: new Date(now.getTime() - GRACE_MS), lte: now },
    },
  });
  for (const item of cycles) {
    for (const device of devices) {
      if (item.dueAt < device.createdAt || item.dueAt < settings.enabledAt) continue;
      await db.pushDelivery.createMany({
        skipDuplicates: true,
        data: {
          subscriptionId: device.id,
          notificationId: item.id,
          occurrenceKey: item.occurrenceKey,
          generation: item.generation,
          sourceKind: item.sourceKind,
          sourceId: item.sourceId,
          targetAt: item.targetAt,
          sendAt: item.dueAt,
          nextAttemptAt: now,
        },
      });
    }
  }
  const queue = await db.pushDelivery.findMany({
    where: {
      subscription: { userId, active: true },
      status: "PENDING",
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { sendAt: "asc" },
    take: 50,
  });
  let sent = 0;
  for (const job of queue) {
    const claimed = await updateDelivery(db, "pushDelivery", {
      where: {
        id: job.id,
        status: "PENDING",
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { leaseUntil: new Date(now.getTime() + 120000), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    // Re-read current state after claiming, so edits/deletion/completion revoke jobs.
    const current = await reminderState(db, userId);
    const device = await db.pushSubscription.findFirst({
      where: { id: job.subscriptionId, userId, active: true, vapidPublicKey: config.publicKey },
    });
    const resolved =
      current?.settings.enabled && device
        ? await resolveReminder(db, userId, job.sourceKind, job.sourceId, now)
        : null;
    const source = resolved?.source;
    let candidate =
      source && !resolved.reason && current.settings[source.option]
        ? reminderCandidate(source, current.settings, current.zone)
        : null;
    const notification = await db.userNotification.findFirst({
      where: { userId, occurrenceKey: job.occurrenceKey },
    });
    if (notification) {
      if (
        notification.lifecycle !== "ACTIVE" ||
        notification.dismissedAt ||
        notification.snoozedUntil ||
        notification.generation !== job.generation
      )
        candidate = null;
      else if (candidate && job.generation > 0) candidate.sendAt = notification.dueAt;
      // Drain compatible legacy null-FK jobs without inventing historical inbox rows.
      if (!job.notificationId)
        await updateDelivery(db, "pushDelivery", {
          where: { id: job.id },
          data: { notificationId: notification.id },
        });
    }
    if (
      candidate &&
      device &&
      candidate.occurrenceKey === job.occurrenceKey &&
      candidate.sendAt > now
    ) {
      await updateDelivery(db, "pushDelivery", {
        where: { id: job.id },
        data: {
          sendAt: candidate.sendAt,
          targetAt: candidate.targetAt,
          nextAttemptAt: candidate.sendAt,
          leaseUntil: null,
        },
      });
      continue;
    }
    if (
      !candidate ||
      !device ||
      candidate.occurrenceKey !== job.occurrenceKey ||
      candidate.sendAt > now ||
      candidate.sendAt.getTime() < now.getTime() - GRACE_MS ||
      candidate.sendAt < new Date(current.settings.categoryStartedAt?.[source.option] || 0) ||
      candidate.sendAt < current.settings.enabledAt ||
      candidate.sendAt < device.createdAt
    ) {
      await updateDelivery(db, "pushDelivery", {
        where: { id: job.id },
        data: { status: "SKIPPED", errorCode: "CHANGED", leaseUntil: null },
      });
      continue;
    }
    try {
      await send({
        subscription: device,
        payload: {
          ...reminderPayload(candidate, current.settings, current.zone),
          ...(notification
            ? {
                url: `/notifications/${notification.id}`,
                tag: `dashboard-${candidate.occurrenceKey}-${job.generation}`,
              }
            : {}),
        },
        config,
        ttl: Math.max(
          1,
          Math.min(
            3600,
            Math.ceil(
              ((job.generation > 0 ? candidate.sendAt : candidate.targetAt).getTime() +
                GRACE_MS -
                now.getTime()) /
                1000,
            ),
          ),
        ),
      });
      await updateDelivery(db, "pushDelivery", {
        where: { id: job.id },
        data: {
          status: "SENT",
          sentAt: now,
          targetAt: candidate.targetAt,
          sendAt: candidate.sendAt,
          leaseUntil: null,
          errorCode: null,
        },
      });
      await db.pushSubscription.update({ where: { id: device.id }, data: { lastSuccessAt: now } });
      sent++;
    } catch (error) {
      const status = Number(error?.statusCode) || 0;
      const permanent = [400, 401, 403, 404, 410, 413].includes(status) || job.attempts + 1 >= 4;
      if ([404, 410].includes(status))
        await db.pushSubscription.update({ where: { id: device.id }, data: { active: false } });
      await updateDelivery(db, "pushDelivery", {
        where: { id: job.id },
        data: {
          status: permanent ? "FAILED" : "PENDING",
          leaseUntil: null,
          errorCode: status ? `PUSH_${status}` : "NETWORK",
          nextAttemptAt: new Date(now.getTime() + Math.min(300, 15 * 2 ** job.attempts) * 1000),
        },
      });
    }
  }
  await db.pushDelivery.deleteMany({
    where: {
      subscription: { userId },
      updatedAt: { lt: new Date(now.getTime() - 90 * 86400000) },
      status: { not: "PENDING" },
    },
  });
  return { sent };
}
