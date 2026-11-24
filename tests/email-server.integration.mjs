import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { loadWorkModule } from "./helpers/work-support.mjs";
import { weeklyModules } from "./helpers/weekly-report.mjs";
import { weeklyPdfFixture } from "./helpers/weekly-pdf-fixture.mjs";
import { renderWeeklyReportPdf } from "../src/lib/weekly-report/pdf.mjs";
import * as transport from "../src/lib/email/resend.mjs";
import * as queue from "../src/lib/email/queue.mjs";
import * as sources from "../src/lib/notifications/weekly-report.mjs";
import * as rules from "../src/lib/notifications/rules.mjs";

test(
  "generic email API registry schedules a weekly PDF, uses CAD/all and keeps delivery status private",
  {
    skip: process.env.RUN_EMAIL_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const prisma = new PrismaClient();
    const rollback = new Error("ROLLBACK_EMAIL_SERVER");
    const values = {
      EMAIL_ENABLED: "true",
      RESEND_API_KEY: "re_test_not_a_real_key",
      EMAIL_FROM: "reports@example.com",
      EMAIL_TO: "owner@example.com",
      WEEKLY_REPORT_EMAIL_ENABLED: "true",
      NEXTAUTH_URL: "https://dashboard.example.com",
    };
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    try {
      await assert.rejects(
        prisma.$transaction(
          async (db) => {
            const owner = await db.user.upsert({
              where: { id: 1 },
              create: { id: 1, email: `${randomUUID()}@invalid.test` },
              update: {},
            });
            // Use an isolated owner ID in this injected server; production is fixed to 1.
            const user = await db.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
            await db.notificationSettings.create({
              data: { userId: user.id, dateOnlyTime: "09:00" },
            });
            const delivered = [];
            const report = weeklyPdfFixture();
            const server = loadWorkModule("src/lib/email/server.ts", {
              "@/lib/prisma": { prisma: db },
              "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: user.id },
              "@/lib/user-settings": { readUserSettings: async () => ({ timeZone: "UTC" }) },
              "@/lib/time-zone-context": { runInTimeZone: (_zone, read) => read() },
              "@/lib/weekly-report/period": weeklyModules(null).period,
              "@/lib/weekly-report/server": {
                weeklyReport: async (params) => {
                  assert.equal(params.get("currency"), "CAD");
                  assert.equal(params.get("dataset"), "all");
                  return report;
                },
              },
              "@/lib/weekly-report/pdf.mjs": { renderWeeklyReportPdf },
              "@/lib/notifications/weekly-report.mjs": sources,
              "@/lib/notifications/rules.mjs": rules,
              "./resend.mjs": transport,
              "./queue.mjs": {
                ...queue,
                deliverEmails: (client, options) =>
                  queue.deliverEmails(client, {
                    ...options,
                    send: async (message) => {
                      delivered.push(message);
                      return { id: "provider-test" };
                    },
                  }),
              },
            });
            assert.equal(owner.id, 1);
            await server.processEmailQueue(new Date("2026-11-23T08:59:00Z"));
            assert.equal(delivered.length, 0);
            await server.processEmailQueue(new Date("2026-11-23T09:00:10Z"));
            await server.processEmailQueue(new Date("2026-11-23T09:01:10Z"));
            assert.equal(delivered.length, 1);
            assert.equal(delivered[0].to, values.EMAIL_TO);
            const pdf = await PDFDocument.load(
              Buffer.from(delivered[0].attachments[0].content, "base64"),
            );
            assert.equal(pdf.getPageCount(), 1);
            const response = await server.queueRequestedEmail({
              kind: "weekly-report",
              data: { week: "2026-11-16" },
            });
            assert.equal(
              (await response.json()).status,
              "SENT",
              "manual retry reuses the scheduled job",
            );
            await assert.rejects(
              server.queueRequestedEmail({ kind: "other" }),
              /EMAIL_JOB_INVALID/,
            );
            await assert.rejects(
              server.queueRequestedEmail({
                kind: "weekly-report",
                data: {},
                to: "stranger@example.com",
              }),
              /EMAIL_JOB_INVALID/,
            );
            const status = await (await server.emailDeliveryStatus()).json();
            assert.equal(status.items.length, 1);
            assert.ok(!JSON.stringify(status).includes("owner@example.com"));
            assert.ok(!JSON.stringify(status).includes("attachments"));
            // A temporarily incomplete report must leave a retryable job, not send zeros.
            report.finance.error = "Unavailable";
            await server.processEmailQueue(new Date("2026-11-30T09:00:10Z"));
            assert.equal(delivered.length, 1);
            const pending = await db.emailDelivery.findFirstOrThrow({
              where: { userId: user.id, status: "PENDING" },
            });
            assert.equal(pending.message, null);
            assert.equal(pending.errorCode, "EMAIL_PREPARATION_FAILED");
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
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await prisma.$disconnect();
    }
  },
);
