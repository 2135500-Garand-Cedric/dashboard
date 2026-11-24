import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { runReminderPass, reminderState } from "../src/lib/notifications/engine.mjs";
import { notificationDetail } from "../src/lib/notifications/inbox-api.mjs";
import { latestWeeklyReportSource } from "../src/lib/notifications/weekly-report.mjs";

test(
  "weekly report inbox and push are restart-safe, owner-scoped and respect settings",
  {
    skip: process.env.RUN_WEEKLY_REPORT_NOTIFICATION_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const prisma = new PrismaClient();
    const rollback = new Error("ROLLBACK_WEEKLY_NOTIFICATION_FIXTURE");
    try {
      await assert.rejects(
        prisma.$transaction(
          async (tx) => {
            const db = { ...tx, $transaction: (fn) => fn(tx) };
            const now = new Date("2026-11-23T09:00:10Z");
            const before = new Date("2026-11-22T00:00:00Z");
            const user = await tx.user.create({
              data: { email: `${randomUUID()}@invalid.test`, timeZone: "UTC" },
            });
            const userId = user.id;
            await tx.notificationSettings.create({
              data: { userId, enabledAt: before, inboxStartedAt: before },
            });
            const config = { publicKey: "test-key" };
            const device = await tx.pushSubscription.create({
              data: {
                userId,
                endpoint: `https://web.push.apple.com/${randomUUID()}`,
                label: "Test phone",
                p256dh: "test",
                auth: "test",
                vapidPublicKey: config.publicKey,
                createdAt: before,
              },
            });
            const sent = [];
            const send = async (message) => {
              sent.push(message);
            };
            const pass = (at = now, options = {}) =>
              runReminderPass(db, { userId, now: at, config, send, ...options });
            await pass(new Date("2026-11-23T08:59:59Z"));
            assert.equal(sent.length, 0);
            assert.equal(await tx.userNotification.count({ where: { userId } }), 0);
            await pass();
            await pass();
            assert.equal(sent.length, 1, "one delivery despite repeated worker passes");
            const item = await tx.userNotification.findFirstOrThrow({ where: { userId } });
            assert.equal(item.sourceKind, "WEEKLY_REPORT");
            assert.equal(item.category, "weeklyReports");
            assert.equal(item.sourceId, 20261116);
            assert.equal(sent[0].payload.url, `/notifications/${item.id}`);
            const detail = await notificationDetail(db, userId, item.id);
            assert.equal(detail.url, "/weekly-report?week=2026-11-16");
            await assert.rejects(notificationDetail(db, userId + 100000, item.id), /not found/);
            assert.equal(await tx.pushDelivery.count({ where: { subscriptionId: device.id } }), 1);
            // A snoozed weekly reminder still resolves and delivers through the common queue.
            const later = new Date(now.getTime() + 3600000);
            await tx.userNotification.update({
              where: { id: item.id },
              data: { generation: 1, snoozedUntil: later, dueAt: later },
            });
            await pass(later);
            assert.equal(sent.length, 2);
            // No future report is generated, and the old report remains openable next week.
            const next = new Date("2026-11-30T09:00:10Z");
            await pass(next);
            await pass(next);
            assert.equal(sent.length, 3);
            assert.equal(await tx.userNotification.count({ where: { userId } }), 2);
            assert.equal((await notificationDetail(db, userId, item.id)).url, detail.url);
            // Disabling just this category retires its notifications without touching reports.
            await tx.notificationSettings.update({
              where: { userId },
              data: { weeklyReports: false },
            });
            await pass(next);
            assert.equal(
              await tx.userNotification.count({ where: { userId, lifecycle: "ACTIVE" } }),
              0,
            );
            await tx.notificationSettings.update({
              where: { userId },
              data: {
                weeklyReports: true,
                categoryStartedAt: { weeklyReports: next.toISOString() },
              },
            });
            await pass(next);
            assert.equal(sent.length, 3, "reenabling does not replay previous reminders");
            // Push opt-out still permits the inbox on a later week.
            const following = new Date("2026-12-07T09:00:10Z");
            await tx.notificationSettings.update({ where: { userId }, data: { enabled: false } });
            await pass(following);
            assert.equal(sent.length, 3);
            assert.equal(
              await tx.userNotification.count({ where: { userId, lifecycle: "ACTIVE" } }),
              1,
            );
            assert.equal((await reminderState(db, userId)).settings.weeklyReports, true);
            assert.equal(latestWeeklyReportSource("UTC", following).id, 20261130);
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
  },
);
