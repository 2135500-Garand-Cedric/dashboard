import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "project activity types, clear dates, default task classification and retired task fields on phone and desktop",
  {
    skip: process.env.RUN_PROJECT_CLASSIFICATION_BROWSER_TEST !== "1",
    timeout: 240000,
  },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const context = await browser.newContext({
      colorScheme: "dark",
      timezoneId: "Pacific/Honolulu",
    });
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    const read = async (path) => {
      const r = await context.request.get(base + path);
      assert.ok(r.ok(), `${path}: ${r.status()}`);
      return r.json();
    };
    const write = async (path, data, revision, method = "post") => {
      const r = await context.request[method](base + path, {
        data,
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
      });
      assert.ok(r.ok(), `${path}: ${r.status()} ${await r.text()}`);
      return r.json();
    };
    const tasks = [],
      projects = [],
      types = [],
      errors = [];
    let page;
    try {
      const prefix = `Project classification ${randomUUID().slice(0, 8)}`;
      const a = await write("/api/activity-types", { name: `${prefix} Green`, color: "#15803d" });
      const b = await write("/api/activity-types", { name: `${prefix} Purple`, color: "#7c3aed" });
      types.push(a.id, b.id);
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const name = `${prefix} ${viewport.width}`;
        await page.goto(base + "/projects/new");
        const form = page.getByRole("form", { name: "Project editor", exact: true });
        await form.getByLabel("Project name", { exact: true }).fill(name);
        assert.equal(await form.getByLabel("Project context", { exact: true }).count(), 0);
        await form.getByLabel("Project activity type", { exact: true }).selectOption(String(a.id));
        await form.getByLabel("Project start date", { exact: true }).fill("2026-11-16");
        await form.getByLabel("Project target date", { exact: true }).fill("2026-12-04");
        const [response] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().endsWith("/api/projects") && r.request().method() === "POST",
          ),
          form.getByRole("button", { name: "Save project", exact: true }).click(),
        ]);
        assert.equal(response.status(), 201);
        const project = await response.json();
        projects.push(project.id);
        assert.equal(project.activityTypeId, a.id);
        await page.waitForURL(`${base}/projects/${project.id}`);
        const schedule = page.getByRole("region", {
          name: "Project dates and activity type",
          exact: true,
        });
        await schedule.getByText("Nov 16, 2026", { exact: true }).waitFor();
        await schedule.getByText("Dec 4, 2026", { exact: true }).waitFor();
        assert.equal(
          await schedule
            .locator(".border-l-4")
            .evaluate((node) => getComputedStyle(node).borderLeftColor),
          "rgb(21, 128, 61)",
        );
        await page.getByRole("button", { name: "+ New task", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/todos/new");
        const taskForm = page.getByRole("form", { name: "New task", exact: true });
        const taskType = taskForm.getByLabel("Task activity type", { exact: true });
        await taskType.locator(`option[value="${a.id}"]`).waitFor({ state: "attached" });
        assert.equal(await taskType.inputValue(), String(a.id));
        assert.equal(
          await taskForm.getByRole("textbox", { name: "Company", exact: true }).count(),
          0,
        );
        assert.equal(
          await taskForm.getByRole("textbox", { name: "Course", exact: true }).count(),
          0,
        );
        await taskForm.getByLabel("Title", { exact: true }).fill(`${name} task`);
        if (viewport.width === 390) await taskType.selectOption(String(b.id));
        const [saved] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().endsWith("/api/todos") && r.request().method() === "POST",
          ),
          taskForm.getByRole("button", { name: "Create task", exact: true }).click(),
        ]);
        assert.equal(saved.status(), 201);
        const task = await saved.json();
        tasks.push(task.id);
        assert.equal(task.activityTypeId, viewport.width === 390 ? b.id : a.id);
        assert.equal(Object.hasOwn(task, "company"), false);
        assert.equal(Object.hasOwn(task, "course"), false);
        await page.waitForURL(`${base}/projects/${project.id}`);
        await page.locator(`[data-open-task="${task.id}"]`).first().click();
        const panel = page.getByRole("dialog", { name: "Task details", exact: true });
        await panel
          .locator(".task-details header")
          .first()
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        assert.equal(await panel.getByLabel("Company", { exact: true }).count(), 0);
        assert.equal(await panel.getByLabel("Course", { exact: true }).count(), 0);
        await panel.getByRole("button", { name: "Discard edits", exact: true }).click();
        await panel.getByRole("button", { name: "Close details", exact: true }).click();
        await page.getByRole("button", { name: "Edit project", exact: true }).click();
        await page.getByLabel("Project activity type", { exact: true }).selectOption(String(b.id));
        await page.getByRole("button", { name: "Save project", exact: true }).click();
        await schedule.getByText(b.name, { exact: true }).waitFor();
        assert.equal(
          await schedule
            .locator(".border-l-4")
            .evaluate((node) => getComputedStyle(node).borderLeftColor),
          "rgb(124, 58, 237)",
        );
        assert.equal(
          (await read(`/api/todos/${task.id}`)).activityTypeId,
          viewport.width === 390 ? b.id : a.id,
        );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.screenshot({
          path: `/tmp/project-classification-${viewport.width}.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "+ New task", exact: true }).click();
        await page
          .getByLabel("Task activity type", { exact: true })
          .locator(`option[value="${b.id}"]`)
          .waitFor({ state: "attached" });
        assert.equal(
          await page.getByLabel("Task activity type", { exact: true }).inputValue(),
          String(b.id),
        );
        await page.getByRole("button", { name: "← Back", exact: true }).click();
        await page.goto(`${base}/todos?company=old&course=old`);
        await page.waitForURL(
          (url) => !url.searchParams.has("company") && !url.searchParams.has("course"),
        );
        await page.getByRole("button", { name: "Show search and filters", exact: true }).click();
        assert.equal(await page.getByRole("textbox", { name: "Company", exact: true }).count(), 0);
        assert.equal(await page.getByRole("textbox", { name: "Course", exact: true }).count(), 0);
        await page.goto(`${base}/my-work?company=old&course=old`);
        await page.waitForURL(
          (url) => !url.searchParams.has("company") && !url.searchParams.has("course"),
        );
        assert.equal(await page.getByLabel("My Work company", { exact: true }).count(), 0);
        assert.equal(await page.getByLabel("My Work course", { exact: true }).count(), 0);
        console.log(
          `Verified project activity selection, written date cards, task type defaults/overrides, type changes and retired fields at ${viewport.width}px.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page)
        await page
          .screenshot({
            path: "/tmp/project-classification-failure.png",
            fullPage: true,
            timeout: 5000,
          })
          .catch(() => {});
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of tasks) {
          const task = await read(`/api/todos/${id}`);
          await write(`/api/todos/${id}`, { archived: true }, task.revision, "patch");
        }
        for (const id of projects) {
          const review = await read(`/api/projects/${id}/transition`);
          await write(
            `/api/projects/${id}/transition`,
            {
              action: "archive",
              token: review.token,
              allowUnfinished: true,
              summary: "Isolated browser fixture",
            },
            review.project.revision,
          );
        }
        for (const id of types)
          await write(`/api/activity-types/${id}`, undefined, undefined, "delete");
      } finally {
        await browser.close();
      }
    }
  },
);
