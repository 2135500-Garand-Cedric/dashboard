import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import sharp from "sharp";
import ts from "typescript";

function samplePdf() {
  const content = "BT /F1 18 Tf 30 350 Td (Pay stub preview) Tj ET\n";
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>', `<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}endstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let text = "%PDF-1.4\n"; const offsets = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  return Buffer.from(`${text}xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`);
}
test("income source/deduction settings, document-free earnings, pay stubs and deposit links work on desktop and phone", { skip: process.env.RUN_FINANCE_INCOME_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require("playwright");
  const baseUrl = process.env.FINANCE_INCOME_BROWSER_BASE_URL || "http://localhost:3000";
  require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  assert.ok(process.env.NEXTAUTH_SECRET);
  function load(file, deps = {}) {
    const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
    const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
  }
  const validation = load("../src/lib/finance/validation.ts"), transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const receiptsValidation = load("../src/lib/finance/receipts.ts", { "./validation": validation, "./transactions": transactions });
  const { incomeInput, incomeConfigInput, incomeAmounts } = load("../src/lib/finance/income.ts", { "./validation": validation, "./transactions": transactions, "./receipts": receiptsValidation });
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const image = await sharp({ create: { width: 200, height: 300, channels: 3, background: "white" } }).png().toBuffer(), pdf = samplePdf();
  const accounts = [{ id: 1, name: "Chequing", currency: "CAD", type: "CHEQUING", active: true, maskedIdentifier: null }], categories = [{ id: 1, name: "Salary", type: "INCOME", active: true }];
  const sources = [], types = [{ id: 1, name: "Income tax", active: true }, { id: 2, name: "QPP/CPP", active: true }, { id: 3, name: "EI", active: true }, { id: 4, name: "QPIP", active: true }, { id: 5, name: "Other deductions", active: true }];
  const deposits = [{ id: 10, description: "Payroll deposit", date: "2026-11-08", amount: "1500.0000", currency: "CAD", type: "INCOME", account: accounts[0], category: categories[0], source: "MANUAL", transfer: null, notes: null, counterparty: "Employer", updatedAt: new Date().toISOString() }];
  const records = [], documents = new Map(); let nextId = 1, documentId = 1, failSave = false;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: baseUrl }]);
    // Financial writes use browser fixtures, never real income records or private files.
    await context.route(`${baseUrl}/api/finance/**`, async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const respond = (json, status = 200) => route.fulfill({ json, status });
      if (url.pathname.endsWith("/accounts")) return respond({ accounts });
      if (url.pathname.endsWith("/categories")) return respond({ categories });
      if (url.pathname.endsWith("/transactions")) return respond({ transactions: deposits, total: deposits.length, page: 1, pageSize: 25 });
      const config = url.pathname.match(/\/(income-sources|deduction-types)(?:\/(\d+))?$/);
      if (config) {
        const source = config[1] === "income-sources", collection = source ? sources : types, id = Number(config[2]);
        if (method === "GET") return respond(source ? { sources } : { types });
        try {
          const data = incomeConfigInput(request.postDataJSON(), source, method === "PATCH"), current = collection.find(item => item.id === id);
          const result = { ...current, active: true, ...data, id: id || collection.length + 1 };
          if (current) collection.splice(collection.indexOf(current), 1, result); else collection.push(result);
          return respond(source ? { source: result } : { type: result }, id ? 200 : 201);
        } catch (error) { return respond({ error: error.message }, 400); }
      }
      const id = Number(url.pathname.match(/\/income\/(\d+)/)?.[1]), existing = records.find(item => item.id === id);
      if (url.pathname.endsWith("/document")) {
        if (method === "DELETE") { documents.delete(id); existing.document = null; existing.updatedAt = new Date().toISOString(); return respond({ success: true }); }
        const file = documents.get(id); return file ? route.fulfill({ body: file.buffer, contentType: file.mimeType }) : respond({ error: "Not found" }, 404);
      }
      if (method === "GET") {
        if (id) return respond({ record: existing });
        const filtered = records.filter(item => (!url.searchParams.get("search") || item.description.toLowerCase().includes(url.searchParams.get("search").toLowerCase())) && (!url.searchParams.get("status") || (url.searchParams.get("status") === "linked") === !!item.transaction));
        return respond({ records: filtered, page: 1, pageSize: 20, total: filtered.length });
      }
      if (method === "DELETE") { records.splice(records.indexOf(existing), 1); documents.delete(id); return respond({ success: true }); }
      if (failSave) return respond({ error: "Income save failed. Please retry." }, 503);
      const multipart = await new Response(request.postDataBuffer(), { headers: { "Content-Type": request.headers()["content-type"] } }).formData();
      try {
        const details = incomeInput(JSON.parse(multipart.get("details")), method === "PATCH"), file = multipart.get("file");
        let transaction = details.transactionAction === "LINK" ? deposits.find(item => item.id === details.transactionId) : null;
        if (details.transactionAction === "CREATE") {
          const duplicate = deposits.find(item => item.account.id === details.accountId && item.amount === details.netAmount);
          if (duplicate) return respond({ error: "A matching deposit already exists. Link it instead.", code: "EXISTING_DEPOSIT", existingId: duplicate.id }, 409);
          transaction = { ...deposits[0], id: 10 + deposits.length, date: details.date, amount: details.netAmount, description: details.description }; deposits.push(transaction);
        }
        const record = { ...details, id: id || nextId++, source: sources.find(item => item.id === details.sourceId), account: accounts.find(item => item.id === details.accountId) ?? null, category: categories[0], deductions: details.deductions.map(line => ({ ...line, name: types.find(type => type.id === line.typeId).name, active: true })), ...incomeAmounts(details.grossAmount, details.deductions, details.netAmount), transaction, document: existing?.document ?? null, linkWarning: null, updatedAt: new Date().toISOString() };
        if (file) { record.document = { id: documentId++, originalName: file.name, mimeType: file.type, byteSize: file.size }; documents.set(record.id, { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type }); }
        if (existing) records.splice(records.indexOf(existing), 1, record); else records.push(record);
        return respond({ record }, id ? 200 : 201);
      } catch (error) { return respond({ error: error.message }, 400); }
    });
    await context.route(`${baseUrl}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${baseUrl}/finance/income/settings`);
    await page.getByLabel("Employer / source name", { exact: true }).fill("Main employer");
    await page.getByRole("button", { name: "Add income source", exact: true }).click();
    await page.getByRole("button", { name: "Edit income source Main employer", exact: true }).waitFor();
    await page.getByLabel("Employer / source name", { exact: true }).fill("Gifts");
    await page.getByLabel("Income source type", { exact: true }).selectOption("GIFT");
    await page.getByRole("button", { name: "Add income source", exact: true }).click();
    await page.getByRole("button", { name: "Edit income source Gifts", exact: true }).waitFor();
    await page.getByLabel("Deduction name", { exact: true }).fill("Insurance");
    await page.getByRole("button", { name: "Add deduction type", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate deduction type Insurance", exact: true }).click();
    await page.getByRole("button", { name: "Reactivate deduction type Insurance", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate deduction type Insurance", exact: true }).waitFor();
    async function fill(description, net, source = "1") {
      await page.getByLabel("Employer / income source", { exact: true }).selectOption(source);
      await page.getByLabel("Income description", { exact: true }).fill(description);
      await page.getByLabel("Pay date", { exact: true }).fill("2026-11-06");
      await page.getByLabel("Net income", { exact: true }).fill(net);
      await page.getByLabel("Income category", { exact: true }).selectOption("1");
    }
    async function save(description) {
      await page.getByRole("button", { name: "Save income record", exact: true }).click();
      await page.getByRole("heading", { name: "Income details", exact: true }).waitFor();
      await page.waitForFunction(value => document.querySelector('[aria-label="Income description"]')?.value === value, description);
    }
    await page.goto(`${baseUrl}/finance/income/new`); await fill("Regular pay", "1500");
    await page.getByLabel("Gross income", { exact: true }).fill("2000");
    await page.getByLabel("Pay period start", { exact: true }).fill("2026-10-19");
    await page.getByLabel("Pay period end", { exact: true }).fill("2026-11-01");
    await page.getByRole("button", { name: "Add deduction", exact: true }).click();
    await page.getByLabel("Deduction 1 type", { exact: true }).selectOption("1");
    await page.getByLabel("Deduction 1 amount", { exact: true }).fill("500");
    failSave = true; await page.getByRole("button", { name: "Save income record", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Income save failed" }).waitFor();
    assert.equal(await page.getByLabel("Gross income", { exact: true }).inputValue(), "2000");
    failSave = false; await save("Regular pay");
    assert.equal(records[0].document, null); assert.equal(records[0].transaction, null); assert.equal(deposits.length, 1);
    await page.getByLabel("Choose pay stub file", { exact: true }).setInputFiles({ name: "pay-stub.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.getByRole("img", { name: "Pay stub PDF preview, page 1", exact: true }).waitFor();
    await page.getByRole("button", { name: "Save income record", exact: true }).click();
    await page.getByText(/pay-stub.pdf ·/).waitFor();
    await page.waitForFunction(() => { const canvas = document.querySelector('[aria-label="Pay stub PDF preview, page 1"]'); if (!canvas?.width) return false; const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data; return pixels.some((value, index) => index % 4 === 0 && value < 100 && pixels[index + 3] > 0); });
    await page.screenshot({ path: "/tmp/dashboard-income-desktop.png", fullPage: true });
    await page.getByLabel("Deposit account", { exact: true }).selectOption("1");
    await page.getByLabel("Associated deposit", { exact: true }).selectOption("CREATE");
    await page.getByRole("button", { name: "Save income record", exact: true }).click();
    await page.getByRole("button", { name: "Link this deposit instead", exact: true }).click();
    await page.getByRole("button", { name: "Save income record", exact: true }).click();
    await page.getByRole("link", { name: "View linked deposit", exact: true }).waitFor(); assert.equal(deposits.length, 1);
    await page.getByLabel("Gross income", { exact: true }).fill("2100");
    await page.getByRole("alert").filter({ hasText: "does not equal net" }).waitFor();
    await page.getByLabel("Keep these amounts despite the difference", { exact: true }).check();
    await page.getByRole("button", { name: "Save income record", exact: true }).click();
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await page.getByText("No document attached.", { exact: false }).waitFor(); assert.equal(records[0].transaction.id, 10);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/finance/income/new`); await fill("Birthday gift", "125.50", "2");
    const camera = page.getByLabel("Take pay stub photo", { exact: true }); assert.equal(await camera.getAttribute("capture"), "environment");
    await camera.setInputFiles({ name: "gift-proof.png", mimeType: "image/png", buffer: image });
    await page.getByAltText("Pay stub preview", { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: "/tmp/dashboard-income-mobile.png", fullPage: true });
    await save("Birthday gift"); assert.equal(records[1].grossAmount, null); assert.equal(records[1].deductions.length, 0);
    await page.getByLabel("Deposit account", { exact: true }).selectOption("1");
    await page.getByLabel("Associated deposit", { exact: true }).selectOption("CREATE");
    await page.getByRole("button", { name: "Save income record", exact: true }).click();
    await page.getByRole("link", { name: "View linked deposit", exact: true }).waitFor(); assert.equal(deposits.length, 2); assert.equal(deposits[1].amount, "125.5000");
    await page.getByRole("button", { name: "Delete income record", exact: true }).click();
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await page.getByRole("heading", { name: "Income history", exact: true }).waitFor(); assert.equal(deposits.length, 2);
    await page.getByLabel("Search income", { exact: true }).fill("Regular pay");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.getByText("1 income record", { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole("link", { name: "View income record", exact: true }).click();
    await page.getByRole("heading", { name: "Income details", exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
