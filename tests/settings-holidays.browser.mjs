import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { encode } from "next-auth/jwt";

test(
  "Settings tiles link to dedicated pages and selected regional holidays work on phone and desktop",
  { skip: process.env.RUN_SETTINGS_HOLIDAYS_BROWSER_TEST !== "1", timeout: 240000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "dark",
    });
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const read = async (path) => {
      const response = await context.request.get(base + path);
      assert.ok(response.ok(), await response.text());
      return response.json();
    };
    try {
      const anonymous = await browser.newContext();
      for (const [path, method] of [
        ["/api/settings/holidays", "get"],
        ["/api/settings/holidays?country=CA", "get"],
        ["/api/settings/holidays", "post"],
        ["/api/settings/holidays/1", "delete"],
        ["/api/settings/holidays/1", "patch"],
      ])
        assert.equal((await anonymous.request[method](base + path)).status(), 401);
      await anonymous.close();
      await page.goto(`${base}/settings`);
      const tiles = [
        ["Display timezone", "/settings/timezone"],
        ["Calendar holidays", "/settings/holidays"],
        ["Notifications", "/settings/notifications"],
        ["Finance settings", "/finance/settings"],
      ];
      for (const [name, href] of tiles)
        assert.equal(
          await page.getByRole("link", { name, exact: true }).getAttribute("href"),
          href,
        );
      assert.equal(await page.getByLabel("Display timezone", { exact: true }).count(), 0);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      }
      await page.getByRole("link", { name: "Display timezone", exact: true }).click();
      await page.getByLabel("Display timezone", { exact: true }).waitFor();
      await page.getByRole("link", { name: "Back to settings", exact: true }).click();
      await page.getByRole("link", { name: "Notifications", exact: true }).click();
      await page.getByRole("heading", { name: "Notifications", exact: true }).waitFor();
      await page.getByRole("link", { name: "Back to settings", exact: true }).click();
      await page.getByRole("link", { name: "Calendar holidays", exact: true }).click();
      await page.waitForURL(`${base}/settings/holidays`);
      await page.getByRole("heading", { name: "Calendar holidays", exact: true }).waitFor();
      const baseline = await read("/api/settings/holidays");
      for (const item of baseline.selected)
        await context.request.delete(`${base}/api/settings/holidays/${item.id}`);
      await page.reload();
      await page.getByText("No holidays added yet.", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Holiday region", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Add holiday", exact: true }).click();
      await page.getByLabel("Holiday country", { exact: true }).selectOption("CA");
      const ca = (await read("/api/settings/holidays?country=CA")).choices;
      const bank = ca.find(
        (item) => item.name === "Remembrance Day" && item.type === "bank" && !item.state,
      );
      const quebec = ca.find((item) => item.state === "QC" && item.name === "National Holiday");
      const bc = ca.find((item) => item.state === "BC" && item.name === "British Columbia Day");
      for (const choice of [bank, quebec, bc]) {
        assert.ok(choice);
        const adding = page.getByRole("dialog", { name: "Add a holiday", exact: true });
        if (!(await adding.isVisible()))
          await page.getByRole("button", { name: "Add holiday", exact: true }).click();
        await page.getByLabel("Holiday", { exact: true }).selectOption(choice.key);
        await page.getByRole("button", { name: "Save holiday", exact: true }).click();
        await page.getByText("Holiday added to your calendar.", { exact: true }).waitFor();
        await adding.waitFor({ state: "hidden" });
      }
      await page
        .getByRole("button", { name: "Edit Remembrance Day, National", exact: true })
        .click();
      const editor = page.getByRole("dialog", { name: "Edit calendar date", exact: true });
      await editor.getByLabel("Holiday display name", { exact: true }).fill("My remembrance day");
      await editor.getByLabel("Holiday type", { exact: true }).selectOption("important");
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await editor.waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: "My remembrance day", exact: true }).waitFor();
      assert.ok(await page.getByText("Important date", { exact: true }).count());
      await page
        .getByRole("button", { name: "Edit My remembrance day, National", exact: true })
        .click();
      await editor.waitFor();
      await page.mouse.click(2, 2);
      await editor.waitFor({ state: "hidden" });
      let cards = page.getByRole("region", { name: "Selected calendar holidays", exact: true });
      assert.ok(await cards.getByText("Important date", { exact: true }).count());
      await page.getByRole("button", { name: "Add holiday", exact: true }).click();
      await page.getByLabel("Holiday country", { exact: true }).selectOption("JP");
      const jp = (await read("/api/settings/holidays?country=JP")).choices.find(
        (item) => item.name === "Coming of Age Day",
      );
      await page.getByLabel("Holiday", { exact: true }).selectOption(jp.key);
      await page.getByRole("button", { name: "Save holiday", exact: true }).click();
      await page.getByText("Holiday added to your calendar.", { exact: true }).waitFor();
      await page.getByRole("heading", { name: "Coming of Age Day", exact: true }).waitFor();
      const selected = (await read("/api/settings/holidays")).selected;
      assert.equal(selected.length, 4);
      assert.ok(
        selected.some(
          (item) =>
            item.name === "My remembrance day" &&
            item.type === "important" &&
            item.sourceName === "Remembrance Day",
        ),
      );
      assert.ok(selected.every((item) => /^\d{4}-\d\d-\d\d$/.test(item.nextDate)));
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        assert.equal(await cards.getByRole("article").count(), 4);
      }
      await page.reload();
      await page.getByRole("heading", { name: "Coming of Age Day", exact: true }).waitFor();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Remove Coming of Age Day, National", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Coming of Age Day", exact: true })
        .waitFor({ state: "hidden" });
      assert.equal((await read("/api/settings/holidays")).selected.length, 3);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
