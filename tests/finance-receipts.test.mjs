import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createRequire } from "node:module";
import ts from "typescript";
import sharp from "sharp";

const require = createRequire(import.meta.url);
export function load(file, deps = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name));
  return exports;
}
const validation = load("../src/lib/finance/validation.ts");
const transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
const receipts = load("../src/lib/finance/receipts.ts", { "./validation": validation, "./transactions": transactions });
const files = load("../src/lib/finance/receipt-files.ts", { "./validation": validation, "./receipts": receipts });
const base = { merchant: "Food store", date: "2026-11-06", accountId: 1, categoryId: 2, currency: "CAD", subtotal: "10", tax: "0", tip: "0", total: "10", transactionAction: "UNMATCHED", requestKey: "ad777fad-4114-46dd-8479-57bedade3883" };
test("receipt validation supports zero tax, optional tips and exact monetary reconciliation", () => {
  assert.equal(receipts.receiptInput(base).tax, "0.0000");
  assert.equal(receipts.receiptInput({ ...base, tip: undefined }).tip, "0.0000");
  assert.equal(receipts.receiptDifference("0.1", "0.2", "0", "0.3"), "0.0000");
  assert.equal(receipts.receiptDifference("900719925474099.1234", "0.0001", "0", "900719925474099.1235"), "0.0000");
  assert.equal(receipts.receiptDifference("10", "1.5", "2", "12"), "-1.5000");
  assert.equal(receipts.receiptInput({ ...base, total: "0", subtotal: "0" }).total, "0.0000");
  for (const patch of [{ subtotal: "-1" }, { total: 10 }, { tax: "1.00001" }, { userId: 2 }, { merchant: " " }, { date: "2026-02-30" }, { accountId: 2147483648 }, { transactionAction: "TRANSFER" }, { transactionAction: "LINK", transactionId: null }, { transactionId: 1 }, { acknowledgeMismatch: "true" }, { notes: "\0" }]) assert.throws(() => receipts.receiptInput({ ...base, ...patch }));
});
test("receipt uploads verify actual file bytes, reject active or corrupt content, bound multipart reads, and store files privately", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "finance-file-unit-"));
  const previous = process.env.FINANCE_UPLOAD_DIR; process.env.FINANCE_UPLOAD_DIR = root;
  try {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    const prepared = await files.prepareReceiptFile(new File([png], "../../camera.png", { type: "image/png" }));
    assert.equal(prepared.originalName, "camera.png"); assert.equal(prepared.mimeType, "image/png");
    const key = await files.storeReceiptFile(prepared);
    assert.deepEqual(await files.readReceiptFile(key), png);
    assert.equal((await stat(files.receiptStoragePath(key))).mode & 0o777, 0o600);
    assert.throws(() => files.receiptStoragePath("../../public/x.svg"));
    for (const [bytes, type] of [[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml"], [png, "application/pdf"], [Buffer.from("<html>fake PDF</html>"), "application/pdf"], [png.subarray(0, 20), "image/png"]]) await assert.rejects(files.prepareReceiptFile(new File([bytes], "receipt.pdf", { type })), validation.FinanceValidationError);
    await assert.rejects(files.prepareReceiptFile(new File([new Uint8Array(receipts.MAX_RECEIPT_BYTES + 1)], "large.jpg")), /15 MB/);
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
    assert.equal((await files.prepareReceiptFile(new File([pdf], "scan.pdf", { type: "application/pdf" }))).mimeType, "application/pdf");
    const form = new FormData(); form.append("details", JSON.stringify(base)); form.append("file", new File([png], "photo.png", { type: "image/png" }));
    const parsed = await files.receiptFormData(new Request("http://localhost", { method: "POST", body: form }));
    assert.equal(parsed.details.merchant, base.merchant); assert.equal(parsed.file.contentHash, prepared.contentHash);
    const extra = new FormData(); extra.append("details", "{}"); extra.append("userId", "2");
    await assert.rejects(files.receiptFormData(new Request("http://localhost", { method: "POST", body: extra })), /Unexpected/);
    await assert.rejects(files.receiptFormData(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x" }, duplex: "half", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(receipts.MAX_RECEIPT_BYTES + 65537)); controller.close(); } }) })), /too large/);
    await files.removeReceiptFile(key); assert.deepEqual(await readdir(root), []);
    await assert.rejects(files.readReceiptFile(key), /unavailable/);
  } finally { if (previous === undefined) delete process.env.FINANCE_UPLOAD_DIR; else process.env.FINANCE_UPLOAD_DIR = previous; await rm(root, { recursive: true, force: true }); }
});
