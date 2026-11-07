import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import ts from "typescript";

test("statement upload, mapping, correction, matching, skipping, completion and history work on desktop and phone", { skip: process.env.RUN_FINANCE_STATEMENT_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require("playwright");
  const base = process.env.FINANCE_STATEMENT_BROWSER_BASE_URL || "http://localhost:3000";
  require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  function load(file, deps = {}) {
    const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
    const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
  }
  const validation = load("../src/lib/finance/validation.ts"), transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const csv = load("../src/lib/finance/statement-csv.ts", { "./validation": validation, "./transactions": transactions });
  const imports = load("../src/lib/finance/statement-imports.ts", { "./validation": validation, "./transactions": transactions, "./statement-csv": csv });
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const accounts = [{ id: 1, name: "Chequing", currency: "CAD", type: "CHEQUING", active: true, maskedIdentifier: null }, { id: 2, name: "Visa", currency: "CAD", type: "CREDIT_CARD", active: true, maskedIdentifier: "1234" }];
  const categories = [{ id: 1, name: "Everyday", type: "EXPENSE", active: true }, { id: 2, name: "Salary", type: "INCOME", active: true }];
  const text = "Date,Description,Amount,Reference\n06/11/2026,Groceries,-12.50,purchase-1\n06/11/2026,Card payment,-75,transfer-1\nBAD,Correct this row,broken,correct-1\n06/11/2026,Ignore this row,0,ignore-1\n";
  let batch = null, failSave = false, commits = 0;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    // Writes are isolated browser fixtures; actual ledger behavior is tested by the rollback-only DB test.
    await context.route(`${base}/api/finance/**`, async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method(), respond = (json, status = 200) => route.fulfill({ json, status });
      if (url.pathname.endsWith("/accounts")) return respond({ accounts });
      if (url.pathname.endsWith("/categories")) return respond({ categories });
      if (url.pathname.endsWith("/transactions/10")) return respond({ transaction: { id: 10, date: "2026-11-06", description: "Store manually recorded", amount: "-12.5000", currency: "CAD", type: "EXPENSE", source: "MANUAL", editable: false, account: accounts[0], category: categories[0], counterparty: null, notes: null, transfer: null, updatedAt: new Date().toISOString(), receipts: [{ id: 40, merchant: "Store", date: "2026-11-06" }], incomeRecords: [] } });
      if (url.pathname.endsWith("/document")) return route.fulfill({ body: text, contentType: "application/octet-stream", headers: { "Content-Disposition": "attachment; filename=statement.csv" } });
      if (method === "GET") {
        if (/\/imports\/\d+$/.test(url.pathname)) return respond({ batch });
        const counts = { CREATE: 0, MATCH: 0, SKIP: 0, REVIEW: 0 }; batch?.rows.forEach(row => counts[row.action]++);
        return respond({ batches: batch ? [{ ...batch, counts }] : [], total: batch ? 1 : 0, page: 1, pageSize: 20 });
      }
      if (method === "POST" && url.pathname.endsWith("/imports")) {
        if (batch) return respond({ batch, reused: true });
        const multipart = await new Response(request.postDataBuffer(), { headers: { "Content-Type": request.headers()["content-type"] } }).formData();
        const details = imports.importUploadInput(JSON.parse(multipart.get("details"))), file = multipart.get("file");
        const parsed = csv.parseStatement(Buffer.from(await file.arrayBuffer()), details.parsing);
        batch = { id: 1, account: accounts[0], status: "DRAFT", revision: 1, originalName: file.name, byteSize: file.size, createdAt: new Date().toISOString(), completedAt: null, headers: parsed.headers, parsing: parsed.parsing, mapping: null, documentAvailable: true, rows: parsed.rows.map((original, index) => ({ id: index + 1, rowNumber: index + 1, original, review: null, action: "REVIEW", transactionId: null, errors: [], warnings: [], candidates: [], duplicateOf: null })) };
        return respond({ batch, reused: false }, 201);
      }
      if (failSave) return respond({ error: "Import review could not be saved. Please retry." }, 503);
      const body = request.postDataJSON();
      if (url.pathname.endsWith("/commit")) {
        assert.ok(batch.rows.every(row => row.action === "SKIP" || !row.errors.length));
        commits++; batch.status = "COMPLETED"; batch.completedAt = new Date().toISOString(); batch.revision++;
        batch.rows.forEach(row => { row.errors = []; row.warnings = []; row.candidates = []; if (row.action !== "SKIP") row.transactionId = row.action === "MATCH" ? row.review.matchId : 20 + row.id; });
        return respond({ batch, replayed: false });
      }
      assert.equal(body.expectedRevision, batch.revision);
      if (body.mapping) {
        batch.mapping = imports.mappingInput(body.mapping, batch.headers.length);
        batch.rows.forEach(row => {
          row.review = imports.mappedReview(row.original.cells, batch.mapping, "CAD"); row.action = "CREATE";
          if (row.id === 1) {
            row.candidates = [{ id: 10, date: "2026-11-06", description: "Store manually recorded", amount: "-12.5000", currency: "CAD", type: "EXPENSE", source: "MANUAL", confidence: "POSSIBLE", otherAccount: null }]; row.action = "REVIEW";
          }
        });
      } else {
        body.rows.forEach(item => { const row = batch.rows.find(row => row.id === item.id); row.action = item.action; row.review = imports.reviewInput(item.review); });
      }
      batch.rows.forEach(row => {
        row.errors = [];
        if (!row.review.type) row.errors.push("Choose a transaction type.");
        try { transactions.calendarDate(row.review.date); } catch { row.errors.push("Correct the date using YYYY-MM-DD."); }
        try { transactions.decimalAmount(row.review.amount, true); } catch { row.errors.push("Correct the signed amount."); }
        if (row.action === "REVIEW") row.errors.push("Choose create, link existing, or skip.");
        if (row.action === "CREATE" && row.review.type === "TRANSFER" && !row.review.otherAccountId) row.errors.push("Choose the other account.");
      }); batch.revision++;
      return respond({ batch });
    });
    await context.route(`${base}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const visible = locator => locator.waitFor({ state: "visible", timeout: 30000 });
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Horizontal page overflow at ${(await page.viewportSize()).width}px`);
    await page.goto(`${base}/finance/imports`);
    await visible(page.getByText("No statement imports yet."));
    await page.getByRole("link", { name: "Import CSV", exact: true }).click();
    await page.getByLabel("Statement account", { exact: true }).selectOption("1");
    await page.getByLabel("Statement CSV file").setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
    await page.getByRole("button", { name: "Upload and map columns" }).click();
    await visible(page.getByRole("heading", { name: "Review statement import" }));
    await page.getByLabel("Statement date format").selectOption("DD/MM/YYYY");
    await page.getByLabel("Suggested outflow type").selectOption("EXPENSE");
    await page.getByLabel("Default expense / refund category", { exact: true }).selectOption("1");
    await page.getByLabel("Confirm statement amount convention").check();
    await page.getByRole("button", { name: "Apply mapping and preview" }).click();
    await visible(page.getByRole("article", { name: "Statement row 1", exact: true }));
    await noOverflow();
    await page.getByLabel("Row 1 action", { exact: true }).selectOption("MATCH");
    await page.getByRole("article", { name: "Statement row 2", exact: true }).getByText("Review and correct fields", { exact: true }).click();
    await page.getByLabel("Row 2 type", { exact: true }).selectOption("TRANSFER");
    await page.getByLabel("Row 2 other account", { exact: true }).selectOption("2");
    await page.getByLabel("Row 3 date", { exact: true }).fill("2026-11-06");
    await page.getByLabel("Row 3 amount", { exact: true }).fill("-3.25");
    await page.getByLabel("Row 3 description", { exact: true }).fill("Corrected snack");
    await page.getByLabel("Row 3 type", { exact: true }).selectOption("EXPENSE");
    await page.getByLabel("Row 4 action", { exact: true }).selectOption("SKIP");
    assert.ok(await page.getByRole("button", { name: "Import reviewed rows", exact: true }).isDisabled());
    failSave = true;
    await page.getByRole("button", { name: "Save review & recheck duplicates" }).click();
    await visible(page.getByText("Import review could not be saved. Please retry.", { exact: true }).first());
    failSave = false;
    await page.getByRole("button", { name: "Save review & recheck duplicates" }).click();
    await page.getByRole("button", { name: "Import reviewed rows", exact: true }).waitFor();
    assert.equal(batch.rows[0].review.matchId, 10); assert.equal(batch.rows[1].review.otherAccountId, 2); assert.equal(batch.rows[3].action, "SKIP");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await noOverflow();
      const row = page.getByRole("article", { name: "Statement row 3", exact: true });
      await row.getByText("Original CSV values", { exact: true }).click();
      await visible(row.getByText("broken", { exact: true }));
      await row.getByText("Original CSV values", { exact: true }).click();
    }
    await page.getByRole("button", { name: "Import reviewed rows", exact: true }).click();
    await page.getByRole("button", { name: "Confirm import", exact: true }).click();
    await visible(page.getByRole("heading", { name: "Import details" }));
    assert.equal(commits, 1); assert.ok(await page.getByLabel("Row 1 action", { exact: true }).isDisabled());
    await page.getByRole("article", { name: "Statement row 1", exact: true }).getByRole("link", { name: "View transaction", exact: true }).click();
    await visible(page.getByRole("heading", { name: "Transaction details", exact: true }));
    assert.ok(await page.getByLabel("Description", { exact: true }).isDisabled());
    assert.equal(await page.getByRole("link", { name: "View receipt", exact: true }).getAttribute("href"), "/finance/receipts/40");
    await page.goto(`${base}/finance/imports/1`);
    await visible(page.getByRole("heading", { name: "Import details", exact: true }));
    await page.getByRole("link", { name: "Import history", exact: false }).click();
    await visible(page.getByRole("link", { name: "View import", exact: true }));
    await page.getByLabel("Import status filter").selectOption("COMPLETED");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await noOverflow();
    await page.getByRole("link", { name: "Import CSV", exact: true }).click();
    await page.getByLabel("Statement account", { exact: true }).selectOption("1");
    await page.getByLabel("Statement CSV file").setInputFiles({ name: "renamed.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
    await page.getByRole("button", { name: "Upload and map columns" }).click();
    await visible(page.getByRole("heading", { name: "Import details" })); assert.equal(commits, 1);
    await noOverflow();
    if (process.env.FINANCE_STATEMENT_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.FINANCE_STATEMENT_BROWSER_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});
