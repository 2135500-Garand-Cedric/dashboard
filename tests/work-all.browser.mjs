import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "current All Work creates tasks on a dedicated page, opens details, switches views and manages contacts on phone and desktop",
  {
    skip: process.env.RUN_WORK_ALL_BROWSER_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const context = await browser.newContext({ colorScheme: "dark" });
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route(`${base}/api/youtube**`, (route) => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const tasks = [];
    let type;
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      const prefix = `Clean work ${randomUUID().slice(0, 8)}`;
      const createdType = await context.request.post(`${base}/api/activity-types`, {
        data: { name: prefix, color: "#3b82f6" },
      });
      assert.ok(createdType.ok());
      type = await createdType.json();
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`${base}/todos?q=${encodeURIComponent(prefix)}&activityType=${type.id}`);
        await page.getByRole("heading", { name: "All Work", exact: true }).waitFor();
        await page.getByRole("button", { name: "+ New task", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/todos/new");
        const form = page.getByRole("form", { name: "New task", exact: true });
        await form
          .getByRole("combobox", { name: "Task activity type", exact: true })
          .locator(`option[value="${type.id}"]`)
          .waitFor({ state: "attached" });
        assert.equal(
          await form
            .getByRole("combobox", { name: "Task activity type", exact: true })
            .inputValue(),
          String(type.id),
        );
        const title = `${prefix} ${viewport.width}`;
        await form.getByRole("textbox", { name: "Title", exact: true }).fill(title);
        const [saved] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/todos" &&
              response.request().method() === "POST",
          ),
          form.getByRole("button", { name: "Create task", exact: true }).click(),
        ]);
        assert.equal(saved.status(), 201);
        const task = await saved.json();
        tasks.push(task.id);
        for (const field of [
          "contextId",
          "tags",
          "company",
          "course",
          "rewardXp",
          "rewardCoins",
          "waitingOnContactId",
        ])
          assert.equal(Object.hasOwn(task, field), false);
        await page.waitForURL((url) => url.pathname === "/todos");
        await page.locator(`[data-open-task="${task.id}"]`).first().click();
        const panel = page.getByRole("dialog", { name: "Task details", exact: true });
        await panel.getByRole("heading", { name: title, exact: true }).waitFor();
        if (viewport.width >= 768) {
          const bounds = await panel.boundingBox();
          await page.mouse.click(Math.max(2, bounds.x - 12), 180);
        } else await page.keyboard.press("Escape");
        await panel.waitFor({ state: "detached" });
        const toggle = page.getByTitle(/^Switch to (list|board) view$/);
        const oldLabel = await toggle.textContent();
        await toggle.click();
        await assertEventually(async () => (await toggle.textContent()) !== oldLabel);
        await page.getByRole("link", { name: "People", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/settings/people");
        await page.getByRole("heading", { name: "People", exact: true, level: 1 }).waitFor();
        assert.equal(await page.getByRole("heading", { name: "Contexts", exact: true }).count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
          false,
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      for (const id of tasks) {
        const response = await context.request.get(`${base}/api/todos/${id}`);
        if (!response.ok()) continue;
        const task = await response.json();
        const removed = await context.request.delete(`${base}/api/todos/${id}`, {
          headers: { "Idempotency-Key": randomUUID(), "If-Match": `"${task.revision}"` },
        });
        assert.ok(removed.ok());
      }
      if (type) await context.request.delete(`${base}/api/activity-types/${type.id}`);
      await browser.close();
    }
  },
);
async function assertEventually(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("The expected UI state did not settle.");
}
