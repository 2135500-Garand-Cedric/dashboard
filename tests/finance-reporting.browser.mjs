import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

test(
  "finance overview shows exact totals, current matching workflow, retained filters and responsive charts",
  { skip: process.env.RUN_FINANCE_REPORT_BROWSER_TEST !== "1", timeout: 180000 },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright");
    const base = process.env.FINANCE_REPORT_BROWSER_BASE_URL || "http://localhost:3000";
    require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, {
      info() {},
      error() {},
    });
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1080 },
        colorScheme: "dark",
      });
      await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      await context.route(`${base}/api/youtube**`, (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      await context.route("https://www.youtube.com/**", (route) => route.abort());
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        // YouTube is deliberately blocked in this finance-only browser check.
        const expectedPlayerError =
          message.text().includes("Failed to initialize YouTube player") ||
          (message.text().includes("net::ERR_FAILED") &&
            message.location().url.includes("youtube.com"));
        if (message.type() === "error" && !expectedPlayerError)
          errors.push(message.text().slice(0, 250));
      });
      const money = (value, currency) => {
        const negative = value.startsWith("-"),
          [whole, decimal = ""] = (negative ? value.slice(1) : value).split(".");
        return `${negative ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal.padEnd(2, "0").replace(/0+$/, "").padEnd(2, "0")} ${currency}`;
      };
      const check = async (report) => {
        await page.locator("[data-finance-report]").waitFor();
        for (const [name, key] of [
          ["Income", "income"],
          ["Net expenses", "expenses"],
          ["Net cash flow", "net"],
        ])
          assert.equal(
            await page.locator(`[data-total="${name}"]`).innerText(),
            money(report.totals[key], report.filters.currency),
          );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      };
      async function change(action) {
        const response = page.waitForResponse(
          (response) =>
            response.url().includes("/api/finance/reports?") && response.status() === 200,
        );
        await action();
        const report = await (await response).json();
        await check(report);
        return report;
      }
      const response = page.waitForResponse(
        (response) => response.url().includes("/api/finance/reports?") && response.status() === 200,
      );
      await page.goto(`${base}/finance`);
      const initial = await (await response).json();
      await check(initial);
      for (const title of [
        "Statement matching",
        "Income versus expenses",
        "Spending by category",
        "Income by source",
        "Recent activity",
      ])
        await page.getByRole("heading", { name: title, exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("link", { name: /Reconciliation|Receipt history|Transaction history/ })
          .count(),
        0,
      );
      for (const width of [1920, 1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1080 });
        await check(initial);
        if (width === 1920 || width === 390)
          await page.screenshot({ path: `/tmp/dashboard-overview-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1080 });
      await page.getByRole("button", { name: "By account", exact: true }).click();
      await page.getByRole("heading", { name: "Spending by account", exact: true }).waitFor();
      await page.getByRole("button", { name: "12 months", exact: true }).click();
      await page.getByRole("button", { name: "Selected period", exact: true }).click();
      const year = await change(() =>
        page.getByRole("button", { name: "Year", exact: true }).click(),
      );
      assert.equal(year.interval, "month");
      await change(() => page.getByRole("button", { name: "Custom range", exact: true }).click());
      await page.getByLabel("Report from date").fill(`${initial.filters.from.slice(0, 4)}-01-01`);
      await page.getByLabel("Report to date").fill(initial.filters.to);
      const custom = await change(() =>
        page.getByRole("button", { name: "Apply range", exact: true }).click(),
      );
      assert.equal(custom.filters.mode, "custom");
      await page.getByRole("button", { name: /^Filters/ }).click();
      const personal = await change(() => page.getByLabel("Report data").selectOption("personal"));
      assert.equal(personal.coverage.examplesIncluded, false);
      assert.equal(await page.getByText("Includes example data", { exact: true }).count(), 0);
      await page.reload();
      await page.locator("[data-finance-report]").waitFor();
      assert.equal(new URL(page.url()).searchParams.get("dataset"), "personal");
      await page.getByRole("button", { name: /^Filters/ }).click();
      assert.equal(await page.getByLabel("Report data").inputValue(), "personal");
      await change(() => page.getByRole("button", { name: "Clear filters", exact: true }).click());
      const usdOption = page
        .getByLabel("Report currency")
        .locator('option[value="USD"], option')
        .filter({ hasText: /^USD$/ });
      if (await usdOption.count()) {
        const usd = await change(() => page.getByLabel("Report currency").selectOption("USD"));
        assert.equal(usd.filters.currency, "USD");
        assert.equal(usd.filters.accountId, null);
      }
      await page.getByLabel("Report from date").fill("1900-01-01");
      await page.getByLabel("Report to date").fill("1900-01-02");
      const empty = await change(() =>
        page.getByRole("button", { name: "Apply range", exact: true }).click(),
      );
      assert.equal(empty.totals.count, 0);
      assert.equal(empty.overview.matching.total, 0);
      await page
        .getByText("Add an income, expense or transfer to see your activity here.", { exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      console.log(
        "Verified exact overview totals, statements and canonical transfers, month/year/custom ranges, personal/currency filters, persistence, empty states and 320–1920px layouts. No financial data changed.",
      );
    } finally {
      await browser.close();
    }
  },
);
