import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import { emailConfiguration, EmailError, sendEmail } from "../src/lib/email/resend.mjs";
import { authorizedEmailWorker, runEmailWorkerPass } from "../src/lib/email/worker.mjs";
import { renderWeeklyReportPdf } from "../src/lib/weekly-report/pdf.mjs";
import { weeklyPdfFixture } from "./helpers/weekly-pdf-fixture.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";

const env = {
  EMAIL_ENABLED: "true",
  RESEND_API_KEY: "re_unit_test_only",
  EMAIL_FROM: "Dashboard <reports@example.com>",
  EMAIL_TO: "owner@example.com",
  EMAIL_WORKER_SECRET: "a".repeat(64),
  EMAIL_APP_URL: "http://dashboard:3000",
};
test("email is explicitly enabled, validates configuration and never sends without it", async () => {
  assert.equal(emailConfiguration({}), null);
  assert.equal(emailConfiguration(env).to, "owner@example.com");
  for (const values of [
    { EMAIL_FROM: "bad" },
    { EMAIL_FROM: "Dashboard\r\nBcc: thief@example.com" },
    { EMAIL_TO: "a@b.com,c@d.com" },
    { RESEND_API_KEY: "bad" },
  ])
    assert.throws(() => emailConfiguration({ ...env, ...values }), EmailError);
  let called = false;
  assert.deepEqual(
    await runEmailWorkerPass({
      env: {},
      fetcher: () => {
        called = true;
      },
    }),
    { sent: 0 },
  );
  assert.equal(called, false);
});
test("shared Resend sender sends attachments with idempotency and sanitizes provider errors", async () => {
  const config = emailConfiguration(env);
  const message = {
    from: config.from,
    to: config.to,
    subject: "A reusable notification",
    text: "Hello",
    attachments: [{ filename: "report.pdf", content: "JVBERg==" }],
  };
  const fetcher = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.headers["Idempotency-Key"], "test/email-1");
    assert.deepEqual(JSON.parse(options.body), message);
    assert.equal(options.redirect, "error");
    return Response.json({ id: "provider-1" });
  };
  assert.deepEqual(await sendEmail(message, { config, key: "test/email-1", fetcher }), {
    id: "provider-1",
  });
  for (const name of ["concurrent_idempotent_requests", "invalid_idempotent_request"]) {
    await assert.rejects(
      sendEmail(message, {
        config,
        key: "test/email-1",
        fetcher: async () => Response.json({ name }, { status: 409 }),
      }),
      (error) =>
        error.code === "RESEND_HTTP_409" &&
        error.retryable === (name === "concurrent_idempotent_requests"),
    );
  }
  await assert.rejects(
    sendEmail(message, {
      config,
      key: "test/email-1",
      fetcher: async () =>
        Response.json(
          { message: "private error" },
          { status: 429, headers: { "retry-after": "120" } },
        ),
    }),
    (error) =>
      error.code === "RESEND_HTTP_429" &&
      error.retryable &&
      error.retryAfter === 120 &&
      !error.message.includes("private"),
  );
  await assert.rejects(
    sendEmail(message, {
      config,
      key: "test/email-1",
      fetcher: async () => {
        throw new Error("private token");
      },
    }),
    (error) => error.code === "EMAIL_NETWORK" && !error.message.includes("token"),
  );
});
test("queue worker requires a separate secret and sends it only to its configured endpoint", async () => {
  const request = (secret) =>
    new Request("http://localhost/api/email/process", {
      headers: { authorization: `Bearer ${secret}` },
    });
  assert.equal(authorizedEmailWorker(request(env.EMAIL_WORKER_SECRET), env), true);
  for (const secret of ["wrong", "", "é".repeat(64)])
    assert.equal(authorizedEmailWorker(request(secret), env), false);
  const result = await runEmailWorkerPass({
    env,
    fetcher: async (url, options) => {
      assert.equal(String(url), "http://dashboard:3000/api/email/process");
      assert.equal(options.headers.Authorization, `Bearer ${env.EMAIL_WORKER_SECRET}`);
      return Response.json({ sent: 1, failed: 0 });
    },
  });
  assert.deepEqual(result, { sent: 1 });
});
test("all user email/PDF APIs reject non-owners before reading data or creating messages", async () => {
  const fail = () => assert.fail("Unauthorized request accessed email/report service");
  for (const file of ["src/app/api/email/route.ts", "src/app/api/weekly-report/pdf/route.ts"]) {
    const route = loadWorkModule(file, {
      "@/lib/require-owner": { requireOwner: async () => Response.json({}, { status: 403 }) },
      "@/lib/email/server": {
        emailDeliveryStatus: fail,
        queueRequestedEmail: fail,
        emailResponseError: fail,
      },
      "@/lib/user-settings": { withUserTimeZone: fail },
      "@/lib/weekly-report/server": { weeklyReport: fail },
      "@/lib/weekly-report/period": { WeeklyInputError: Error },
      "@/lib/weekly-report/pdf.mjs": { renderWeeklyReportPdf: fail },
    });
    for (const method of ["GET", "POST"])
      if (route[method]) assert.equal((await route[method]({ json: fail })).status, 403);
  }
  const worker = loadWorkModule("src/app/api/email/process/route.ts", {
    "@/lib/email/worker.mjs": { authorizedEmailWorker: () => false },
    "@/lib/email/server": { processEmailQueue: fail, emailResponseError: fail },
  });
  assert.equal((await worker.POST({})).status, 401);
});
test("weekly PDF is exactly one A4 page and incomplete sections never become misleading zeros", async () => {
  const report = weeklyPdfFixture();
  const pdf = await renderWeeklyReportPdf(report);
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
  assert.equal(Math.round(document.getPage(0).getWidth()), 595);
  assert.equal(Math.round(document.getPage(0).getHeight()), 842);
  assert.ok(pdf.length < 100000);
  assert.match(document.getTitle(), /2026-11-16/);
  await writeFile("/tmp/weekly-report-preview.pdf", pdf);
  report.finance = { data: null, error: "Unavailable" };
  await assert.rejects(renderWeeklyReportPdf(report), /REPORT_INCOMPLETE/);
});
