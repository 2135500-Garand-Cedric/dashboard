import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import ts from "typescript";

test("manual transaction entry, history, duplicate recovery and mobile layout", { skip: process.env.RUN_FINANCE_TRANSACTION_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  assert.ok(process.env.NEXTAUTH_SECRET);
  function load(file, deps = {}) {
    const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
    const exports = {};
    new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name));
    return exports;
  }
  const validation = load("../src/lib/finance/validation.ts");
  const { transactionInput, decimalAmount } = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const accounts = ["Cash", "Chequing", "Credit card", "USD savings"].map((name, index) => ({ id: index + 1, name, type: ["CASH", "CHEQUING", "CREDIT_CARD", "SAVINGS"][index], currency: index === 3 ? "USD" : "CAD", active: true, maskedIdentifier: null }));
  const categories = [{ id: 1, name: "Food", type: "EXPENSE", active: true }, { id: 2, name: "Salary", type: "INCOME", active: true }];
  const records = []; let nextId = 1, failure = false, duplicate = false;
  const queries = [];
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: "http://localhost:3000" }]);
    await context.route("http://localhost:3000/api/finance/**", async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const respond = (json, status = 200) => route.fulfill({ json, status });
      if (url.pathname.endsWith("/accounts")) return respond({ accounts });
      if (url.pathname.endsWith("/categories")) return respond({ categories });
      const id = Number(url.pathname.match(/\/(\d+)$/)?.[1]);
      if (method === "GET") {
        if (id) return respond({ transaction: records.find(item => item.id === id) });
        queries.push(url.searchParams.toString());
        const filtered = records.filter(item => (!url.searchParams.get("search") || item.description.toLowerCase().includes(url.searchParams.get("search").toLowerCase())) && (!url.searchParams.get("type") || item.type === url.searchParams.get("type")));
        return respond({ transactions: filtered, page: 1, pageSize: 25, total: filtered.length });
      }
      if (method === "DELETE") { records.splice(records.findIndex(item => item.id === id), 1); return respond({ success: true }); }
      if (failure) return respond({ error: "Could not save this transaction. Please retry." }, 503);
      if (duplicate && !request.postDataJSON().allowDuplicate) return respond({ error: "Matching manual entry already exists.", code: "DUPLICATE_TRANSACTION", existingId: records[0].id }, 409);
      try {
        const data = transactionInput(request.postDataJSON(), method === "PATCH");
        const record = { ...data, id: id || nextId++, amount: ["EXPENSE", "TRANSFER"].includes(data.type) ? `-${data.amount}` : data.amount, account: accounts.find(item => item.id === data.accountId), category: categories.find(item => item.id === data.categoryId) ?? null, transfer: data.type === "TRANSFER" ? { id: "fixture-transfer", transactionId: 1000, account: accounts.find(item => item.id === data.destinationAccountId), amount: decimalAmount(data.destinationAmount ?? data.amount), currency: accounts.find(item => item.id === data.destinationAccountId).currency } : null, source: "MANUAL", updatedAt: new Date().toISOString() };
        if (id) records.splice(records.findIndex(item => item.id === id), 1, record); else records.push(record);
        return respond({ transaction: record }, id ? 200 : 201);
      } catch (error) { return respond({ error: error.message }, 400); }
    });
    await context.route("http://localhost:3000/api/youtube**", route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage(), pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    async function form(type, description, account, amount = "50") {
      await page.goto("http://localhost:3000/finance/transactions/new");
      await page.getByLabel("Transaction type", { exact: true }).selectOption(type);
      await page.getByLabel("Date", { exact: true }).fill("2026-11-05");
      await page.getByLabel("Description", { exact: true }).fill(description);
      await page.getByLabel(type === "TRANSFER" ? "From account" : "Account", { exact: true }).selectOption(String(account));
      await page.getByLabel(type === "TRANSFER" ? "Amount sent" : "Amount", { exact: true }).fill(amount);
      if (["EXPENSE", "REFUND", "INCOME"].includes(type)) await page.getByLabel("Category", { exact: true }).selectOption(type === "INCOME" ? "2" : "1");
    }
    async function submit() {
      await page.getByRole("button", { name: "Save transaction", exact: true }).click();
      await page.getByRole("heading", { name: "Transaction history", exact: true }).waitFor();
    }
    await form("EXPENSE", "Cash lunch", 1);
    failure = true;
    await page.getByRole("button", { name: "Save transaction", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Could not save" }).waitFor();
    assert.equal(await page.getByLabel("Description", { exact: true }).inputValue(), "Cash lunch");
    failure = false; await submit();
    assert.equal(records[0].amount, "-50.0000"); assert.equal(records[0].counterparty, null);
    await form("INCOME", "Payroll", 2, "1500.25"); await submit();
    assert.equal(records[1].amount, "1500.2500");
    await form("TRANSFER", "Credit card payment", 2, "60");
    await page.getByLabel("To account", { exact: true }).selectOption("3"); await submit();
    assert.equal(records[2].category, null); assert.equal(records[2].transfer.account.id, 3);
    await form("TRANSFER", "Exchange", 2, "100");
    await page.getByLabel("To account", { exact: true }).selectOption("4");
    await page.getByLabel("Amount received (USD)", { exact: true }).fill("70.1234"); await submit();
    assert.equal(records[3].transfer.amount, "70.1234");
    await form("REFUND", "Lunch refund", 1, "20"); await submit();
    assert.equal(records[4].amount, "20.0000");
    await form("ADJUSTMENT", "Cash correction", 1, "0.1234");
    await page.getByLabel("Adjustment direction", { exact: true }).selectOption("OUT"); await submit();
    assert.equal(records[5].amount, "-0.1234");
    await page.getByLabel("Search transactions", { exact: true }).fill("payroll");
    await page.getByLabel("Filter type", { exact: true }).selectOption("INCOME");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.getByText("1 transaction", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Payroll", exact: true }).waitFor();
    assert.ok(queries.some(query => query.includes("search=payroll") && query.includes("type=INCOME")));
    await page.getByRole("link", { name: "View / edit", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Updated payroll");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("heading", { name: "Transaction history", exact: true }).waitFor();
    assert.equal(records[1].description, "Updated payroll");
    await form("EXPENSE", "Another lunch", 1); duplicate = true;
    await page.getByRole("button", { name: "Save transaction", exact: true }).click();
    await page.getByRole("link", { name: "Review existing transaction", exact: true }).waitFor();
    await page.getByRole("button", { name: "Save as a separate transaction", exact: true }).click();
    await page.getByRole("heading", { name: "Transaction history", exact: true }).waitFor(); duplicate = false;
    await page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Credit card payment", exact: true }) }).getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText("Both sides of this transfer will be deleted.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).waitFor({ state: "hidden" });
    assert.ok(!records.some(item => item.description === "Credit card payment"));
    await page.setViewportSize({ width: 390, height: 844 });
    await form("EXPENSE", "Phone purchase", 1, "12.50");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: "/tmp/dashboard-finance-transaction-mobile.png", fullPage: true });
    await submit();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: "/tmp/dashboard-finance-history-mobile.png", fullPage: true });
    assert.deepEqual(pageErrors, []);
  } finally { await browser.close(); }
});
