import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "task header actions, centered dialogs, prominent dates and follow-ups in Notes only",
  {
    skip: process.env.RUN_TASK_DIALOG_BROWSER_TEST !== "1",
  },
  async () => {
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
      const result = await context.request.get(base + path);
      assert.ok(result.ok(), `${path}: ${result.status()}`);
      return result.json();
    };
    const write = async (path, body, revision, method = "post") => {
      const result = await context.request[method](base + path, {
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
        data: body,
      });
      assert.ok(result.ok(), `${path}: ${result.status()} ${await result.text()}`);
      return result.json();
    };
    const originalSettings = await read("/api/settings"),
      ids = [],
      errors = [];
    let page;
    try {
      await write("/api/settings", { timeZone: "America/Toronto" }, undefined, "patch");
      page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      const outside = async (dialog) => {
        const box = await dialog.boundingBox();
        assert.ok(box);
        await page.mouse.click(Math.max(2, box.x - 8), box.y + 10);
        await dialog.waitFor({ state: "hidden" });
      };
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        const task = await write("/api/todos", {
          title: `Task dialogs ${viewport.width} ${randomUUID().slice(0, 8)}`,
          description: "Keep dates and daily actions easy to find.",
        });
        ids.push(task.id);
        const ordinary = await write("/api/events", {
          title: `${task.title} appointment`,
          date: "2027-01-04T15:00:00Z",
          links: [{ todoId: task.id, role: "RELATED", revision: task.revision }],
        });
        await page.goto(`${base}/todos/${task.id}`);
        const article = page.locator(".task-details"),
          header = article.locator("header").first();
        await article.getByRole("heading", { name: task.title, exact: true }).waitFor();
        await header.getByRole("button", { name: "Focus today", exact: true }).click();
        await header.getByRole("button", { name: "Remove today's focus", exact: true }).waitFor();
        assert.equal((await read(`/api/todos/${task.id}/focus`)).active, true);
        const events = article.getByRole("region", { name: "Task calendar links", exact: true });
        assert.equal(await events.evaluate((node) => !!node.closest("details")), false);
        await events.getByRole("link", { name: new RegExp(ordinary.title) }).waitFor();
        assert.equal(
          await events.getByRole("button", { name: "Schedule work session", exact: true }).count(),
          0,
        );
        await header.getByRole("button", { name: "Schedule work session", exact: true }).click();
        let modal = page.getByRole("dialog", { name: "Schedule work session", exact: true });
        const bounds = await modal.boundingBox();
        assert.ok(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) < 3);
        assert.ok(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) < 3);
        await modal.getByLabel("Work session start", { exact: true }).fill("2027-01-04T09:00");
        await outside(modal);
        assert.equal((await read(`/api/todos/${task.id}/calendar`)).total, 1);
        await header.getByRole("button", { name: "Schedule work session", exact: true }).click();
        assert.equal(
          await modal.getByLabel("Work session start", { exact: true }).inputValue(),
          "",
        );
        await modal.getByLabel("Work session start", { exact: true }).fill("2027-01-04T09:30");
        await modal.getByLabel("Work session minutes", { exact: true }).fill("25");
        const [scheduled] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/events") && response.request().method() === "POST",
          ),
          modal.getByRole("button", { name: "Schedule work session", exact: true }).click(),
        ]);
        assert.equal(scheduled.status(), 201);
        const session = await scheduled.json();
        assert.equal(session.date, "2027-01-04T14:30:00.000Z");
        assert.equal(Date.parse(session.endDate) - Date.parse(session.date), 25 * 60000);
        await modal.waitFor({ state: "hidden" });
        await events.getByRole("link", { name: new RegExp(session.title) }).waitFor();
        const deadline = article.getByRole("region", { name: "Task deadline", exact: true });
        assert.equal(await deadline.evaluate((node) => !!node.closest("aside")), false);
        await deadline.getByRole("button", { name: "Set deadline", exact: true }).click();
        modal = page.getByRole("dialog", { name: "Edit deadline", exact: true });
        await modal.getByLabel("Calendar date", { exact: true }).fill("2020-01-01");
        await modal.getByRole("button", { name: "Save deadline", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await deadline.getByText("Overdue", { exact: true }).waitFor();
        assert.equal((await read(`/api/todos/${task.id}`)).deadlineDate, "2020-01-01");
        await deadline.getByRole("button", { name: "Edit deadline", exact: true }).click();
        await modal.getByLabel("Calendar date", { exact: true }).fill("2035-01-01");
        await outside(modal);
        assert.equal((await read(`/api/todos/${task.id}`)).deadlineDate, "2020-01-01");
        const notes = article.getByRole("region", { name: "Notes and activity", exact: true });
        await notes.getByRole("button", { name: "Add note", exact: true }).click();
        await notes
          .getByRole("textbox", { name: "Note text", exact: true })
          .fill("Manual note stays alongside follow-up history.");
        await notes.getByRole("button", { name: "Save note", exact: true }).click();
        await notes
          .getByText("Manual note stays alongside follow-up history.", { exact: true })
          .waitFor();
        const followup = article.getByRole("region", { name: "Task follow-up", exact: true });
        await followup.getByRole("button", { name: "Schedule follow-up", exact: true }).click();
        modal = page.getByRole("dialog", { name: "Schedule follow-up", exact: true });
        await modal.getByLabel("Calendar date", { exact: true }).fill("2020-01-02");
        await modal
          .getByLabel("Follow-up reason", { exact: true })
          .fill("Check with the requester");
        await modal.getByRole("button", { name: "Schedule follow-up", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await followup.getByText("Follow-up due", { exact: true }).waitFor();
        await followup.getByRole("button", { name: "Complete follow-up", exact: true }).click();
        modal = page.getByRole("dialog", { name: "Complete follow-up", exact: true });
        await modal
          .getByLabel("Follow-up reason", { exact: true })
          .fill("Requester contacted; awaiting delivery");
        await modal.getByRole("button", { name: "Complete follow-up", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await notes.getByRole("heading", { name: "Follow-up completed", exact: true }).waitFor();
        await notes.getByText("Requester contacted; awaiting delivery", { exact: true }).waitFor();
        assert.ok(
          await notes
            .getByText("Manual note stays alongside follow-up history.", { exact: true })
            .isVisible(),
        );
        await followup.getByRole("button", { name: "Schedule follow-up", exact: true }).click();
        modal = page.getByRole("dialog", { name: "Schedule follow-up", exact: true });
        await modal.getByLabel("Calendar date", { exact: true }).fill("2027-02-01");
        await outside(modal);
        assert.equal((await read(`/api/todos/${task.id}/dates`)).activeFollowUp, null);
        assert.ok(!(await article.innerText()).toLowerCase().includes("key date"));
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `/tmp/task-dialogs-${viewport.width}.png`, fullPage: true });
        // The same centered modal must stack above the task side panel, and a
        // backdrop click must close only the inner scheduling modal.
        await page.goto(`${base}/todos?q=${encodeURIComponent(task.title)}`);
        await page.locator(`[data-open-task="${task.id}"]`).first().click();
        const panel = page.getByRole("dialog", { name: "Task details", exact: true });
        await panel.getByRole("button", { name: "Schedule work session", exact: true }).click();
        await outside(page.getByRole("dialog", { name: "Schedule work session", exact: true }));
        assert.ok(await panel.isVisible());
        await panel.getByRole("button", { name: "Close details", exact: true }).click();
        await panel.waitFor({ state: "detached" });
        console.log(
          `Verified header focus/scheduling, centered modal cancellation, linked sessions, prominent deadline, follow-up completion in Notes only, and nested dialogs at ${viewport.width}px.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page) await page.screenshot({ path: "/tmp/task-dialogs-failure.png", fullPage: true });
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of ids) {
          const row = await read(`/api/todos/${id}`);
          if (!row.archivedAt)
            await write(`/api/todos/${id}`, { archived: true }, row.revision, "patch");
        }
        await write("/api/settings", originalSettings, undefined, "patch");
      } finally {
        await browser.close();
      }
    }
  },
);
