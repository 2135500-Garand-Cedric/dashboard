import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { runReminderPass, reminderState } from "../src/lib/notifications/engine.mjs";
import { DAY_MS, reconcileItem, cleanupInbox } from "../src/lib/notifications/inbox.mjs";
import {
  inboxCommand,
  listInbox,
  inboxCount,
  notificationDetail,
} from "../src/lib/notifications/inbox-api.mjs";
import { reminderCandidate, DEFAULTS } from "../src/lib/notifications/rules.mjs";

const enabled = process.env.RUN_NOTIFICATION_DB_TEST === "1";
const now = new Date(`${new Date().toISOString().slice(0, 10)}T14:00:10Z`);
async function fixture(run) {
  assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
  assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  const rollback = new Error("ROLLBACK_INBOX_FIXTURE");
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const db = { ...tx, $transaction: (callback) => callback(tx) };
          const user = await tx.user.create({
            data: { email: `${randomUUID()}@invalid.test`, timeZone: "UTC" },
          });
          const userId = user.id;
          await tx.authSession.create({
            data: {
              userId,
              tokenHash: randomBytes(32).toString("hex"),
              authenticatedAt: new Date(now.getTime() - DAY_MS),
              expires: new Date(now.getTime() + 365 * DAY_MS),
            },
          });
          await tx.notificationSettings.create({
            data: {
              userId,
              enabled: false,
              milestones: true,
              weeklyReports: false,
              inboxStartedAt: new Date(now.getTime() - 30 * DAY_MS),
              enabledAt: new Date(now.getTime() - DAY_MS),
            },
          });
          const event = (title = "Event", fields = {}) =>
            tx.event.create({
              data: {
                userId,
                title,
                date: new Date(now.getTime() + 15 * 60000 - 10000),
                ...fields,
              },
            });
          const pass = (fields = {}) => runReminderPass(db, { userId, now, ...fields });
          const items = () =>
            tx.userNotification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
          const command = (item, action, body = { action }, fields = {}) =>
            inboxCommand(
              db,
              userId,
              {
                id: item.id,
                key: randomUUID(),
                revision: item.revision,
                body,
                action: action === "snooze" ? "snooze" : "update",
                ...fields,
              },
              now,
            );
          await run({ db, tx, userId, event, pass, items, command });
          throw rollback;
        },
        { timeout: 60000 },
      ),
      (error) => {
        if (error !== rollback) throw error;
        return true;
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

test(
  "inbox is independent of push, catches up seven days, respects activation and never duplicates",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, userId, event, pass, items, db }) => {
      await event("Due");
      await event("Three days late", {
        date: new Date(now.getTime() - 3 * DAY_MS),
        reminderMinutes: 0,
      });
      await event("Too old", { date: new Date(now.getTime() - 8 * DAY_MS), reminderMinutes: 0 });
      await event("Disabled event", { reminderMinutes: -1 });
      await event("Future", { date: new Date(now.getTime() + DAY_MS) });
      await Promise.all([pass(), pass()]);
      assert.equal((await items()).length, 2);
      assert.equal((await inboxCount(db, userId, now)).unread, 2);
      assert.equal(await tx.pushDelivery.count({ where: { subscription: { userId } } }), 0);
      await tx.notificationSettings.update({ where: { userId }, data: { inboxStartedAt: now } });
      await event("Before activation", { date: new Date(now.getTime() - DAY_MS) });
      await pass();
      assert.equal((await items()).length, 2);
      const page = await listInbox(db, userId, new URLSearchParams("limit=1"), now);
      assert.equal(page.items.length, 1);
      assert.ok(page.nextCursor);
      const next = await listInbox(
        db,
        userId,
        new URLSearchParams({ limit: "1", cursor: page.nextCursor }),
        now,
      );
      assert.notEqual(page.items[0].id, next.items[0].id);
      assert.equal(next.nextCursor, null);
    }),
);

test(
  "read/dismiss/undo, replay protection, revision conflicts and bulk cutoff preserve source state",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items, command }) => {
      const source = await event();
      await pass();
      let [item] = await items();
      const key = randomUUID();
      await command(item, "read", { action: "read" }, { key });
      await command(item, "read", { action: "read" }, { key });
      await assert.rejects(command(item, "unread"), (error) => error.status === 409);
      await assert.rejects(
        command(item, "dismiss", { action: "dismiss" }, { key }),
        (error) => error.status === 409,
      );
      [item] = await items();
      await command(item, "unread");
      [item] = await items();
      await command(item, "dismiss");
      assert.equal((await inboxCount(db, userId, now)).unread, 0);
      assert.equal(
        (await listInbox(db, userId, new URLSearchParams("view=history"), now)).items.length,
        1,
      );
      [item] = await items();
      await command(item, "undo");
      assert.equal((await inboxCount(db, userId, now)).unread, 1);
      // Capture after earlier commands; Prisma updatedAt uses the actual clock,
      // which may be later than this fixture's fixed 14:00 reference time.
      const cutoff = new Date(Math.max(Date.now(), now.getTime()));
      await event("Arrived later", { date: new Date(cutoff.getTime() + 16 * 60000) });
      const later = new Date(cutoff.getTime() + 2 * 60000);
      await pass({ now: later });
      await inboxCommand(
        db,
        userId,
        { key: randomUUID(), action: "read-all", body: { cutoff: cutoff.toISOString() } },
        later,
      );
      assert.equal(
        (await inboxCount(db, userId, later)).unread,
        1,
        "new arrivals are excluded from the earlier server cutoff",
      );
      const after = await tx.event.findUnique({ where: { id: source.id } });
      assert.deepEqual(after, source, "notification actions never change the source");
      const foreign = await tx.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
      await assert.rejects(
        notificationDetail(db, foreign.id, item.id),
        (error) => error.status === 404,
      );
    }),
);

test(
  "source reconciliation handles completion, deletion, disabling, rescheduling and old active sources",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items }) => {
      const completed = await event("Completed later");
      const removed = await event("Removed later");
      const moved = await event("Moved later");
      const muted = await event("Muted later");
      const old = await event("Old reminder");
      await pass();
      await tx.event.update({ where: { id: completed.id }, data: { completed: true } });
      await tx.event.delete({ where: { id: removed.id } });
      await tx.event.update({
        where: { id: moved.id },
        data: { date: new Date(now.getTime() + DAY_MS) },
      });
      await tx.event.update({ where: { id: muted.id }, data: { reminderMinutes: -1 } });
      await pass();
      const bySource = new Map((await items()).map((item) => [item.sourceId, item]));
      assert.equal(bySource.get(completed.id).retiredReason, "EVENT_COMPLETED");
      assert.equal(bySource.get(removed.id).retiredReason, "SOURCE_REMOVED");
      assert.equal(bySource.get(moved.id).lifecycle, "SUPERSEDED");
      assert.equal(bySource.get(muted.id).retiredReason, "REMINDERS_DISABLED");
      await pass({ now: new Date(now.getTime() + 12 * DAY_MS) });
      const oldItem = await tx.userNotification.findUnique({
        where: { id: bySource.get(old.id).id },
      });
      assert.equal(oldItem.lifecycle, "ACTIVE", "absence from the catch-up window is not deletion");
      await tx.event.update({ where: { id: completed.id }, data: { completed: false } });
      await pass();
      assert.equal(
        (await tx.userNotification.findUnique({ where: { id: bySource.get(completed.id).id } }))
          .lifecycle,
        "RESOLVED",
        "reopening the same occurrence cannot revive it",
      );
      await tx.notificationSettings.update({ where: { userId }, data: { events: false } });
      await pass();
      assert.equal(
        (await tx.userNotification.findUnique({ where: { id: oldItem.id } })).retiredReason,
        "REMINDERS_DISABLED",
      );
      await tx.notificationSettings.update({
        where: { userId },
        data: { events: true, categoryStartedAt: { events: now.toISOString() } },
      });
      await event("Before category reactivation", { date: new Date(now.getTime() - DAY_MS) });
      await pass();
      assert.ok(
        !(await items()).some((item) => item.titleSnapshot === "Before category reactivation"),
      );
    }),
);

test(
  "task, follow-up, work-session and milestone lifecycle is owner scoped and date-only identity survives timezone edits",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items }) => {
      const task = await tx.todo.create({
        data: { userId, title: "Task", deadlineDate: now.toISOString().slice(0, 10) },
      });
      const followUp = await tx.workFollowUp.create({
        data: { todoId: task.id, date: now.toISOString().slice(0, 10), reason: "Check" },
      });
      const session = await event("Work session", {
        kind: "WORK_SESSION",
        endDate: new Date(now.getTime() + 3600000),
        timeZone: "UTC",
      });
      await tx.eventTaskLink.create({
        data: { eventId: session.id, todoId: task.id, role: "SESSION_TARGET" },
      });
      const project = await tx.workProject.create({ data: { userId, name: "Project" } });
      const milestone = await tx.workKeyDate.create({
        data: { projectId: project.id, date: now.toISOString().slice(0, 10), label: "Milestone" },
      });
      await pass();
      assert.equal((await items()).length, 4);
      const deadline = (await items()).find((item) => item.sourceKind === "DEADLINE");
      await tx.user.update({ where: { id: userId }, data: { timeZone: "Asia/Tokyo" } });
      await pass();
      assert.equal((await items()).filter((item) => item.sourceKind === "DEADLINE").length, 1);
      assert.equal(
        (await tx.userNotification.findUnique({ where: { id: deadline.id } })).occurrenceKey,
        deadline.occurrenceKey,
      );
      await tx.workFollowUp.update({
        where: { id: followUp.id },
        data: { status: "COMPLETED", resolvedAt: now, outcome: "Resolved" },
      });
      await tx.todo.update({ where: { id: task.id }, data: { status: "DONE" } });
      await tx.workKeyDate.update({ where: { id: milestone.id }, data: { completedAt: now } });
      await pass();
      assert.ok((await items()).every((item) => item.lifecycle !== "ACTIVE"));
      assert.equal(
        (await items()).find((item) => item.sourceId === session.id && item.sourceKind === "EVENT")
          .retiredReason,
        "SESSION_TARGET_INACTIVE",
      );
    }),
);

test(
  "snoozes wake once after old target dates, create separate delivery generations and preserve failures",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items, command }) => {
      await tx.notificationSettings.update({ where: { userId }, data: { enabled: true } });
      const config = { publicKey: "fake-key" };
      for (const label of ["Phone", "Desktop"])
        await tx.pushSubscription.create({
          data: {
            userId,
            sessionId: (await tx.authSession.findFirst({ where: { userId } })).id,
            label,
            endpoint: `https://web.push.apple.com/${randomUUID()}`,
            p256dh: "fake",
            auth: randomBytes(16).toString("base64url"),
            vapidPublicKey: config.publicKey,
            createdAt: new Date(now.getTime() - DAY_MS),
          },
        });
      const source = await event();
      const sent = [];
      const send = async (message) => {
        sent.push(message);
      };
      await pass({ config, send });
      assert.equal(sent.length, 2);
      assert.equal((await items()).length, 1);
      let [item] = await items();
      await command(item, "read");
      [item] = await items();
      await command(item, "snooze", {
        local: `${new Date(now.getTime() + 12 * DAY_MS).toISOString().slice(0, 10)}T09:00`,
      });
      await assert.rejects(
        command(item, "snooze", { preset: "hour" }),
        (error) => error.status === 409,
      );
      await pass({ config, send });
      assert.equal((await inboxCount(db, userId, now)).unread, 0);
      const wake = new Date(
        `${new Date(now.getTime() + 12 * DAY_MS).toISOString().slice(0, 10)}T09:00:10Z`,
      );
      await Promise.all([pass({ config, send, now: wake }), pass({ config, send, now: wake })]);
      assert.equal(sent.length, 4);
      assert.equal((await inboxCount(db, userId, wake)).unread, 1);
      [item] = await items();
      assert.equal(item.snoozedUntil, null);
      assert.equal(item.generation, 1);
      assert.equal(
        (await tx.pushDelivery.findMany({ where: { notificationId: item.id, generation: 0 } }))
          .length,
        2,
      );
      assert.ok(sent[2].payload.tag.endsWith("-1"));
      assert.ok(sent[2].ttl > 1, "snoozing an old target retains a useful push TTL");
      assert.deepEqual(await tx.event.findUnique({ where: { id: source.id } }), source);
      await pass({ config, send, now: wake });
      assert.equal(sent.length, 4);
      await inboxCommand(
        db,
        userId,
        {
          id: item.id,
          key: randomUUID(),
          revision: item.revision,
          action: "snooze",
          body: { preset: "hour" },
        },
        wake,
      );
      await tx.event.update({ where: { id: source.id }, data: { completed: true } });
      await pass({ config, send, now: new Date(wake.getTime() + 3600001) });
      [item] = await items();
      assert.equal(item.lifecycle, "RESOLVED");
      assert.equal(sent.length, 4, "invalid source does not wake/send");
    }),
);

test(
  "retention runs without push, preserves sources/deliveries, and does not regenerate purged reminders",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items }) => {
      const source = await event();
      await pass();
      const [item] = await items();
      await tx.userNotification.update({
        where: { id: item.id },
        data: { createdAt: new Date(now.getTime() - 181 * DAY_MS) },
      });
      const state = await reminderState(db, userId);
      await reconcileItem(
        db,
        await tx.userNotification.findUnique({ where: { id: item.id } }),
        state,
        now,
      );
      assert.equal(
        (await tx.userNotification.findUnique({ where: { id: item.id } })).lifecycle,
        "EXPIRED",
      );
      await cleanupInbox(db, userId, new Date(now.getTime() + 91 * DAY_MS));
      assert.equal((await items()).length, 0);
      await pass({ now: new Date(now.getTime() + 91 * DAY_MS) });
      assert.equal((await items()).length, 0);
      assert.ok(await tx.event.findUnique({ where: { id: source.id } }));
    }),
);

test(
  "delivery ownership guard rejects foreign notifications and owner reassignment",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items }) => {
      await event();
      await pass();
      const [item] = await items();
      const foreign = await tx.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
      const device = await tx.pushSubscription.create({
        data: {
          userId: foreign.id,
          label: "Other",
          endpoint: `https://web.push.apple.com/${randomUUID()}`,
          p256dh: "fake",
          auth: "fake",
          vapidPublicKey: "fake",
        },
      });
      // Savepoints keep expected SQL constraint errors from aborting the fixture transaction.
      await tx.$executeRawUnsafe("SAVEPOINT owner_check");
      await assert.rejects(
        tx.pushDelivery.create({
          data: {
            subscriptionId: device.id,
            notificationId: item.id,
            sourceKind: item.sourceKind,
            sourceId: item.sourceId,
            occurrenceKey: item.occurrenceKey,
            targetAt: item.targetAt,
            sendAt: item.dueAt,
          },
        }),
        /ownership mismatch/,
      );
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT owner_check");
      await assert.rejects(
        tx.userNotification.update({ where: { id: item.id }, data: { userId: foreign.id } }),
        /cannot be reassigned/,
      );
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT owner_check");
    }),
);

test(
  "independent worker connections and concurrent snooze commands serialize without duplicate reminders or cycles",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    let userId;
    try {
      const owner = await db.user.create({
        data: { email: `${randomUUID()}@invalid.test`, timeZone: "UTC" },
      });
      userId = owner.id;
      const clock = new Date();
      await db.notificationSettings.create({
        data: { userId, enabled: false, inboxStartedAt: new Date(clock.getTime() - DAY_MS) },
      });
      await db.event.create({
        data: { userId, title: "Concurrency fixture", date: clock, reminderMinutes: 0 },
      });
      await Promise.all(
        Array.from({ length: 4 }, () => runReminderPass(db, { userId, now: clock })),
      );
      assert.equal(await db.userNotification.count({ where: { userId } }), 1);
      const item = await db.userNotification.findFirst({ where: { userId } });
      const command = {
        id: item.id,
        key: randomUUID(),
        revision: item.revision,
        body: { preset: "hour" },
        action: "snooze",
      };
      await Promise.all([
        inboxCommand(db, userId, command, clock),
        inboxCommand(db, userId, command, clock),
      ]);
      assert.equal(
        (await db.userNotification.findUnique({ where: { id: item.id } })).generation,
        1,
        "a lost-response retry replays the existing result",
      );
      const current = await db.userNotification.findUnique({ where: { id: item.id } });
      const competing = await Promise.allSettled([
        inboxCommand(
          db,
          userId,
          { ...command, key: randomUUID(), revision: current.revision },
          clock,
        ),
        inboxCommand(
          db,
          userId,
          { ...command, key: randomUUID(), revision: current.revision },
          clock,
        ),
      ]);
      assert.equal(competing.filter((value) => value.status === "fulfilled").length, 1);
      assert.equal(competing.find((value) => value.status === "rejected").reason.status, 409);
      assert.equal(
        (await db.userNotification.findUnique({ where: { id: item.id } })).generation,
        2,
      );
    } finally {
      if (userId) {
        await db.workMutationReceipt.deleteMany({ where: { userId } });
        await db.userNotification.deleteMany({ where: { userId } });
        await db.event.deleteMany({ where: { userId } });
        await db.notificationSettings.deleteMany({ where: { userId } });
        await db.auditEvent.deleteMany({ where: { userId } });
        await db.user.delete({ where: { id: userId } });
      }
      await db.$disconnect();
    }
  },
);

test(
  "legacy null-FK queued jobs drain without historical inbox backfill and inbox deletion preserves delivery history",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items }) => {
      const config = { publicKey: "legacy-fake" };
      await tx.notificationSettings.update({
        where: { userId },
        data: { enabled: true, inboxStartedAt: now },
      });
      const device = await tx.pushSubscription.create({
        data: {
          userId,
          sessionId: (await tx.authSession.findFirst({ where: { userId } })).id,
          label: "Legacy device",
          endpoint: `https://web.push.apple.com/${randomUUID()}`,
          p256dh: "fake",
          auth: "fake",
          vapidPublicKey: config.publicKey,
          createdAt: new Date(now.getTime() - DAY_MS),
        },
      });
      const source = await event("Legacy pending");
      const candidate = reminderCandidate(
        { kind: "EVENT", id: source.id, at: source.date },
        DEFAULTS,
        "UTC",
      );
      const legacy = await tx.pushDelivery.create({
        data: {
          subscriptionId: device.id,
          occurrenceKey: candidate.occurrenceKey,
          sourceKind: "EVENT",
          sourceId: source.id,
          targetAt: candidate.targetAt,
          sendAt: candidate.sendAt,
          nextAttemptAt: now,
        },
      });
      let sent = 0;
      await pass({
        config,
        send: async () => {
          sent++;
        },
      });
      assert.equal(sent, 1);
      assert.equal((await items()).length, 0);
      assert.equal(
        (await tx.pushDelivery.findUnique({ where: { id: legacy.id } })).notificationId,
        null,
      );
      await event("Current occurrence", { date: new Date(now.getTime() + 15 * 60000) });
      await pass({
        config,
        send: async () => {
          sent++;
        },
      });
      const [item] = await items();
      assert.ok(item);
      const linked = await tx.pushDelivery.findFirst({ where: { notificationId: item.id } });
      assert.ok(linked);
      await tx.userNotification.delete({ where: { id: item.id } });
      assert.equal(
        (await tx.pushDelivery.findUnique({ where: { id: linked.id } })).notificationId,
        null,
      );
    }),
);

test(
  "same-time occurrences remain distinct while title/color/lead-time edits preserve inbox decisions",
  { skip: !enabled },
  () =>
    fixture(async ({ tx, db, userId, event, pass, items, command }) => {
      const activity = await tx.activityType.create({
        data: { name: `Inbox color ${randomUUID()}`, color: "#10b981" },
      });
      const first = await event("Occurrence one", { type: activity.name });
      await event("Occurrence two", { type: activity.name });
      await pass();
      assert.equal((await items()).length, 2);
      let item = (await items()).find((row) => row.sourceId === first.id);
      await command(item, "read");
      item = (await items()).find((row) => row.id === item.id);
      await command(item, "dismiss");
      const saved = (await items()).find((row) => row.id === item.id);
      await tx.event.update({
        where: { id: first.id },
        data: { title: "Renamed occurrence", reminderMinutes: 30 },
      });
      await tx.activityType.update({ where: { id: activity.id }, data: { color: "#a855f7" } });
      await pass();
      const updated = await notificationDetail(db, userId, saved.id);
      assert.equal((await items()).length, 2);
      assert.equal(updated.titleSnapshot, "Renamed occurrence");
      assert.equal(updated.color, "#a855f7");
      assert.deepEqual(updated.readAt, saved.readAt);
      assert.deepEqual(updated.dismissedAt, saved.dismissedAt);
      assert.equal(updated.occurrenceKey, saved.occurrenceKey);
    }),
);
