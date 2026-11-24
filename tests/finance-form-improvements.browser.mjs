import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

test(
  "finance validation uses snackbars and all active deductions can be added with blank zero amounts",
  { skip: process.env.RUN_FINANCE_FORMS_BROWSER_TEST !== "1", timeout: 180000 },
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
        let expenseWrites = 0;
        let savedIncome = null;
        await context.route(`${base}/api/finance/**`, async (route) => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (request.method() === "GET") {
            if (path.endsWith("/accounts"))
              return route.fulfill({
                json: {
                  accounts: [
                    {
                      id: 1,
                      name: "Example bank",
                      type: "CHEQUING",
                      currency: "CAD",
                      active: true,
                    },
                  ],
                },
              });
            if (path.endsWith("/categories"))
              return route.fulfill({
                json: {
                  categories: [{ id: 11, name: "Groceries", type: "EXPENSE", active: true }],
                },
              });
            if (path.endsWith("/income-sources"))
              return route.fulfill({
                json: {
                  sources: [{ id: 1, name: "Example employer", kind: "EMPLOYMENT", active: true }],
                },
              });
            if (path.endsWith("/deduction-types"))
              return route.fulfill({
                json: {
                  types: [
                    { id: 1, name: "Income tax", active: true },
                    { id: 2, name: "QPP", active: true },
                    { id: 3, name: "EI", active: true },
                    { id: 4, name: "Inactive deduction", active: false },
                  ],
                },
              });
            return route.fulfill({ json: { transactions: [] } });
          }
          if (path.endsWith("/expenses")) {
            expenseWrites++;
            return route.fulfill({
              status: 400,
              json: { error: "Example expense save failed. Please retry." },
            });
          }
          if (path.endsWith("/income")) {
            const details = request.postData().match(/name="details"\r\n\r\n([^\r]+)/);
            assert.ok(details, "income details were sent as multipart JSON");
            savedIncome = JSON.parse(details[1]);
            return route.fulfill({
              status: 400,
              json: { error: "Example income save failed. Please retry." },
            });
          }
          throw new Error(`Unexpected finance mutation: ${path}`);
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/finance/expenses/new`);
        await page.getByLabel("Description / merchant", { exact: true }).fill("Example purchase");
        await page.getByLabel("Expense category", { exact: true }).selectOption("11");
        await page.getByLabel("Subtotal", { exact: true }).fill("12.50");
        await page.getByRole("button", { name: "Save expense", exact: true }).click();
        await page.getByText("Payment account is required.", { exact: true }).waitFor();
        assert.equal(expenseWrites, 0, "missing required fields never submit a financial write");
        assert.equal(
          await page
            .getByLabel("Payment account", { exact: true })
            .evaluate((node) => node === document.activeElement),
          true,
        );
        await page.getByLabel("Payment account", { exact: true }).selectOption("1");
        await page.getByRole("button", { name: "Save expense", exact: true }).click();
        await page
          .locator(".fixed")
          .getByText("Example expense save failed. Please retry.", { exact: true })
          .waitFor();
        assert.equal(expenseWrites, 1);

        await page.goto(`${base}/finance/income/new`);
        await page.getByLabel("Employer / income source", { exact: true }).selectOption("1");
        await page.getByLabel("Income description", { exact: true }).fill("Example pay");
        await page.getByLabel("Deposit account", { exact: true }).selectOption("1");
        await page.getByLabel("Gross income", { exact: true }).fill("104.25");
        await page.getByLabel("Net income", { exact: true }).fill("100");
        await page.getByRole("button", { name: "Add deduction", exact: true }).click();
        assert.equal(await page.getByLabel("Deduction 1 amount", { exact: true }).inputValue(), "");
        await page.getByLabel("Deduction 1 amount", { exact: true }).fill("4.25");
        await page.getByRole("button", { name: "Add all deductions", exact: true }).click();
        assert.equal(await page.getByLabel(/^Deduction \d+ amount$/).count(), 3);
        assert.equal(
          await page.getByLabel("Deduction 1 amount", { exact: true }).inputValue(),
          "4.25",
        );
        assert.equal(await page.getByLabel("Deduction 2 amount", { exact: true }).inputValue(), "");
        assert.equal(await page.getByLabel("Deduction 3 amount", { exact: true }).inputValue(), "");
        assert.equal(
          await page.getByRole("button", { name: "Add all deductions", exact: true }).isDisabled(),
          true,
        );
        assert.equal(await page.getByText(/Gross minus deductions does not equal net/).count(), 0);
        await page.getByRole("button", { name: "Save income record", exact: true }).click();
        await page
          .locator(".fixed")
          .getByText("Example income save failed. Please retry.", { exact: true })
          .waitFor();
        assert.deepEqual(savedIncome.deductions, [
          { typeId: 1, amount: "4.25" },
          { typeId: 2, amount: "0" },
          { typeId: 3, amount: "0" },
        ]);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.goto(`${base}/finance/transfers/new`);
        await page
          .getByRole("heading", { name: /transfer/i })
          .first()
          .waitFor();
        assert.equal(await page.getByText(/Use transfers for moves/).count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
