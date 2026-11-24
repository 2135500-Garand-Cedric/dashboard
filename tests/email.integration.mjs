import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { enqueueEmail, deliverEmails } from "../src/lib/email/queue.mjs";
import { EmailError } from "../src/lib/email/resend.mjs";

test(
  "shared email outbox deduplicates, preserves retry bytes, bounds ambiguity and supports unrelated templates",
  {
    skip: process.env.RUN_EMAIL_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const prisma = new PrismaClient();
    const rollback = new Error("ROLLBACK_EMAIL_FIXTURE");
    try {
      await assert.rejects(
        prisma.$transaction(
          async (db) => {
            const user = await db.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
            const userId = user.id,
              now = new Date();
            const input = {
              kind: "weekly-report",
              key: "weekly-report:2026-11-16",
              payload: { week: "2026-11-16" },
            };
            const a = await enqueueEmail(db, userId, input, now);
            const b = await enqueueEmail(db, userId, input, now);
            assert.equal(a.id, b.id);
            let prepared = 0,
              calls = 0;
            const message = {
              from: "reports@example.com",
              to: "owner@example.com",
              subject: "Report",
              text: "Summary",
              attachments: [{ filename: "report.pdf", content: "fixed-base64" }],
            };
            const prepare = async () => {
              prepared++;
              return message;
            };
            const send = async (value, options) => {
              calls++;
              assert.deepEqual(value, message);
              assert.equal(options.key, `dashboard/${a.id}`);
              if (calls === 1) throw new EmailError("EMAIL_NETWORK", true);
              return { id: "provider-1" };
            };
            const config = { apiKey: "fake" };
            assert.equal((await deliverEmails(db, { userId, config, prepare, send, now })).sent, 0);
            let job = await db.emailDelivery.findUniqueOrThrow({ where: { id: a.id } });
            assert.equal(job.status, "PENDING");
            assert.deepEqual(job.message, message);
            assert.equal(
              (await deliverEmails(db, { userId, config, prepare, send, now: job.nextAttemptAt }))
                .sent,
              1,
            );
            assert.equal(prepared, 1, "retry never regenerates the PDF/body");
            await deliverEmails(db, { userId, config, prepare, send, now: job.nextAttemptAt });
            assert.equal(calls, 2);
            const other = await db.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
            await enqueueEmail(db, other.id, input, now);
            assert.equal(
              (await db.emailDelivery.findUniqueOrThrow({ where: { id: a.id } })).providerId,
              "provider-1",
            );
            // Shared infrastructure also supports another feature, independent of the report.
            const alert = await enqueueEmail(
              db,
              userId,
              { kind: "example-alert", key: "alert:1", payload: { note: "example" } },
              now,
            );
            await db.emailDelivery.update({
              where: { id: alert.id },
              data: { firstAttemptAt: new Date(now.getTime() - 21 * 3600000), message },
            });
            await deliverEmails(db, {
              userId,
              config,
              prepare,
              send: () => assert.fail("Expired ambiguity must not resend"),
              now,
            });
            assert.equal(
              (await db.emailDelivery.findUniqueOrThrow({ where: { id: alert.id } })).status,
              "UNKNOWN",
            );
            const rejected = await enqueueEmail(
              db,
              userId,
              { kind: "example-alert", key: "alert:2", payload: {} },
              now,
            );
            await deliverEmails(db, {
              userId,
              config,
              prepare,
              send: async () => {
                throw new EmailError("RESEND_HTTP_401");
              },
              now,
            });
            assert.equal(
              (await db.emailDelivery.findUniqueOrThrow({ where: { id: rejected.id } })).status,
              "FAILED",
            );
            const off = await enqueueEmail(
              db,
              userId,
              { kind: "weekly-report", key: "weekly-report:disabled", payload: {} },
              now,
            );
            await deliverEmails(db, {
              userId,
              config,
              prepare,
              allowed: () => false,
              send: () => assert.fail("Disabled email must not send"),
              now,
            });
            assert.equal(
              (await db.emailDelivery.findUniqueOrThrow({ where: { id: off.id } })).errorCode,
              "EMAIL_TEMPLATE_DISABLED",
            );
            await db.emailDelivery.update({
              where: { id: a.id },
              data: { updatedAt: new Date(now.getTime() - 31 * 86400000) },
            });
            await deliverEmails(db, { userId, config, prepare, send, now });
            assert.equal(
              (await db.emailDelivery.findUniqueOrThrow({ where: { id: a.id } })).message,
              null,
            );
            assert.equal(
              (await enqueueEmail(db, userId, input, now)).id,
              a.id,
              "retention preserves deduplication",
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
