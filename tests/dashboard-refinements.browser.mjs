import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";

test(
  "transfer field order, refund assignment, simplified event forms, completion and attachment rename",
  { skip: process.env.RUN_DASHBOARD_REFINEMENTS_BROWSER_TEST !== "1", timeout: 180000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const fixture = JSON.parse(fs.readFileSync("/tmp/multi-browser-fixture.json", "utf8"));
    const browser = await chromium.launch({ headless: true }),
      base = "http://localhost:3000",
      id = 1800000001;
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies([
        { name: "next-auth.session-token", value: fixture.ownerToken, url: base },
      ]);
      await context.route("https://www.youtube.com/**", (route) => route.abort());
      await context.route("https://*.ytimg.com/**", (route) => route.abort());
      const now = new Date().toISOString(),
        day = now.slice(0, 10);
      const accounts = [
        { id: 1, name: "Test chequing", type: "CHEQUING", currency: "CAD", active: true },
        { id: 2, name: "Test savings", type: "SAVINGS", currency: "CAD", active: true },
      ];
      const task = (n) => ({
        id: n,
        title: `Fixture task ${n}`,
        reference: `TASK-${n}`,
        revision: 3,
        status: "TODO",
        kind: "TASK",
      });
      let event = {
        id,
        revision: 1,
        title: "Completed fixture event",
        description: null,
        type: null,
        date: `${day}T17:00:00Z`,
        endDate: `${day}T18:00:00Z`,
        completed: true,
        kind: "WORK_SESSION",
        timeZone: "UTC",
        appTimeZone: "UTC",
        allDayStart: null,
        allDayEnd: null,
        superseded: false,
        conversion: null,
        reminderMinutes: 30,
        taskLinks: [{ todoId: 1, role: "SESSION_TARGET", task: task(1) }],
        recurrence: {
          id: 900,
          revision: 1,
          frequency: "MONTHLY",
          until: null,
          active: true,
          anchor: day + "T17:00:00",
          timeZone: "UTC",
        },
      };
      let attachment = {
        id,
        originalName: "original.png",
        mimeType: "image/png",
        revision: 1,
        byteSize: 128,
        removedAt: null,
        cleanupPending: false,
      };
      let savedEvent, createdEvent, refundBody;
      const transaction = {
        id,
        type: "REFUND",
        date: day,
        description: "Fixture reimbursement",
        amount: "20.0000",
        currency: "CAD",
        account: accounts[0],
        category: null,
        counterparty: null,
        notes: null,
        source: "MANUAL",
        editable: true,
        updatedAt: now,
        ledgerAmount: "20.0000",
        excludedAmount: "0.0000",
        incomeRecords: [],
        receipts: [],
        transfer: null,
        statementMatches: [],
      };
      await context.route("**/api/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname,
          method = req.method();
        const send = (json) => route.fulfill({ json });
        if (path === "/api/finance/accounts") return send({ accounts });
        if (path === "/api/finance/categories") return send({ categories: [] });
        if (path === "/api/finance/transactions" && method === "POST") {
          refundBody = req.postDataJSON();
          return send({ transaction, replayed: false });
        }
        if (path === `/api/finance/transactions/${id}`) return send({ transaction });
        if (path === `/api/finance/activities/${id}/reimbursements`)
          return send({
            transactionId: id,
            type: "REFUND",
            currency: "CAD",
            amount: "20.0000",
            available: "20.0000",
            summary: null,
            plans: [],
            links: [],
            candidates: [
              {
                id: 3,
                planId: 4,
                description: "Rent",
                date: day,
                person: "Parent",
                remaining: "20.0000",
                account: "Test chequing",
              },
            ],
          });
        if (path === "/api/activity-types") return send([]);
        if (path === "/api/work-items") {
          const n = Number(url.searchParams.get("page") || 1);
          return send({ items: [task(n)], page: n, pageSize: 1, total: 2 });
        }
        if (path === "/api/work-calendar")
          return send({
            items: [
              {
                id: `event:${id}`,
                title: event.title,
                start: day,
                allDay: true,
                extendedProps: { layer: "events", completed: true, href: `/events/${id}` },
              },
            ],
            timeZone: "UTC",
            tbd: [],
            tbdTotal: 0,
            tbdPage: 1,
            tbdPageSize: 10,
          });
        if (path === `/api/events/${id}/activity`) return send({ items: [] });
        if (path === `/api/events/${id}`) {
          if (method === "PATCH") {
            savedEvent = req.postDataJSON();
            const series = event.recurrence;
            event = {
              ...event,
              ...savedEvent,
              recurrence:
                savedEvent.scope === "SERIES"
                  ? { ...series, ...savedEvent.recurrence, revision: series.revision + 1 }
                  : series,
              revision: 2,
              taskLinks:
                savedEvent.links?.map((link) => ({ ...link, task: task(link.todoId) })) ??
                event.taskLinks,
            };
          }
          return send(event);
        }
        if (path === "/api/events" && method === "POST") {
          createdEvent = req.postDataJSON();
          return send({ ...event, ...createdEvent, id: id + 1 });
        }
        if (path === `/api/knowledge/${id}`)
          return send({
            id,
            title: "Fixture article",
            summary: null,
            body: "Test article",
            type: "NOTE",
            tags: [],
            pinned: false,
            archivedAt: null,
            folderId: null,
            folderArchived: false,
            revision: 1,
            createdAt: now,
            updatedAt: now,
            tasks: [],
            projects: [],
            backlinks: [],
            outgoing: [],
            counts: { incoming: 0, outgoing: 0, tasks: 0, projects: 0 },
            page: 1,
            pageSize: 20,
            brokenLinkCount: 0,
          });
        if (path === `/api/knowledge/${id}/attachments`)
          return send({ items: [attachment], total: 1, page: 1, pageSize: 12 });
        if (path === `/api/knowledge/${id}/attachments/${id}` && method === "PATCH") {
          assert.equal(req.headers()["if-match"], '"1"');
          attachment = { ...attachment, originalName: req.postDataJSON().name, revision: 2 };
          return send(attachment);
        }
        if (method !== "GET" && !path.startsWith("/api/auth/"))
          throw Error(`Unexpected mutation: ${method} ${path}`);
        return route.continue();
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/admin/users");
      await page.getByRole("link", { name: "Back to settings", exact: false }).click();
      await page.waitForURL("**/settings");
      await page.goto(base + "/finance/transfers/new");
      await page.getByLabel("From account", { exact: true }).selectOption("1");
      await page.getByLabel("To account", { exact: true }).selectOption("2");
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const before = await page
          .getByLabel("To account", { exact: true })
          .evaluate(
            (el) =>
              !!(
                el.compareDocumentPosition(document.querySelector('[aria-label="Amount sent"]')) &
                Node.DOCUMENT_POSITION_FOLLOWING
              ),
          );
        assert.equal(before, true);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      }
      await page.goto(base + "/finance/expenses/refunds/new");
      await page.getByLabel("Description", { exact: true }).fill(transaction.description);
      await page.getByLabel("Account", { exact: true }).selectOption("1");
      await page.getByLabel("Amount", { exact: true }).fill("20");
      await page.getByRole("button", { name: "Save refund", exact: true }).click();
      await page.waitForURL(`**/finance/expenses/${id}`);
      await page.getByRole("heading", { name: "Reimburse expenses", exact: true }).waitFor();
      assert.equal(refundBody.type, "REFUND");
      assert.equal(
        await page.getByLabel("Expense to reimburse", { exact: true }).isVisible(),
        true,
      );
      await page.goto(base + `/events/${id}`);
      const title = page.getByRole("heading", { name: event.title, exact: true });
      await title.waitFor();
      assert.ok(
        (await title.evaluate((el) => getComputedStyle(el).textDecorationLine)).includes(
          "line-through",
        ),
      );
      assert.equal(
        await page.getByRole("button", { name: "Reload event", exact: true }).count(),
        0,
      );
      await page.getByText("↻ Every month", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Edit event", exact: true }).click();
      const editor = page.getByRole("form", { name: "Event editor" });
      for (const label of ["Event kind", "Event availability", "Event reminder", "Find event task"])
        assert.equal(await editor.getByLabel(label, { exact: true }).count(), 0);
      const linked = editor.getByLabel("Choose a task to link", { exact: true });
      await page.waitForFunction(
        () => document.querySelector('[aria-label="Choose a task to link"]')?.options.length === 3,
      );
      await linked.selectOption("2");
      assert.equal(
        await editor.getByLabel("Apply changes to", { exact: true }).inputValue(),
        "CURRENT",
      );
      assert.equal(await editor.getByLabel("Repeat", { exact: true }).isDisabled(), true);
      await editor.getByLabel("Apply changes to", { exact: true }).selectOption("SERIES");
      await editor.getByLabel("Repeat", { exact: true }).selectOption("WEEKLY");

      await editor.getByRole("button", { name: "Save event", exact: true }).click();
      await editor.waitFor({ state: "hidden" });
      assert.equal(savedEvent.scope, "SERIES");
      assert.equal(savedEvent.seriesRevision, 1);
      assert.equal(savedEvent.recurrence.frequency, "WEEKLY");
      assert.equal(savedEvent.reminderMinutes, null);
      assert.equal("kind" in savedEvent, false);
      assert.equal("busy" in savedEvent, false);
      assert.equal(savedEvent.links[0].role, "SESSION_TARGET");
      assert.equal(savedEvent.links[0].todoId, 2);
      await page.goto(base + "/events", { waitUntil: "domcontentloaded" });
      const completed = page.locator(".fc-event span.line-through").first();
      await completed.waitFor();
      await page.getByRole("button", { name: "New event", exact: true }).click();
      await page
        .getByRole("form", { name: "Event editor" })
        .getByLabel("Event title")
        .fill("New fixture event");
      await page.getByLabel("Choose a task to link", { exact: true }).selectOption("2");
      await page.getByLabel("Event timing", { exact: true }).selectOption("ALL_DAY");
      await page.getByLabel("First day", { exact: true }).fill(day);
      await page.getByLabel("Repeat", { exact: true }).selectOption("YEARLY");

      await page.getByRole("button", { name: "Save event", exact: true }).click();
      await page.getByRole("form", { name: "Event editor" }).waitFor({ state: "hidden" });
      assert.equal(createdEvent.recurrence.frequency, "YEARLY");
      assert.equal(createdEvent.kind, "ORDINARY");
      assert.equal(createdEvent.reminderMinutes, null);
      assert.equal(createdEvent.links[0].role, "RELATED");
      await page.goto(base + `/knowledge/${id}`);
      await page.getByText("Attachments", { exact: true }).click();
      await page.getByRole("button", { name: "Rename", exact: true }).click();
      await page.getByLabel("Attachment name", { exact: true }).fill("Procedure screenshot.png");
      await page.getByRole("button", { name: "Save name", exact: true }).click();
      await page.getByText("Procedure screenshot.png", { exact: true }).waitFor();
      assert.equal(attachment.revision, 2);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
