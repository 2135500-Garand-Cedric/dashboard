import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { encode } from "next-auth/jwt";

test(
  "Phase 01 controls work on touch/keyboard, keep drafts on failure and send revision/replay headers without separate rewards",
  { skip: process.env.RUN_WORK_MANAGEMENT_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright");
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ colorScheme: "dark", hasTouch: true });
      await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const calls = [],
        errors = [];
      let tasks,
        events,
        user,
        legacyRewards = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route(`${base}/api/users`, (route) => route.fulfill({ json: user }));
      await context.route(`${base}/api/users/rewards`, (route) => {
        legacyRewards++;
        return route.fulfill({ status: 410, json: { error: "No direct task rewards" } });
      });
      await context.route(`${base}/api/activity-types**`, (route) => route.fulfill({ json: [] }));
      await context.route(`${base}/api/youtube**`, (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      await context.route("https://www.youtube.com/**", (route) => route.abort());
      await context.route(`${base}/api/work-items**`, (route) =>
        route.fulfill({ json: { items: tasks, total: tasks.length, page: 1, pageSize: 30 } }),
      );
      await context.route(`${base}/api/todos**`, async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname,
          method = req.method();
        const parentId = Number(path.split("/")[3]),
          parent = tasks.find((task) => task.id === parentId);
        if (method === "GET" && path.endsWith("/calendar"))
          return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
        if (method === "GET" && path.endsWith("/dates"))
          return route.fulfill({
            json: {
              timeZone: "America/Toronto",
              taskRevision: parent.revision,
              actionable: true,
              deadline: { date: null, at: null, timeZone: null },
              deadlineState: null,
              activeFollowUp: null,
              followUps: [],
              total: 0,
              page: 1,
              pageSize: 20,
              keyDates: [],
              keyTotal: 0,
              keyPage: 1,
            },
          });
        if (method === "GET" && path.endsWith("/transition"))
          return route.fulfill({
            json: {
              taskRevision: parent.revision,
              currentStatus: parent.status,
              archived: false,
              requestedStatus: new URL(req.url()).searchParams.get("status"),
              workaround: null,
              token: "a".repeat(64),
              blockingCount: parent.dependsOnId ? 1 : 0,
              blockers: parent.dependsOnId
                ? [
                    {
                      id: parent.dependsOnId,
                      reference: "TASK-999903",
                      title: "Prerequisite",
                      status: "TODO",
                    },
                  ]
                : [],
              unfinishedChildCount: 0,
              unfinishedChildren: [],
              descendantCount: 0,
            },
          });
        if (method === "GET" && path.endsWith("/relationships"))
          return route.fulfill({
            json: { task: parent, total: 0, page: 1, pageSize: 20, items: [] },
          });
        if (method === "GET" && path.endsWith("/timeline"))
          return route.fulfill({
            json: { total: 0, page: 1, pageSize: 20, notes: [], activity: [] },
          });
        if (method === "GET" && path.endsWith("/attachments"))
          return route.fulfill({ json: { total: 0, page: 1, pageSize: 20, items: [] } });
        if (method === "GET" && path.endsWith("/activity")) return route.fulfill({ json: [] });
        const id = Number(path.split("/").at(-1)),
          row = tasks.find((task) => task.id === id);
        if (method === "GET") return route.fulfill({ json: path === "/api/todos" ? tasks : row });
        const body = method === "DELETE" ? {} : req.postDataJSON();
        calls.push({ path, method, headers: req.headers(), body });
        if (path.includes("/subtasks/")) {
          const parent = tasks.find((task) => task.subtasks.some((item) => item.id === id));
          const child = parent.subtasks.find((item) => item.id === id);
          Object.assign(child, body, { revision: child.revision + 1 });
          parent.revision++;
          return route.fulfill({ json: child });
        }
        if (method === "PATCH") {
          if (req.headers()["if-match"] !== `"${row.revision}"`)
            return route.fulfill({
              status: 409,
              json: { error: "This record changed in another window. Reload it before saving." },
            });
          if (row.dependsOnId && body.status === "DONE")
            return route.fulfill({
              status: 409,
              json: { error: "Complete the prerequisite before starting or completing this task." },
            });
          if (body.status === "DONE" && row.status !== "DONE") {
            user.totalXp += row.rewardXp;
            user.coins += row.rewardCoins;
          }
          Object.assign(row, body, { revision: row.revision + 1 });
          return route.fulfill({ json: row });
        }
        return route.fulfill({ status: 400, json: { error: "Unexpected fixture command" } });
      });
      await context.route(`${base}/api/events**`, (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname,
          row = events[0];
        if (path.endsWith("/conversion/preview"))
          return route.fulfill({
            json: {
              token: "a".repeat(64),
              event: row,
              task: null,
              title: "Phone task",
              contextId: null,
              beforeDeadline: { date: null, at: null, timeZone: null },
              afterDeadline: { date: null, at: null, timeZone: null },
              mode: "RELATED",
              changeDeadline: false,
              warning: null,
            },
          });
        if (path.endsWith("/activity")) return route.fulfill({ json: [] });
        if (req.method() === "GET")
          return route.fulfill({ json: path === "/api/events" ? events : row });
        const body = req.method() === "DELETE" ? {} : req.postDataJSON();
        calls.push({ path, method: req.method(), headers: req.headers(), body });
        if (path.endsWith("/conversion")) {
          row.linkedTodo = { id: 999901, title: "Phone task" };
          row.taskLinks = [
            {
              todoId: 999901,
              role: "RELATED",
              task: {
                id: 999901,
                reference: "TASK-999901",
                title: "Phone task",
                status: "TODO",
                revision: 1,
              },
            },
          ];
          row.conversion = {
            id: 1,
            mode: "RELATED",
            todoId: 999901,
            deadlineChanged: false,
            active: true,
          };
          row.revision++;
          return route.fulfill({ json: { event: row, taskId: 999901 } });
        } else Object.assign(row, body);
        row.revision++;
        return route.fulfill({ json: row });
      });
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        const activate = (locator) => (viewport.width < 1024 ? locator.tap() : locator.click());
        const baseTask = {
          title: "Phone task",
          status: "TODO",
          revision: 1,
          description: "Original description",
          priority: 1,
          rewardXp: 20,
          rewardCoins: 5,
          updatedAt: "2026-11-09T12:00:00Z",
          dependsOn: null,
          dependsOnId: null,
          subtasks: [],
        };
        tasks = [
          {
            ...baseTask,
            id: 999901,
            subtasks: [{ id: 999951, todoId: 999901, title: "Step one", done: false, revision: 1 }],
          },
          {
            ...baseTask,
            id: 999902,
            title: "Blocked task",
            dependsOnId: 999903,
            dependsOn: { id: 999903, title: "Prerequisite" },
          },
          { ...baseTask, id: 999903, title: "Prerequisite" },
        ];
        events = [
          {
            id: 999911,
            revision: 1,
            title: "Phone event",
            kind: "ORDINARY",
            busy: null,
            timeZone: null,
            allDayStart: null,
            allDayEnd: null,
            appTimeZone: "America/Toronto",
            taskLinks: [],
            conversion: null,
            superseded: false,
            date: "2026-11-13T18:00:00Z",
            endDate: null,
            completed: false,
            description: "",
            type: "",
            linkedTodo: null,
          },
        ];
        user = { totalXp: 200, coins: 20 };
        await page.setViewportSize(viewport);
        await page.goto(`${base}/todos`);
        const card = page.locator('[data-open-task="999901"]');
        await card.focus();
        await page.keyboard.press("Enter");
        await activate(page.getByRole("link", { name: "Open full page", exact: true }));
        await page.waitForURL((url) => url.pathname === "/todos/999901");
        const status = page.getByRole("combobox", { name: "Task status", exact: true });
        await status.selectOption("IN_PROGRESS");
        await activate(
          page.getByRole("dialog").getByRole("button", { name: "Start task", exact: true }),
        );
        await page.waitForFunction(
          () =>
            document.querySelector('[aria-label="Task status"]').value === "IN_PROGRESS" &&
            !document.querySelector('[aria-label="Task status"]').disabled,
        );
        await status.selectOption("DONE");
        await activate(
          page.getByRole("dialog").getByRole("button", { name: "Complete task", exact: true }),
        );
        await page.waitForFunction(
          () => document.querySelector('[aria-label="Task status"]').value === "DONE",
        );
        assert.equal(user.totalXp, 220);
        assert.equal(user.coins, 25);
        await activate(page.getByRole("button", { name: "Edit", exact: true }));
        await page
          .getByRole("textbox", { name: "Task title", exact: true })
          .fill("Unsaved task title");
        const step = page.getByRole("textbox", {
          name: "Checklist item title: Step one",
          exact: true,
        });
        await step.fill("Updated checklist step");
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/todos/subtasks/999951") &&
              response.request().method() === "PATCH",
          ),
          step.press("Tab"),
        ]);
        await page.getByRole("button", { name: "Save", exact: true }).waitFor();
        assert.equal(
          await page.getByRole("textbox", { name: "Task title", exact: true }).inputValue(),
          "Unsaved task title",
        );
        await activate(page.getByRole("button", { name: "Save", exact: true }));
        await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
        assert.equal(tasks[0].title, "Unsaved task title");
        assert.equal(tasks[0].subtasks[0].title, "Updated checklist step");
        await activate(page.getByRole("button", { name: "Edit", exact: true }));
        tasks[0].revision++;
        await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Stale draft");
        await activate(page.getByRole("button", { name: "Save", exact: true }));
        await page
          .getByRole("alert")
          .filter({ hasText: "This record changed in another window" })
          .waitFor();
        assert.equal(
          await page.getByRole("textbox", { name: "Task title", exact: true }).inputValue(),
          "Stale draft",
        );
        assert.ok(await page.getByRole("button", { name: "Save", exact: true }).isVisible());
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "task detail/edit fits screen width",
        );
        page.once("dialog", (dialog) => dialog.accept());
        await page.goto(`${base}/todos/999902`);
        await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("DONE");
        await page
          .getByRole("dialog")
          .getByRole("textbox", { name: "Override reason", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Complete task", exact: true })
            .isDisabled(),
          true,
        );
        await activate(page.getByRole("dialog").getByRole("button", { name: "Back", exact: true }));
        assert.equal(user.totalXp, 220);
        assert.equal(user.coins, 25);
        assert.equal(tasks[1].status, "TODO");
        await page.goto(`${base}/events/999911`);
        await activate(page.getByRole("button", { name: "Mark completed", exact: true }));
        await page.getByRole("button", { name: "Mark incomplete", exact: true }).waitFor();
        await activate(
          page.getByRole("button", { name: "Create or link task — preview", exact: true }),
        );
        await activate(page.getByRole("button", { name: "Preview conversion", exact: true }));
        await page.getByLabel("Conversion preview", { exact: true }).getByRole("checkbox").check();
        await activate(page.getByRole("button", { name: "Confirm conversion", exact: true }));
        await page.getByRole("link", { name: "Open converted task", exact: true }).waitFor();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "event detail fits screen width",
        );
        console.log(`Verified work controls at ${viewport.width}×${viewport.height}.`);
      }
      assert.equal(legacyRewards, 0);
      for (const call of calls) {
        assert.match(call.headers["idempotency-key"], /^[a-f0-9-]{36}$/);
        assert.match(call.headers["if-match"], /^"[1-9]\d*"$/);
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
