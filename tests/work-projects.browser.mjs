import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { samplePng } from "./helpers/work-support.mjs";

test(
  "Phase 08 project pages, shared task panel/board, milestones, notes and private files at four sizes",
  { skip: process.env.RUN_WORK_PROJECT_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright"),
      base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true }),
      context = await browser.newContext({
        hasTouch: true,
        timezoneId: "Asia/Tokyo",
        colorScheme: "dark",
      }),
      projectIds = [],
      taskIds = [],
      errors = [];
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route(`${base}/api/youtube**`, (route) => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const read = async (path) => {
      const response = await context.request.get(base + path);
      assert.ok(response.ok(), `${path} ${response.status()}`);
      return response.json();
    };
    const write = async (path, body, revision, method = "post") => {
      const response = await context.request[method](base + path, {
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
        ...(body ? { data: body } : {}),
      });
      assert.ok(response.ok(), `${path} ${response.status()} ${await response.text()}`);
      return response.json();
    };
    let page;
    try {
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) => errors.push(error.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        const activate = (locator) => (viewport.width < 1024 ? locator.tap() : locator.click()),
          name = `Project UI ${viewport.width} ${randomUUID().slice(0, 8)}`;
        await page.setViewportSize(viewport);
        await page.goto(`${base}/projects`);
        await activate(page.getByRole("button", { name: "New project", exact: true }));
        const editor = page.getByRole("form", { name: "Project editor", exact: true });
        await editor.getByRole("textbox", { name: "Project name", exact: true }).fill(name);
        await editor
          .getByRole("textbox", { name: "Project objective", exact: true })
          .fill("Keep original work records grouped without changing their status.");
        await editor
          .getByRole("textbox", { name: "Project summary", exact: true })
          .fill("Responsive project acceptance fixture");
        await editor.getByLabel("Project start date", { exact: true }).fill("2026-11-01");
        await editor.getByLabel("Project target date", { exact: true }).fill("2026-11-30");
        const [created] = await Promise.all([
          page.waitForResponse(
            (r) => new URL(r.url()).pathname === "/api/projects" && r.request().method() === "POST",
          ),
          activate(editor.getByRole("button", { name: "Save project", exact: true })),
        ]);
        assert.equal(created.status(), 201);
        let project = await created.json();
        projectIds.push(project.id);
        await page.waitForURL((url) => url.pathname === `/projects/${project.id}`);
        await page.getByRole("heading", { name, exact: true }).waitFor();
        const stages = page.getByRole("region", { name: "Project stages", exact: true });
        await activate(
          stages.getByRole("button", { name: "Edit stage Implementation", exact: true }),
        );
        const stageForm = page.getByRole("form", { name: "Stage editor", exact: true });
        await stageForm.getByRole("textbox", { name: "Stage name", exact: true }).fill("Build");
        await activate(stageForm.getByRole("button", { name: "Save stage", exact: true }));
        await stageForm.waitFor({ state: "hidden" });
        await stages.getByRole("button", { name: "Edit stage Build", exact: true }).waitFor();
        project = await read(`/api/projects/${project.id}`);
        await activate(page.getByRole("button", { name: "+ New task", exact: true }));
        const capture = page.getByRole("form", { name: "Quick capture", exact: true });
        await capture
          .getByRole("textbox", { name: "New todo title", exact: true })
          .fill(`${name} task`);
        const [taskResponse] = await Promise.all([
          page.waitForResponse(
            (r) => new URL(r.url()).pathname === "/api/todos" && r.request().method() === "POST",
          ),
          activate(capture.getByRole("button", { name: "Add task", exact: true })),
        ]);
        assert.equal(taskResponse.status(), 201);
        const task = await taskResponse.json();
        taskIds.push(task.id);
        assert.equal(task.projectId, project.id);
        assert.equal(task.status, "NEW");
        await capture.waitFor({ state: "hidden" });
        await activate(page.locator(`[data-open-task="${task.id}"]`).first());
        const panel = page.getByRole("dialog", { name: "Task details", exact: true });
        await panel.waitFor();
        const membership = panel.getByRole("region", {
          name: "Task project membership",
          exact: true,
        });
        await membership
          .getByRole("combobox", { name: "Project stage", exact: true })
          .selectOption(String(project.stages.find((row) => row.name === "Build").id));
        await Promise.all([
          page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === `/api/todos/${task.id}/project` &&
              r.request().method() === "PATCH",
          ),
          activate(membership.getByRole("button", { name: "Save membership", exact: true })),
        ]);
        assert.equal(
          (await read(`/api/todos/${task.id}`)).stageId,
          project.stages.find((row) => row.name === "Build").id,
        );
        await activate(panel.getByRole("button", { name: "Close details", exact: true }));
        await panel.waitFor({ state: "hidden" });
        const buildId = project.stages.find((row) => row.name === "Build").id;
        await page
          .getByRole("combobox", { name: "Stage filter", exact: true })
          .selectOption(String(buildId));
        await page.locator(`[data-open-task="${task.id}"]`).first().waitFor();
        const boardButton = page.getByRole("button", { name: "board", exact: true });
        await activate(boardButton);
        await page.getByRole("region", { name: "Work board", exact: true }).waitFor();
        await page.getByText(`${name} task`, { exact: true }).first().waitFor();
        await page.goto(`${base}/projects/${project.id}`);
        await page.getByRole("heading", { name, exact: true }).waitFor();
        const milestones = page.getByRole("region", { name: "Project milestones", exact: true });
        await activate(milestones.getByRole("button", { name: "Add milestone", exact: true }));
        const dateForm = page.getByRole("form", { name: "Milestone editor", exact: true });
        await dateForm
          .getByRole("textbox", { name: "Milestone label", exact: true })
          .fill(`${name} launch`);
        await dateForm.getByLabel("Milestone date", { exact: true }).fill("2026-11-20");
        await activate(dateForm.getByRole("button", { name: "Save milestone", exact: true }));
        await dateForm.waitFor({ state: "hidden" });
        await milestones.getByText(`◇ ${name} launch`, { exact: true }).waitFor();
        const timeline = page.getByRole("region", { name: "Notes and activity", exact: true });
        await activate(timeline.getByRole("button", { name: "Add note", exact: true }));
        await timeline
          .getByRole("textbox", { name: "Note text", exact: true })
          .fill(`${name} decision`);
        await activate(timeline.getByRole("button", { name: "Save note", exact: true }));
        await timeline.getByText(`${name} decision`, { exact: true }).waitFor();
        const files = page.getByRole("region", { name: "Project attachments", exact: true });
        await files
          .getByLabel("Attachment file", { exact: true })
          .setInputFiles({ name: "project.png", mimeType: "image/png", buffer: samplePng });
        await activate(files.getByRole("button", { name: "Upload attachment", exact: true }));
        await files.getByText("Attachment saved.", { exact: true }).waitFor();
        const listing = await read(`/api/projects/${project.id}/attachments`),
          attachment = listing.items[0];
        const original = await context.request.get(
          `${base}/api/projects/${project.id}/attachments/${attachment.id}/file?download=1`,
        );
        assert.equal(original.status(), 200);
        assert.deepEqual(await original.body(), samplePng);
        assert.match(original.headers()["cache-control"], /no-store/);
        await page.goto(`${base}/events`);
        const projectSelect = page.getByRole("combobox", { name: "Calendar project", exact: true });
        await projectSelect
          .getByRole("option", { name: new RegExp(name) })
          .waitFor({ state: "attached" });
        await projectSelect.selectOption(String(project.id));
        const marker = page.getByRole("link", {
          name: `◇ Milestone · ${name} launch · ${name}`,
          exact: true,
        });
        await marker.waitFor();
        await marker.focus();
        await page.keyboard.press("Enter");
        await page.waitForURL((url) => url.pathname === `/projects/${project.id}`);
        await page.getByRole("heading", { name, exact: true }).waitFor();
        await activate(page.getByRole("button", { name: "Complete project", exact: true }));
        const close = page.getByRole("dialog", { name: "Review project closure", exact: true });
        await close.waitFor();
        assert.equal(
          await close
            .getByRole("button", { name: "Confirm project complete", exact: true })
            .isDisabled(),
          true,
        );
        await close.getByRole("checkbox").check();
        await activate(
          close.getByRole("button", { name: "Confirm project complete", exact: true }),
        );
        await close.waitFor({ state: "hidden" });
        assert.equal((await read(`/api/todos/${task.id}`)).status, "NEW");
        page.once("dialog", (dialog) => dialog.accept());
        await activate(page.getByRole("button", { name: "Reopen project", exact: true }));
        await page.getByRole("button", { name: "Complete project", exact: true }).waitFor();
        if (viewport.width === 1440) {
          const member = await read(`/api/todos/${task.id}`);
          await write(`/api/todos/${task.id}`, { archived: true }, member.revision, "patch");
          await activate(page.getByRole("button", { name: "Reload project", exact: true }));
          await page
            .getByRole("region", { name: "Project summary", exact: true })
            .getByText("1 archived", { exact: true })
            .waitFor();
          await activate(page.getByRole("button", { name: "Complete project", exact: true }));
          const archivedReview = page.getByRole("dialog", {
            name: "Review project closure",
            exact: true,
          });
          await archivedReview.waitFor();
          assert.equal(
            await archivedReview
              .getByRole("button", { name: "Confirm project complete", exact: true })
              .isDisabled(),
            true,
          );
          await archivedReview
            .getByText("1 unfinished tasks, including archived work, will stay open.", {
              exact: true,
            })
            .waitFor();
          await archivedReview.getByRole("checkbox").check();
          await activate(
            archivedReview.getByRole("button", { name: "Confirm project complete", exact: true }),
          );
          await archivedReview.waitFor({ state: "hidden" });
          assert.equal((await read(`/api/todos/${task.id}`)).status, "NEW");
          page.once("dialog", (dialog) => dialog.accept());
          await activate(page.getByRole("button", { name: "Reopen project", exact: true }));
          await page.getByRole("button", { name: "Complete project", exact: true }).waitFor();
          const archivedMember = await read(`/api/todos/${task.id}`);
          await write(
            `/api/todos/${task.id}`,
            { archived: false },
            archivedMember.revision,
            "patch",
          );
          await activate(page.getByRole("button", { name: "Reload project", exact: true }));
          await page.locator(`[data-open-task="${task.id}"]`).first().waitFor();
        }
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          `Viewport overflow at ${viewport.width}`,
        );
        if (viewport.width === 1440)
          await page.screenshot({ path: "/tmp/work-phase08-desktop.png", fullPage: true });
        console.log(`Verified real project flow at ${viewport.width}×${viewport.height}.`);
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page) await page.screenshot({ path: "/tmp/work-phase08-failure.png", fullPage: true });
      console.log("Runtime errors", errors);
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of taskIds) {
          const row = await read(`/api/todos/${id}`);
          if (!row.archivedAt)
            await write(`/api/todos/${id}`, { archived: true }, row.revision, "patch");
        }
        for (const id of projectIds) {
          const review = await read(`/api/projects/${id}/transition`);
          if (!review.project.archivedAt)
            await write(
              `/api/projects/${id}/transition`,
              { action: "archive", token: review.token, allowUnfinished: true },
              review.project.revision,
            );
        }
      } finally {
        await browser.close();
      }
    }
  },
);
