import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

// Run only against the disposable work-test app on port 3002.
test(
  "recurring task/event forms and holiday settings work on desktop and phone",
  { skip: process.env.RUN_RECURRENCE_BROWSER_TEST !== "1", timeout: 240000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "dark",
    });
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const prefix = `Recurring browser ${randomUUID().slice(0, 8)}`;
    const today = new Date().toISOString().slice(0, 10);
    const read = async (path) => {
      const response = await context.request.get(base + path);
      assert.ok(response.ok(), await response.text());
      return response.json();
    };
    const write = async (path, data) => {
      const response = await context.request.post(base + path, {
        data,
        headers: { "Idempotency-Key": randomUUID() },
      });
      assert.ok(response.ok(), await response.text());
      return response.json();
    };
    try {
      const anonymous = await browser.newContext();
      for (const path of [
        "/api/todos/1/recurrence",
        "/api/events/1/recurrence",
        "/api/settings/holidays",
      ]) {
        assert.equal((await anonymous.request.get(base + path)).status(), 401);
        assert.equal(
          (
            await anonymous.request.post(base + path, {
              data: {},
            })
          ).status(),
          401,
        );
      }
      await anonymous.close();
      const project = await write("/api/projects", { name: `${prefix} payroll` });
      await page.goto(`${base}/todos/new?project=${project.id}`);
      await page.getByLabel("Title", { exact: true }).fill(prefix);
      await page.getByLabel("Task deadline", { exact: true }).fill(today);
      await page.getByLabel("Repeat", { exact: true }).selectOption("WEEKLY");
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        assert.ok(await page.getByLabel("Repeat until", { exact: true }).isVisible());
      }
      await page.getByRole("button", { name: "Create task", exact: true }).click();
      await page.waitForURL(`${base}/todos`);
      const rows = (await read(`/api/work-items?q=${encodeURIComponent(prefix)}`)).items;
      assert.equal(rows.length, 4);
      assert.ok(rows.every((row) => row.projectId === project.id));
      const task = rows.find((row) => row.revision === 2);
      assert.ok(task);
      await page.goto(`${base}/todos/${task.id}`);
      await page.getByRole("button", { name: "Edit repeating schedule", exact: true }).waitFor();
      await page.getByRole("button", { name: "Edit repeating schedule", exact: true }).click();
      let modal = page.getByRole("dialog", { name: "Repeating task", exact: true });
      await modal.getByLabel("Repeat", { exact: true }).selectOption("MONTHLY");
      await modal
        .getByRole("button", { name: "Save schedule and future copies", exact: true })
        .click();
      await modal.waitFor({ state: "hidden" });
      assert.equal((await read(`/api/todos/${task.id}/recurrence`)).series.frequency, "MONTHLY");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Edit repeating schedule", exact: true }).click();
      await modal.waitFor();
      const box = await modal.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 391);
      await page.mouse.click(2, 2);
      await modal.waitFor({ state: "hidden" });
      await page.goto(`${base}/events`);
      await page.getByRole("button", { name: "New event / session", exact: true }).click();
      modal = page.getByRole("dialog", { name: "New event or work session", exact: true });
      await modal.getByLabel("Event title", { exact: true }).fill(`${prefix} birthday`);
      await modal.getByLabel("Event timing", { exact: true }).selectOption("ALL_DAY");
      await modal.getByLabel("First day", { exact: true }).fill(today);
      await modal.getByLabel("Repeat", { exact: true }).selectOption("YEARLY");
      await modal.getByRole("button", { name: "Save event", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      const birthday = (await read("/api/events")).find(
        (item) => item.title === `${prefix} birthday`,
      );
      assert.ok(birthday.recurrenceId);
      await page.goto(`${base}/events/${birthday.id}`);
      await page.getByRole("button", { name: "Edit repeating schedule", exact: true }).waitFor();
      assert.ok(await page.getByText("Every year", { exact: false }).count());
      await page.goto(`${base}/settings`);
      await page.getByRole("link", { name: "Calendar holidays", exact: true }).click();
      await page.getByRole("button", { name: "Add holiday", exact: true }).click();
      await page.getByLabel("Holiday country", { exact: true }).selectOption("CA");
      const choices = (await read("/api/settings/holidays?country=CA")).choices;
      const holiday = choices.find((item) => item.name === "Easter Monday" && !item.state);
      await page.getByLabel("Holiday", { exact: true }).selectOption(holiday.key);
      await page.getByRole("button", { name: "Save holiday", exact: true }).click();
      await page.getByText("Holiday added to your calendar.", { exact: true }).waitFor();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      }
      assert.ok(
        (await read("/api/settings/holidays")).selected.some((item) => item.key === holiday.key),
      );
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
