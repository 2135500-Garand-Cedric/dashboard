import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "rewarded practice, open people selectors, inline scheduling and automatic task archiving",
  {
    skip: process.env.RUN_PRACTICE_TASK_BROWSER_TEST !== "1",
  },
  async () => {
    // Writes only to the disposable app/database. Practice fixtures intentionally
    // remain there so their persisted overview can be inspected afterward.
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const context = await browser.newContext({ colorScheme: "dark", timezoneId: "Asia/Tokyo" });
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    const read = async (path) => {
      const response = await context.request.get(base + path);
      assert.ok(response.ok(), `${path}: ${response.status()}`);
      return response.json();
    };
    const write = async (path, body, revision, method = "post") => {
      const response = await context.request[method](base + path, {
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
        data: body,
      });
      assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
      return response.json();
    };
    const originalSettings = await read("/api/settings");
    const tasks = [],
      contacts = [],
      errors = [];
    let page;
    try {
      await write("/api/settings", { timeZone: "America/Toronto" }, undefined, "patch");
      const prefix = `Session workflow ${randomUUID().slice(0, 8)}`;
      const requester = await write("/api/work-contacts", { name: `${prefix} requester` });
      const affected = await write("/api/work-contacts", { name: `${prefix} affected` });
      contacts.push(requester.id, affected.id);
      page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        const task = await write("/api/todos", {
          title: `${prefix} ${viewport.width}`,
          kind: "ISSUE",
          priorityLevel: "HIGH",
          contextId: null,
        });
        tasks.push(task.id);
        await page.goto(`${base}/todos/${task.id}`);
        const article = page.locator(".task-details");
        await article.getByRole("heading", { name: task.title, exact: true }).waitFor();
        assert.equal(await article.getByRole("navigation", { name: "Task sections" }).count(), 0);
        assert.equal(
          await article.getByRole("button", { name: "Archive task", exact: true }).count(),
          0,
        );
        assert.equal(await article.getByText("Organization & people", { exact: true }).count(), 0);
        assert.equal(await article.getByText("Tags", { exact: true }).count(), 0);
        assert.equal(await article.getByLabel("Waiting-on contact", { exact: true }).count(), 0);
        await article.getByText("Issue", { exact: true }).waitFor();
        await article.getByRole("button", { name: "Edit", exact: true }).click();
        assert.equal(
          await article.getByRole("combobox", { name: "Priority", exact: true }).count(),
          1,
        );
        assert.equal(
          await article.getByRole("combobox", { name: "Context", exact: true }).count(),
          1,
        );
        assert.equal(await article.getByRole("combobox", { name: "Kind", exact: true }).count(), 1);
        await article.getByRole("combobox", { name: "Kind", exact: true }).selectOption("TASK");
        await article.getByRole("button", { name: "Save", exact: true }).click();
        await article.getByRole("button", { name: "Edit", exact: true }).waitFor();
        const people = article.getByRole("region", { name: "Task people", exact: true });
        await people.getByRole("textbox", { name: "Search requester", exact: true }).fill(prefix);
        await people
          .getByRole("combobox", { name: "Requester", exact: true })
          .selectOption(String(requester.id));
        await people
          .getByRole("textbox", { name: "Search affected people", exact: true })
          .fill(prefix);
        await people
          .getByRole("checkbox", { name: new RegExp(`Affected people: ${affected.name}`) })
          .check();
        await people.getByRole("button", { name: "Save people", exact: true }).click();
        await article.getByRole("status").filter({ hasText: "People saved." }).waitFor();
        const savedPeople = await read(`/api/todos/${task.id}`);
        assert.equal(savedPeople.requesterId, requester.id);
        assert.ok(savedPeople.affectedPeople.some((row) => row.id === affected.id));
        await article
          .locator("summary")
          .filter({ hasText: "Work sessions & linked events" })
          .click();
        const form = article.getByRole("form", { name: "Schedule work session", exact: true });
        await form.getByLabel("Work session start", { exact: true }).fill("2026-11-13T09:30");
        await form.getByLabel("Work session minutes", { exact: true }).fill("45");
        const [scheduled] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/events") && response.request().method() === "POST",
          ),
          form.getByRole("button", { name: "Schedule work session", exact: true }).click(),
        ]);
        assert.equal(scheduled.status(), 201);
        const event = await scheduled.json();
        assert.equal(event.kind, "WORK_SESSION");
        assert.equal(event.date, "2026-11-13T14:30:00.000Z");
        assert.equal(Date.parse(event.endDate) - Date.parse(event.date), 45 * 60000);
        assert.ok(
          event.taskLinks.some((link) => link.todoId === task.id && link.role === "SESSION_TARGET"),
        );
        await article.getByRole("status").filter({ hasText: "Work session scheduled." }).waitFor();
        await article
          .locator("header")
          .first()
          .getByRole("button", { name: "Schedule work session", exact: true })
          .click();
        await form.getByLabel("Work session start", { exact: true }).fill("2026-11-01T01:30");
        await form.getByLabel("Work session minutes", { exact: true }).fill("60");
        await form
          .getByLabel("Work session time occurrence", { exact: true })
          .selectOption("earlier");
        const [fold] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/events") && response.request().method() === "POST",
          ),
          form.getByRole("button", { name: "Schedule work session", exact: true }).click(),
        ]);
        assert.equal(fold.status(), 201);
        const repeated = await fold.json();
        assert.equal(repeated.date, "2026-11-01T05:30:00.000Z");
        assert.equal(repeated.endDate, "2026-11-01T06:30:00.000Z");
        await article.getByRole("status").filter({ hasText: "Work session scheduled." }).waitFor();
        await page
          .getByRole("dialog", { name: "Schedule work session", exact: true })
          .waitFor({ state: "hidden" });
        await page.waitForFunction(
          () =>
            document.querySelectorAll('[aria-label="Task calendar links"] ul > li').length === 2,
        );
        await page.screenshot({ path: `/tmp/session-task-${viewport.width}.png`, fullPage: true });
        await article
          .getByRole("combobox", { name: "Task status", exact: true })
          .selectOption("DONE");
        await page
          .getByRole("dialog", { name: "Complete task", exact: true })
          .getByRole("button", { name: "Complete task", exact: true })
          .click();
        await article.getByRole("button", { name: "Reopen task", exact: true }).waitFor();
        assert.ok((await read(`/api/todos/${task.id}`)).archivedAt);
        assert.ok(
          (
            await read(`/api/work-items?view=history&q=${encodeURIComponent(task.title)}`)
          ).items.some((row) => row.id === task.id),
        );
        await article.getByRole("button", { name: "Reopen task", exact: true }).click();
        await article
          .getByRole("combobox", { name: "Task status", exact: true })
          .waitFor({ state: "visible" });
        await page.waitForFunction(
          () => document.querySelector('[aria-label="Task status"]')?.value === "TODO",
        );
        assert.equal((await read(`/api/todos/${task.id}`)).archivedAt, null);
        await article
          .getByRole("combobox", { name: "Task status", exact: true })
          .selectOption("CANCELLED");
        await page
          .getByRole("dialog", { name: "Cancel task", exact: true })
          .getByRole("button", { name: "Confirm cancellation", exact: true })
          .click();
        await article.getByRole("button", { name: "Reopen task", exact: true }).waitFor();
        assert.ok((await read(`/api/todos/${task.id}`)).archivedAt);

        const balance = await read("/api/users");
        await page.goto(`${base}/japanese/practice`);
        await page.getByRole("button", { name: "Start Practice", exact: true }).click();
        for (let index = 0; index < 10; index++) {
          await page.getByRole("button", { name: "Show Translation", exact: true }).click();
          await page
            .getByRole("button", {
              name: index < 4 ? "GOOD" : index < 7 ? "PERFECT" : "WEAK",
              exact: true,
            })
            .click();
        }
        const rewards = page.getByLabel("Practice rewards", { exact: true });
        await rewards.getByText("+10 XP", { exact: true }).waitFor();
        await rewards.getByText("+2 gold", { exact: true }).waitFor();
        assert.equal((await read("/api/users")).totalXp, balance.totalXp);
        await page.screenshot({
          path: `/tmp/session-practice-${viewport.width}.png`,
          fullPage: true,
        });
        const [saved] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/japanese-practice/practice-sessions") &&
              response.request().method() === "POST",
          ),
          page.getByRole("button", { name: "Okay", exact: true }).click(),
        ]);
        assert.equal(saved.status(), 200);
        const result = await saved.json(),
          payload = saved.request().postDataJSON();
        const after = await read("/api/users");
        assert.equal(after.totalXp, balance.totalXp + 10);
        assert.equal(after.coins, balance.coins + 2);
        const retry = await write("/api/japanese-practice/practice-sessions", payload);
        assert.equal(retry.review.id, result.review.id);
        assert.equal((await read("/api/users")).totalXp, after.totalXp);
        assert.equal((await read("/api/users")).coins, after.coins);
        await page.goto(`${base}/japanese/practice/history/${result.review.id}`);
        await page
          .getByLabel("Practice rewards", { exact: true })
          .getByText("+10 XP", { exact: true })
          .waitFor();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        console.log(
          `Verified practice preview/save/retry/history rewards, people, inline normal/DST scheduling, automatic archive/reopen at ${viewport.width}px.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page)
        await page.screenshot({ path: "/tmp/session-workflow-failure.png", fullPage: true });
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of tasks) {
          const task = await read(`/api/todos/${id}`);
          if (!task.archivedAt)
            await write(`/api/todos/${id}`, { archived: true }, task.revision, "patch");
        }
        for (const id of contacts) {
          const contact = await read(`/api/work-contacts/${id}`);
          await write(`/api/work-contacts/${id}`, { active: false }, contact.revision, "patch");
        }
        await write("/api/settings", originalSettings, undefined, "patch");
      } finally {
        await browser.close();
      }
    }
  },
);
