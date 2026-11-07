import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import sharp from "sharp";

function samplePdf() {
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R 6 0 R]/Count 2>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>', '<</Length 47>>\nstream\nBT /F1 18 Tf 30 350 Td (Receipt preview) Tj ET\nendstream', '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>'];
  let text = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
test("receipt forms, image/PDF preview, independent/link/create flows and document management work on phone and desktop", { skip: process.env.RUN_FINANCE_RECEIPT_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require("playwright");
  const baseUrl = process.env.FINANCE_RECEIPT_BROWSER_BASE_URL || "http://localhost:3000";
  require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  assert.ok(process.env.NEXTAUTH_SECRET);
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const image = await sharp({ create: { width: 240, height: 360, channels: 3, background: "white" } }).png().toBuffer();
  const pdf = samplePdf();
  const accounts = [{ id: 1, name: "Cash", currency: "CAD", type: "CASH", active: true, maskedIdentifier: null }];
  const categories = [{ id: 1, name: "Food", type: "EXPENSE", active: true }];
  const expenses = [{ id: 10, description: "Already recorded", date: "2026-11-06", amount: "-10.0000", currency: "CAD", type: "EXPENSE", account: accounts[0], category: categories[0], source: "MANUAL", transfer: null, notes: null, counterparty: "Store", updatedAt: new Date().toISOString() }];
  const receipts = [], documents = new Map(); let nextId = 1, documentId = 1, failSave = false;
  const dto = record => ({ ...record });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: baseUrl }]);
    await context.route(`${baseUrl}/api/finance/**`, async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const respond = (json, status = 200) => route.fulfill({ json, status });
      if (url.pathname.endsWith("/accounts")) return respond({ accounts });
      if (url.pathname.endsWith("/categories")) return respond({ categories });
      if (url.pathname.endsWith("/transactions")) return respond({ transactions: expenses, total: expenses.length, page: 1, pageSize: 25 });
      const id = Number(url.pathname.match(/\/receipts\/(\d+)/)?.[1]);
      const existing = receipts.find(item => item.id === id);
      if (url.pathname.endsWith("/document")) {
        if (method === "DELETE") { documents.delete(id); existing.document = null; existing.updatedAt = new Date().toISOString(); return respond({ success: true }); }
        const file = documents.get(id); return file ? route.fulfill({ body: file.buffer, contentType: file.mimeType }) : respond({ error: "Not found" }, 404);
      }
      if (method === "GET") {
        if (id) return respond({ receipt: dto(existing) });
        const filtered = receipts.filter(item => (!url.searchParams.get("search") || item.merchant.toLowerCase().includes(url.searchParams.get("search").toLowerCase())) && (!url.searchParams.get("status") || (url.searchParams.get("status") === "linked") === !!item.transaction));
        return respond({ receipts: filtered.map(dto), page: 1, pageSize: 20, total: filtered.length });
      }
      if (method === "DELETE") { receipts.splice(receipts.indexOf(existing), 1); documents.delete(id); return respond({ success: true }); }
      if (failSave) return respond({ error: "Receipt save failed. Please retry." }, 503);
      const multipart = await new Response(request.postDataBuffer(), { headers: { "Content-Type": request.headers()["content-type"] } }).formData();
      const details = JSON.parse(multipart.get("details")), file = multipart.get("file");
      let transaction = details.transactionAction === "LINK" ? expenses.find(item => item.id === details.transactionId) : null;
      if (details.transactionAction === "CREATE") {
        const duplicate = expenses.find(item => item.date === details.date && item.amount === `-${Number(details.total).toFixed(4)}`);
        if (duplicate) return respond({ error: "An expense already exists. Link it instead.", code: "EXISTING_EXPENSE", existingId: duplicate.id }, 409);
        transaction = { ...expenses[0], id: 10 + expenses.length, amount: `-${Number(details.total).toFixed(4)}`, description: details.merchant }; expenses.push(transaction);
      }
      const record = { id: id || nextId++, merchant: details.merchant, date: details.date, account: accounts[0], category: categories[0], currency: details.currency, subtotal: Number(details.subtotal).toFixed(4), tax: Number(details.tax).toFixed(4), tip: Number(details.tip).toFixed(4), total: Number(details.total).toFixed(4), notes: details.notes, transaction, document: existing?.document ?? null, difference: (Number(details.total) - Number(details.subtotal) - Number(details.tax) - Number(details.tip)).toFixed(4), linkWarning: null, updatedAt: new Date().toISOString() };
      if (file) { record.document = { id: documentId++, originalName: file.name, mimeType: file.type, byteSize: file.size }; documents.set(record.id, { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type }); }
      if (existing) receipts.splice(receipts.indexOf(existing), 1, record); else receipts.push(record);
      return respond({ receipt: dto(record) }, id ? 200 : 201);
    });
    await context.route(`${baseUrl}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    async function fill(merchant, amount = "10") {
      await page.getByLabel("Merchant / store", { exact: true }).fill(merchant);
      await page.getByLabel("Purchase date", { exact: true }).fill("2026-11-06");
      await page.getByLabel("Payment account", { exact: true }).selectOption("1");
      await page.getByLabel("Expense category", { exact: true }).selectOption("1");
      await page.getByLabel("Subtotal", { exact: true }).fill(amount);
      await page.getByLabel("Tax", { exact: true }).fill("0");
      await page.getByLabel("Total", { exact: true }).fill(amount);
    }
    async function saveAndWait(merchant) {
      await page.getByRole("button", { name: "Save receipt", exact: true }).click();
      await page.getByRole("heading", { name: "Receipt details", exact: true }).waitFor();
      await page.getByLabel("Merchant / store", { exact: true }).filter({ visible: true }).waitFor();
      await page.waitForFunction(value => document.querySelector('[aria-label="Merchant / store"]')?.value === value, merchant);
    }
    await page.goto(`${baseUrl}/finance/receipts/new`);
    const camera = page.getByLabel("Take receipt photo", { exact: true });
    assert.equal(await camera.getAttribute("capture"), "environment");
    await camera.setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: image });
    await page.getByAltText("Receipt preview").waitFor();
    await fill("Independent phone receipt");
    await page.screenshot({ path: "/tmp/dashboard-receipt-mobile.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    failSave = true;
    await page.getByRole("button", { name: "Save receipt", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Receipt save failed" }).waitFor();
    assert.equal(await page.getByLabel("Merchant / store", { exact: true }).inputValue(), "Independent phone receipt");
    failSave = false; await saveAndWait("Independent phone receipt");
    assert.equal(receipts[0].transaction, null); assert.equal(expenses.length, 1);
    await page.getByLabel("Associated transaction", { exact: true }).selectOption("LINK");
    await page.getByLabel("Existing expense", { exact: true }).selectOption("10");
    await page.getByRole("button", { name: "Save receipt", exact: true }).click();
    await page.getByRole("link", { name: "View linked transaction", exact: true }).waitFor();
    assert.equal(expenses.length, 1); assert.equal(receipts[0].transaction.id, 10);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("Choose receipt file", { exact: true }).setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.getByRole("img", { name: "Receipt PDF preview, page 1", exact: true }).waitFor();
    await page.getByRole("button", { name: "Save receipt", exact: true }).click();
    await page.getByText(/scan.pdf ·/).waitFor();
    assert.equal(receipts[0].document.mimeType, "application/pdf");
    await page.getByText("Loading PDF preview…", { exact: true }).waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("alert").filter({ hasText: /Could not preview|Could not render/ }).count(), 0);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByRole("img", { name: "Receipt PDF preview, page 2", exact: true }).waitFor();
    await page.getByText("Loading PDF preview…", { exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await page.getByText("Loading PDF preview…", { exact: true }).waitFor({ state: "hidden" });
    await page.waitForFunction(() => { const canvas = document.querySelector('[aria-label="Receipt PDF preview, page 1"]'); if (!canvas || !canvas.width || !canvas.height) return false; const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data; return pixels.some((value, index) => index % 4 === 0 && value < 100 && pixels[index + 3] > 0); });
    await page.screenshot({ path: "/tmp/dashboard-receipt-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "Delete document", exact: true }).click();
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await page.getByText("No document attached.", { exact: false }).waitFor();
    assert.equal(receipts[0].document, null); assert.equal(receipts[0].transaction.id, 10);
    await page.goto(`${baseUrl}/finance/receipts/new`); await fill("Duplicate prevention receipt");
    await page.getByLabel("Associated transaction", { exact: true }).selectOption("CREATE");
    await page.getByRole("button", { name: "Save receipt", exact: true }).click();
    await page.getByRole("button", { name: "Link this expense instead", exact: true }).click();
    await saveAndWait("Duplicate prevention receipt"); assert.equal(expenses.length, 1);
    await page.goto(`${baseUrl}/finance/receipts/new`); await fill("New expense receipt", "25");
    await page.getByLabel("Associated transaction", { exact: true }).selectOption("CREATE");
    await saveAndWait("New expense receipt"); assert.equal(expenses.length, 2);
    await page.getByLabel("Subtotal", { exact: true }).fill("24");
    await page.getByRole("alert").filter({ hasText: "does not equal total" }).waitFor();
    await page.getByLabel("Keep these amounts despite the difference", { exact: true }).check();
    await page.getByRole("button", { name: "Save receipt", exact: true }).click();
    await page.getByRole("button", { name: "Delete receipt", exact: true }).click();
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await page.getByRole("heading", { name: "Receipt history", exact: true }).waitFor(); assert.equal(expenses.length, 2);
    await page.getByLabel("Search receipts", { exact: true }).fill("Independent");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.getByText("1 receipt", { exact: true }).waitFor();
    await page.getByRole("link", { name: "View receipt", exact: true }).click();
    await page.getByRole("heading", { name: "Receipt details", exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
