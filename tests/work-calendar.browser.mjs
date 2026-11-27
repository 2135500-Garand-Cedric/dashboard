import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
test(
  "Phase 07 real calendar and conversion UI in Tokyo browser at four sizes",
  { skip: process.env.RUN_WORK_CALENDAR_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright"),
      base = "http://localhost:3002";
    const token = await encode({
        secret: "disposable-work-browser-test-secret-not-for-production",
        maxAge: 3600,
        token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
      }),
      browser = await chromium.launch({ headless: true }),
      context = await browser.newContext({
        hasTouch: true,
        timezoneId: "Asia/Tokyo",
        colorScheme: "dark",
      }),
      taskIds = [],
      eventIds = [],
      errors = [];
    let page;
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route(`${base}/api/youtube**`, (route) => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    async function read(path) {
      const r = await context.request.get(base + path);
      assert.ok(r.ok(), `${path} ${r.status()}`);
      return r.json();
    }
    async function write(path, body, revision, method = "post") {
      const r = await context.request[method](base + path, {
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
        ...(body ? { data: body } : {}),
      });
      assert.ok(r.ok(), `${path}: ${r.status()} ${await r.text()}`);
      return r.json();
    }
    try {
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (e) => errors.push(e.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        const activate = (locator) => (viewport.width < 1024 ? locator.tap() : locator.click()),
          name = `Calendar UI ${viewport.width} ${randomUUID().slice(0, 8)}`;
        const root = await write("/api/todos", { title: name }),
          other = await write("/api/todos", { title: `${name} related` });
        taskIds.push(root.id, other.id);
        let task = await read(`/api/todos/${root.id}`);
        await write(
          `/api/todos/${root.id}/dates`,
          { action: "deadline", date: { kind: "DATE", date: "2026-11-13" } },
          task.revision,
        );
        task = await read(`/api/todos/${root.id}`);
        await write(
          `/api/todos/${root.id}/dates`,
          { action: "followup-create", date: { kind: "DATE", date: "2026-11-12" } },
          task.revision,
        );
        task = await read(`/api/todos/${root.id}`);
        await write(
          `/api/todos/${root.id}/dates`,
          { action: "key-create", label: "Delivery", date: { kind: "DATE", date: "2026-11-14" } },
          task.revision,
        );
        const source = await write("/api/events", {
          title: `${name} legacy assignment`,
          date: "2026-11-13T20:00:00.123Z",
          type: "CSI2101",
          links: [{ todoId: root.id, role: "RELATED" }],
        });
        eventIds.push(source.id);
        await page.setViewportSize(viewport);
        await page.goto(`${base}/events?new=session&task=${root.id}`);
        const form = page.getByRole("form", { name: "Event editor", exact: true });
        await form.waitFor();
        await form
          .getByRole("textbox", { name: "Event title", exact: true })
          .fill(`${name} session`);
        await form.getByLabel("Start date and time", { exact: true }).fill("2026-11-12T13:00");
        await form.getByLabel("End date and time", { exact: true }).fill("2026-11-12T14:00");
        const [created] = await Promise.all([
          page.waitForResponse(
            (r) => new URL(r.url()).pathname === "/api/events" && r.request().method() === "POST",
          ),
          activate(form.getByRole("button", { name: "Save event", exact: true })),
        ]);
        assert.equal(created.status(), 201);
        const session = await created.json();
        eventIds.push(session.id);
        assert.equal(session.date, "2026-11-12T18:00:00.000Z");
        await form.waitFor({ state: "hidden" });
        await activate(page.getByRole("button", { name: "Week", exact: true }));
        await activate(page.getByRole("button", { name: "Today", exact: true }));
        await page.locator(".fc-timegrid").waitFor();
        await page
          .locator(".fc-timegrid-event")
          .filter({ hasText: `${name} session` })
          .first()
          .waitFor();
        assert.ok(
          await page
            .locator(".fc-timegrid-event")
            .filter({ hasText: `${name} session` })
            .first()
            .innerText()
            .then((text) => text.includes("13:00")),
          "named calendar zone must ignore Tokyo device zone",
        );
        if (viewport.width === 1440) {
          const block = page
            .locator(".fc-timegrid-event")
            .filter({ hasText: `${name} session` })
            .first();
          await block.evaluate((node) => node.scrollIntoView({ block: "center" }));
          const box = await block.boundingBox(),
            slot = await page.locator(".fc-timegrid-slot-lane").first().boundingBox();
          assert.ok(box && slot);
          await page.mouse.move(box.x + box.width / 2, box.y + Math.min(12, box.height / 2));
          await page.mouse.down();
          await page.mouse.move(
            box.x + box.width / 2,
            box.y + Math.min(12, box.height / 2) + slot.height * 2,
            { steps: 16 },
          );
          await page.mouse.up();
          const move = page.getByRole("dialog", { name: "Confirm session move", exact: true });
          await move.waitFor();
          await activate(move.getByRole("button", { name: "Confirm session move", exact: true }));
          await move.waitFor({ state: "hidden" });
          assert.equal((await read(`/api/todos/${root.id}`)).deadlineDate, "2026-11-13");
          assert.equal((await read(`/api/todos/${root.id}`)).status, "NEW");
        }
        const layer = page.getByRole("checkbox", { name: "⚑ Deadlines", exact: true });
        await layer.uncheck();
        await page.waitForFunction(
          (name) =>
            ![...document.querySelectorAll(".fc-event")].some((el) =>
              el.textContent.includes(`⚑ Due · ${name}`),
            ),
          name,
        );
        await layer.check();
        await page
          .locator(".fc-event")
          .filter({ hasText: `⚑ Due · ${name}` })
          .first()
          .waitFor();
        await activate(page.getByRole("button", { name: "Day", exact: true }));
        await page.locator(".fc-timegrid").waitFor();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          "calendar fits width",
        );
        await page.goto(`${base}/events/${session.id}`);
        await activate(page.getByRole("button", { name: "Edit event", exact: true }));
        await page.getByLabel("Start date and time", { exact: true }).fill("2026-11-12T15:00");
        await page.getByLabel("End date and time", { exact: true }).fill("2026-11-12T16:00");
        await activate(page.getByRole("button", { name: "Save event", exact: true }));
        await page.getByRole("heading", { name: `${name} session`, exact: true }).waitFor();
        assert.equal((await read(`/api/events/${session.id}`)).date, "2026-11-12T20:00:00.000Z");
        assert.equal((await read(`/api/todos/${root.id}`)).deadlineDate, "2026-11-13");
        await activate(page.getByRole("button", { name: "Mark completed", exact: true }));
        await page.getByRole("button", { name: "Mark incomplete", exact: true }).waitFor();
        assert.equal((await read(`/api/todos/${root.id}`)).status, "NEW");
        await page.goto(`${base}/events`);
        await activate(page.getByRole("button", { name: "New event / session", exact: true }));
        const allDay = page.getByRole("form", { name: "Event editor", exact: true });
        await allDay
          .getByRole("textbox", { name: "Event title", exact: true })
          .fill(`${name} reading week`);
        await allDay
          .getByRole("combobox", { name: "Event kind", exact: true })
          .selectOption("INFORMATIONAL");
        await allDay
          .getByRole("combobox", { name: "Event availability", exact: true })
          .selectOption("FREE");
        await allDay
          .getByRole("combobox", { name: "Event timing", exact: true })
          .selectOption("ALL_DAY");
        await allDay.getByLabel("First day", { exact: true }).fill("2026-11-24");
        await allDay.getByLabel("Through day", { exact: true }).fill("2026-11-27");
        const [allDayResponse] = await Promise.all([
          page.waitForResponse(
            (r) => new URL(r.url()).pathname === "/api/events" && r.request().method() === "POST",
          ),
          activate(allDay.getByRole("button", { name: "Save event", exact: true })),
        ]);
        assert.equal(allDayResponse.status(), 201);
        const allDayRow = await allDayResponse.json();
        eventIds.push(allDayRow.id);
        assert.equal(allDayRow.allDayEnd, "2026-11-28");
        assert.equal(allDayRow.date, null);
        assert.equal("busy" in allDayRow, false);
        await allDay.waitFor({ state: "hidden" });
        const currentRoot = await read(`/api/todos/${root.id}`);
        await page
          .getByRole("combobox", { name: "Calendar context", exact: true })
          .selectOption(String(currentRoot.contextId));
        await page
          .locator(".fc-event")
          .filter({ hasText: `⚑ Due · ${name}` })
          .first()
          .waitFor();
        const marker = page.getByRole("link", { name: `⚑ Due · ${name}`, exact: true });
        await marker.focus();
        await page.keyboard.press("Enter");
        await page.waitForURL((url) => url.pathname === `/todos/${root.id}`);
        await page.getByRole("region", { name: "Task dates", exact: true }).waitFor();
        await page.goto(`${base}/events/${source.id}`);
        await activate(page.getByRole("button", { name: "Edit event", exact: true }));
        await page
          .getByRole("textbox", { name: "Event description", exact: true })
          .fill("Metadata-only edit must keep the legacy instant unchanged.");
        await activate(page.getByRole("button", { name: "Save event", exact: true }));
        await page.getByRole("heading", { name: source.title, exact: true }).waitFor();
        assert.equal((await read(`/api/events/${source.id}`)).date, source.date);
        await activate(
          page.getByRole("button", { name: "Create or link task — preview", exact: true }),
        );
        const conversion = page.getByRole("form", { name: "Conversion choices", exact: true });
        await conversion
          .getByRole("combobox", { name: "Conversion event meaning", exact: true })
          .selectOption("PLACEHOLDER");
        await conversion
          .getByRole("combobox", { name: "Conversion task", exact: true })
          .selectOption("");
        await conversion
          .getByRole("textbox", { name: "Converted task title", exact: true })
          .fill(`${name} converted task`);
        await conversion
          .getByRole("combobox", { name: "Conversion deadline type", exact: true })
          .selectOption("DATE");
        await conversion.getByLabel("Converted deadline date", { exact: true }).fill("2026-11-13");
        await activate(conversion.getByRole("button", { name: "Preview conversion", exact: true }));
        const preview = page.getByLabel("Conversion preview", { exact: true });
        await preview.waitFor();
        await preview.getByRole("checkbox").check();
        const [converted] = await Promise.all([
          page.waitForResponse(
            (r) => new URL(r.url()).pathname === `/api/events/${source.id}/conversion`,
          ),
          activate(preview.getByRole("button", { name: "Confirm conversion", exact: true })),
        ]);
        assert.equal(converted.status(), 200);
        const result = await converted.json();
        taskIds.push(result.taskId);
        await page
          .getByText(
            "This explicitly superseded placeholder is hidden from the calendar. Its original data is retained.",
            { exact: true },
          )
          .waitFor();
        const projection = await read(
          "/api/work-calendar?start=2026-11-01T00:00:00-04:00&end=2026-12-01T00:00:00-05:00",
        );
        assert.ok(!projection.items.some((item) => item.id === `event:${source.id}`));
        assert.ok(projection.items.some((item) => item.id === `deadline:${result.taskId}`));
        await activate(page.getByRole("button", { name: "Review undo conversion", exact: true }));
        const undo = page.getByRole("form", { name: "Undo conversion", exact: true });
        await undo
          .getByRole("checkbox", {
            name: "I reviewed the retained task and previous deadline policy.",
            exact: true,
          })
          .check();
        await activate(undo.getByRole("button", { name: "Confirm undo", exact: true }));
        await page
          .getByRole("button", { name: "Create or link task — preview", exact: true })
          .waitFor();
        assert.equal((await read(`/api/todos/${result.taskId}`)).deadlineDate, null);
        await page.goto(`${base}/todos/${root.id}`);
        await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("DONE");
        const close = page.getByRole("dialog", { name: "Complete task", exact: true });
        await close
          .getByRole("link", { name: `Review session: ${name} session`, exact: true })
          .waitFor();
        await activate(close.getByRole("button", { name: "Complete task", exact: true }));
        await close.waitFor({ state: "hidden" });
        assert.ok(await read(`/api/events/${session.id}`));
        if (viewport.width === 1440) {
          await page.goto(`${base}/events`);
          await page.locator(".fc-daygrid").waitFor();
          await activate(page.getByRole("button", { name: "Week", exact: true }));
          await activate(page.getByRole("button", { name: "Today", exact: true }));
          await page.locator(".fc-timegrid-event").first().waitFor();
          await page.screenshot({ path: "/tmp/work-phase07-desktop.png", fullPage: true });
        }
        console.log(
          `Verified timezone, session editing, layers, conversion/undo and future-session review at ${viewport.width}×${viewport.height}.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (e) {
      if (page) await page.screenshot({ path: "/tmp/work-phase07-failure.png", fullPage: true });
      console.log("Browser runtime errors", errors);
      throw e;
    } finally {
      try {
        if (page) await page.close();
        for (const id of eventIds) {
          const row = await read(`/api/events/${id}`);
          await write(`/api/events/${id}`, null, row.revision, "delete");
        }
        for (const id of taskIds) {
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
