import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
test(
  "Phase 09 real My Work focus, filters, capture, canonical actions and day labels at four sizes",
  { skip: process.env.RUN_WORK_FOCUS_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright"),
      base = "http://localhost:3002";
    const token = await encode({
        secret: "disposable-work-browser-test-secret-not-for-production",
        maxAge: 3600,
        token: {
          githubId: "89470930",
          provider: "github",
          ownerAuthVersion: 1,
        },
      }),
      browser = await chromium.launch({ headless: true }),
      context = await browser.newContext({
        hasTouch: true,
        timezoneId: "Asia/Tokyo",
        colorScheme: "dark",
      }),
      ids = [],
      errors = [];
    await context.addCookies([
      { name: "next-auth.session-token", value: token, url: base },
    ]);
    await context.route(`${base}/api/youtube**`, (route) =>
      route.fulfill({ json: { items: [] } }),
    );
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
      assert.ok(response.ok(), `${path} ${response.status()}`);
      return response.json();
    };
    let page;
    try {
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) => errors.push(error.message));
      const contexts = await read("/api/work-contexts"),
        school = contexts.find((row) => row.key === "school");
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        const activate = (locator) =>
            viewport.width < 1024 ? locator.tap() : locator.click(),
          prefix = `Focus UI ${viewport.width} ${randomUUID().slice(0, 8)}`,
          title = `${prefix} ${"long readable task ".repeat(8)}`.trim();
        await page.setViewportSize(viewport);
        await page.goto(
          `${base}/my-work?company=${encodeURIComponent(prefix)}`,
        );
        await page
          .getByRole("combobox", { name: "My Work context", exact: true })
          .selectOption(String(school.id));
        await page
          .getByRole("combobox", {
            name: "My Work capture context",
            exact: true,
          })
          .getByRole("option", { name: school.name, exact: true })
          .waitFor({ state: "attached" });
        const form = page.getByRole("form", {
          name: "My Work capture",
          exact: true,
        });
        await form
          .getByRole("textbox", { name: "Capture task title", exact: true })
          .fill(title);
        assert.equal(
          await form
            .getByRole("combobox", {
              name: "My Work capture context",
              exact: true,
            })
            .inputValue(),
          String(school.id),
        );
        await form
          .getByRole("textbox", { name: "Capture company", exact: true })
          .fill(prefix);
        const [created] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/todos" &&
              response.request().method() === "POST",
          ),
          activate(form.getByRole("button", { name: "Add task", exact: true })),
        ]);
        assert.equal(created.status(), 201);
        const task = await created.json();
        ids.push(task.id);
        assert.equal(task.contextId, school.id);
        const intake = page.getByRole("region", {
          name: "New to review",
          exact: true,
        });
        await intake
          .getByRole("button", {
            name: `Focus today ${task.reference}`,
            exact: true,
          })
          .waitFor();
        await activate(
          intake.getByRole("button", {
            name: `Focus today ${task.reference}`,
            exact: true,
          }),
        );
        const focus = page.getByRole("region", {
          name: "Today's focus",
          exact: true,
        });
        await focus
          .getByRole("button", {
            name: `Remove focus ${task.reference}`,
            exact: true,
          })
          .waitFor();
        const record = await read(`/api/todos/${task.id}`);
        assert.equal(record.status, "NEW");
        assert.equal(record.deadlineDate, null);
        const planning = await read(
          `/api/my-work?company=${encodeURIComponent(prefix)}`,
        );
        assert.equal(planning.sections.focus.total, 1);
        assert.equal(planning.totalActive, 1);
        await page
          .getByText(new RegExp(`${planning.date}.*${planning.timeZone}`))
          .first()
          .waitFor();
        await activate(
          focus.getByRole("button", {
            name: `${task.reference} · ${title}`,
            exact: true,
          }),
        );
        const panel = page.getByRole("dialog", {
          name: "Task details",
          exact: true,
        });
        await panel.waitFor();
        await activate(
          panel.getByRole("button", {
            name: "Remove today's focus",
            exact: true,
          }),
        );
        await panel
          .getByRole("button", { name: "Focus today", exact: true })
          .waitFor();
        await activate(
          panel.getByRole("button", { name: "Focus today", exact: true }),
        );
        await panel
          .getByRole("button", { name: "Remove today's focus", exact: true })
          .waitFor();
        await panel
          .getByRole("combobox", { name: "Task status", exact: true })
          .selectOption("DONE");
        const close = page.getByRole("dialog", {
          name: "Complete task",
          exact: true,
        });
        await close.waitFor();
        await activate(
          close.getByRole("button", { name: "Complete task", exact: true }),
        );
        await close.waitFor({ state: "hidden" });
        await activate(
          panel.getByRole("button", { name: "Close details", exact: true }),
        );
        await panel.waitFor({ state: "hidden" });
        await focus
          .getByText("Choose focus from any task here or in All Work.", {
            exact: true,
          })
          .waitFor();
        const closed = await read(`/api/todos/${task.id}`);
        await write(
          `/api/todos/${task.id}`,
          { status: "TODO" },
          closed.revision,
          "patch",
        );
        await activate(
          page.getByRole("button", { name: "Refresh My Work", exact: true }),
        );
        await focus
          .getByRole("button", {
            name: `Remove focus ${task.reference}`,
            exact: true,
          })
          .waitFor();
        const urgent = await write("/api/todos", {
          title: `${prefix} undated urgent`,
          company: prefix,
          contextId: school.id,
          priorityLevel: "URGENT",
        });
        ids.push(urgent.id);
        await activate(
          page.getByRole("button", { name: "Refresh My Work", exact: true }),
        );
        const urgentSection = page.getByRole("region", {
          name: "Urgent work",
          exact: true,
        });
        await urgentSection.getByText("No deadline", { exact: true }).waitFor();
        await activate(
          urgentSection.getByRole("link", { name: "View all", exact: true }),
        );
        await page.waitForURL(
          (url) =>
            url.pathname === "/todos" &&
            url.searchParams.get("planning") === "urgent",
        );
        await page.locator(`[data-open-task="${urgent.id}"]`).first().waitFor();
        assert.equal(
          await page
            .getByRole("combobox", { name: "Filter planning section" })
            .inputValue(),
          "urgent",
        );
        const completed = await write("/api/todos", {
          title: `${prefix} completed history`,
          company: prefix,
          contextId: school.id,
          rewardXp: 0,
          rewardCoins: 0,
        });
        ids.push(completed.id);
        await write(
          `/api/todos/${completed.id}`,
          { status: "DONE" },
          completed.revision,
          "patch",
        );
        await activate(
          page.getByRole("button", { name: "Completed history", exact: true }),
        );
        await page.waitForURL(
          (url) =>
            url.searchParams.get("view") === "history" &&
            !url.searchParams.has("planning"),
        );
        await page
          .locator(`[data-open-task="${completed.id}"]`)
          .first()
          .waitFor();
        await page
          .getByRole("combobox", { name: "Filter planning section" })
          .selectOption("urgent");
        await page.waitForURL(
          (url) =>
            url.searchParams.get("planning") === "urgent" &&
            !url.searchParams.has("view"),
        );
        await page.locator(`[data-open-task="${urgent.id}"]`).first().waitFor();
        await page.goto(
          `${base}/my-work?company=${encodeURIComponent(prefix)}`,
        );
        await page
          .getByRole("region", { name: "Today's focus", exact: true })
          .getByRole("button", {
            name: `Remove focus ${task.reference}`,
            exact: true,
          })
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `Overflow at ${viewport.width}`,
        );
        if (viewport.width === 1440)
          await page.screenshot({
            path: "/tmp/work-phase09-desktop.png",
            fullPage: true,
          });
        // A failed read keeps a concrete retry path; no focus/status writes happen on reload.
        await page.route(`${base}/api/my-work**`, (route) =>
          route.fulfill({
            status: 503,
            json: { error: "Planning temporarily unavailable" },
          }),
        );
        await activate(
          page.getByRole("button", { name: "Refresh My Work", exact: true }),
        );
        await page
          .getByRole("alert")
          .filter({ hasText: "Planning temporarily unavailable" })
          .waitFor();
        await page.unroute(`${base}/api/my-work**`);
        await activate(
          page.getByRole("button", { name: "Retry My Work", exact: true }),
        );
        await focus
          .getByRole("button", {
            name: `Remove focus ${task.reference}`,
            exact: true,
          })
          .waitFor();
        await page.route(`${base}/api/work-contexts`, (route) =>
          route.fulfill({
            status: 503,
            json: { error: "Contexts temporarily unavailable" },
          }),
        );
        await page.reload();
        await page
          .getByRole("alert")
          .filter({ hasText: "Contexts temporarily unavailable" })
          .waitFor();
        await page.unroute(`${base}/api/work-contexts`);
        await activate(
          page.getByRole("button", { name: "Retry contexts", exact: true }),
        );
        await page
          .getByRole("combobox", { name: "My Work context", exact: true })
          .getByRole("option", { name: school.name, exact: true })
          .waitFor({ state: "attached" });
        console.log(
          `Verified focus, capture, filters, lifecycle, source links and errors at ${viewport.width}×${viewport.height}.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page)
        await page.screenshot({
          path: "/tmp/work-phase09-failure.png",
          fullPage: true,
        });
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of ids) {
          const row = await read(`/api/todos/${id}`);
          if (!row.archivedAt)
            await write(
              `/api/todos/${id}`,
              { archived: true },
              row.revision,
              "patch",
            );
        }
      } finally {
        await browser.close();
      }
    }
  },
);

test(
  "Phase 09 dashboard task/event tiles retain responsive loading, canonical links and retry",
  { skip: process.env.RUN_WORK_FOCUS_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url);
    const { chromium } = require("playwright");
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      timezoneId: "Asia/Tokyo",
      colorScheme: "dark",
    });
    await context.addCookies([
      { name: "next-auth.session-token", value: token, url: base },
    ]);
    await context.route(`${base}/api/youtube**`, (route) =>
      route.fulfill({ json: { items: [] } }),
    );
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const errors = [];
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) => errors.push(error.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(base);
        await page
          .getByRole("heading", { name: "My Dashboard", exact: true })
          .waitFor();
        for (const label of ["Tasks", "Calendar"]) {
          const tile = page
            .getByRole("heading", { name: label, exact: true })
            .locator("../..");
          await tile.waitFor();
          await tile.getByRole("status").waitFor({ state: "detached" });
          assert.equal(await tile.getByRole("alert").count(), 0);
          if (label === "Tasks") {
            assert.equal(
              await tile
                .getByRole("link", { name: "My Work" })
                .getAttribute("href"),
              "/my-work",
            );
            await tile
              .getByRole("button", { name: "View all", exact: true })
              .click();
            await page.waitForURL(`${base}/todos`);
            await page.goto(base);
            await page
              .getByRole("heading", { name: "Calendar", exact: true })
              .waitFor();
          }
        }
        console.log(
          `Verified dashboard tiles at ${viewport.width}×${viewport.height}.`,
        );
      }
      // Only these two reads are failed deliberately; the real API is restored before retry.
      await context.route(`${base}/api/todos`, (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Task tile temporarily unavailable." },
        }),
      );
      await context.route(`${base}/api/events`, (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Event tile temporarily unavailable." },
        }),
      );
      await page.goto(base);
      await page
        .getByRole("alert")
        .filter({ hasText: "Task tile temporarily unavailable" })
        .waitFor();
      await page
        .getByRole("alert")
        .filter({ hasText: "Event tile temporarily unavailable" })
        .waitFor();
      await context.unroute(`${base}/api/todos`);
      await context.unroute(`${base}/api/events`);
      await page
        .getByRole("button", { name: "Retry tasks", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Retry events", exact: true })
        .click();
      for (const label of ["Tasks", "Calendar"]) {
        const tile = page
          .getByRole("heading", { name: label, exact: true })
          .locator("../..");
        await tile.getByRole("alert").waitFor({ state: "detached" });
        await tile.getByRole("status").waitFor({ state: "detached" });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
