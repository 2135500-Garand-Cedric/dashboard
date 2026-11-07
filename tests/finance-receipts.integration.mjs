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
test("receipt API keeps independent receipts separate from expenses; linking, creation, replacement, deletion and authorization", { skip: process.env.RUN_FINANCE_RECEIPT_DB_TEST !== "1" }, async () => {
  const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  const root = await mkdtemp(path.join(os.tmpdir(), "finance-receipt-db-")), previous = process.env.FINANCE_UPLOAD_DIR;
  process.env.FINANCE_UPLOAD_DIR = root;
  const validation = load("../src/lib/finance/validation.ts");
  const transactionValidation = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const receiptValidation = load("../src/lib/finance/receipts.ts", { "./validation": validation, "./transactions": transactionValidation });
  const files = load("../src/lib/finance/receipt-files.ts", { "./validation": validation, "./receipts": receiptValidation });
  const nextServer = require("next/server");
  const server = load("../src/lib/finance/server.ts", { "next/server": nextServer, "./validation": validation });
  const rollback = new Error("ROLLBACK_RECEIPT_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const db = { prisma: { ...tx, $transaction: callback => callback(tx) } };
      const transactions = load("../src/lib/finance/transaction-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "next/server": nextServer, "./validation": validation, "./server": server, "./transactions": transactionValidation });
      const receipts = load("../src/lib/finance/receipt-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "next/server": nextServer, "./validation": validation, "./server": server, "./transactions": transactionValidation, "./transaction-server": transactions, "./receipt-files": files, "./receipts": receiptValidation });
      const deps = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": nextServer, "@/lib/finance/server": server, "@/lib/finance/validation": validation, "@/lib/finance/receipts": receiptValidation, "@/lib/finance/receipt-files": files, "@/lib/finance/receipt-server": receipts };
      const route = load("../src/app/api/finance/receipts/route.ts", deps), detail = load("../src/app/api/finance/receipts/[id]/route.ts", deps), documentRoute = load("../src/app/api/finance/receipts/[id]/document/route.ts", deps);
      const account = await tx.financialAccount.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "CASH", currency: "CAD" } });
      const category = await tx.financeCategory.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "EXPENSE" } });
      const base = { merchant: "Receipt API store", date: "2026-11-06", accountId: account.id, categoryId: category.id, currency: "CAD", subtotal: "10", tax: "0", tip: "0", total: "10", transactionAction: "UNMATCHED" };
      const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: "white" } }).png().toBuffer();
      const replacement = await sharp({ create: { width: 4, height: 4, channels: 3, background: "black" } }).png().toBuffer();
      const context = id => ({ params: Promise.resolve({ id: String(id) }) });
      function request(method, body, buffer = null, version) {
        const headers = version ? { "If-Match": version } : {};
        if (!body) return new Request("http://localhost/api/finance/receipts", { method, headers });
        const form = new FormData(); form.append("details", JSON.stringify(body)); if (buffer) form.append("file", new File([buffer], "camera.png", { type: "image/png" }));
        return new Request("http://localhost/api/finance/receipts", { method, body: form, headers });
      }
      async function create(patch = {}, buffer = null, status = 201) {
        const body = { ...base, requestKey: randomUUID(), ...patch };
        const response = await route.POST(request("POST", body, buffer));
        const result = await response.json(); assert.equal(response.status, status, result.error);
        return { body, ...result };
      }
      const before = await tx.financialTransaction.count({ where: { userId: 1 } });
      const independent = await create({}, png);
      assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before);
      assert.equal(independent.receipt.transaction, null); assert.ok(independent.receipt.document);
      assert.equal(independent.receipt.tax, "0.0000");
      assert.equal((await create(independent.body, png, 200)).receipt.id, independent.receipt.id);
      assert.equal((await create({ ...independent.body, merchant: "Changed after retry" }, png, 409)).code, "RECEIPT_REQUEST_USED");
      assert.equal((await create({}, png, 409)).code, "DUPLICATE_RECEIPT");
      assert.equal((await readdir(root)).length, 1);
      const download = await documentRoute.GET(request("GET"), context(independent.receipt.id));
      assert.equal(download.status, 200); assert.equal(download.headers.get("content-type"), "image/png");
      assert.match(download.headers.get("cache-control"), /no-store/); assert.match(download.headers.get("content-security-policy"), /sandbox/);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
      const expense = (await transactions.saveTransaction(transactionValidation.transactionInput({ date: base.date, accountId: account.id, categoryId: category.id, amount: "10", currency: "CAD", type: "EXPENSE", description: "Already recorded cash purchase", requestKey: randomUUID() }))).transaction;
      const duplicate = await create({ transactionAction: "CREATE" }, null, 409);
      assert.equal(duplicate.code, "EXISTING_EXPENSE"); assert.equal(duplicate.existingId, expense.id);
      const linked = await create({ transactionAction: "LINK", transactionId: expense.id, notes: "Supporting evidence" });
      assert.equal(linked.receipt.transaction.id, expense.id);
      assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before + 1);
      const created = await create({ merchant: "New purchase", subtotal: "11.5", tax: "1.5", total: "13", transactionAction: "CREATE" });
      assert.equal(created.receipt.transaction.amount, "-13.0000");
      assert.equal(await tx.financialTransaction.count({ where: { userId: 1 } }), before + 2);
      assert.equal((await create(created.body, null, 200)).receipt.transaction.id, created.receipt.transaction.id);
      await create({ subtotal: "9" }, null, 400);
      assert.equal((await create({ subtotal: "9", acknowledgeMismatch: true })).receipt.difference, "1.0000");
      assert.equal((await create({ subtotal: "0", total: "0" })).receipt.total, "0.0000");
      await create({ subtotal: "0", total: "0", transactionAction: "CREATE" }, null, 400);
      await create({ currency: "USD", transactionAction: "CREATE" }, null, 400);
      assert.equal((await create({ currency: "USD" })).receipt.currency, "USD"); // original foreign-currency receipt can remain unmatched
      await create({ transactionAction: "LINK", transactionId: expense.id, total: "11", subtotal: "11" }, null, 400);
      const { requestKey, ...editBody } = independent.body;
      const editRequest = { ...editBody, expectedUpdatedAt: independent.receipt.updatedAt, merchant: "Edited store", transactionAction: "LINK", transactionId: expense.id };
      const editedResponse = await detail.PATCH(request("PATCH", editRequest, replacement), context(independent.receipt.id));
      assert.equal(editedResponse.status, 200);
      const edited = (await editedResponse.json()).receipt;
      assert.deepEqual((await transactions.getTransaction(expense.id)).receipts.map(receipt => receipt.id).sort((a, b) => a - b), [linked.receipt.id, edited.id].sort((a, b) => a - b));
      assert.notEqual(edited.document.id, independent.receipt.document.id);
      assert.deepEqual(Buffer.from(await (await documentRoute.GET(request("GET"), context(edited.id))).arrayBuffer()), replacement);
      assert.equal((await readdir(root)).length, 1); // old original removed only after successful replacement
      assert.equal((await detail.PATCH(request("PATCH", editRequest), context(edited.id))).status, 409);
      assert.equal((await tx.financialTransaction.findUnique({ where: { id: expense.id } })).description, "Already recorded cash purchase");
      const removed = await documentRoute.DELETE(request("DELETE", null, null, edited.updatedAt), context(edited.id));
      assert.equal(removed.status, 200); assert.deepEqual(await readdir(root), []);
      assert.equal((await documentRoute.GET(request("GET"), context(edited.id))).status, 404);
      const kept = await receipts.getReceipt(edited.id); assert.equal(kept.document, null); assert.equal(kept.transaction.id, expense.id);
      assert.equal((await detail.DELETE(request("DELETE", null, null, kept.updatedAt), context(kept.id))).status, 200);
      assert.ok(await tx.financialTransaction.findUnique({ where: { id: expense.id } }));
      const searchResponse = await route.GET(new Request("http://localhost/api/finance/receipts?search=Supporting&status=linked"));
      assert.ok((await searchResponse.json()).receipts.some(item => item.id === linked.receipt.id));
      const otherUser = await tx.user.create({ data: { id: (await tx.user.aggregate({ _max: { id: true } }))._max.id + 1, email: `${randomUUID()}@example.invalid` } });
      const foreignReceipt = await tx.financialReceipt.create({ data: { userId: otherUser.id, purchasedOn: new Date(base.date), total: "1", currency: "CAD" } });
      // Even a malformed cross-owner relation must not expose another owner's receipt.
      await tx.financialReceipt.update({ where: { id: foreignReceipt.id }, data: { transactionId: expense.id } });
      assert.ok(!(await transactions.getTransaction(expense.id)).receipts.some(receipt => receipt.id === foreignReceipt.id));
      const foreignAccount = await tx.financialAccount.create({ data: { userId: otherUser.id, name: randomUUID(), normalizedName: randomUUID(), type: "CASH", currency: "CAD" } });
      const foreignExpense = await tx.financialTransaction.create({ data: { userId: otherUser.id, accountId: foreignAccount.id, occurredOn: new Date(base.date), amount: "-10", currency: "CAD", type: "EXPENSE", description: "Foreign expense" } });
      await create({ accountId: foreignAccount.id }, null, 400);
      await create({ transactionAction: "LINK", transactionId: foreignExpense.id }, null, 400);
      for (const method of ["GET", "PATCH", "DELETE"]) assert.equal((await detail[method](request(method, method === "PATCH" ? { ...editBody, expectedUpdatedAt: foreignReceipt.updatedAt.toISOString() } : null, null, foreignReceipt.updatedAt.toISOString()), context(foreignReceipt.id))).status, 404);
      for (const method of ["GET", "DELETE"]) assert.equal((await documentRoute[method](request(method, null, null, foreignReceipt.updatedAt.toISOString()), context(foreignReceipt.id))).status, 404);
      assert.ok(!(await receipts.listReceipts(new URLSearchParams())).receipts.some(item => item.id === foreignReceipt.id));
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 60000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); if (previous === undefined) delete process.env.FINANCE_UPLOAD_DIR; else process.env.FINANCE_UPLOAD_DIR = previous; await rm(root, { recursive: true, force: true }); }
});
