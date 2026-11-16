import * as webpush from "web-push";
import { DEFAULTS, GRACE_MS, reminderCandidate, reminderPayload } from "./rules.mjs";

/** @param {import('../../generated/prisma/index.js').PrismaClient} db */
export async function reminderSources(db, userId, now = new Date()) {
  const start = new Date(now.getTime() - GRACE_MS);
  const end = new Date(now.getTime() + 9 * 86400000);
  // Extra calendar days cover the extreme UTC offsets and DST transitions.
  const dates = {
    gte: new Date(start.getTime() - 2 * 86400000).toISOString().slice(0, 10),
    lte: end.toISOString().slice(0, 10),
  };
  const activeTask = { userId, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] } };
  const [events, tasks, followUps, milestones] = await Promise.all([
    db.event.findMany({
      where: {
        userId,
        completed: false,
        conversions: { none: { active: true, mode: "PLACEHOLDER" } },
        OR: [{ date: { gte: start, lte: end } }, { allDayStart: dates }],
      },
      include: {
        taskLinks: {
          include: { todo: { select: { status: true, archivedAt: true, userId: true } } },
        },
      },
    }),
    db.todo.findMany({
      where: {
        ...activeTask,
        OR: [{ deadlineAt: { gte: start, lte: end } }, { deadlineDate: dates }],
      },
      select: { id: true, title: true, deadlineAt: true, deadlineDate: true },
    }),
    db.workFollowUp.findMany({
      where: {
        status: "ACTIVE",
        todo: activeTask,
        OR: [{ at: { gte: start, lte: end } }, { date: dates }],
      },
      include: { todo: { select: { title: true } } },
    }),
    db.workKeyDate.findMany({
      where: {
        todoId: null,
        removedAt: null,
        completedAt: null,
        project: { userId, archivedAt: null, status: "ACTIVE" },
        OR: [{ at: { gte: start, lte: end } }, { date: dates }],
      },
      select: { id: true, label: true, at: true, date: true, projectId: true },
    }),
  ]);
  return [
    ...events
      .filter(
        (event) =>
          event.kind !== "WORK_SESSION" ||
          event.taskLinks.some(
            (link) =>
              link.role === "SESSION_TARGET" &&
              link.todo.userId === userId &&
              !link.todo.archivedAt &&
              !["DONE", "CANCELLED"].includes(link.todo.status),
          ),
      )
      .map((event) => ({
        kind: "EVENT",
        id: event.id,
        title: event.title,
        label: event.kind === "WORK_SESSION" ? "Work session" : "Event",
        option: event.kind === "WORK_SESSION" ? "sessions" : "events",
        at: event.date,
        date: event.allDayStart,
        minutes: event.reminderMinutes,
        url: `/events/${event.id}`,
      })),
    ...tasks.map((task) => ({
      kind: "DEADLINE",
      id: task.id,
      title: task.title,
      label: "Task deadline",
      option: "deadlines",
      at: task.deadlineAt,
      date: task.deadlineDate,
      url: `/todos/${task.id}`,
    })),
    ...followUps.map((followUp) => ({
      kind: "FOLLOW_UP",
      id: followUp.id,
      title: followUp.todo.title,
      label: "Follow-up",
      option: "followUps",
      at: followUp.at,
      date: followUp.date,
      url: `/todos/${followUp.todoId}`,
    })),
    ...milestones.map((milestone) => ({
      kind: "MILESTONE",
      id: milestone.id,
      title: milestone.label,
      label: "Project milestone",
      option: "milestones",
      at: milestone.at,
      date: milestone.date,
      url: `/projects/${milestone.projectId}`,
    })),
  ];
}

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
    pending.map((job) => [`${job.subscriptionId}:${job.occurrenceKey}`, job]),
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
          await db.pushDelivery.updateMany({
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
      candidate.sendAt.getTime() < now.getTime() - GRACE_MS
    )
      continue;
    for (const device of devices) {
      // Newly registered devices never get a backlog of old reminders.
      if (candidate.sendAt < device.createdAt || candidate.sendAt < settings.enabledAt) continue;
      await db.pushDelivery.upsert({
        where: {
          subscriptionId_occurrenceKey: {
            subscriptionId: device.id,
            occurrenceKey: candidate.occurrenceKey,
          },
        },
        update: {},
        create: {
          subscriptionId: device.id,
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
  await db.pushDelivery.updateMany({
    where: {
      subscription: { userId },
      status: "PENDING",
      sendAt: { lt: new Date(now.getTime() - GRACE_MS) },
    },
    data: { status: "SKIPPED", errorCode: "EXPIRED", leaseUntil: null },
  });
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
    const claimed = await db.pushDelivery.updateMany({
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
    const latestSources =
      current?.settings.enabled && device ? await reminderSources(db, userId, now) : [];
    const source = latestSources.find(
      (item) => item.id === job.sourceId && item.kind === job.sourceKind,
    );
    const candidate =
      source && current.settings[source.option]
        ? reminderCandidate(source, current.settings, current.zone)
        : null;
    if (
      candidate &&
      device &&
      candidate.occurrenceKey === job.occurrenceKey &&
      candidate.sendAt > now
    ) {
      await db.pushDelivery.update({
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
      candidate.sendAt < current.settings.enabledAt ||
      candidate.sendAt < device.createdAt
    ) {
      await db.pushDelivery.update({
        where: { id: job.id },
        data: { status: "SKIPPED", errorCode: "CHANGED", leaseUntil: null },
      });
      continue;
    }
    try {
      await send({
        subscription: device,
        payload: reminderPayload(candidate, current.settings, current.zone),
        config,
        ttl: Math.max(
          1,
          Math.min(
            3600,
            Math.ceil((candidate.targetAt.getTime() + GRACE_MS - now.getTime()) / 1000),
          ),
        ),
      });
      await db.pushDelivery.update({
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
      const permanent = [400, 401, 403, 404, 410, 413].includes(status) || job.attempts >= 4;
      if ([404, 410].includes(status))
        await db.pushSubscription.update({ where: { id: device.id }, data: { active: false } });
      await db.pushDelivery.update({
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
