import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "calendar and project creation dialogs, activity selection, clear filters and visual actions",
  {
    skip: process.env.RUN_CALENDAR_PROJECT_BROWSER_TEST !== "1",
    timeout: 240000,
  },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const context = await browser.newContext({ colorScheme: "dark" });
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
    const ids = [],
      events = [],
      types = [],
      errors = [];
    let page;
    try {
      const prefix = `Visual controls ${randomUUID().slice(0, 8)}`;
      const typeA = await write("/api/activity-types", { name: `${prefix} A`, color: "#15803d" });
      const typeB = await write("/api/activity-types", { name: `${prefix} B`, color: "#7c3aed" });
      types.push(typeA.id, typeB.id);
      const project = await write("/api/projects", { name: prefix });
      const task = await write("/api/todos", {
        title: `${prefix} task`,
        activityTypeId: typeA.id,
        projectId: project.id,
      });
      ids.push(task.id);
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const centered = async (modal) => {
          await modal.waitFor();
          const box = await modal.boundingBox();
          assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 3);
          assert.ok(Math.abs(box.y + box.height / 2 - viewport.height / 2) < 3);
        };
        const outside = async (modal) => {
          await centered(modal);
          const box = await modal.boundingBox();
          await page.mouse.click(Math.max(2, box.x - 8), box.y + 10);
          await modal.waitFor({ state: "hidden" });
        };
        await page.goto(`${base}/events?project=${project.id}`);
        await page.getByRole("heading", { name: "Calendar", level: 1, exact: true }).waitFor();
        assert.equal(await page.getByRole("list", { name: "Calendar color legend" }).count(), 0);
        await page.getByRole("button", { name: "New event / session", exact: true }).click();
        const eventModal = page.getByRole("dialog", {
          name: "New event or work session",
          exact: true,
        });
        await outside(eventModal);
        await page.getByRole("button", { name: "New event / session", exact: true }).click();
        await centered(eventModal);
        await eventModal
          .getByLabel("Event title", { exact: true })
          .fill(`${prefix} event ${viewport.width}`);
        await eventModal.getByLabel("Event timing", { exact: true }).selectOption("ALL_DAY");
        await eventModal.getByLabel("First day", { exact: true }).fill("2026-11-25");
        await eventModal.getByLabel("Through day", { exact: true }).fill("2026-11-25");
        const [saved] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/events") && response.request().method() === "POST",
          ),
          eventModal.getByRole("button", { name: "Save event", exact: true }).click(),
        ]);
        assert.equal(saved.status(), 201);
        events.push((await saved.json()).id);
        await eventModal.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Show search and filters", exact: true }).click();
        const activity = page.getByLabel("Calendar activity type", { exact: true });
        await activity.selectOption(String(typeA.id));
        const followup = page.getByRole("checkbox", { name: "↻ Follow-ups", exact: true });
        await followup.uncheck();
        await page.getByRole("button", { name: "Clear filters", exact: true }).click();
        assert.equal(await activity.inputValue(), "");
        assert.equal(await page.getByLabel("Calendar project", { exact: true }).inputValue(), "");
        assert.equal(await followup.isChecked(), true);
        assert.equal(new URL(page.url()).search, "");
        await page.goto(`${base}/projects/${project.id}`);
        await page.getByRole("heading", { name: prefix, exact: true }).waitFor();
        assert.equal(await page.getByRole("link", { name: "Find tasks to assign" }).count(), 0);
        assert.equal(await page.getByText(/Counts include direct/).count(), 0);
        assert.equal(await page.getByText(/Milestones inform planning/).count(), 0);
        const projectCalendar = page.getByRole("link", { name: "Project calendar", exact: true });
        assert.ok(await projectCalendar.locator("svg").count());
        const reload = page.getByRole("button", { name: "Reload project", exact: true });
        assert.ok(await reload.locator("svg").count());
        assert.equal(
          await projectCalendar.evaluate(
            (node) =>
              node.parentElement ===
              [...document.querySelectorAll("button")].find((button) =>
                button.textContent.includes("Reload project"),
              )?.parentElement,
          ),
          true,
        );
        await page.getByRole("button", { name: "Add stage", exact: true }).click();
        let modal = page.getByRole("dialog", { name: "Add stage", exact: true });
        await outside(modal);
        await page.getByRole("button", { name: "Add stage", exact: true }).click();
        const stage = `Planning ${viewport.width}`;
        await modal.getByLabel("Stage name", { exact: true }).fill(stage);
        await modal.getByRole("button", { name: "Save stage", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        const edit = page.getByRole("button", { name: `Edit stage ${stage}`, exact: true });
        await edit.waitFor();
        assert.equal((await edit.innerText()).trim(), "");
        assert.ok(await edit.locator("svg").count());
        await edit.click();
        modal = page.getByRole("dialog", { name: "Edit stage", exact: true });
        await outside(modal);
        await page.getByRole("button", { name: "Add milestone", exact: true }).click();
        modal = page.getByRole("dialog", { name: "Add milestone", exact: true });
        await outside(modal);
        await page.getByRole("button", { name: "Add milestone", exact: true }).click();
        await modal.getByLabel("Milestone label", { exact: true }).fill(`Launch ${viewport.width}`);
        await modal.getByLabel("Milestone date", { exact: true }).fill("2026-11-25");
        await modal.getByRole("button", { name: "Save milestone", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await page
          .getByRole("region", { name: "Project milestones" })
          .getByText(new RegExp(`Launch ${viewport.width}`))
          .waitFor();
        await page.screenshot({
          path: `/tmp/project-controls-${viewport.width}.png`,
          fullPage: true,
        });
        await page.goto(`${base}/todos?context=999999&q=${encodeURIComponent(task.title)}`);
        await page.waitForURL((url) => !url.searchParams.has("context"));
        await page.locator(`[data-open-task="${task.id}"]`).first().waitFor();
        await page.goto(`${base}/my-work?context=999999`);
        await page.waitForURL((url) => !url.searchParams.has("context"));
        await page.goto(`${base}/todos/${task.id}`);
        const article = page.locator(".task-details");
        await article.getByRole("heading", { name: task.title, exact: true }).waitFor();
        await article
          .locator("header")
          .first()
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        const taskType = article.getByLabel("Activity type", { exact: true });
        await taskType.selectOption(String(viewport.width === 1440 ? typeB.id : typeA.id));
        assert.equal(await article.getByLabel("Context", { exact: true }).count(), 0);
        await article
          .locator("header")
          .first()
          .getByRole("button", { name: "Save", exact: true })
          .click();
        await article
          .locator("header")
          .first()
          .getByRole("button", { name: "Edit", exact: true })
          .waitFor();
        assert.equal(
          (await read(`/api/todos/${task.id}`)).activityTypeId,
          viewport.width === 1440 ? typeB.id : typeA.id,
        );
        console.log(
          `Verified event/stage/milestone modals, persistence and cancellation, filter reset, task activity editing and project action icons at ${viewport.width}px.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page)
        await page
          .screenshot({ path: "/tmp/project-controls-failure.png", fullPage: true, timeout: 5000 })
          .catch(() => {});
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of events) {
          const event = await read(`/api/events/${id}`);
          await write(`/api/events/${id}`, undefined, event.revision, "delete");
        }
        for (const id of ids) {
          const task = await read(`/api/todos/${id}`);
          await write(`/api/todos/${id}`, { archived: true }, task.revision, "patch");
        }
        for (const id of types)
          await write(`/api/activity-types/${id}`, undefined, undefined, "delete");
      } finally {
        await browser.close();
      }
    }
  },
);
