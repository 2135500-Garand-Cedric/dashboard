import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => dependencies[name] ?? require(name));
  return exports;
}
test("manual transactions: common payment cases, atomic transfers, exact money, duplicates, edits, ownership and future links", { skip: process.env.RUN_FINANCE_TRANSACTION_DB_TEST !== "1" }, async () => {
  const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  const validation = load("../src/lib/finance/validation.ts");
  const transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const json = { NextResponse: { json: (data, options) => Response.json(data, options) } };
  const server = load("../src/lib/finance/server.ts", { "next/server": json, "./validation": validation });
  const rollback = new Error("ROLLBACK_TRANSACTION_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const transactionServer = load("../src/lib/finance/transaction-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": { prisma: { ...tx, $transaction: callback => callback(tx) } }, "next/server": json, "./validation": validation, "./server": server, "./transactions": transactions });
      const dependencies = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": json, "@/lib/finance/server": server, "@/lib/finance/validation": validation, "@/lib/finance/transactions": transactions, "@/lib/finance/transaction-server": transactionServer };
      const route = load("../src/app/api/finance/transactions/route.ts", dependencies);
      const detail = load("../src/app/api/finance/transactions/[id]/route.ts", dependencies);
      const request = (method, body, query = "") => new Request(`http://localhost/api/finance/transactions${query}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const context = id => ({ params: Promise.resolve({ id: String(id) }) });
      const account = async (type, currency = "CAD", userId = 1) => tx.financialAccount.create({ data: { userId, name: `${type} ${randomUUID()}`, normalizedName: randomUUID(), type, currency } });
      const cash = await account("CASH"), bank = await account("CHEQUING"), card = await account("CREDIT_CARD"), usd = await account("SAVINGS", "USD");
      const expense = await tx.financeCategory.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "EXPENSE" } });
      const income = await tx.financeCategory.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "INCOME" } });
      const base = { date: "2026-11-05", description: `Fixture ${randomUUID()}`, amount: "50", currency: "CAD", type: "EXPENSE", accountId: cash.id, categoryId: expense.id };
      async function create(changes = {}, status = 201) {
        const body = { ...base, requestKey: randomUUID(), ...changes };
        const response = await route.POST(request("POST", body));
        const result = await response.json();
        assert.equal(response.status, status, result.error);
        return { body, ...result };
      }
      const purchase = await create();
      assert.equal(purchase.transaction.amount, "-50.0000");
      assert.equal(purchase.transaction.counterparty, null);
      assert.equal(await tx.financialDocument.count({ where: { transactionId: purchase.transaction.id } }), 0);
      const replay = await create(purchase.body, 200);
      assert.equal(replay.transaction.id, purchase.transaction.id);
      assert.equal(replay.replayed, true);
      assert.equal((await create({ ...purchase.body, amount: "51" }, 409)).code, "REQUEST_ALREADY_USED");
      assert.equal((await create({}, 409)).code, "DUPLICATE_TRANSACTION");
      const separate = await create({ allowDuplicate: true });
      assert.notEqual(separate.transaction.id, purchase.transaction.id);
      const etransfer = await create({ description: "Interac e-Transfer rent", amount: "200", accountId: bank.id, counterparty: "Landlord", notes: "Sent via Interac" });
      assert.equal(etransfer.transaction.amount, "-200.0000");
      const debit = await create({ description: "Debit groceries", accountId: bank.id });
      assert.equal(debit.transaction.type, "EXPENSE");
      const cardPurchase = await create({ description: "Restaurant on credit card", accountId: card.id, amount: "60" });
      assert.equal(cardPurchase.transaction.amount, "-60.0000");
      const salary = await create({ description: "Payroll deposit", type: "INCOME", accountId: bank.id, categoryId: income.id, amount: "1500.25" });
      assert.equal(salary.transaction.amount, "1500.2500");
      const received = await create({ description: "Interac e-Transfer received", type: "INCOME", accountId: bank.id, categoryId: income.id, amount: "300" });
      assert.equal(received.transaction.type, "INCOME");
      const payment = await create({ description: "Credit card bill payment", type: "TRANSFER", accountId: bank.id, categoryId: null, destinationAccountId: card.id, amount: "60" });
      assert.equal(payment.transaction.type, "TRANSFER");
      assert.equal(payment.transaction.category, null);
      assert.equal(payment.transaction.amount, "-60.0000");
      assert.equal(payment.transaction.transfer.amount, "60.0000");
      assert.equal(await tx.financialTransaction.count({ where: { transferId: payment.transaction.transfer.id } }), 2);
      const cardHistory = await transactionServer.listTransactions(new URLSearchParams({ account: String(card.id) }));
      assert.equal(cardHistory.transactions.filter(item => item.id === payment.transaction.id).length, 1);
      assert.ok(cardHistory.transactions.some(item => item.id === cardPurchase.transaction.id));
      const fromIncoming = await transactionServer.getTransaction(payment.transaction.transfer.transactionId);
      assert.equal(fromIncoming.id, payment.transaction.id);
      await create({ description: "Invalid same-currency transfer", type: "TRANSFER", categoryId: null, accountId: bank.id, destinationAccountId: cash.id, destinationAmount: "49" }, 400);
      await create({ description: "Invalid FX", type: "TRANSFER", categoryId: null, destinationAccountId: usd.id }, 400);
      const fx = await create({ description: "Currency exchange", type: "TRANSFER", categoryId: null, accountId: bank.id, destinationAccountId: usd.id, amount: "100", destinationAmount: "70.1234" });
      assert.equal(fx.transaction.transfer.currency, "USD");
      assert.equal(fx.transaction.transfer.amount, "70.1234");
      const refund = await create({ description: "Purchase refund", type: "REFUND", accountId: card.id, amount: "20" });
      assert.equal(refund.transaction.amount, "20.0000");
      assert.equal(refund.transaction.category.id, expense.id);
      const adjustment = await create({ description: "Cash adjustment", type: "ADJUSTMENT", categoryId: null, amount: "-0.1234" });
      assert.equal(adjustment.transaction.amount, "-0.1234");
      const exact = await create({ description: "Exact money", amount: "900719925474099.1234" });
      assert.equal(exact.transaction.amount, "-900719925474099.1234");
      await create({ type: "INCOME" }, 400);
      await create({ currency: "USD" }, 400);
      await tx.financialAccount.update({ where: { id: cash.id }, data: { active: false } });
      await create({ description: "Inactive account" }, 400);
      await tx.financialAccount.update({ where: { id: cash.id }, data: { active: true } });
      const otherUser = await tx.user.create({ data: { id: (await tx.user.aggregate({ _max: { id: true } }))._max.id + 1, email: `${randomUUID()}@example.invalid` } });
      const foreign = await account("CASH", "CAD", otherUser.id);
      await create({ accountId: foreign.id }, 400);
      await create({ type: "TRANSFER", categoryId: null, destinationAccountId: foreign.id }, 400);
      const foreignEntry = await tx.financialTransaction.create({ data: { userId: otherUser.id, accountId: foreign.id, occurredOn: new Date("2026-11-05"), amount: "-1", currency: "CAD", type: "EXPENSE", description: "Other owner" } });
      for (const method of ["GET", "PATCH", "DELETE"]) {
        const { requestKey, ...editBase } = base;
        const response = await detail[method](request(method, method === "PATCH" ? { ...editBase, expectedUpdatedAt: new Date().toISOString() } : undefined), context(foreignEntry.id));
        assert.equal(response.status, 404);
      }
      const search = await transactionServer.listTransactions(new URLSearchParams({ search: "landlord", from: "2026-11-05", to: "2026-11-05", type: "EXPENSE" }));
      assert.equal(search.transactions.length, 1);
      assert.equal(search.transactions[0].id, etransfer.transaction.id);
      assert.ok(!(await transactionServer.listTransactions(new URLSearchParams())).transactions.some(item => item.id === foreignEntry.id));
      async function edit(original, changes = {}, status = 200) {
        const { requestKey, ...body } = original.body;
        const response = await detail.PATCH(request("PATCH", { ...body, expectedUpdatedAt: original.transaction.updatedAt, ...changes }), context(original.transaction.id));
        const result = await response.json();
        assert.equal(response.status, status, result.error);
        return { ...original, ...result, body: { ...original.body, ...changes } };
      }
      const swapped = await edit(payment, { accountId: card.id, destinationAccountId: bank.id, notes: "Reversed direction" });
      assert.equal(swapped.transaction.id, payment.transaction.id);
      assert.equal(swapped.transaction.transfer.transactionId, payment.transaction.transfer.transactionId);
      assert.equal(swapped.transaction.account.id, card.id);
      await edit(payment, { amount: "61" }, 409); // stale version
      const ordinary = await edit(swapped, { type: "EXPENSE", accountId: bank.id, categoryId: expense.id, destinationAccountId: null });
      assert.equal(ordinary.transaction.transfer, null);
      assert.equal(await tx.financialTransfer.findUnique({ where: { id: payment.transaction.transfer.id } }), null);
      const converted = await edit(ordinary, { type: "TRANSFER", categoryId: null, destinationAccountId: card.id });
      assert.ok(converted.transaction.transfer);
      assert.equal((await detail.DELETE(request("DELETE"), context(converted.transaction.id))).status, 200);
      assert.equal(await tx.financialTransaction.count({ where: { id: { in: [converted.transaction.id, converted.transaction.transfer.transactionId] } } }), 0);
      const batch = await tx.financialImport.create({ data: { userId: 1, accountId: cash.id, fingerprint: randomUUID() } });
      const linked = await tx.financialImportEntry.create({ data: { importId: batch.id, rowKey: "original-row", originalData: { amount: "-50.00", description: "Original source" }, transactionId: purchase.transaction.id } });
      await edit(purchase, { notes: "Cannot change matched entry" }, 409);
      assert.equal((await detail.DELETE(request("DELETE"), context(purchase.transaction.id))).status, 409);
      assert.deepEqual((await tx.financialImportEntry.findUnique({ where: { id: linked.id } })).originalData, { amount: "-50.00", description: "Original source" });
      assert.equal((await detail.DELETE(request("DELETE"), context(separate.transaction.id))).status, 200);
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 45000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
