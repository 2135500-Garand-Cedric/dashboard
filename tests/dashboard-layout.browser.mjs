import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "dashboard settings, persistent filters, creation pages, outside click and tile scrolling",
  {
    skip: process.env.RUN_DASHBOARD_LAYOUT_BROWSER_TEST !== "1",
  },
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
      timezoneId: "Pacific/Honolulu",
      colorScheme: "dark",
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.addInitScript(() => {
      window.__ytState = 2;
      window.__ytCreates = 0;
      window.YT = {
        PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
        Player: class {
          constructor(mount, options) {
            window.__ytCreates++;
            this.options = options;
            this.frame = document.createElement("iframe");
            this.frame.dataset.testPlayer = "true";
            mount.replaceWith(this.frame);
            setTimeout(() => options.events.onReady(), 0);
          }
          playVideo() {
            window.__ytState = 1;
            this.options.events.onStateChange({ data: 1 });
          }
          pauseVideo() {
            window.__ytState = 2;
            this.options.events.onStateChange({ data: 2 });
          }
          cueVideoById() {
            window.__ytState = 2;
          }
          loadVideoById() {
            this.playVideo();
          }
          getCurrentTime() {
            return 15;
          }
          getDuration() {
            return 120;
          }
          seekTo() {}
          destroy() {
            this.frame.remove();
          }
        },
      };
    });
    await context.route(`${base}/api/youtube**`, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: { videoId: "synthetic" },
              snippet: {
                title: "Synthetic test track",
                thumbnails: {
                  medium: {
                    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==",
                  },
                },
              },
            },
          ],
        },
      }),
    );
    const errors = [],
      taskIds = [],
      eventIds = [],
      projectIds = [];
    const read = async (path) => {
      const response = await context.request.get(base + path);
      assert.ok(response.ok(), `${path}: ${response.status()}`);
      return response.json();
    };
    const write = async (path, body, revision, method = "post") => {
      const response = await context.request[method](base + path, {
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
        data: body,
      });
      assert.ok(response.ok(), `${path}: ${response.status()}`);
      return response.json();
    };
    const initialSettings = await read("/api/settings");
    let page;
    try {
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) => errors.push(error.message));
      const school = (await read("/api/activity-types")).find(
        (row) => row.name.toLowerCase() === "school",
      );
      const nav = async (name) => {
        const open = page.getByRole("button", { name: "Open navigation", exact: true });
        if (await open.isVisible()) await open.click();
        const link = page.getByRole("link", { name, exact: true });
        const href = await link.getAttribute("href");
        await link.click();
        await page.waitForURL((url) => url.pathname === href);
        await page
          .getByRole("heading", {
            name: name === "Main Dashboard" ? "My Dashboard" : name,
            exact: true,
            level: 1,
          })
          .waitFor();
      };
      const showFilters = async () => {
        const show = page.getByRole("button", { name: "Show search and filters", exact: true });
        if (await show.isVisible()) await show.click();
      };
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        await page.setViewportSize(viewport);
        const prefix = `Layout test ${viewport.width} ${randomUUID().slice(0, 8)}`;
        await page.goto(
          `${base}/todos?company=${encodeURIComponent(prefix)}&activityType=${school.id}`,
        );
        await page.getByRole("heading", { name: "All Work", exact: true }).waitFor();
        assert.ok(await page.getByRole("button", { name: "Show search and filters" }).isVisible());
        await showFilters();
        await page.getByRole("textbox", { name: "Search work", exact: true }).fill("Layout test");
        await page.getByRole("button", { name: "+ New task", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/todos/new");
        await page.getByRole("button", { name: "← Back", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/todos");
        await page.getByRole("button", { name: "+ New task", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/todos/new");
        const taskForm = page.getByRole("form", { name: "New task", exact: true });
        await taskForm.getByRole("textbox", { name: "Title", exact: true }).fill(prefix);
        await taskForm
          .getByRole("combobox", { name: "Context", exact: true })
          .locator(`option[value="${school.id}"]`)
          .waitFor({ state: "attached" });
        assert.equal(
          await taskForm.getByRole("combobox", { name: "Context", exact: true }).inputValue(),
          String(school.id),
        );
        const [created] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/todos" &&
              response.request().method() === "POST",
          ),
          taskForm.getByRole("button", { name: "Create task", exact: true }).click(),
        ]);
        assert.equal(created.status(), 201);
        const task = await created.json();
        taskIds.push(task.id);
        await page.waitForURL((url) => url.pathname === "/todos");
        await page.locator(`[data-open-task="${task.id}"]`).first().click();
        const panel = page.getByRole("dialog", { name: "Task details", exact: true });
        await panel.getByRole("heading", { name: prefix, exact: true }).waitFor();
        if (viewport.width >= 768) {
          const rect = await panel.boundingBox();
          await panel.getByRole("button", { name: "Edit", exact: true }).click();
          await panel
            .getByRole("textbox", { name: "Task title", exact: true })
            .fill(`${prefix} unsaved`);
          page.once("dialog", (dialog) => dialog.dismiss());
          await page.mouse.click(Math.max(2, rect.x - 12), 180);
          assert.ok(await panel.isVisible(), "Cancelled discard keeps the task panel open.");
          page.once("dialog", (dialog) => dialog.accept());
          await page.mouse.click(Math.max(2, rect.x - 12), 180);
        } else await page.keyboard.press("Escape");
        await panel.waitFor({ state: "detached" });
        await page.getByRole("button", { name: "Hide search and filters", exact: true }).click();
        await nav("Settings");
        assert.equal(
          await page.getByRole("textbox", { name: "Search timezones", exact: true }).count(),
          0,
        );
        const zoneOptions = await page
          .getByRole("combobox", { name: "Display timezone", exact: true })
          .locator("option")
          .allTextContents();
        assert.ok(zoneOptions.length < 40 && zoneOptions.every((label) => label.includes("GMT")));
        await page
          .getByRole("combobox", { name: "Display timezone", exact: true })
          .selectOption("Asia/Tokyo");
        const [saved] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/settings" &&
              response.request().method() === "PATCH",
          ),
          page.getByRole("button", { name: "Save settings", exact: true }).click(),
        ]);
        assert.equal(saved.status(), 200);
        await page.getByRole("status").filter({ hasText: "Settings saved" }).waitFor();
        assert.equal((await read("/api/my-work")).timeZone, "Asia/Tokyo");
        await nav("All Work");
        await page.waitForURL((url) => url.searchParams.get("company") === prefix);
        assert.ok(await page.getByRole("button", { name: "Show search and filters" }).isVisible());
        await showFilters();
        assert.equal(
          await page.getByRole("textbox", { name: "Search work", exact: true }).inputValue(),
          "Layout test",
        );
        await page.getByRole("link", { name: "Contexts & contacts", exact: true }).click();
        await page.waitForURL(`${base}/todos/manage`);
        await page.getByRole("heading", { name: "Contexts & contacts", exact: true }).waitFor();
        await page.getByRole("heading", { name: "Contexts", exact: true }).waitFor();
        await page.getByRole("heading", { name: "Contacts", exact: true }).waitFor();
        assert.equal(await page.locator("#contexts summary, #contacts summary").count(), 0);
        await nav("Calendar");
        await showFilters();
        const layer = page.getByRole("checkbox", { name: "◇ Project milestones", exact: true });
        await layer.uncheck();
        await page
          .getByRole("combobox", { name: "Calendar context", exact: true })
          .selectOption(String(school.id));
        await page.getByRole("button", { name: "Hide search and filters", exact: true }).click();
        await page.getByRole("button", { name: "Week", exact: true }).click();
        await page.getByRole("button", { name: "Next calendar range", exact: true }).click();
        const calendarTitle = await page.locator(".calendar-page h2").first().innerText();
        await nav("My Work");
        await showFilters();
        await page.getByRole("textbox", { name: "My Work company", exact: true }).fill(prefix);
        await page
          .getByRole("combobox", { name: "My Work context", exact: true })
          .selectOption(String(school.id));
        await page.getByRole("button", { name: "Hide search and filters", exact: true }).click();
        await page.getByRole("link", { name: "New task", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/todos/new");
        const shared = page.getByRole("form", { name: "New task", exact: true });
        assert.equal(
          await shared.getByRole("textbox", { name: "Company", exact: true }).inputValue(),
          prefix,
        );
        await shared
          .getByRole("textbox", { name: "Title", exact: true })
          .fill(`${prefix} captured`);
        const [secondResponse] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/todos" &&
              response.request().method() === "POST",
          ),
          shared.getByRole("button", { name: "Create task", exact: true }).click(),
        ]);
        assert.equal(secondResponse.status(), 201);
        taskIds.push((await secondResponse.json()).id);
        await page.waitForURL((url) => url.pathname === "/my-work");
        await nav("Calendar");
        assert.equal(
          await page
            .getByRole("button", { name: "Week", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
        await page.waitForFunction(
          (title) => document.querySelector(".calendar-page h2")?.textContent === title,
          calendarTitle,
        );
        await showFilters();
        assert.equal(await layer.isChecked(), false);
        assert.equal(
          await page.getByRole("combobox", { name: "Calendar context", exact: true }).inputValue(),
          String(school.id),
        );
        await nav("My Work");
        await showFilters();
        assert.equal(
          await page.getByRole("textbox", { name: "My Work company", exact: true }).inputValue(),
          prefix,
        );
        assert.equal(
          await page.getByRole("link", { name: "All Work", exact: true }).count(),
          1,
          "Only sidebar All Work link remains.",
        );
        assert.ok(
          !(await page.locator("main").innerText()).includes("Sections can contain the same task"),
        );
        await page.getByRole("link", { name: "View all", exact: true }).first().click();
        await page.waitForURL(
          (url) => url.pathname === "/todos" && url.searchParams.has("planning"),
        );
        await page.getByRole("heading", { name: "All Work", exact: true, level: 1 }).waitFor();
        await page.getByRole("button", { name: "Remove planning filter", exact: true }).waitFor();
        await showFilters();
        assert.ok(
          await page
            .getByRole("combobox", { name: "Filter planning section", exact: true })
            .inputValue(),
        );
        await page.getByRole("button", { name: "Hide search and filters", exact: true }).click();
        await page.getByRole("button", { name: "Board", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("mode") === "board");
        await page.getByRole("button", { name: "List", exact: true }).click();
        await page.waitForURL((url) => !url.searchParams.has("mode"));
        await page.getByRole("button", { name: "Clear filters", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/todos" && !url.searchParams.size);
        await showFilters();
        assert.equal(
          await page
            .getByRole("combobox", { name: "Filter planning section", exact: true })
            .inputValue(),
          "",
        );
        await nav("Projects");
        await page.getByRole("link", { name: "New project", exact: true }).click();
        await page.waitForURL(`${base}/projects/new`);
        await page.getByRole("link", { name: "← Back", exact: true }).click();
        await page.waitForURL(`${base}/projects`);
        await page.getByRole("link", { name: "New project", exact: true }).click();
        await page.waitForURL(`${base}/projects/new`);
        const projectForm = page.getByRole("form", { name: "Project editor", exact: true });
        await projectForm.getByRole("textbox", { name: "Project name", exact: true }).fill(prefix);
        const [projectResponse] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/projects" &&
              response.request().method() === "POST",
          ),
          projectForm.getByRole("button", { name: "Save project", exact: true }).click(),
        ]);
        assert.equal(projectResponse.status(), 201);
        projectIds.push((await projectResponse.json()).id);
        await page.waitForURL((url) => /^\/projects\/\d+$/.test(url.pathname));
        await nav("Main Dashboard");
        await page.getByRole("heading", { name: "My Dashboard", exact: true }).waitFor();
        await page.getByRole("heading", { name: "Synthetic test track", exact: true }).waitFor();
        await page.getByRole("button", { name: "▶️", exact: true }).click();
        const player = await page.locator("iframe[data-test-player]").elementHandle();
        assert.equal(await page.evaluate(() => window.__ytState), 1);
        const scroll = await page.evaluate(() => {
          const tile = document.querySelector(".dashboard-grid > div");
          const before = document.documentElement.scrollHeight;
          const tiles = [...document.querySelectorAll(".dashboard-grid > *")].map((node) => {
            const box = node.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom, height: box.height };
          });
          const content = document.createElement("div");
          content.style.height = "2000px";
          tile.appendChild(content);
          tile.scrollTop = 100;
          return {
            before,
            after: document.documentElement.scrollHeight,
            tiles,
            inner: tile.scrollTop,
            viewport: innerHeight,
          };
        });
        assert.ok(scroll.inner > 0, "Overflow remains inside each tile.");
        if (viewport.width >= 768) {
          assert.ok(
            scroll.before <= viewport.height + 1 && scroll.after <= viewport.height + 1,
            `Dashboard fits ${viewport.width}×${viewport.height}: ${JSON.stringify(scroll)}`,
          );
          assert.ok(scroll.tiles.every((tile) => tile.bottom <= viewport.height + 1));
        } else assert.ok(scroll.before > viewport.height, "Phone dashboard keeps page scrolling.");
        await nav("Settings");
        await nav("My Work");
        assert.equal(await player.evaluate((node) => node.isConnected), true);
        assert.equal(await page.evaluate(() => window.__ytState), 1);
        assert.equal(await page.evaluate(() => window.__ytCreates), 1);
        const event = await write("/api/events", {
          title: `${prefix} timed`,
          date: "2026-11-12T00:30:00.000Z",
        });
        eventIds.push(event.id);
        await page.goto(`${base}/events/${event.id}`);
        await page.getByText("2026-11-12 09:30:00", { exact: true }).waitFor();
        assert.ok(!(await page.locator("body").innerText()).includes("America/Toronto"));
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `Overflow ${viewport.width}`,
        );
        if (viewport.width === 1440)
          await page.screenshot({ path: "/tmp/dashboard-ui-event.png", fullPage: true });
        console.log(
          `Verified all requested flows at ${viewport.width}×${viewport.height}, Tokyo display / Honolulu device.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page) await page.screenshot({ path: "/tmp/dashboard-ui-failure.png", fullPage: true });
      throw error;
    } finally {
      try {
        if (page) await page.close();
        for (const id of taskIds) {
          const row = await read(`/api/todos/${id}`);
          if (!row.archivedAt)
            await write(`/api/todos/${id}`, { archived: true }, row.revision, "patch");
        }
        for (const id of eventIds) {
          const row = await read(`/api/events/${id}`);
          await write(`/api/events/${id}`, undefined, row.revision, "delete");
        }
        await context.request.patch(`${base}/api/settings`, { data: initialSettings });
      } finally {
        await browser.close();
      }
    }
  },
);
