import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "task details prioritize daily content, show every typed relationship and save compact project selection",
  {
    skip: process.env.RUN_TASK_DETAILS_BROWSER_TEST !== "1",
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
    const ids = [],
      errors = [];
    let page;
    try {
      const prefix = `Task usability ${randomUUID().slice(0, 8)}`;
      let task = await write("/api/todos", {
        title: prefix,
        description: "The daily information should be easy to find.",
        priorityLevel: "HIGH",
      });
      ids.push(task.id);
      for (let index = 0; index < 24; index++) {
        const other = await write("/api/todos", { title: `${prefix} linked ${index}` });
        ids.push(other.id);
        const kind =
          index === 0 ? "child" : index === 1 ? "blocked-by" : index === 2 ? "blocks" : "related";
        task = await write(
          `/api/todos/${task.id}/relationships`,
          { kind, targetId: other.id },
          task.revision,
        );
      }
      const project = await write("/api/projects", { name: `${prefix} project` });
      const staged = await write(
        `/api/projects/${project.id}/stages`,
        { name: `${prefix} stage` },
        project.revision,
      );
      page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`${base}/todos/${task.id}`);
        await page.getByRole("heading", { name: prefix, exact: true }).waitFor();
        const article = page.locator(".task-details");
        assert.ok(!(await article.innerText()).includes("Personal rewards"));
        assert.equal(
          await article.getByRole("textbox", { name: "Project search", exact: true }).count(),
          0,
        );
        assert.equal(
          await article.getByRole("heading", { name: "Project membership", exact: true }).count(),
          0,
        );
        const links = page.getByRole("list", { name: "Linked tasks", exact: true });
        await links.locator("li").nth(23).waitFor({ state: "attached" });
        assert.equal(
          await links.locator("li").count(),
          24,
          "All pages and relationship types are loaded.",
        );
        assert.equal(
          await page.getByRole("button", { name: "Next links", exact: true }).count(),
          0,
        );
        assert.equal(await page.getByLabel("Relationship views", { exact: true }).count(), 0);
        const scrolling = await links.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
          return { scroll: node.scrollTop, height: node.clientHeight, total: node.scrollHeight };
        });
        assert.ok(scrolling.scroll > 0 && scrolling.total > scrolling.height);
        const order = await article.evaluate((node) => {
          const position = (selector) => node.querySelector(selector).getBoundingClientRect().top;
          return {
            description: position("#task-description"),
            files: position("#task-files"),
            notes: position("#task-notes"),
            relationships: position("[aria-label='Task relationships']"),
          };
        });
        assert.ok(
          order.description < order.files &&
            order.files < order.notes &&
            order.notes < order.relationships,
        );
        assert.ok(await article.getByText("High priority", { exact: true }).isVisible());
        assert.equal(
          await article.locator("summary").filter({ hasText: "Organization & people" }).count(),
          0,
        );
        assert.ok(
          await article.getByRole("region", { name: "Task people", exact: true }).isVisible(),
        );
        if (viewport.width === 390) {
          const notes = page.getByRole("region", { name: "Notes and activity", exact: true });
          await notes.getByRole("button", { name: "Add note", exact: true }).click();
          await notes
            .getByRole("textbox", { name: "Note text", exact: true })
            .fill("Daily note saved from the redesigned task page.");
          await notes.getByRole("button", { name: "Save note", exact: true }).click();
          await notes
            .getByText("Daily note saved from the redesigned task page.", { exact: true })
            .waitFor();
          await article
            .getByRole("combobox", { name: "Project", exact: true })
            .selectOption(String(project.id));
          const stage = article.getByRole("combobox", { name: "Project stage", exact: true });
          await stage
            .locator(
              `option[value="${staged.stages.find((row) => row.name === `${prefix} stage`).id}"]`,
            )
            .waitFor({ state: "attached" });
          await stage.selectOption(
            String(staged.stages.find((row) => row.name === `${prefix} stage`).id),
          );
          await Promise.all([
            page.waitForResponse(
              (response) =>
                response.url().endsWith(`/api/todos/${task.id}/project`) &&
                response.request().method() === "PATCH" &&
                response.status() === 200,
            ),
            article.getByRole("button", { name: "Save project", exact: true }).click(),
          ]);
          const saved = await read(`/api/todos/${task.id}`);
          assert.equal(saved.projectId, project.id);
          assert.equal(
            saved.stageId,
            staged.stages.find((row) => row.name === `${prefix} stage`).id,
          );
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.screenshot({ path: `/tmp/task-details-${viewport.width}.png`, fullPage: true });
        console.log(
          `Verified task hierarchy, scrollable typed links, notes and compact project selection at ${viewport.width}px.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page) await page.screenshot({ path: "/tmp/task-details-failure.png", fullPage: true });
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of ids) {
          const row = await read(`/api/todos/${id}`);
          if (!row.archivedAt)
            await write(`/api/todos/${id}`, { archived: true }, row.revision, "patch");
        }
      } finally {
        await browser.close();
      }
    }
  },
);
