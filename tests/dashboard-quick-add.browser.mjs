import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

test(
  "Quick add safely opens, saves and returns from all five existing editors using desktop or phone actions",
  {
    skip: process.env.RUN_QUICK_ADD_BROWSER_TEST !== "1",
    timeout: 240000,
  },
  async () => {
    const require = createRequire(import.meta.url);
    require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, {
      info() {

      },
      error() {

      },
    });
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3000";
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 900,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    try {
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
        { width: 320, height: 740 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        await context.route("https://www.youtube.com/**", (route) => route.abort());
        let events = [],
          eventReads = 0,
          eventFailure = true;
        const writes = [];
        await context.route(`${base}/api/**`, async (route) => {
          const request = route.request();
          const url = new URL(request.url()),
            path = url.pathname;
          if (path.startsWith("/api/auth/")) return route.continue();
          if (request.method() === "GET") {
            let json = {};
            if (path === "/api/users") json = { totalXp: 80, coins: 20 };
            else if (path === "/api/events") {
              eventReads++;
              json = events;
            } else if (
              [
                "/api/todos",
                "/api/activity-types",
                "/api/users/quests",
                "/api/knowledge/folders",
              ].includes(path)
            )
              json = [];
            else if (path === "/api/projects" || path === "/api/work-items") json = { items: [] };
            else if (path === "/api/finance/accounts")
              json = {
                accounts: [
                  { id: 1, name: "Mock bank", type: "CHEQUING", currency: "CAD", active: true },
                ],
              };
            else if (path === "/api/finance/categories")
              json = { categories: [{ id: 2, name: "Food", type: "EXPENSE", active: true }] };
            else if (path === "/api/japanese-practice/categories")
              json = { success: true, categories: [{ id: 1, name: "Vocabulary" }] };
            else if (path === "/api/japanese-practice/practices") json = { practices: [] };
            else if (path === "/api/japanese-practice/vocabulary/add") json = { count: 0 };
            else if (path.startsWith("/api/youtube")) json = { items: [] };
            else if (path === "/api/notifications/inbox/count") json = { unread: 0 };
            else if (path === "/api/finance/reports")
              return route.fulfill({ status: 503, json: { error: "No report fixture" } });
            return route.fulfill({ json });
          }
          writes.push({
            path,
            key: request.headers()["idempotency-key"],
            body: request.postData(),
          });
          if (path === "/api/events") {
            if (eventFailure) {
              eventFailure = false;
              return route.fulfill({
                status: 503,
                json: { error: "Temporary event save failure" },
              });
            }
            const input = request.postDataJSON();
            assert.equal(input.kind, "ORDINARY");
            assert.deepEqual(input.links, []);
            const row = {
              id: 901,
              title: input.title,
              date: "2028-01-02T15:00:00.000Z",
              endDate: null,
              allDayStart: null,
              allDayEnd: null,
              kind: "ORDINARY",
              completed: false,
              superseded: false,
              type: null,
              taskLinks: [],
              revision: 1,
            };
            events = [row];
            return route.fulfill({ json: row });
          }
          if (path === "/api/todos")
            return route.fulfill({ json: { id: 902, reference: "TASK-0902" } });
          if (path === "/api/finance/expenses")
            return route.fulfill({ json: { receipt: { transaction: { id: 903 } } } });
          if (path === "/api/knowledge") return route.fulfill({ json: { id: 904, revision: 1 } });
          if (path === "/api/japanese-practice/vocabulary/add")
            return route.fulfill({ json: { success: true } });
          throw new Error(`Unexpected mutation ${path}`);
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        async function openActions() {
          if (viewport.width < 768) {
            const actions = page.getByRole("button", { name: "Quick actions", exact: true });
            if ((await actions.getAttribute("aria-expanded")) !== "true") await actions.click();
          }
        }
        async function clickQuickAdd() {
          await openActions();
          await page.getByRole("button", { name: "Quick add", exact: true }).click();
        }
        async function home() {
          await page.waitForURL(base + "/");
          await openActions();
          await page.getByRole("button", { name: "Quick add", exact: true }).waitFor();
        }
        async function choose(label) {
          await clickQuickAdd();
          const menu = page.getByRole("dialog", { name: "Quick add", exact: true });
          await menu.waitFor();
          await menu
            .getByRole(label === "New event" ? "button" : "link", { name: label, exact: true })
            .click();
        }
        async function checkExit(action, field) {
          page.once("dialog", (dialog) => dialog.dismiss());
          await action.click();
          await field.waitFor();
          assert.ok(await field.inputValue(), "Stay preserves the draft");
          page.once("dialog", (dialog) => dialog.accept());
          await action.click();
          await home();
        }
        await page.goto(base);
        await home();
        const trigger = page.getByRole("button", { name: "Quick add", exact: true });
        const bounds = await trigger.boundingBox();
        assert.ok(bounds.width >= 44 && bounds.height >= 44);
        const title = await page
          .getByRole("heading", { name: "My Dashboard", exact: true })
          .boundingBox();
        if (viewport.width >= 768)
          assert.ok(
            Math.abs(title.y + title.height / 2 - (bounds.y + bounds.height / 2)) < 12,
            "button stays next to the title",
          );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (viewport.width >= 768)
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2),
            false,
          );
        await page.evaluate(() => {
          window.__quickAddShell = document.querySelector(".app-shell");
          window.__quickAddPlayer = [...document.querySelectorAll("div[style]")].find(
            (node) => node.style.display === "none",
          );
        });
        await clickQuickAdd();
        assert.equal(writes.length, 0);
        await page.keyboard.press("Escape");
        await page
          .getByRole("dialog", { name: "Quick add", exact: true })
          .waitFor({ state: "hidden" });
        await page.waitForFunction(
          (label) => document.activeElement?.getAttribute("aria-label") === label,
          viewport.width < 768 ? "Quick actions" : "Quick add",
        );
        await clickQuickAdd();
        await page.mouse.click(2, 2);
        await page
          .getByRole("dialog", { name: "Quick add", exact: true })
          .waitFor({ state: "hidden" });

        await choose("New event");
        const modal = page.getByRole("dialog", { name: "New event or work session", exact: true });
        await modal.getByLabel("Event title", { exact: true }).fill("Quick event");
        page.once("dialog", (dialog) => dialog.dismiss());
        await page.keyboard.press("Escape");
        assert.equal(await modal.isVisible(), true);
        await modal.getByLabel("Event timing", { exact: true }).selectOption("TIMED");
        await modal.getByLabel("Start date and time", { exact: true }).fill("2028-01-02T10:00");
        await modal.getByRole("button", { name: "Save event", exact: true }).click();
        await modal.getByText("Temporary event save failure", { exact: true }).waitFor();
        await modal.getByRole("button", { name: "Save event", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await page.getByText("Quick event", { exact: true }).waitFor();
        assert.ok(eventReads >= 2, "calendar tile reloads after creating the event");
        const attempts = writes.filter((write) => write.path === "/api/events");
        assert.equal(attempts.length, 2);
        assert.equal(
          attempts[0].key,
          attempts[1].key,
          "uncertain retries keep their mutation identity",
        );
        await openActions();
        assert.equal(await trigger.isEnabled(), true);

        await choose("New task");
        await page.getByLabel("Title", { exact: true }).fill("Quick task");
        assert.equal(await page.getByRole("button", { name: "Quick add", exact: true }).count(), 0);
        await checkExit(
          page.getByRole("button", { name: "← Back", exact: true }),
          page.getByLabel("Title", { exact: true }),
        );
        await choose("New task");
        await page.getByLabel("Title", { exact: true }).fill("Quick task");
        await page.getByRole("button", { name: "Create task", exact: true }).click();
        await home();
        const task = JSON.parse(writes.find((write) => write.path === "/api/todos").body);
        assert.equal(task.projectId, null);
        assert.equal(task.stageId, null);
        assert.equal(task.knowledgeArticleId, undefined);

        await choose("New expense");
        await page.getByLabel("Description / merchant", { exact: true }).fill("Quick purchase");
        await checkExit(
          page.getByRole("link", { name: "Cancel", exact: true }),
          page.getByLabel("Description / merchant", { exact: true }),
        );
        await choose("New expense");
        await page.getByLabel("Description / merchant", { exact: true }).fill("Quick purchase");
        await page.getByLabel("Payment account", { exact: true }).selectOption("1");
        await page.getByLabel("Expense category", { exact: true }).selectOption("2");
        await page.getByLabel("Subtotal", { exact: true }).fill("10");
        await page.getByRole("button", { name: "Save expense", exact: true }).click();
        await home();

        await choose("New Knowledge article");
        await page.getByLabel("Title", { exact: true }).fill("Quick procedure");
        await checkExit(
          page.getByRole("link", { name: "← Back", exact: true }),
          page.getByLabel("Title", { exact: true }),
        );
        await choose("New Knowledge article");
        await page.getByLabel("Title", { exact: true }).fill("Quick procedure");
        await page.getByRole("button", { name: "Save article", exact: true }).click();
        await home();
        const article = JSON.parse(writes.find((write) => write.path === "/api/knowledge").body);
        assert.deepEqual(article.taskIds, []);
        assert.deepEqual(article.projectIds, []);

        await choose("New vocabulary");
        await page.getByLabel("English", { exact: true }).fill("School");
        await checkExit(
          page.getByRole("link", { name: "Back", exact: true }),
          page.getByLabel("English", { exact: true }),
        );
        await choose("New vocabulary");
        await page.getByLabel("English", { exact: true }).fill("School");
        await page.getByLabel("Japanese", { exact: true }).fill("学校");
        await page.getByLabel("Reading 1", { exact: true }).fill("がっこう");
        await page.getByRole("button", { name: "Add Vocabulary", exact: true }).click();
        await home();
        assert.equal(
          await page.evaluate(
            () =>
              window.__quickAddShell === document.querySelector(".app-shell") &&
              window.__quickAddPlayer?.isConnected,
          ),
          true,
          "shell and player remain mounted through creation routes",
        );
        // Direct module visits and unsafe return values retain their normal destinations.
        await page.goto(`${base}/finance/expenses/new?returnTo=https%3A%2F%2Fevil.example`);
        await page.getByRole("link", { name: "Cancel", exact: true }).waitFor();
        assert.equal(
          await page.getByRole("link", { name: "Cancel", exact: true }).getAttribute("href"),
          "/finance/expenses",
        );
        await page.goto(`${base}/knowledge/new?returnTo=%2F%2Fevil.example`);
        assert.equal(
          await page.getByRole("link", { name: "← Back", exact: true }).getAttribute("href"),
          "/knowledge",
        );
        await page.goto(`${base}/japanese/add-vocabulary`);
        await page.getByLabel("English", { exact: true }).fill("Water");
        await page.getByLabel("Japanese", { exact: true }).fill("水");
        await page.getByLabel("Reading 1", { exact: true }).fill("みず");
        await page.getByRole("button", { name: "Add Vocabulary", exact: true }).click();
        await page.waitForFunction(
          () => document.querySelector('[aria-label="English"]')?.value === "",
        );
        assert.equal(
          new URL(page.url()).pathname,
          "/japanese/add-vocabulary",
          "regular vocabulary capture stays in the form",
        );
        assert.equal(
          await page.getByRole("link", { name: "Back", exact: true }).getAttribute("href"),
          "/japanese/vocabulary",
        );
        assert.equal(await page.getByRole("button", { name: "Quick add", exact: true }).count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
