import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

test(
  "email controls and income precision work on desktop and phone without real writes",
  {
    skip: process.env.RUN_DASHBOARD_SETTINGS_BROWSER_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    const require = createRequire(import.meta.url);
    require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, {
      info() {},
      error() {},
    });
    const { chromium } = require("playwright");
    const base = "http://localhost:3000";
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        await context.route("https://www.youtube.com/**", (route) => route.abort());
        let preferences = { enabled: false, recipient: "", revision: 0, configured: true };
        let failSave = false;
        await context.route(`${base}/api/settings/email`, async (route) => {
          if (route.request().method() === "PATCH") {
            if (failSave)
              return route.fulfill({ status: 503, json: { error: "Settings unavailable." } });
            const input = route.request().postDataJSON();
            assert.equal(input.revision, preferences.revision);
            preferences = { ...input, revision: preferences.revision + 1, configured: true };
          }
          await route.fulfill({ json: preferences });
        });
        const account = {
          id: 1,
          name: "Example bank",
          type: "CHEQUING",
          currency: "CAD",
          active: true,
        };
        const source = { id: 1, name: "Example employer", kind: "EMPLOYMENT", active: true };
        const record = {
          id: 5,
          source,
          description: "Example pay",
          date: "2026-11-24",
          periodStart: null,
          periodEnd: null,
          account,
          category: null,
          currency: "CAD",
          grossAmount: "100.1234",
          netAmount: "90.1234",
          deductions: [{ typeId: 1, name: "Tax", active: true, amount: "10.0000" }],
          deductionsTotal: "10.0000",
          difference: "0.0000",
          notes: "Example note",
          updatedAt: "2026-11-24T12:00:00.000Z",
          document: null,
          transaction: null,
          linkWarning: null,
          allocations: [],
        };
        const transaction = {
          id: 8,
          type: "INCOME",
          source: "MANUAL",
          date: record.date,
          description: record.description,
          amount: record.netAmount,
          currency: "CAD",
          account,
          notes: record.notes,
          updatedAt: record.updatedAt,
          statementMatches: [],
          incomeRecords: [{ id: 5, date: record.date }],
          receipts: [],
        };
        let saved = null;
        await context.route(`${base}/api/finance/**`, async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (route.request().method() !== "GET") {
            assert.equal(path, "/api/finance/income/5");
            const details = route
              .request()
              .postData()
              .match(/name="details"\r\n\r\n([^\r]+)/);
            assert.ok(details);
            saved = JSON.parse(details[1]);
            return route.fulfill({ status: 400, json: { error: "Example validation response." } });
          }
          const data = path.endsWith("/accounts")
            ? { accounts: [account] }
            : path.endsWith("/income-sources")
              ? { sources: [source] }
              : path.endsWith("/deduction-types")
                ? { types: [{ id: 1, name: "Tax", active: true }] }
                : path.endsWith("/transactions/8")
                  ? { transaction }
                  : path.endsWith("/income/5")
                    ? { record }
                    : { categories: [] };
          await route.fulfill({ json: data });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/settings/email`);
        const toggle = page.getByRole("switch", { name: "Allow dashboard emails" });
        await page.getByLabel("Email recipient").fill("example@example.com");
        await page.getByRole("button", { name: "Save recipient", exact: true }).click();
        await page.waitForFunction(
          () => document.querySelector('[aria-label="Email recipient"]')?.disabled === false,
        );
        await toggle.click();
        await page.waitForFunction(
          () => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "true",
        );
        await page.getByLabel("Email recipient").fill("invalid draft");
        await toggle.click();
        await page.waitForFunction(
          () => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "false",
        );
        assert.equal(
          preferences.recipient,
          "example@example.com",
          "invalid unsaved draft cannot block disabling",
        );
        failSave = true;
        await page.getByLabel("Email recipient").fill("new@example.com");
        await page.getByRole("button", { name: "Save recipient", exact: true }).click();
        await page.getByRole("alert").getByText("Settings unavailable.", { exact: true }).waitFor();
        assert.equal(preferences.recipient, "example@example.com");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        await page.goto(`${base}/finance/income/deposits/8`);
        await page.getByRole("heading", { name: "Income details", exact: true }).waitFor();
        assert.equal(await page.getByLabel("Gross income", { exact: true }).inputValue(), "100.12");
        assert.equal(await page.getByLabel("Net income", { exact: true }).inputValue(), "90.12");
        assert.equal(
          await page.getByLabel("Deduction 1 amount", { exact: true }).inputValue(),
          "10.00",
        );
        await page.getByRole("button", { name: "Save income record", exact: true }).click();
        await page.getByText("Example validation response.", { exact: true }).first().waitFor();
        assert.equal(
          saved.grossAmount,
          "100.1234",
          "display formatting preserves untouched stored precision",
        );
        assert.equal(saved.netAmount, "90.1234");
        assert.equal(saved.deductions[0].amount, "10.0000");
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
