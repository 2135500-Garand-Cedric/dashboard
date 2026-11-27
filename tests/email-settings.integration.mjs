import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  readEmailPreferences,
  saveEmailPreferences,
  withEmailPermission,
} from "../src/lib/email/preferences.mjs";
import { emailConfiguration } from "../src/lib/email/resend.mjs";
import { enqueueEmail, deliverEmails } from "../src/lib/email/queue.mjs";

const env = {
  EMAIL_ENABLED: "true",
  RESEND_API_KEY: "re_fake_test_key",
  EMAIL_FROM: "reports@example.com",
  EMAIL_TO: "ignored@example.com",
};
const message = {
  from: env.EMAIL_FROM,
  to: "owner@example.com",
  subject: "Permission test",
  text: "Example",
};
const enabled = process.env.RUN_EMAIL_DB_TEST === "1";

async function database() {
  assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
  assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  return new PrismaClient();
}

test(
  "email off is authoritative, recipient changes cancel old jobs, and stale settings conflict",
  { skip: !enabled },
  async () => {
    const prisma = await database();
    const rollback = new Error("ROLLBACK_EMAIL_PREFERENCES");
    try {
      await assert.rejects(
        prisma.$transaction(
          async (tx) => {
            const db = { ...tx, $transaction: (read) => read(tx) };
            const owner = await db.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
            const userId = owner.id;
            assert.deepEqual(await readEmailPreferences(db, userId), {
              enabled: false,
              recipient: "",
              revision: 0,
            });
            await assert.rejects(
              withEmailPermission(db, userId, message, () => assert.fail("Off must not send"), env),
              /EMAIL_DISABLED/,
            );
            const saved = await saveEmailPreferences(db, userId, {
              enabled: true,
              recipient: message.to,
              revision: 0,
            });
            const config = emailConfiguration(env, saved);
            let sent = 0;
            const job = await enqueueEmail(db, userId, {
              kind: "test",
              key: "permission:1",
              payload: {},
            });
            await deliverEmails(db, {
              userId,
              config,
              env,
              prepare: async () => {
                await saveEmailPreferences(db, userId, { ...saved, enabled: false });
                return message;
              },
              send: async () => {
                sent++;
                return { id: "fake" };
              },
            });
            assert.equal(sent, 0, "disabling during preparation prevents delivery");
            assert.equal(
              (await db.emailDelivery.findUniqueOrThrow({ where: { id: job.id } })).status,
              "FAILED",
            );
            const off = await readEmailPreferences(db, userId);
            const old = await enqueueEmail(db, userId, {
              kind: "test",
              key: "permission:2",
              payload: {},
            });
            await db.emailDelivery.update({
              where: { id: old.id },
              data: { message, firstAttemptAt: new Date() },
            });
            const changed = await saveEmailPreferences(db, userId, {
              enabled: true,
              recipient: "new@example.com",
              revision: off.revision,
            });
            assert.equal(
              (await db.emailDelivery.findUniqueOrThrow({ where: { id: old.id } })).status,
              "UNKNOWN",
            );
            await assert.rejects(
              withEmailPermission(
                db,
                userId,
                message,
                () => assert.fail("Stale recipient must not send"),
                env,
              ),
              /EMAIL_RECIPIENT_CHANGED/,
            );
            await assert.rejects(
              withEmailPermission(
                db,
                userId,
                { ...message, to: changed.recipient },
                () => assert.fail("Environment kill switch must block"),
                { ...env, EMAIL_ENABLED: "false" },
              ),
              /EMAIL_DISABLED/,
            );
            await assert.rejects(
              saveEmailPreferences(db, userId, {
                enabled: false,
                recipient: changed.recipient,
                revision: saved.revision,
              }),
              (error) => error.status === 409,
            );
            assert.equal((await readEmailPreferences(db, userId)).enabled, true);
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
  "a confirmed disable serializes with an in-flight send and blocks every later delivery",
  { skip: !enabled, timeout: 60000 },
  async () => {
    const prisma = await database();
    let userId, release, sending;
    try {
      const owner = await prisma.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
      userId = owner.id;
      const settings = await saveEmailPreferences(prisma, userId, {
        enabled: true,
        recipient: message.to,
        revision: 0,
      });
      const config = emailConfiguration(env, settings);
      const first = await enqueueEmail(prisma, userId, {
        kind: "test",
        key: "race:first",
        payload: {},
      });
      let entered;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const hold = new Promise((resolve) => {
        release = resolve;
      });
      let sends = 0;
      sending = deliverEmails(prisma, {
        userId,
        config,
        env,
        prepare: async () => message,
        send: async () => {
          sends++;
          entered();
          await hold;
          return { id: "accepted-test" };
        },
      });
      await started;
      let disabled = false;
      const disabling = saveEmailPreferences(prisma, userId, { ...settings, enabled: false }).then(
        () => {
          disabled = true;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(disabled, false, "disable waits for an already-started request to settle");
      release();
      await Promise.all([sending, disabling]);
      assert.equal(
        (await prisma.emailDelivery.findUniqueOrThrow({ where: { id: first.id } })).status,
        "SENT",
      );
      assert.equal((await readEmailPreferences(prisma, userId)).enabled, false);
      await enqueueEmail(prisma, userId, { kind: "test", key: "race:later", payload: {} });
      await deliverEmails(prisma, {
        userId,
        config,
        env,
        prepare: async () => message,
        send: async () => {
          sends++;
          return { id: "must-not-send" };
        },
      });
      assert.equal(sends, 1, "a stale worker configuration cannot bypass the saved off switch");
    } finally {
      release?.();
      await sending?.catch(() => {});
      if (userId) {
        await prisma.emailDelivery.deleteMany({ where: { userId } });
        await prisma.emailSettings.deleteMany({ where: { userId } });
        await prisma.auditEvent.deleteMany({where:{userId}});
        await prisma.user.delete({ where: { id: userId } });
      }
      await prisma.$disconnect();
    }
  },
);
