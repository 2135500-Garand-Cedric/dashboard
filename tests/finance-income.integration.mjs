import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";

const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
}
test("income and pay stubs preserve gross/net/deposit separation, owner access, configurable deductions and future import links", { skip: process.env.RUN_FINANCE_INCOME_DB_TEST !== "1" }, async () => {
  const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient(), root = await mkdtemp(path.join(os.tmpdir(), "finance-income-db-")), previous = process.env.FINANCE_UPLOAD_DIR;
  process.env.FINANCE_UPLOAD_DIR = root;
  const validation = load("../src/lib/finance/validation.ts");
  const transactionValidation = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const receiptValidation = load("../src/lib/finance/receipts.ts", { "./validation": validation, "./transactions": transactionValidation });
  const incomeValidation = load("../src/lib/finance/income.ts", { "./validation": validation, "./transactions": transactionValidation, "./receipts": receiptValidation });
  const files = load("../src/lib/finance/receipt-files.ts", { "./validation": validation, "./receipts": receiptValidation });
  const nextServer = require("next/server"), server = load("../src/lib/finance/server.ts", { "next/server": nextServer, "./validation": validation });
  const rollback = new Error("ROLLBACK_INCOME_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const db = { prisma: { ...tx, $transaction: callback => callback(tx) } };
      const ledger = load("../src/lib/finance/reconciliation-ledger.ts", { "@/generated/prisma": { Prisma }, "./validation": validation, "./server": server });
      const transactions = load("../src/lib/finance/transaction-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "next/server": nextServer, "./validation": validation, "./server": server, "./transactions": transactionValidation });
      const income = load("../src/lib/finance/income-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "next/server": nextServer, "./validation": validation, "./server": server, "./transactions": transactionValidation, "./transaction-server": transactions, "./reconciliation-ledger": ledger, "./receipt-files": files, "./income": incomeValidation });
      const receiptServer = load("../src/lib/finance/receipt-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "next/server": nextServer, "./validation": validation, "./server": server, "./transactions": transactionValidation, "./transaction-server": transactions, "./reconciliation-ledger": ledger, "./receipt-files": files, "./receipts": receiptValidation });
      const settings = load("../src/lib/finance/income-settings-server.ts", { "@/lib/prisma": db, "./server": server, "./validation": validation, "./income-server": income });
      const deps = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": nextServer, "@/lib/finance/server": server, "@/lib/finance/validation": validation, "@/lib/finance/income": incomeValidation, "@/lib/finance/receipt-files": files, "@/lib/finance/income-server": income, "@/lib/finance/income-settings-server": settings };
      const route = load("../src/app/api/finance/income/route.ts", deps), detail = load("../src/app/api/finance/income/[id]/route.ts", deps), documentRoute = load("../src/app/api/finance/income/[id]/document/route.ts", deps);
      const sourceRoute = load("../src/app/api/finance/income-sources/route.ts", deps), sourceDetail = load("../src/app/api/finance/income-sources/[id]/route.ts", deps), typeRoute = load("../src/app/api/finance/deduction-types/route.ts", deps), typeDetail = load("../src/app/api/finance/deduction-types/[id]/route.ts", deps);
      const context = id => ({ params: Promise.resolve({ id: String(id) }) });
      const jsonRequest = (method, body) => new Request("http://localhost/api/finance", { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const source = (await (await sourceRoute.POST(jsonRequest("POST", { name: `Employer ${randomUUID()}`, kind: "EMPLOYMENT" }))).json()).source;
      const tax = (await (await typeRoute.POST(jsonRequest("POST", { name: `Federal tax ${randomUUID()}` }))).json()).type;
      const other = (await (await typeRoute.POST(jsonRequest("POST", { name: `Other ${randomUUID()}` }))).json()).type;
      assert.ok((await (await sourceRoute.GET(jsonRequest("GET"))).json()).sources.some(item => item.id === source.id));
      assert.ok((await (await typeRoute.GET(jsonRequest("GET"))).json()).types.some(item => item.name === "QPIP"));
      const account = await tx.financialAccount.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "CHEQUING", currency: "CAD" } });
      const category = await tx.financeCategory.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "INCOME" } });
      const expenseCategory = await tx.financeCategory.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "EXPENSE" } });
      const base = { sourceId: source.id, description: "Regular payroll", date: "2026-11-06", periodStart: "2026-10-19", periodEnd: "2026-11-01", accountId: account.id, categoryId: category.id, currency: "CAD", grossAmount: "2000", netAmount: "1500", deductions: [{ typeId: tax.id, amount: "400" }, { typeId: other.id, amount: "100" }], transactionAction: "UNMATCHED" };
      const png = await sharp({ create: { width: 3, height: 4, channels: 3, background: "white" } }).png().toBuffer();
      const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
      function request(method, body, buffer, version) {
        const headers = version ? { "If-Match": version } : {};
        if (!body) return new Request("http://localhost/api/finance/income", { method, headers });
        const form = new FormData(); form.append("details", JSON.stringify(body)); if (buffer) form.append("file", new File([buffer], buffer.equals(png) ? "pay.png" : "pay.pdf", { type: buffer.equals(png) ? "image/png" : "application/pdf" }));
        return new Request("http://localhost/api/finance/income", { method, headers, body: form });
      }
      async function create(patch = {}, buffer = null, status = 201) {
        const body = { ...base, requestKey: randomUUID(), ...patch };
        const response = await route.POST(request("POST", body, buffer));
        const result = await response.json(); assert.equal(response.status, status, result.error);
        return { body, ...result };
      }
      async function edit(original, patch = {}, buffer = null, status = 200) {
        const { requestKey, ...body } = original.body;
        const requestBody = { ...body, expectedUpdatedAt: original.record.updatedAt, ...patch };
        const response = await detail.PATCH(request("PATCH", requestBody, buffer), context(original.record.id));
        const result = await response.json(); assert.equal(response.status, status, result.error);
        return { body: { ...original.body, ...patch }, ...result };
      }
      const before = await tx.financialTransaction.count({ where: { userId: 1 } });
      const independent = await create({ accountId: null }, png);
      assert.equal(independent.record.transaction, null); assert.ok(independent.record.document); assert.equal(independent.record.account, null);
      assert.equal(independent.record.grossAmount, "2000.0000"); assert.equal(independent.record.netAmount, "1500.0000"); assert.equal(independent.record.deductionsTotal, "500.0000"); assert.equal(independent.record.difference, "0.0000");
      assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before);
      assert.equal((await create(independent.body, png, 200)).record.id, independent.record.id);
      assert.equal((await create({ ...independent.body, description: "Changed form" }, png, 409)).code, "INCOME_REQUEST_USED");
      assert.equal((await create({}, png, 409)).code, "DUPLICATE_INCOME");
      const original = await documentRoute.GET(request("GET"), context(independent.record.id));
      assert.equal(original.status, 200); assert.equal(original.headers.get("content-type"), "image/png"); assert.match(original.headers.get("cache-control"), /no-store/); assert.match(original.headers.get("content-security-policy"), /sandbox/); assert.deepEqual(Buffer.from(await original.arrayBuffer()), png);
      const receiptDetails = receiptValidation.receiptInput({ merchant: "Cross-document fixture", date: base.date, accountId: account.id, categoryId: expenseCategory.id, currency: "CAD", subtotal: "10", tax: "0", tip: "0", total: "10", transactionAction: "UNMATCHED", requestKey: randomUUID() });
      await assert.rejects(receiptServer.saveReceipt(receiptDetails, await files.prepareReceiptFile(new File([png], "same-pay-stub.png", { type: "image/png" }))), error => error.code === "DUPLICATE_DOCUMENT");
      const receiptWithPdf = await receiptServer.saveReceipt(receiptDetails, await files.prepareReceiptFile(new File([pdf], "receipt.pdf", { type: "application/pdf" })));
      const crossDocument = await create({}, pdf, 409);
      assert.equal(crossDocument.code, "DUPLICATE_RECEIPT"); assert.equal(crossDocument.existingId, receiptWithPdf.receipt.id);
      await receiptServer.deleteReceipt(receiptWithPdf.receipt.id, false, receiptWithPdf.receipt.updatedAt);
      const created = await create({ transactionAction: "CREATE" });
      const depositId = created.record.transaction.id;
      assert.equal(created.record.transaction.amount, "1500.0000"); assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before + 1);
      assert.equal((await create(created.body, null, 200)).record.transaction.id, depositId);
      assert.equal((await create({ description: "Different bank wording", transactionAction: "CREATE" }, null, 409)).existingId, depositId);
      const linked = await edit(independent, { accountId: account.id, transactionAction: "LINK", transactionId: depositId });
      assert.equal(linked.record.transaction.id, depositId); assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before + 1);
      assert.deepEqual((await transactions.getTransaction(depositId)).incomeRecords.map(record => record.id).sort((a, b) => a - b), [independent.record.id, created.record.id].sort((a, b) => a - b));
      // Future import rows must reference the same canonical deposit, never insert a second ledger movement.
      for (const index of [1, 2]) {
        const batch = await tx.financialImport.create({ data: { userId: 1, accountId: account.id, fingerprint: randomUUID() } });
        await tx.financialImportEntry.create({ data: { importId: batch.id, rowKey: `bank-row-${index}`, originalData: { amount: "1500.00", description: "Original payroll bank text" }, transactionId: depositId } });
      }
      assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before + 1);
      assert.equal((await income.getIncome(created.record.id)).transaction.id, depositId);
      assert.equal(await tx.financialImportEntry.count({ where: { transactionId: depositId } }), 2);
      const imported = await tx.financialTransaction.create({ data: { userId: 1, accountId: account.id, categoryId: category.id, occurredOn: new Date("2026-11-08"), amount: "1500", currency: "CAD", type: "INCOME", source: "IMPORTED", description: "Posted payroll" } });
      const alreadyImported = await create({ transactionAction: "LINK", transactionId: imported.id });
      assert.equal(alreadyImported.record.transaction.date, "2026-11-08"); assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before + 2);
      const typesBefore = (await (await typeRoute.GET(jsonRequest("GET"))).json()).types;
      assert.ok(typesBefore.some(item => item.id === tax.id));
      assert.equal((await sourceDetail.PATCH(jsonRequest("PATCH", { kind: "GIFT" }), context(source.id))).status, 409);
      assert.equal((await typeDetail.PATCH(jsonRequest("PATCH", { name: `${tax.name} renamed`, active: false }), context(tax.id))).status, 200);
      await create({ description: "Inactive deduction" }, null, 400);
      const adjusted = await edit(linked, { grossAmount: "2100", deductions: [{ typeId: tax.id, amount: "500" }, { typeId: other.id, amount: "100" }], notes: "Corrected gross only" }, pdf);
      assert.equal(adjusted.record.grossAmount, "2100.0000"); assert.equal(adjusted.record.transaction.amount, "1500.0000"); assert.equal(adjusted.record.document.mimeType, "application/pdf");
      await edit(linked, { notes: "Stale change" }, null, 409);
      await edit(adjusted, { netAmount: "1499", acknowledgeMismatch: true }, null, 400);
      const countAfter = await tx.financialTransaction.count({ where: { userId: 1 } });
      for (const kind of ["GIFT", "INTEREST", "FREELANCE", "REIMBURSEMENT", "OTHER"]) {
        const otherSource = (await (await sourceRoute.POST(jsonRequest("POST", { name: `${kind} ${randomUUID()}`, kind }))).json()).source;
        const oneTime = await create({ sourceId: otherSource.id, description: `${kind} payment`, grossAmount: null, netAmount: "25.1234", deductions: [], periodStart: null, periodEnd: null, accountId: null });
        assert.equal(oneTime.record.source.kind, kind); assert.equal(oneTime.record.grossAmount, null); assert.equal(oneTime.record.document, null);
      }
      assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), countAfter);
      await create({ deductions: [], grossAmount: "2000", netAmount: "1500" }, null, 400);
      const mismatch = await create({ deductions: [], grossAmount: "2000", netAmount: "1500", acknowledgeMismatch: true });
      assert.equal(mismatch.record.difference, "500.0000");
      const zero = await create({ grossAmount: "0", netAmount: "0", deductions: [] }); assert.equal(zero.record.netAmount, "0.0000");
      await create({ grossAmount: "0", netAmount: "0", deductions: [], transactionAction: "CREATE" }, null, 400);
      await create({ deductions: [], grossAmount: null, categoryId: expenseCategory.id }, null, 400);
      assert.equal((await sourceDetail.PATCH(jsonRequest("PATCH", { active: false }), context(source.id))).status, 200);
      await create({ deductions: [] }, null, 400);
      const retained = await edit(adjusted, { notes: "Historical inactive source and deduction are retained" });
      const search = await route.GET(new Request("http://localhost/api/finance/income?search=Historical&status=linked"));
      assert.ok((await search.json()).records.some(item => item.id === retained.record.id));
      const foreignUser = await tx.user.create({ data: { id: (await tx.user.aggregate({ _max: { id: true } }))._max.id + 1, email: `${randomUUID()}@example.invalid` } });
      const foreignSource = await tx.financialIncomeSource.create({ data: { userId: foreignUser.id, name: "Other employer", normalizedName: "other", kind: "EMPLOYMENT" } });
      const foreignType = await tx.financialDeductionType.create({ data: { userId: foreignUser.id, name: "Other tax", normalizedName: "other" } });
      const foreignAccount = await tx.financialAccount.create({ data: { userId: foreignUser.id, name: "Other bank", normalizedName: "other", type: "CHEQUING", currency: "CAD" } });
      const foreignDeposit = await tx.financialTransaction.create({ data: { userId: foreignUser.id, accountId: foreignAccount.id, occurredOn: new Date(base.date), amount: "1500", currency: "CAD", type: "INCOME", description: "Other owner's deposit" } });
      const foreignRecord = await tx.financialIncomeRecord.create({ data: { userId: foreignUser.id, sourceId: foreignSource.id, paidOn: new Date(base.date), description: "Private other income", netAmount: "1500", currency: "CAD", transactionId: depositId } });
      assert.ok(!(await transactions.getTransaction(depositId)).incomeRecords.some(item => item.id === foreignRecord.id));
      for (const method of ["GET", "PATCH", "DELETE"]) {
        const { requestKey, ...editing } = base;
        const body = method === "PATCH" ? { ...editing, expectedUpdatedAt: foreignRecord.updatedAt.toISOString() } : null;
        assert.equal((await detail[method](request(method, body, null, foreignRecord.updatedAt.toISOString()), context(foreignRecord.id))).status, 404);
      }
      for (const method of ["GET", "DELETE"]) assert.equal((await documentRoute[method](request(method, null, null, foreignRecord.updatedAt.toISOString()), context(foreignRecord.id))).status, 404);
      assert.equal((await sourceDetail.GET(jsonRequest("GET"), context(foreignSource.id))).status, 404);
      assert.equal((await sourceDetail.PATCH(jsonRequest("PATCH", { active: false }), context(foreignSource.id))).status, 404);
      assert.equal((await typeDetail.GET(jsonRequest("GET"), context(foreignType.id))).status, 404);
      assert.equal((await typeDetail.PATCH(jsonRequest("PATCH", { active: false }), context(foreignType.id))).status, 404);
      // Reactivate the owner source to independently exercise foreign-reference rejection.
      await sourceDetail.PATCH(jsonRequest("PATCH", { active: true }), context(source.id));
      await create({ sourceId: foreignSource.id, deductions: [] }, null, 400);
      await create({ deductions: [{ typeId: foreignType.id, amount: "500" }] }, null, 400);
      await create({ accountId: foreignAccount.id, deductions: [], grossAmount: null }, null, 400);
      await create({ transactionAction: "LINK", transactionId: foreignDeposit.id, deductions: [], grossAmount: null }, null, 400);
      assert.ok(!(await income.listIncome(new URLSearchParams())).records.some(item => item.id === foreignRecord.id));
      const deletedDocument = await documentRoute.DELETE(request("DELETE", null, null, retained.record.updatedAt), context(retained.record.id));
      assert.equal(deletedDocument.status, 200); assert.deepEqual(await readdir(root), []);
      const kept = await income.getIncome(retained.record.id); assert.equal(kept.document, null); assert.equal(kept.transaction.id, depositId);
      assert.equal((await detail.DELETE(request("DELETE", null, null, kept.updatedAt), context(kept.id))).status, 200);
      assert.equal(await tx.financialIncomeDeduction.count({ where: { incomeRecordId: kept.id } }), 0); assert.ok(await tx.financialTransaction.findUnique({ where: { id: depositId } }));
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 60000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); if (previous === undefined) delete process.env.FINANCE_UPLOAD_DIR; else process.env.FINANCE_UPLOAD_DIR = previous; await rm(root, { recursive: true, force: true }); }
});
