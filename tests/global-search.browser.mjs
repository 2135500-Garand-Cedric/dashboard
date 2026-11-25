import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

test(
  "global search works on desktop and phone, preserves drafts/music, and keeps private queries out of URLs/storage",
  {
    skip: process.env.RUN_GLOBAL_SEARCH_BROWSER_TEST !== "1",
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
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 900,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const base = "http://localhost:3000";
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        await context.addInitScript(() => {
          window.__searchPlayers = [];
          window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
            Player: class {
              constructor(element, options) {
                this.options = options;
                window.__searchPlayers.push(this);
                setTimeout(() => options.events.onReady(), 0);
              }
              setVolume() {

              }
              cueVideoById() {

              }
              loadVideoById() {

              }
              playVideo() {

              }
              pauseVideo() {

              }
              getDuration() {
                return 100;
              }
              getCurrentTime() {
                return 0;
              }
              seekTo() {

              }
              destroy() {
                this.destroyed = true;
              }
            },
          };
        });
        await context.route(`${base}/api/youtube*`, (route) =>
          route.fulfill({ json: { items: [] } }),
        );
        await context.route(`${base}/api/notifications/inbox/count`, (route) =>
          route.fulfill({ json: { unread: 0 } }),
        );
        await context.route(`${base}/api/notifications/inbox?*`, (route) =>
          route.fulfill({ json: { items: [] } }),
        );
        await context.route(`${base}/api/activity-types`, (route) => route.fulfill({ json: [] }));
        await context.route(`${base}/api/projects?*`, (route) =>
          route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 30 } }),
        );
        const focused = {
          id: 9001,
          name: "Person result",
          company: null,
          email: null,
          phone: null,
          notes: "Selected by ID",
          active: true,
          revision: 1,
        };
        await context.route(`${base}/api/work-contacts*`, (route) =>
          route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 30 } }),
        );
        await context.route(`${base}/api/work-contacts/9001`, (route) =>
          route.fulfill({ json: focused }),
        );
        const requests = [];
        let partialAttempts = 0;
        const row = (kind, id, title, extra = {}) => ({
          key: `${kind}:${id}`,
          kind,
          entity: kind === "people" ? "person" : "task",
          id,
          title,
          href: kind === "people" ? "/settings/people?person=9001" : "/settings",
          subtitle: "Current record",
          snippet: "<script>window.searchUnsafe=true</script>",
          badges: [],
          ...extra,
        });
        await context.route(`${base}/api/search`, async (route) => {
          const request = route.request();
          assert.equal(request.method(), "POST");
          assert.equal(new URL(request.url()).search, "");
          const input = request.postDataJSON();
          requests.push(input);
          if (input.query === "slow") await new Promise((resolve) => setTimeout(resolve, 1000));
          let groups;
          if (input.query === "person")
            groups = [
              {
                kind: "people",
                page: 1,
                hasMore: false,
                items: [row("people", 9001, "Person result")],
              },
            ];
          else if (input.query === "unavailable") {
            groups = ["tasks", "finance"].map((kind) => ({
              kind,
              items: [],
              hasMore: false,
              page: 1,
              error: "Unavailable — Retry",
            }));
          } else if (input.query === "denied") {
            await route.fulfill({ status: 403, json: { error: "You cannot use this app." } });
            return;
          } else if (input.query === "partial") {
            partialAttempts++;
            groups = [
              {
                kind: "knowledge",
                page: 1,
                hasMore: false,
                items: [row("knowledge", 1, "Knowledge still works")],
              },
              {
                kind: "finance",
                page: 1,
                hasMore: false,
                items: partialAttempts === 1 ? [] : [row("finance", 1, "Finance recovered")],
                ...(partialAttempts === 1 ? { error: "Unavailable — Retry" } : {}),
              },
            ];
          } else {
            groups = [
              {
                kind: "tasks",
                page: input.page,
                hasMore: input.view === "dialog" || input.page === 1,
                items: [
                  row("tasks", input.page, `${input.query} result ${input.page}`, {
                    badges: input.includeArchived ? ["Archived"] : [],
                  }),
                ],
              },
            ];
          }
          try {
            await route.fulfill({ json: { groups } });
          } catch {
            /* Aborted stale requests never update the UI. */
          }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        const hydrationErrors = [];
        page.on("console", (message) => {
          if (
            message.type() === "error" &&
            /hydrat|server rendered|didn.t match/i.test(message.text())
          )
            hydrationErrors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/settings`);
        const trigger = page.getByRole("button", { name: "Search dashboard", exact: true });
        const quickActions = page.getByRole("button", { name: "Quick actions", exact: true });
        async function openActions() {
          if (
            viewport.width < 768 &&
            (await quickActions.getAttribute("aria-expanded")) !== "true"
          ) {
            await quickActions.click();
          }
        }
        async function openSearch() {
          await openActions();
          await trigger.click();
        }
        await (viewport.width < 768 ? quickActions : trigger).waitFor();
        const serverHTML = await (await context.request.get(`${base}/settings`)).text();
        assert.ok(
          serverHTML.includes('data-search-trigger="true"'),
          "SSR uses an explicit string marker",
        );
        await page.waitForFunction(() => window.__searchPlayers.length > 0);
        const players = await page.evaluate(() => window.__searchPlayers.length);
        if (viewport.width < 768) {
          await page.getByRole("button", { name: "Open navigation", exact: true }).click();
          await openActions();
          const actions = page.getByRole("region", { name: "Quick actions", exact: true });
          assert.equal(await actions.getByRole("button").count(), 3);
          await page.waitForTimeout(320);
          await page.screenshot({path: `/tmp/mobile-actions-${viewport.width}.png`});
          await page.emulateMedia({reducedMotion: "reduce"});
          assert.equal(await actions.evaluate(node => getComputedStyle(node).transitionProperty), "none");
          await page.emulateMedia({reducedMotion: "no-preference"});
          assert.equal(
            await actions.evaluate((node) => getComputedStyle(node).transitionDuration),
            "0.2s",
          );
          await actions.getByRole("button", { name: "Quick add", exact: true }).click();
          const quickDialog = page.getByRole("dialog", { name: "Quick add", exact: true });
          await quickDialog.waitFor();
          assert.equal(await quickActions.getAttribute("aria-expanded"), "false");
          await quickDialog.getByRole("link", { name: "New expense", exact: true }).waitFor();
          await page.keyboard.press("Escape");
          await quickDialog.waitFor({ state: "hidden" });
          await openSearch();
          assert.equal(await page.locator('button[aria-label="Open navigation"]').count(), 1);
        } else await page.keyboard.press("Control+k");
        const dialog = page.getByRole("dialog", { name: "Search dashboard", exact: true });
        await dialog.waitFor();
        const input = dialog.getByRole("searchbox", { name: "Search dashboard", exact: true });
        assert.equal(await input.evaluate((node) => node === document.activeElement), true);
        await dialog.getByRole("region", { name: "Go to page", exact: true }).waitFor();
        assert.equal(requests.length, 0, "empty input uses local shortcuts");
        await input.fill("VPN");
        await dialog.getByRole("link", { name: /VPN result 1/ }).waitFor();
        assert.equal(await page.evaluate(() => window.searchUnsafe), undefined);
        assert.equal(await dialog.locator("script").count(), 0);
        await input.press("ArrowDown");
        assert.equal(
          await dialog
            .getByRole("link", { name: /VPN result 1/ })
            .evaluate((node) => node === document.activeElement),
          true,
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(
          await (viewport.width < 768 ? quickActions : trigger).evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        );
        await openActions();
        await page.getByRole("button", { name: /^Notifications/ }).click();
        await page.getByRole("region", { name: "Recent notifications", exact: true }).waitFor();
        await openSearch();
        await dialog.waitFor();
        assert.equal(
          await page.getByRole("region", { name: "Recent notifications", exact: true }).count(),
          0,
        );
        const beforeSlow = requests.length;
        const slowStarted = page.waitForRequest(
          (request) =>
            request.url().endsWith("/api/search") && request.postDataJSON().query === "slow",
        );
        await input.fill("slow");
        await slowStarted;
        await input.fill("fast");
        await dialog.getByRole("link", { name: /fast result 1/ }).waitFor();
        await page.waitForTimeout(1100);
        assert.equal(await dialog.getByRole("link", { name: /slow result/ }).count(), 0);
        assert.ok(requests.length > beforeSlow);
        const beforeComposition = requests.length;
        await input.dispatchEvent("compositionstart", { data: "が" });
        await input.fill("が");
        await page.waitForTimeout(400);
        assert.equal(requests.length, beforeComposition);
        await input.dispatchEvent("compositionend", { data: "が" });
        await dialog.getByRole("link", { name: /が result 1/ }).waitFor();
        await input.fill("unavailable");
        await dialog.getByRole("button", { name: "Retry search", exact: true }).waitFor();
        assert.equal(await dialog.getByText("No matches.", { exact: false }).count(), 0);
        await input.fill("partial");
        await dialog.getByRole("button", { name: "Retry Finance", exact: true }).waitFor();
        await dialog.getByRole("link", { name: /Knowledge still works/ }).waitFor();
        await dialog.getByRole("button", { name: "Retry Finance", exact: true }).click();
        await dialog.getByRole("link", { name: /Finance recovered/ }).waitFor();
        await input.fill("VPN");
        await dialog.getByRole("link", { name: "See all Tasks", exact: true }).click();
        await page.waitForURL(`${base}/search?type=tasks`);
        await dialog.waitFor({ state: "hidden" });
        const expanded = page.getByRole("searchbox", { name: "Search dashboard", exact: true });
        assert.equal(await expanded.inputValue(), "VPN");
        await page.getByRole("link", { name: /VPN result 1/ }).waitFor();
        await page.getByRole("button", { name: "Next results", exact: true }).click();
        await page.getByRole("link", { name: /VPN result 2/ }).waitFor();
        await page
          .getByRole("checkbox", { name: "Include archived/inactive", exact: true })
          .check();
        await page.getByText("Archived", { exact: true }).waitFor();
        assert.ok(requests.at(-1).includeArchived);
        assert.ok(!page.url().includes("VPN"));
        assert.equal(
          await page.evaluate(() =>
            JSON.stringify({ ...localStorage, ...sessionStorage }).includes("VPN"),
          ),
          false,
        );
        assert.equal(
          await page.evaluate(() => window.__searchPlayers.length),
          players,
          "search navigation preserves the music player",
        );
        assert.equal(
          await page.evaluate(() => window.__searchPlayers.some((player) => player.destroyed)),
          false,
        );
        await page.reload();
        await page.getByRole("searchbox", { name: "Search dashboard", exact: true }).waitFor();
        assert.equal(
          await page.getByRole("searchbox", { name: "Search dashboard", exact: true }).inputValue(),
          "",
          "refresh does not restore private query text",
        );
        await page.goto(`${base}/todos/new`);
        const title = page.getByLabel("Title", { exact: true });
        await title.fill("Unsaved search test");
        await title.press("Control+k");
        assert.equal(await dialog.count(), 0, "editable controls keep their shortcuts");
        await openSearch();
        await dialog.waitFor();
        await input.fill("person");
        await dialog.getByRole("link", { name: /Person result/ }).waitFor();
        page.once("dialog", (native) => native.dismiss());
        await input.press("Enter");
        assert.ok(page.url().endsWith("/todos/new"));
        assert.equal(await dialog.isVisible(), true);
        assert.equal(await title.inputValue(), "Unsaved search test");
        page.once("dialog", (native) => native.accept());
        await input.press("Enter");
        await page.waitForURL(`${base}/settings/people?person=9001`);
        await dialog.waitFor({ state: "hidden" });
        await page.locator('#person-9001[data-focused="true"]').waitFor();
        assert.equal(
          await page.locator("#person-9001").evaluate((node) => node === document.activeElement),
          true,
        );
        assert.equal(
          await page.getByRole("heading", { name: "Person result", exact: true }).count(),
          1,
          "focused person is visible outside the directory page",
        );
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await openSearch();
        await dialog.waitFor();
        await dialog.getByRole("link", { name: /Person result/ }).waitFor();
        for (let i = 0; i < 15; i++) {
          await page.keyboard.press("Tab");
          assert.ok(
            await dialog.evaluate((node) => node.contains(document.activeElement)),
            "focus stays inside search",
          );
        }
        if (viewport.width < 768) {
          await page.setViewportSize({ width: 390, height: 460 });
          await page.waitForTimeout(100);
          const keyboardBox = await dialog.boundingBox();
          assert.ok(keyboardBox.y >= 0 && keyboardBox.y + keyboardBox.height <= 461);
          await page.setViewportSize(viewport);
        }
        await page.screenshot({ path: `/tmp/global-search-${viewport.width}.png`, fullPage: true });
        const box = await dialog.boundingBox();
        assert.ok(box.width <= viewport.width && box.height <= viewport.height);
        if (viewport.width >= 768) {
          await page.mouse.click(2, 2);
          await dialog.waitFor({ state: "hidden" });
        } else {
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
        }
        await openSearch();
        await dialog.waitFor();
        await input.fill("denied");
        await page.waitForURL(`${base}/access-denied`);
        await dialog.waitFor({ state: "hidden" });
        await openSearch();
        await dialog.waitFor();
        assert.equal(
          await input.inputValue(),
          "",
          "authorization loss clears private search state",
        );
        assert.deepEqual(errors, []);
        assert.deepEqual(hydrationErrors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
