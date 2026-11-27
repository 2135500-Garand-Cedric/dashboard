import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

test(
  "Logs desktop and phone: collapsed filters, paging, read-only details, dismissal, errors and safe sizing",
  { skip: process.env.RUN_AUDIT_BROWSER_TEST !== "1", timeout: 180000 },
  async () => {
    const require = createRequire(import.meta.url);
    require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, {
      info() {

      },
      error() {

      },
    });
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3000";
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 900,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const id = "2e7ebbf7-78ed-4f47-b5e7-4b4d69037ebd";
    const entry = {
      id,
      occurredAt: new Date().toISOString(),
      category: "WORK",
      action: "task.changed",
      outcome: "SUCCESS",
      entityType: "task",
      entityReference: "TASK-0042",
      summary: "Task changed — Follow up on the invoice",
      actorKind: "OWNER",
    };
    try {
      for (const viewport of [
        { width: 1920, height: 1080 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const requests = [];
        let failed = false;
        await page.route("**/api/logs", async (route) => {
          requests.push(route.request().postDataJSON());
          await route.fulfill({
            status: failed ? 503 : 200,
            contentType: "application/json",
            body: JSON.stringify(
              failed
                ? { error: "Unable to load logs. Try again." }
                : {
                    items: [entry],
                    nextCursor: requests.at(-1).cursor ? null : "next-page",
                    startedAt: new Date().toISOString(),
                  },
            ),
          });
        });
        await page.route(`**/api/logs/${id}`, (route) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              ...entry,
              changes: { status: { before: "NEW", after: "WAITING" }, body: { changed: true } },
              href: null,
              sourceState: "deleted",
              relatedLinks: [],
            }),
          }),
        );
        const ownerList = await context.request.post(`${base}/api/logs`, { data: {} });
        assert.equal(ownerList.status(), 200, await ownerList.text());
        await page.goto(`${base}/logs`);
        await page.getByRole("button", { name: /Task changed — Follow up/ }).waitFor();
        assert.equal(await page.getByLabel("Reference or summary", { exact: true }).count(), 0);
        assert.equal(requests[0].from.length, 10);
        await page.getByRole("button", { name: /Task changed — Follow up/ }).click();
        await page.getByText("Record deleted. This history is retained.").waitFor();
        await page.getByText("Content changed", { exact: true }).waitFor();
        assert.equal(await page.getByRole("link", { name: "Open record", exact: true }).count(), 0);
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page.getByText("Page 2", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Search and filters", exact: true }).click();
        await page.getByLabel("Reference or summary", { exact: true }).fill("TASK-0042");
        await page.getByRole("button", { name: "Apply filters", exact: true }).click();
        await page.waitForFunction(() => document.body.textContent.includes("Page 1"));
        assert.equal(requests.at(-1).search, "TASK-0042");
        assert.equal(requests.at(-1).cursor, "");
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        failed = true;
        await page.getByRole("button", { name: "Refresh logs", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "Unable to load logs" }).waitFor();
        failed = false;
        await page.getByRole("button", { name: "Try again", exact: true }).click();
        await page.getByRole("button", { name: /Task changed — Follow up/ }).waitFor();
        assert.deepEqual(errors, []);
        await context.close();
      }
      const request = await browser.newContext();
      assert.equal((await request.request.post(`${base}/api/logs`, { data: {} })).status(), 401);
      assert.equal((await request.request.get(`${base}/api/logs/${id}`)).status(), 401);
      await request.close();
    } finally {
      await browser.close();
    }
  },
);
