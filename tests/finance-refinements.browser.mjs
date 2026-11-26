import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import { financeRefinements } from "./helpers/finance-refinements.mjs";

test(
  "finance balances, configurable income types, transfer currency/precision and full-width history work on desktop and phone",
  {
    skip: process.env.RUN_FINANCE_REFINEMENTS_BROWSER_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    const require = createRequire(import.meta.url);
    require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, {
      info() {

      },
      error() {

      },
    });
    const { chromium } = require("playwright"),
      browser = await chromium.launch({ headless: true }),
      base = "http://localhost:3000";
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 900,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const modules = financeRefinements({});
    const today = modules["./reporting"].reportingToday();
    try {
      for (const viewport of [
        { width: 2560, height: 1440 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        const errors = [],
          writes = [];
        const accounts = [
          {
            id: 1,
            name: "Bank",
            type: "CHEQUING",
            currency: "CAD",
            active: true,
            maskedIdentifier: null,
          },
          {
            id: 2,
            name: "USD account",
            type: "SAVINGS",
            currency: "USD",
            active: true,
            maskedIdentifier: null,
          },
        ];
        const types = [{ id: 1, name: "Employment", active: true, legacyKind: "EMPLOYMENT" }],
          sources = [{ id: 1, name: "Employer", kind: "EMPLOYMENT", active: true, type: types[0] }];
        const categories = [{ id: 1, name: "Rent", type: "EXPENSE", active: true }];
        const balance = {
          id: 1,
          name: "Bank",
          type: "CHEQUING",
          currency: "CAD",
          active: true,
          amount: "1234.5000",
          revision: 0,
          asOf: today,
          checkpoint: null,
        };
        const record = (id, type, amount) => ({
          id,
          type,
          amount,
          ledgerAmount: amount,
          excludedAmount: "0.0000",
          currency: "CAD",
          date: today,
          description:
            type === "INCOME" ? "Salary" : type === "TRANSFER" ? "Savings transfer" : "Rent",
          notes: "Visible note",
          account: accounts[0],
          category: type === "EXPENSE" ? categories[0] : null,
          source: "MANUAL",
          editable: true,
          updatedAt: "2026-11-25T12:00:00.000Z",
          statementMatches: [],
          receipts: [],
          incomeRecords:
            type === "INCOME"
              ? [{ id: 1, description: "Salary", date: today, source: sources[0] }]
              : [],
          transfer:
            type === "TRANSFER"
              ? {
                  id: "transfer",
                  transactionId: 4,
                  account: accounts[1],
                  amount: "18.7500",
                  ledgerAmount: "18.7500",
                  currency: "USD",
                }
              : null,
        });
        const expense = record(1, "EXPENSE", "-1000.0000"),
          income = record(2, "INCOME", "2000.0000"),
          transfer = record(3, "TRANSFER", "-25.1000");
        const reportData = {
          today,
          accounts,
          categories,
          sources: [{ id: 1, name: "Employer", kind: "EMPLOYMENT", typeName: "Employment" }],
          transactions: [expense, income, { ...record(5, "REFUND", "250.0000"), accountId: 1 }].map(
            (row) => ({
              ...row,
              accountId: 1,
              categoryId: row.category?.id ?? null,
              statementBacked: false,
              counterparty: null,
            }),
          ),
          income: [
            {
              id: 1,
              sourceId: 1,
              accountId: 1,
              categoryId: null,
              date: today,
              gross: "2500",
              net: "2000",
              deductions: "500",
              currency: "CAD",
              transactionId: 2,
              description: "Salary",
            },
          ],
          receipts: [],
          matches: [],
          examples: { accountIds: [], receiptIds: [], incomeIds: [] },
          reimbursements: [{ expenseId: 1, paymentId: 5, amount: "250" }],
          reimbursementPlans: [{ expenseId: 1, person: "Dad", expected: "1000" }],
        };
        await context.route(`${base}/api/**`, async (route) => {
          const request = route.request(),
            url = new URL(request.url()),
            path = url.pathname;
          if (path.startsWith("/api/auth/")) return route.continue();
          let json = {};
          if (request.method() !== "GET") writes.push({ path, body: request.postDataJSON() });
          if (path === "/api/finance/accounts") json = { accounts };
          else if (path === "/api/finance/balances") json = { balances: [balance] };
          else if (path === "/api/finance/accounts/1/balance") {
            const body = request.postDataJSON();
            assert.equal(body.expectedRevision, balance.revision);
            balance.amount = body.amount;
            balance.revision++;
            balance.checkpoint = { date: body.date, amount: body.amount, ledgerAmount: "0" };
            json = { checkpoint: balance.checkpoint };
          } else if (path === "/api/finance/categories") json = { categories };
          else if (path === "/api/finance/income-source-types") {
            if (request.method() === "POST") {
              const body = request.postDataJSON();
              types.push({ id: 10, ...body, active: true });
              json = { type: types.at(-1) };
            } else json = { types };
          } else if (path === "/api/finance/income-source-types/10") {
            Object.assign(types.at(-1), request.postDataJSON());
            json = { type: types.at(-1) };
          } else if (path === "/api/finance/income-sources") {
            if (request.method() === "POST") {
              const body = request.postDataJSON();
              sources.push({
                id: 10,
                name: body.name,
                kind: "OTHER",
                active: true,
                type: types.find((row) => row.id === body.typeId),
              });
              json = { source: sources.at(-1) };
            } else json = { sources, sourceTypes: types };
          } else if (path === "/api/finance/transactions/3") json = { transaction: transfer };
          else if (path === "/api/finance/transactions") {
            const activity = url.searchParams.get("activity");
            json = {
              transactions: [
                activity === "income" ? income : activity === "transfers" ? transfer : expense,
              ],
              total: 1,
              page: 1,
              pageSize: 30,
            };
          } else if (path === "/api/finance/reports") {
            const filters = modules["./reporting"].reportFilters(url.searchParams, today);
            json = {
              ...modules["./reporting"].buildReport(reportData, filters, today),
              overview: modules["./overview"].buildOverview(reportData, filters),
            };
          } else if (path === "/api/notifications/inbox/count") json = { unread: 0 };
          return route.fulfill({ json });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/finance/settings/accounts`);
        await page.getByRole("button", { name: "Set balance for Bank", exact: true }).click();
        const modal = page.getByRole("dialog", { name: "Set balance · Bank", exact: true });
        await modal.waitFor();
        await modal.getByLabel("Actual account balance").fill("1000.25");
        await modal.getByRole("button", { name: "Set balance", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await page.getByText("1,000.25 CAD", { exact: true }).waitFor();
        await page.goto(`${base}/finance/settings/income-source-types`);
        await page.getByRole("button", { name: "New income source type", exact: true }).click();
        await page.getByLabel("Type name", { exact: true }).fill("Family support");
        await page.getByRole("button", { name: "Add income source type", exact: true }).click();
        await page.getByText("Family support", { exact: true }).waitFor();
        await page
          .getByRole("button", { name: "Edit income source type Family support", exact: true })
          .click();
        await page.getByLabel("Type name", { exact: true }).fill("Family help");
        await page.getByRole("button", { name: "Save income source type", exact: true }).click();
        await page.getByRole("list").getByText("Family help", { exact: true }).waitFor();
        await page.goto(`${base}/finance/settings/income-sources`);
        await page.getByRole("button", { name: "New income source", exact: true }).click();
        await page.getByLabel("Employer / source name", { exact: true }).fill("Dad");
        await page.getByLabel("Income source type", { exact: true }).selectOption("10");
        await page.getByRole("button", { name: "Add income source", exact: true }).click();
        await page.getByText("Dad", { exact: true }).waitFor();
        await page.getByRole("list").getByText("Family help", { exact: true }).waitFor();
        await page.goto(`${base}/finance/transfers/3`);
        const sent = page.getByLabel("Amount sent", { exact: true });
        await sent.waitFor();
        assert.equal(await sent.inputValue(), "25.10");
        assert.equal(
          await page.getByLabel("Amount received (USD)", { exact: true }).inputValue(),
          "18.75",
        );
        assert.equal(await page.getByLabel("Currency", { exact: true }).count(), 0);
        await sent.fill("25.2");
        await sent.press("Tab");
        assert.equal(await sent.inputValue(), "25.20");
        await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await page.waitForURL(`${base}/finance/transfers`);
        assert.equal(
          writes.find((row) => row.path === "/api/finance/transactions/3").body.currency,
          "CAD",
        );
        for (const view of ["expenses", "income", "transfers"]) {
          await page.goto(`${base}/finance/${view}`);
          const grid = page.locator("ul.grid.w-full");
          await grid.waitFor();
          const bounds = await grid.boundingBox();
          assert.ok(
            bounds.x + bounds.width >= viewport.width - 40,
            "history uses available monitor width",
          );
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await page.goto(`${base}/finance`);
        const awaiting = page.getByRole("region", { name: "Awaiting reimbursements", exact: true });
        await awaiting.waitFor();
        assert.match(await awaiting.innerText(), /750\.00 CAD/);
        await page.getByRole("region", { name: "Account balances", exact: true }).waitFor();
        await page.screenshot({
          path: `/tmp/finance-refinements-${viewport.width}.png`,
          fullPage: true,
        });
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
