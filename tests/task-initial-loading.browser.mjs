import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "task panels wait for initial sections and relationships use centered modals",
  {
    skip: process.env.RUN_TASK_INITIAL_BROWSER_TEST !== "1",
    timeout: 180000,
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
    const write = async (path, data, revision, method = "post") => {
      const response = await context.request[method](base + path, {
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
        data,
      });
      assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
      return response.json();
    };
    const ids = [],
      errors = [];
    let page;
    try {
      const title = `Initial load ${randomUUID().slice(0, 8)}`;
      let task = await write("/api/todos", { title, contextId: null });
      ids.push(task.id);
      const target = await write("/api/todos", { title: `${title} target`, contextId: null });
      ids.push(target.id);
      const project = await write("/api/projects", { name: `${title} project` });
      task = await write(
        `/api/todos/${task.id}/project`,
        { projectId: project.id, stageId: null },
        task.revision,
        "patch",
      );
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(30000);
      page.on("pageerror", (error) => errors.push(error.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`${base}/todos?q=${encodeURIComponent(title)}`);
        // The single initial response includes every section. Hold it to prove
        // the panel stays behind one loader, with no section request waterfall.
        let release,
          held = false,
          initialRequests = 0;
        const secondaryRequests = [];
        const handler = async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname !== `/api/todos/${task.id}/details`) {
            if (
              url.pathname.startsWith(`/api/todos/${task.id}/`) &&
              route.request().method() === "GET"
            )
              secondaryRequests.push(url.pathname);
            return route.continue();
          }
          initialRequests++;
          const response = await route.fetch();
          await new Promise((resolve) => {
            release = resolve;
            held = true;
          });
          await route.fulfill({ response });
        };
        await page.route("**/api/**", handler);
        await page.locator(`[data-open-task="${task.id}"]`).first().click();
        const panel = page.getByRole("dialog", { name: "Task details", exact: true });
        const article = panel.locator(".task-details");
        const loading = panel.getByRole("status").filter({ hasText: "Loading task…" });
        await assertEventually(() => held);
        await loading.waitFor();
        assert.equal(await article.isVisible(), false);
        release();
        await article.getByRole("heading", { name: title, exact: true }).waitFor();
        assert.equal(initialRequests, 1);
        assert.deepEqual(secondaryRequests, []);
        await page.unroute("**/api/**", handler);
        assert.equal(await loading.count(), 0);
        assert.ok(!(await article.innerText()).includes("Loading"));
        const people = article.getByRole("region", { name: "Task people", exact: true });
        assert.deepEqual(
          await people.evaluate((node) => [
            getComputedStyle(node).borderTopWidth,
            getComputedStyle(node.previousElementSibling).borderBottomWidth,
          ]),
          ["0px", "0px"],
        );
        const outside = async (modal) => {
          const box = await modal.boundingBox();
          assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 3);
          assert.ok(Math.abs(box.y + box.height / 2 - viewport.height / 2) < 3);
          await page.mouse.click(Math.max(2, box.x - 8), box.y + 10);
          await modal.waitFor({ state: "hidden" });
          assert.ok(await panel.isVisible());
        };
        await article.getByRole("button", { name: "Link existing task", exact: true }).click();
        let modal = page.getByRole("dialog", { name: "Link existing task", exact: true });
        await outside(modal);
        await article.getByRole("button", { name: "Create child task", exact: true }).click();
        modal = page.getByRole("dialog", { name: "Create child task", exact: true });
        await modal
          .getByLabel("Child task title", { exact: true })
          .fill(`${title} child ${viewport.width}`);
        await outside(modal);
        await article.getByRole("button", { name: "Create child task", exact: true }).click();
        assert.equal(await modal.getByLabel("Child task title", { exact: true }).inputValue(), "");
        const childTitle = `${title} child ${viewport.width}`;
        await modal.getByLabel("Child task title", { exact: true }).fill(childTitle);
        const [response] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/todos") && response.request().method() === "POST",
          ),
          modal.getByRole("button", { name: "Create child", exact: true }).click(),
        ]);
        assert.equal(response.status(), 201);
        const child = await response.json();
        ids.push(child.id);
        assert.equal(child.parentId, task.id);
        await modal.waitFor({ state: "hidden" });
        await article.getByRole("link", { name: new RegExp(childTitle) }).waitFor();
        if (viewport.width === 390) {
          await article.getByRole("button", { name: "Link existing task", exact: true }).click();
          modal = page.getByRole("dialog", { name: "Link existing task", exact: true });
          await modal.getByLabel("Find relationship task", { exact: true }).fill(target.title);
          const select = modal.getByLabel("Relationship task", { exact: true });
          await select.locator(`option[value="${target.id}"]`).waitFor({ state: "attached" });
          await select.selectOption(String(target.id));
          await modal.getByRole("button", { name: "Save relationship", exact: true }).click();
          await modal.waitFor({ state: "hidden" });
          await article.getByRole("link", { name: new RegExp(target.title) }).waitFor();
          const linked = await read(`/api/todos/${task.id}/relationships?section=related`);
          assert.ok(linked.items.some((item) => item.task.id === target.id));
        }
        await panel.getByRole("button", { name: "Close details", exact: true }).click();
        await panel.waitFor({ state: "detached" });
        console.log(
          `Verified unified loading, centered relationship modals, save/cancel and dividers at ${viewport.width}px.`,
        );
      }
      // A seeded section failure still exposes retry; retries must bypass the
      // initial snapshot and read fresh data from the normal section endpoint.
      const detailsPath = `**/api/todos/${task.id}/details`;
      const unavailable = async (route) => {
        const response = await route.fetch();
        const result = await response.json();
        result.initial[`/api/todos/${task.id}/attachments?page=1`] = {
          error: "Test file service unavailable",
        };
        await route.fulfill({ json: result });
      };
      await page.route(detailsPath, unavailable);
      await page.locator(`[data-open-task="${task.id}"]`).first().click();
      await page
        .locator(".task-details")
        .getByRole("heading", { name: title, exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Retry attachments", exact: true }).click();
      await page
        .getByText("Test file service unavailable", { exact: false })
        .waitFor({ state: "hidden" });
      await page.unroute(detailsPath, unavailable);
      await page.getByRole("button", { name: "Close details", exact: true }).click();
      await page.route(detailsPath, (route) =>
        route.fulfill({ status: 500, json: { error: "Initial read failed" } }),
      );
      await page.locator(`[data-open-task="${task.id}"]`).first().click();
      await page.getByRole("alert").filter({ hasText: "Initial read failed" }).waitFor();
      await page.unroute(detailsPath);
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page
        .locator(".task-details")
        .getByRole("heading", { name: title, exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(error);
      if (page)
        await page
          .screenshot({ path: "/tmp/task-initial-failure.png", fullPage: true, timeout: 5000 })
          .catch(() => {});
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of ids.reverse()) {
          const task = await read(`/api/todos/${id}`);
          if (!task.archivedAt)
            await write(`/api/todos/${id}`, { archived: true }, task.revision, "patch");
        }
      } finally {
        await browser.close();
      }
    }
  },
);

async function assertEventually(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(check(), "Expected request was not received");
}
