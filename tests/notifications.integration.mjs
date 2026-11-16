import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import * as webpush from "web-push";
import { runReminderPass, reminderSources } from "../src/lib/notifications/engine.mjs";
import { pushConfiguration } from "../src/lib/notifications/rules.mjs";

const enabled = process.env.RUN_NOTIFICATION_DB_TEST === "1";
test(
  "reminder worker selects owned active sources, sends per device once, retries, revokes changes and expires subscriptions",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const prisma = new PrismaClient();
    const rollback = new Error("ROLLBACK_NOTIFICATION_FIXTURE");
    const keys = webpush.generateVAPIDKeys();
    const config = pushConfiguration({
      PUSH_ENABLED: "true",
      PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
      PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
      PUSH_VAPID_SUBJECT: "mailto:test@example.com",
      NEXTAUTH_URL: "https://example.com",
      NODE_ENV: "production",
    });
    try {
      await assert.rejects(
        prisma.$transaction(
          async (tx) => {
            const db = { ...tx, $transaction: (callback) => callback(tx) };
            const owner = await tx.user.create({
              data: { email: `${randomUUID()}@invalid.test`, timeZone: "UTC" },
            });
            const foreign = await tx.user.create({
              data: { email: `${randomUUID()}@invalid.test`, timeZone: "UTC" },
            });
            const userId = owner.id;
            const now = new Date("2026-11-20T14:00:10Z"),
              target = new Date("2026-11-20T14:15:00Z");
            const previous = new Date(now.getTime() - 3600000);
            await tx.notificationSettings.create({
              data: { userId, milestones: true, dateOnlyTime: "14:00", enabledAt: previous },
            });
            const device = (label, fields = {}) =>
              tx.pushSubscription.create({
                data: {
                  userId,
                  label,
                  endpoint: `https://web.push.apple.com/${randomUUID()}`,
                  p256dh: keys.publicKey,
                  auth: randomBytes(16).toString("base64url"),
                  vapidPublicKey: config.publicKey,
                  createdAt: previous,
                  ...fields,
                },
              });
            const first = await device("Phone"),
              second = await device("Desktop");
            await device("Disabled", { active: false });
            await device("Newly enrolled", { createdAt: now });
            await device("Rotated key", { vapidPublicKey: "older-key" });
            const event = (title, fields = {}) =>
              tx.event.create({ data: { title, userId, date: target, ...fields } });
            const meeting = await event("Private meeting");
            await event("Completed", { completed: true });
            await event("Off", { reminderMinutes: -1 });
            await event("Unscheduled", { date: null });
            await event("Other owner's event", { userId: foreign.id });
            const task = await tx.todo.create({
              data: { userId, title: "Deadline", deadlineAt: target, deadlineTimeZone: "UTC" },
            });
            const followUp = await tx.workFollowUp.create({
              data: { todoId: task.id, at: target, timeZone: "UTC", reason: "Check in" },
            });
            const project = await tx.workProject.create({
              data: { userId, name: "Reminder project" },
            });
            await tx.workKeyDate.create({
              data: { projectId: project.id, label: "Milestone", date: "2026-11-20" },
            });
            const sources = await reminderSources(db, userId, now);
            assert.equal(sources.filter((source) => source.minutes !== -1).length, 4);
            assert.ok(
              sources.some((source) => source.kind === "FOLLOW_UP" && source.id === followUp.id),
            );
            const delivered = [];
            const send = async (message) => {
              delivered.push(message);
            };
            await Promise.all([
              runReminderPass(db, { userId, now, config, send }),
              runReminderPass(db, { userId, now, config, send }),
            ]);
            assert.equal(
              delivered.length,
              8,
              "four sources × two existing devices, with no parallel duplicates",
            );
            assert.equal(
              await tx.pushDelivery.count({ where: { subscriptionId: first.id, status: "SENT" } }),
              4,
            );
            assert.ok(
              delivered.every((message) => [first.id, second.id].includes(message.subscription.id)),
            );
            await runReminderPass(db, { userId, now, config, send });
            assert.equal(
              delivered.length,
              8,
              "a restart/repeat pass cannot resend accepted occurrences",
            );
            await tx.event.update({
              where: { id: meeting.id },
              data: { title: "Renamed", reminderMinutes: 30 },
            });
            await runReminderPass(db, { userId, now, config, send });
            assert.equal(
              delivered.length,
              8,
              "changing a title/offset cannot resend an already delivered occurrence",
            );
            await tx.event.update({
              where: { id: meeting.id },
              data: { date: new Date("2026-11-20T15:00:00Z"), reminderMinutes: 60 },
            });
            await runReminderPass(db, { userId, now, config, send });
            assert.equal(delivered.length, 10, "moving an event creates a new occurrence");
            const cancelled = await event("Cancel after failed delivery");
            const failing = async () => {
              throw Object.assign(new Error("Do not log this"), { statusCode: 503 });
            };
            await runReminderPass(db, { userId, now, config, send: failing });
            assert.equal(
              await tx.pushDelivery.count({
                where: { sourceKind: "EVENT", sourceId: cancelled.id, status: "PENDING" },
              }),
              2,
            );
            await tx.event.update({ where: { id: cancelled.id }, data: { completed: true } });
            const retryAt = new Date(now.getTime() + 20000);
            await runReminderPass(db, { userId, now: retryAt, config, send });
            assert.equal(delivered.length, 10);
            assert.equal(
              await tx.pushDelivery.count({
                where: { sourceId: cancelled.id, sourceKind: "EVENT", status: "SKIPPED" },
              }),
              2,
            );
            const retryEvent = await event("Retry with current privacy setting");
            await runReminderPass(db, { userId, now, config, send: failing });
            await tx.notificationSettings.update({
              where: { userId },
              data: { showDetails: false },
            });
            await runReminderPass(db, { userId, now: retryAt, config, send });
            assert.equal(delivered.length, 12);
            assert.equal(delivered.at(-1).payload.title, "Dashboard reminder");
            assert.ok(!JSON.stringify(delivered.at(-1).payload).includes(retryEvent.title));
            const deleted = await event("Deleted before retry");
            await runReminderPass(db, { userId, now, config, send: failing });
            await tx.event.delete({ where: { id: deleted.id } });
            await runReminderPass(db, { userId, now: retryAt, config, send });
            assert.equal(delivered.length, 12);
            const expired = await event("Too late after downtime");
            await runReminderPass(db, { userId, now, config, send: failing });
            await runReminderPass(db, {
              userId,
              now: new Date(now.getTime() + 16 * 60000),
              config,
              send,
            });
            assert.equal(delivered.length, 12);
            assert.equal(
              await tx.pushDelivery.count({
                where: { sourceKind: "EVENT", sourceId: expired.id, errorCode: "EXPIRED" },
              }),
              2,
            );
            await event("Expired registrations");
            await runReminderPass(db, {
              userId,
              now,
              config,
              send: async () => {
                throw Object.assign(new Error("Gone"), { statusCode: 410 });
              },
            });
            assert.equal(
              (await tx.pushSubscription.findUnique({ where: { id: first.id } })).active,
              false,
            );
            assert.equal(
              (await tx.pushSubscription.findUnique({ where: { id: second.id } })).active,
              false,
            );
            assert.equal(
              (
                await tx.pushSubscription.findUnique({ where: { id: first.id } })
              ).lastSuccessAt.toISOString(),
              retryAt.toISOString(),
            );
            // An archived session target must not produce a work-session reminder.
            const session = await event("Work session", {
              kind: "WORK_SESSION",
              endDate: new Date(target.getTime() + 3600000),
              timeZone: "UTC",
            });
            await tx.eventTaskLink.create({
              data: { eventId: session.id, todoId: task.id, role: "SESSION_TARGET" },
            });
            await tx.todo.update({ where: { id: task.id }, data: { archivedAt: now } });
            assert.ok(
              !(await reminderSources(db, userId, now)).some(
                (source) => source.id === session.id && source.kind === "EVENT",
              ),
            );
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

test(
  "owner notification APIs register devices safely, hide subscription secrets, validate settings and disable pending jobs",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { loadWorkModule } = await import("./helpers/work-support.mjs");
    const rules = await import("../src/lib/notifications/rules.mjs");
    const engine = await import("../src/lib/notifications/engine.mjs");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const prisma = new PrismaClient(),
      rollback = new Error("ROLLBACK_NOTIFICATION_API");
    const keys = webpush.generateVAPIDKeys();
    const env = {
      PUSH_ENABLED: "true",
      PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
      PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
      PUSH_VAPID_SUBJECT: "mailto:test@example.com",
      NEXTAUTH_URL: "https://example.com",
    };
    const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    try {
      await assert.rejects(
        prisma.$transaction(
          async (tx) => {
            const db = { ...tx, $transaction: (callback) => callback(tx) };
            await tx.pushSubscription.updateMany({ where: { userId: 1 }, data: { active: false } });
            let sent = 0;
            const server = loadWorkModule("src/lib/notifications/server.ts", {
              "@/lib/prisma": { prisma: db },
              "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1 },
              "./rules.mjs": rules,
              "./engine.mjs": {
                ...engine,
                sendPush: async () => {
                  sent++;
                },
              },
            });
            const dependencies = {
              "@/lib/require-owner": { requireOwner: async () => null },
              "@/lib/notifications/server": server,
            };
            const subscriptions = loadWorkModule(
              "src/app/api/notifications/subscriptions/route.ts",
              dependencies,
            );
            const settings = loadWorkModule("src/app/api/notifications/route.ts", dependencies);
            const testRoute = loadWorkModule(
              "src/app/api/notifications/test/route.ts",
              dependencies,
            );
            const request = (method, body) =>
              new Request("https://example.com/api/notifications", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
            const input = {
              endpoint: `https://web.push.apple.com/${randomUUID()}`,
              label: "Phone",
              keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString("base64url") },
            };
            const registered = await subscriptions.POST(request("POST", input));
            assert.equal(registered.status, 200);
            const { id } = await registered.json();
            assert.equal(
              (await (await subscriptions.POST(request("POST", input))).json()).id,
              id,
              "registration is idempotent",
            );
            const overview = await (
              await settings.GET(new Request("https://example.com/api/notifications"))
            ).json();
            assert.equal(overview.configured, true);
            assert.equal(overview.devices.length, 1);
            assert.ok(!JSON.stringify(overview).includes(input.endpoint));
            assert.ok(!JSON.stringify(overview).includes(input.keys.auth));
            assert.ok(!JSON.stringify(overview).includes(keys.privateKey));
            assert.equal(
              (
                await settings.PATCH(
                  request("PATCH", { leadMinutes: 60, dateOnlyTime: "08:30", showDetails: false }),
                )
              ).status,
              200,
            );
            assert.equal(
              (await tx.notificationSettings.findUnique({ where: { userId: 1 } })).leadMinutes,
              60,
            );
            assert.equal((await settings.PATCH(request("PATCH", { userId: 2 }))).status, 400);
            assert.equal(
              (
                await subscriptions.POST(
                  request("POST", { ...input, endpoint: "https://localhost/private" }),
                )
              ).status,
              400,
            );
            assert.equal((await testRoute.POST(request("POST", { id }))).status, 200);
            assert.equal((await testRoute.POST(request("POST", { id }))).status, 429);
            assert.equal(sent, 1, "test sends are rate-limited and use the injected fake sender");
            const foreign = await tx.user.create({
              data: { email: `${randomUUID()}@invalid.test` },
            });
            const other = await tx.pushSubscription.create({
              data: {
                userId: foreign.id,
                endpoint: `https://web.push.apple.com/${randomUUID()}`,
                p256dh: keys.publicKey,
                auth: input.keys.auth,
                vapidPublicKey: keys.publicKey,
                label: "Other owner",
              },
            });
            assert.equal(
              (await subscriptions.DELETE(request("DELETE", { id: other.id }))).status,
              404,
            );
            assert.equal(
              (await subscriptions.POST(request("POST", { ...input, endpoint: other.endpoint })))
                .status,
              403,
            );
            assert.equal((await subscriptions.DELETE(request("DELETE", { id }))).status, 200);
            assert.equal((await tx.pushSubscription.findUnique({ where: { id } })).active, false);
            assert.equal((await testRoute.POST(request("POST", { id }))).status, 429);
            throw rollback;
          },
          { timeout: 30000 },
        ),
        (error) => {
          if (error !== rollback) throw error;
          return true;
        },
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await prisma.$disconnect();
    }
  },
);

test(
  "changing a failed reminder's offset defers its retry to the new time instead of losing it",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const prisma = new PrismaClient(),
      rollback = new Error("ROLLBACK_RESCHEDULE");
    const keys = webpush.generateVAPIDKeys();
    const config = { publicKey: keys.publicKey };
    try {
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          const db = { ...tx, $transaction: (callback) => callback(tx) };
          const owner = await tx.user.create({
            data: { email: `${randomUUID()}@invalid.test`, timeZone: "UTC" },
          });
          const userId = owner.id;
          const now = new Date("2026-11-20T14:00:10Z"),
            before = new Date("2026-11-20T13:00:00Z");
          await tx.notificationSettings.create({ data: { userId, enabledAt: before } });
          await tx.pushSubscription.create({
            data: {
              userId,
              label: "Test",
              endpoint: `https://web.push.apple.com/${randomUUID()}`,
              p256dh: keys.publicKey,
              auth: randomBytes(16).toString("base64url"),
              vapidPublicKey: config.publicKey,
              createdAt: before,
            },
          });
          const event = await tx.event.create({
            data: { userId, title: "Reschedule retry", date: new Date("2026-11-20T14:15:00Z") },
          });
          await runReminderPass(db, {
            userId,
            now,
            config,
            send: async () => {
              throw { statusCode: 503 };
            },
          });
          await tx.event.update({ where: { id: event.id }, data: { reminderMinutes: 5 } });
          let sent = 0;
          const send = async () => {
            sent++;
          };
          await runReminderPass(db, {
            userId,
            now: new Date("2026-11-20T14:01:00Z"),
            config,
            send,
          });
          assert.equal(sent, 0);
          const pending = await tx.pushDelivery.findFirst({ where: { subscription: { userId } } });
          assert.equal(pending.status, "PENDING");
          assert.equal(pending.nextAttemptAt.toISOString(), "2026-11-20T14:10:00.000Z");
          await runReminderPass(db, {
            userId,
            now: new Date("2026-11-20T14:10:10Z"),
            config,
            send,
          });
          assert.equal(sent, 1);
          throw rollback;
        }),
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
