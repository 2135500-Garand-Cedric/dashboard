import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import ts from "typescript";

test("finance account and category management works on desktop and phone", { skip: process.env.RUN_FINANCE_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  assert.ok(process.env.NEXTAUTH_SECRET, "Local auth secret required; never print it.");
  const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/finance/validation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const validation = {};
  new Function("exports", compiled)(validation);
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 300, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: "http://localhost:3000" }]);
    const accounts = [], categories = [];
    let nextId = 1, failLoad = false;
    // All mutations use browser-only fixtures; database finance data is untouched.
    await context.route("http://localhost:3000/api/finance/**", async route => {
      const request = route.request();
      const match = new URL(request.url()).pathname.match(/\/api\/finance\/(accounts|categories)(?:\/(\d+))?$/);
      if (!match) return route.fulfill({ status: 404, json: { error: "Not found" } });
      const [, entity, id] = match;
      const records = entity === "accounts" ? accounts : categories;
      if (request.method() === "GET") {
        if (failLoad && entity === "accounts") return route.fulfill({ status: 503, json: { error: "Fixture load failure" } });
        return route.fulfill({ json: { [entity]: records } });
      }
      if (request.method() === "DELETE") {
        records.splice(records.findIndex(item => item.id === Number(id)), 1);
        return route.fulfill({ json: { success: true } });
      }
      try {
        const data = (entity === "accounts" ? validation.accountInput : validation.categoryInput)(request.postDataJSON(), request.method() === "PATCH");
        const record = records.find(item => item.id === Number(id));
        if (data.normalizedName && records.some(item => item.id !== Number(id) && item.normalizedName === data.normalizedName && (entity === "accounts" || item.type === (data.type ?? record?.type)))) return route.fulfill({ status: 409, json: { error: "An entry with this name already exists." } });
        const result = { ...record, ...data, id: record?.id ?? nextId++ };
        if (record) records.splice(records.indexOf(record), 1, result); else records.push(result);
        const dto = Object.fromEntries(Object.entries(result).filter(([key]) => key !== "normalizedName"));
        return route.fulfill({ status: request.method() === "POST" ? 201 : 200, json: { [entity === "accounts" ? "account" : "category"]: dto } });
      } catch (error) { return route.fulfill({ status: 400, json: { error: error.message } }); }
    });
    await context.route("http://localhost:3000/api/youtube**", route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.goto("http://localhost:3000/finance");
    await page.getByRole("link", { name: "Manage accounts" }).click();
    await page.getByLabel("Account name", { exact: true }).fill("Browser account");
    await page.getByLabel("Masked identifier", { exact: false }).fill("**** 1234");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByRole("heading", { name: "Browser account", exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit Browser account", exact: true }).click();
    await page.getByLabel("Account name", { exact: true }).fill("Browser savings");
    await page.getByLabel("Account type", { exact: false }).selectOption("SAVINGS");
    await page.getByLabel("Currency", { exact: false }).selectOption("USD");
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    await page.getByRole("heading", { name: "Browser savings", exact: true }).waitFor();
    assert.equal(accounts[0].type, "SAVINGS");
    assert.equal(accounts[0].currency, "USD");
    await page.getByRole("button", { name: "Deactivate Browser savings", exact: true }).click();
    await page.getByRole("button", { name: "Reactivate Browser savings", exact: true }).waitFor();
    assert.equal(accounts[0].active, false);
    await page.getByRole("button", { name: "Reactivate Browser savings", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate Browser savings", exact: true }).waitFor();
    await page.getByLabel("Account name", { exact: true }).fill("Invalid card");
    await page.getByLabel("Masked identifier", { exact: false }).fill("1234567890123456");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Full account or card numbers" }).waitFor();
    assert.equal(await page.getByLabel("Account name", { exact: true }).inputValue(), "Invalid card");
    await page.getByRole("navigation", { name: "Finance navigation" }).getByRole("link", { name: "Categories", exact: true }).click();
    await page.getByLabel("Category name", { exact: true }).fill("Food");
    await page.getByRole("button", { name: "Create category", exact: true }).click();
    await page.getByRole("button", { name: "Edit expense category Food", exact: true }).click();
    await page.getByLabel("Category name", { exact: true }).fill("Meals");
    await page.getByRole("button", { name: "Save category", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate expense category Meals", exact: true }).click();
    await page.getByRole("button", { name: "Reactivate expense category Meals", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate expense category Meals", exact: true }).waitFor();
    await page.getByLabel("Category name", { exact: true }).fill("Salary");
    await page.getByLabel("Category type", { exact: false }).selectOption("INCOME");
    await page.getByRole("button", { name: "Create category", exact: true }).click();
    await page.getByRole("button", { name: "Delete income category Salary", exact: true }).click();
    await page.getByRole("button", { name: "Create category", exact: true }).waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('[aria-label="Delete income category Salary"]'));
    assert.equal(categories.length, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://localhost:3000/finance/accounts");
    await page.getByLabel("Account name", { exact: true }).fill("Phone cash");
    await page.getByLabel("Account type", { exact: false }).selectOption("CASH");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByRole("heading", { name: "Phone cash", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "phone layout must not overflow horizontally");
    failLoad = true;
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "Fixture load failure" }).waitFor();
    failLoad = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "Phone cash", exact: true }).waitFor();
    if (process.env.FINANCE_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.FINANCE_BROWSER_SCREENSHOT, fullPage: true });
    assert.deepEqual(pageErrors, [], "Finance pages must render without browser or hydration errors");
    console.log("Verified account/category CRUD, activation, masked-identifier errors, retained drafts, phone layout, and load retry without database mutations.");
  } finally { await browser.close(); }
});
