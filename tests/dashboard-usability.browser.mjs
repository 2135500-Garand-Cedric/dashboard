import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "dashboard volume, finance tile, note modals, clock changes and manual task archive",
  {
    skip: process.env.RUN_DASHBOARD_USABILITY_BROWSER_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "dark",
    });
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.addInitScript(() => {
      window.__players = [];
      window.YT = {
        PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
        Player: class {
          constructor(element, options) {
            this.options = options;
            this.volume = -1;
            this.plays = 0;
            window.__players.push(this);
            setTimeout(() => options.events.onReady(), 0);
          }
          setVolume(volume) {
            this.volume = volume;
          }
          playVideo() {
            this.plays++;
            this.options.events.onStateChange({ data: 1 });
          }
          pauseVideo() {
            this.options.events.onStateChange({ data: 2 });
          }
          cueVideoById() {}
          loadVideoById() {}
          getDuration() {
            return 100;
          }
          getCurrentTime() {
            return 10;
          }
          seekTo() {}
          destroy() {}
        },
      };
    });
    await context.route("**/api/youtube*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: { videoId: "fixture" },
              snippet: {
                title: "Test music",
                thumbnails: {
                  medium: {
                    url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                  },
                },
              },
            },
          ],
        },
      }),
    );
    const read = async (path) => {
      const response = await context.request.get(base + path);
      assert.ok(response.ok(), await response.text());
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
      assert.ok(response.ok(), `${path}: ${await response.text()}`);
      return response.json();
    };
    const original = await read("/api/settings");
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let task, project;
    const outside = async (dialog) => {
      const box = await dialog.boundingBox();
      await page.mouse.click(Math.max(2, box.x - 8), box.y + 10);
      await dialog.waitFor({ state: "hidden" });
    };
    try {
      await write("/api/settings", { timeZone: "America/Toronto" }, undefined, "patch");
      await page.goto(base);
      await page.getByRole("slider", { name: "Music volume", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.__players[0].volume), 30);
      assert.equal(await page.evaluate(() => window.__players[0].plays), 0);
      await page.getByRole("slider", { name: "Music volume", exact: true }).fill("12");
      assert.equal(await page.evaluate(() => window.__players[0].volume), 12);
      const summary = page.getByRole("region", { name: "Finance summary", exact: true });
      await summary.getByText("Net cash flow", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Play music", exact: true }).click();
      await summary.getByRole("link", { name: "View overview", exact: true }).click();
      await page.getByRole("heading", { name: "Financial overview", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.__players.length), 1);
      assert.equal(await page.evaluate(() => window.__players[0].plays), 1);
      await page.setViewportSize({ width: 2560, height: 1440 });
      const finance = await page
        .getByRole("heading", { name: "Financial overview", exact: true })
        .locator("..")
        .locator("..")
        .boundingBox();
      const main = await page.locator("main").boundingBox();
      assert.ok(finance.width > main.width - 70);
      await page.goto(base);
      assert.equal(
        await page.getByRole("slider", { name: "Music volume", exact: true }).inputValue(),
        "12",
      );
      await page.waitForFunction(() => window.__players[0]?.volume === 12);
      assert.equal(await page.evaluate(() => window.__players[0].plays), 0);
      assert.equal(await page.getByRole("link", { name: "Time Manager", exact: true }).count(), 0);

      task = await write("/api/todos", { title: `Usability task ${randomUUID()}` });
      project = await write("/api/projects", { name: `Usability project ${randomUUID()}` });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const [path, basePath] of [
          [`/todos/${task.id}`, `/api/todos/${task.id}`],
          [`/projects/${project.id}`, `/api/projects/${project.id}`],
        ]) {
          await page.goto(base + path);
          await page.getByRole("button", { name: "Add note", exact: true }).click();
          const modal = page.getByRole("dialog", { name: "Add note", exact: true });
          await modal.getByLabel("Note text", { exact: true }).fill(`Note ${width}`);
          if (width === 390)
            await page.screenshot({ path: "/tmp/dashboard-usability-note-phone.png" });
          await outside(modal);
          await page.getByRole("button", { name: "Add note", exact: true }).click();
          assert.equal(
            await modal.getByLabel("Note text", { exact: true }).inputValue(),
            `Note ${width}`,
          );
          assert.equal(await modal.getByLabel("Note occurred at", { exact: true }).count(), 0);
          assert.equal(await modal.getByLabel("Documentation links", { exact: true }).count(), 0);
          if (basePath.startsWith("/api/todos/"))
            await modal.getByLabel("Note task status", { exact: true }).selectOption("WAITING");
          else assert.equal(await modal.getByLabel("Note task status", { exact: true }).count(), 0);
          await modal.getByRole("button", { name: "Save note", exact: true }).click();
          await modal.waitFor({ state: "hidden" });
          const timeline = await read(`${basePath}/timeline?filter=notes&page=1`);
          assert.ok(
            timeline.notes.some(
              (note) => note.body === `Note ${width}` && note.occurredAt === null,
            ),
          );
        }
      }
      await page.goto(`${base}/todos/${task.id}`);
      await page.getByRole("button", { name: "Archive task", exact: true }).click();
      await page.getByRole("button", { name: "Restore task", exact: true }).waitFor();
      assert.ok((await read(`/api/todos/${task.id}`)).archivedAt);
      await page.getByRole("button", { name: "Restore task", exact: true }).click();
      await page.getByRole("button", { name: "Archive task", exact: true }).waitFor();
      for (const status of ["DONE", "TODO", "CANCELLED"]) {
        task = await read(`/api/todos/${task.id}`);
        task = await write(`/api/todos/${task.id}`, { status }, task.revision, "patch");
        assert.equal(task.archivedAt, null);
      }
      await page.goto(base + "/events");
      await page.getByRole("button", { name: "New event / session", exact: true }).click();
      const eventModal = page.getByRole("dialog", {
        name: "New event or work session",
        exact: true,
      });
      await eventModal.getByLabel("Event timing", { exact: true }).selectOption("TIMED");
      await eventModal.getByLabel("Start date and time", { exact: true }).fill("2026-11-02T10:00");
      assert.equal(await eventModal.getByLabel("Start repeated time", { exact: true }).count(), 0);
      await eventModal.getByLabel("Start date and time", { exact: true }).fill("2026-11-01T01:30");
      await eventModal.getByLabel("Start repeated time", { exact: true }).waitFor();
      page.once("dialog", (dialog) => dialog.accept());
      await outside(eventModal);
      assert.deepEqual(errors, []);
      console.log(
        "Verified saved volume/no autoplay/page persistence, finance summary/full width, task/project note modals and retained drafts, DST choices, and manual archive/status changes.",
      );
    } finally {
      await write("/api/settings", { timeZone: original.timeZone }, undefined, "patch").catch(
        () => {},
      );
      if (task) {
        const latest = await read(`/api/todos/${task.id}`).catch(() => null);
        if (latest && !latest.archivedAt)
          await write(`/api/todos/${task.id}`, { archived: true }, latest.revision, "patch").catch(
            () => {},
          );
      }
      await context.close();
      await browser.close();
    }
  },
);
