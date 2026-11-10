import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "Phase 02 real isolated UI/API: capture, metadata, Waiting, explained closure, history, archive, reopen and Cancelled search",
  { skip: process.env.RUN_WORK_FOUNDATION_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright");
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 1200,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true });
    const created = new Set();
    let context;
    try {
      context = await browser.newContext({ colorScheme: "dark", hasTouch: true });
      await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      await context.route(`${base}/api/youtube**`, (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      await context.route("https://www.youtube.com/**", (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        const activate = (locator) => (viewport.width < 1024 ? locator.tap() : locator.click());
        const title = `Isolated foundation ${viewport.width} ${randomUUID().slice(0, 8)}`;
        await page.setViewportSize(viewport);
        await page.goto(`${base}/todos`);
        await page.getByRole("button", { name: "+ New task", exact: true }).waitFor();
        await activate(page.getByRole("button", { name: "+ New task", exact: true }));
        assert.equal(
          await page
            .getByRole("combobox", { name: "Capture context", exact: true })
            .locator("option:checked")
            .textContent(),
          "Personal",
        );
        await page.getByRole("textbox", { name: "New todo title", exact: true }).fill(title);
        const [response] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/todos" &&
              response.request().method() === "POST",
          ),
          activate(page.getByRole("button", { name: "Add task", exact: true })),
        ]);
        assert.equal(response.status(), 201);
        const row = await response.json();
        created.add(row.id);
        assert.equal(row.status, "NEW");
        assert.equal(row.priorityLevel, "NORMAL");
        assert.equal(row.context.key, "personal");
        const card = page.locator(`[data-open-task="${row.id}"]`);
        await card.focus();
        await page.keyboard.press("Enter");
        await activate(page.getByRole("link", { name: "Open full page", exact: true }));
        await page.waitForURL((url) => url.pathname === `/todos/${row.id}`);
        await page.getByRole("combobox", { name: "Task status", exact: true }).waitFor();
        assert.equal(
          await page.getByRole("combobox", { name: "Task status", exact: true }).inputValue(),
          "NEW",
        );
        assert.ok(await page.getByText(row.reference, { exact: true }).isVisible());
        await activate(page.getByRole("button", { name: "Edit", exact: true }));
        await page.getByRole("combobox", { name: "Priority", exact: true }).selectOption("URGENT");
        const work = await page
          .getByRole("combobox", { name: "Context", exact: true })
          .locator("option")
          .allTextContents();
        assert.ok(work.includes("Work"));
        await page
          .getByRole("combobox", { name: "Context", exact: true })
          .selectOption({ label: "Work" });
        await page.getByRole("combobox", { name: "Kind", exact: true }).selectOption("IMPROVEMENT");
        await page
          .getByRole("textbox", { name: "Desired outcome", exact: true })
          .fill("Resolve the example issue");
        await page
          .getByRole("textbox", { name: "Next action", exact: true })
          .fill("Contact the example vendor");
        await page.getByRole("textbox", { name: "Company", exact: true }).fill("Example company");
        await page
          .getByRole("textbox", { name: "Waiting on", exact: true })
          .fill("Replacement shipment");
        await page
          .getByRole("textbox", { name: "Waiting reason", exact: true })
          .fill("Delivery pending");
        await page
          .getByRole("textbox", { name: "Workaround", exact: true })
          .fill("Use the spare device");
        await page
          .getByRole("textbox", { name: "Tags (comma separated)", exact: true })
          .fill("example, printer");
        await activate(page.getByRole("button", { name: "Save", exact: true }));
        await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
        await page
          .getByRole("combobox", { name: "Task status", exact: true })
          .selectOption("WAITING");
        await page.waitForFunction(() => {
          const node = document.querySelector('[aria-label="Task status"]');
          return node?.value === "WAITING" && !node.disabled;
        });
        await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("DONE");
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await dialog
          .getByRole("combobox", { name: "Completion outcome", exact: true })
          .selectOption("ACCEPTED_WORKAROUND");
        await dialog
          .getByRole("textbox", { name: "Completion summary", exact: true })
          .fill("Explicitly accepted the spare as the final outcome");
        await dialog.getByRole("checkbox").check();
        await activate(dialog.getByRole("button", { name: "Complete task", exact: true }));
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByText("Closed with an explicitly accepted workaround", { exact: true })
          .waitFor();
        await activate(page.getByRole("button", { name: "All activity", exact: true }));
        await page.getByText("completed", { exact: true }).waitFor();
        await activate(page.getByRole("button", { name: "Reopen task", exact: true }));
        await page.waitForFunction(() => {
          const node = document.querySelector('[aria-label="Task status"]');
          return node?.value === "TODO" && !node.disabled;
        });
        await activate(page.getByRole("button", { name: "Archive task", exact: true }));
        await page.getByRole("button", { name: "Restore task", exact: true }).waitFor();
        await page.goto(`${base}/todos`);
        await page.getByRole("button", { name: "Archived", exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: new RegExp(title) }).count(), 0);
        await activate(page.getByRole("button", { name: "Archived", exact: true }));
        await activate(page.getByRole("button", { name: new RegExp(title) }));
        await activate(page.getByRole("link", { name: "Open full page", exact: true }));
        await page.waitForURL((url) => url.pathname === `/todos/${row.id}`);
        await activate(page.getByRole("button", { name: "Restore task", exact: true }));
        await page.getByRole("button", { name: "Archive task", exact: true }).waitFor();
        await page
          .getByRole("combobox", { name: "Task status", exact: true })
          .selectOption("CANCELLED");
        await page.getByRole("dialog", { name: "Cancel task", exact: true }).waitFor();
        await activate(
          page
            .getByRole("dialog", { name: "Cancel task", exact: true })
            .getByRole("button", { name: "Confirm cancellation", exact: true }),
        );
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.goto(`${base}/todos`);
        await activate(page.getByRole("button", { name: "Completed history", exact: true }));
        await page.getByRole("textbox", { name: "Search work", exact: true }).fill(row.reference);
        await page.getByRole("button", { name: new RegExp(title) }).waitFor();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "board must fit width",
        );
        await activate(page.getByRole("button", { name: new RegExp(title) }));
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "detail must fit width",
        );
        const history = await (
          await context.request.get(`${base}/api/todos/${row.id}/activity`)
        ).json();
        for (const action of [
          "CREATED",
          "UPDATED",
          "STATUS_CHANGED",
          "COMPLETED",
          "REOPENED",
          "ARCHIVED",
          "RESTORED",
          "CANCELLED",
        ])
          assert.ok(
            history.some((entry) => entry.action === action),
            action,
          );
        console.log(`Verified Phase 02 workflow at ${viewport.width}×${viewport.height}.`);
      }
      assert.deepEqual(errors, []);
    } finally {
      if (context)
        for (const id of created) {
          const response = await context.request.get(`${base}/api/todos/${id}`);
          if (response.ok()) {
            const row = await response.json();
            const deleted = await context.request.delete(`${base}/api/todos/${id}`, {
              headers: { "Idempotency-Key": randomUUID(), "If-Match": `"${row.revision}"` },
            });
            assert.equal(deleted.status(), 200);
          }
        }
      await browser.close();
    }
  },
);
