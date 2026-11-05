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

test("finance CRUD is owner-scoped; history, exact decimals and reconciliation links survive deactivation", { skip: process.env.RUN_FINANCE_DB_TEST !== "1" }, async () => {
  const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  const validation = load("../src/lib/finance/validation.ts");
  const json = { NextResponse: { json: (data, options) => Response.json(data, options) } };
  const server = load("../src/lib/finance/server.ts", { "next/server": json, "./validation": validation });
  const rollback = new Error("ROLLBACK_FINANCE_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const dependencies = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": json, "@/lib/prisma": { prisma: { ...tx, $transaction: callback => callback(tx) } }, "@/lib/finance/validation": validation, "@/lib/finance/server": server };
      const accounts = load("../src/app/api/finance/accounts/route.ts", dependencies);
      const accountRoute = load("../src/app/api/finance/accounts/[id]/route.ts", dependencies);
      const categories = load("../src/app/api/finance/categories/route.ts", dependencies);
      const categoryRoute = load("../src/app/api/finance/categories/[id]/route.ts", dependencies);
      const request = (method, body) => new Request("http://localhost/api/finance", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json" } });
      const context = id => ({ params: Promise.resolve({ id: String(id) }) });
      async function expectedConflict(callback) {
        await tx.$executeRawUnsafe("SAVEPOINT finance_expected_conflict");
        try { return await callback(); }
        finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT finance_expected_conflict"); await tx.$executeRawUnsafe("RELEASE SAVEPOINT finance_expected_conflict"); }
      }
      const name = `Finance fixture ${randomUUID()}`;
      const base = { name, type: "CHEQUING", currency: "CAD", maskedIdentifier: "**** 1234" };
      const created = await accounts.POST(request("POST", base));
      assert.equal(created.status, 201);
      assert.match(created.headers.get("cache-control"), /no-store/);
      const { account } = await created.json();
      assert.equal(account.currency, "CAD");
      assert.equal((await tx.financialAccount.findUnique({ where: { id: account.id } })).userId, 1);
      assert.equal((await accountRoute.GET(request("GET"), context(account.id))).status, 200);
      assert.equal((await expectedConflict(() => accounts.POST(request("POST", { ...base, name: name.toUpperCase() })))).status, 409);
      assert.equal((await accounts.POST(request("POST", { ...base, userId: 2 }))).status, 400);
      assert.equal((await accounts.POST(request("POST", { ...base, maskedIdentifier: "1234567890123456" }))).status, 400);
      const changed = await accountRoute.PATCH(request("PATCH", { type: "SAVINGS", currency: "USD" }), context(account.id));
      assert.equal(changed.status, 200);
      assert.equal((await changed.json()).account.type, "SAVINGS");
      const categoryName = `Category ${randomUUID()}`;
      const createCategory = async type => {
        const response = await categories.POST(request("POST", { name: categoryName, type }));
        assert.equal(response.status, 201);
        return (await response.json()).category;
      };
      const expense = await createCategory("EXPENSE");
      const income = await createCategory("INCOME");
      assert.notEqual(expense.id, income.id);
      assert.equal((await expectedConflict(() => categories.POST(request("POST", { name: categoryName.toUpperCase(), type: "EXPENSE" })))).status, 409);
      assert.equal((await categoryRoute.PATCH(request("PATCH", { name: `${categoryName} renamed` }), context(income.id))).status, 200);
      const maxUser = await tx.user.aggregate({ _max: { id: true } });
      const otherUser = await tx.user.create({ data: { id: (maxUser._max.id ?? 0) + 1, email: `${randomUUID()}@example.invalid` } });
      const otherAccount = await tx.financialAccount.create({ data: { userId: otherUser.id, name: "Other owner's account", normalizedName: "other account", type: "CASH", currency: "CAD" } });
      const otherCategory = await tx.financeCategory.create({ data: { userId: otherUser.id, name: "Other category", normalizedName: "other category", type: "EXPENSE" } });
      assert.equal((await accountRoute.GET(request("GET"), context(otherAccount.id))).status, 404);
      assert.equal((await accountRoute.PATCH(request("PATCH", { active: false }), context(otherAccount.id))).status, 404);
      assert.equal((await categoryRoute.GET(request("GET"), context(otherCategory.id))).status, 404);
      assert.equal((await categoryRoute.PATCH(request("PATCH", { active: false }), context(otherCategory.id))).status, 404);
      assert.equal((await categoryRoute.DELETE(request("DELETE"), context(otherCategory.id))).status, 404);
      assert.ok(!(await (await accounts.GET(request("GET"))).json()).accounts.some(item => item.id === otherAccount.id));
      assert.ok(!(await (await categories.GET(request("GET"))).json()).categories.some(item => item.id === otherCategory.id));
      // Schema fixtures exercise future relationships, not future application features.
      const exactAmount = "900719925474099.1234";
      const transaction = await tx.financialTransaction.create({ data: { userId: 1, accountId: account.id, categoryId: expense.id, occurredOn: new Date("2026-11-05"), amount: new Prisma.Decimal(exactAmount).negated(), currency: "USD", type: "EXPENSE", description: "Decimal fixture" } });
      assert.equal(transaction.amount.toFixed(4), `-${exactAmount}`);
      assert.equal(new Prisma.Decimal("0.1").plus("0.2").toFixed(4), "0.3000");
      const receipt = await tx.financialReceipt.create({ data: { userId: 1, accountId: account.id, categoryId: expense.id, transactionId: transaction.id, purchasedOn: new Date("2026-11-05"), total: "0.3000", currency: "USD" } });
      const incomeRecord = await tx.financialIncomeRecord.create({ data: { userId: 1, accountId: account.id, categoryId: income.id, paidOn: new Date("2026-11-05"), description: "Income fixture", grossAmount: "1.2345", netAmount: "0.3000", currency: "USD" } });
      assert.equal(incomeRecord.grossAmount.toFixed(4), "1.2345");
      assert.equal((await accountRoute.PATCH(request("PATCH", { currency: "CAD" }), context(account.id))).status, 409);
      assert.equal((await categoryRoute.PATCH(request("PATCH", { type: "INCOME" }), context(expense.id))).status, 409);
      assert.equal((await expectedConflict(() => categoryRoute.DELETE(request("DELETE"), context(expense.id)))).status, 409);
      const imports = await Promise.all(["a", "b"].map(character => tx.financialImport.create({ data: { userId: 1, accountId: account.id, fingerprint: character.repeat(64) } })));
      for (const batch of imports) await tx.financialImportEntry.create({ data: { importId: batch.id, rowKey: "row-1", originalData: { amount: "-0.3000", merchant: "Original source text" }, transactionId: transaction.id } });
      assert.equal(await tx.financialImportEntry.count({ where: { transactionId: transaction.id } }), 2);
      assert.equal(await tx.financialTransaction.count({ where: { id: transaction.id } }), 1);
      await expectedConflict(async () => assert.rejects(tx.financialImport.create({ data: { userId: 1, accountId: account.id, fingerprint: "a".repeat(64) } }), error => error.code === "P2002"));
      await expectedConflict(async () => assert.rejects(tx.financialImportEntry.create({ data: { importId: imports[0].id, rowKey: "row-1", originalData: {} } }), error => error.code === "P2002"));
      await tx.financialDocument.create({ data: { userId: 1, accountId: account.id, transactionId: transaction.id, receiptId: receipt.id, type: "RECEIPT", storageKey: `private/finance/${randomUUID()}`, originalName: "fixture.pdf", mimeType: "application/pdf", byteSize: 100 } });
      assert.equal((await accountRoute.PATCH(request("PATCH", { active: false }), context(account.id))).status, 200);
      assert.equal((await categoryRoute.PATCH(request("PATCH", { active: false }), context(expense.id))).status, 200);
      assert.equal((await tx.financialAccount.findUnique({ where: { id: account.id } })).active, false);
      assert.ok(await tx.financialTransaction.findUnique({ where: { id: transaction.id } }));
      assert.ok(await tx.financialReceipt.findUnique({ where: { id: receipt.id } }));
      assert.equal((await accountRoute.PATCH(request("PATCH", { active: true }), context(account.id))).status, 200);
      const disposable = await categories.POST(request("POST", { name: `Unused ${randomUUID()}`, type: "EXPENSE" }));
      const unused = (await disposable.json()).category;
      assert.equal((await categoryRoute.DELETE(request("DELETE"), context(unused.id))).status, 200);
      assert.equal(await tx.financeCategory.findUnique({ where: { id: unused.id } }), null);
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 30000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
