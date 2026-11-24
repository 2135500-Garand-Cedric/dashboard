import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "next-auth/jwt";
import { PDFDocument } from "pdf-lib";

test(
  "live development email endpoints are protected and the owner can download a complete PDF",
  {
    skip: process.env.RUN_EMAIL_HTTP_TEST !== "1",
    timeout: 90000,
  },
  async () => {
    assert.equal(process.env.NODE_ENV, "development");
    const base = "http://localhost:3000";
    const cookie = async (githubId) =>
      `next-auth.session-token=${await encode({
        secret: process.env.NEXTAUTH_SECRET,
        maxAge: 120,
        token: { githubId, provider: "github", ownerAuthVersion: 1 },
      })}`;
    for (const path of ["/api/email", "/api/weekly-report/pdf"]) {
      assert.equal((await fetch(base + path)).status, 401);
      assert.equal(
        (await fetch(base + path, { headers: { cookie: await cookie("123") } })).status,
        403,
      );
    }
    assert.equal((await fetch(`${base}/api/email/process`, { method: "POST" })).status, 401);
    const headers = { cookie: await cookie("89470930") };
    assert.equal(
      (await fetch(`${base}/api/weekly-report/pdf?week=invalid`, { headers })).status,
      400,
    );
    const reportResponse = await fetch(`${base}/api/weekly-report`, { headers });
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json();
    const response = await fetch(`${base}/api/weekly-report/pdf?week=${report.period.week}`, {
      headers,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    assert.match(response.headers.get("content-disposition"), /attachment/);
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(pdf.getTitle().includes(report.period.week));
    const status = await fetch(`${base}/api/email`, { headers });
    assert.equal(status.status, 200);
    const items = (await status.json()).items;
    assert.ok(items.every((item) => !("message" in item) && !("payload" in item)));
  },
);
