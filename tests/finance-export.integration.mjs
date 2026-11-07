import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);

test("CSV endpoints export all matching pages, exact counted money, metadata, and owner-scoped records", { skip: process.env.RUN_FINANCE_EXPORT_DB_TEST !== "1" }, async () => {
  const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js"), prisma = new PrismaClient(), rollback = new Error("ROLLBACK_EXPORT");
  try {
    await assert.rejects(prisma.$transaction(async db => {
      const modules = new Map();
      function load(file) {
        const absolute = path.resolve(file); if (modules.has(absolute)) return modules.get(absolute);
        const exports = {}; modules.set(absolute, exports);
        const compiled = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
        new Function("exports", "require", compiled)(exports, name => {
          if (name === "@/lib/prisma") return { prisma: { ...db, $transaction: callback => callback(db) } };
          if (name === "@/generated/prisma") return { Prisma };
          if (name === "@/lib/require-owner") return { requireOwner: async () => null };
          if (name.startsWith("@/")) return load(path.join("src", `${name.slice(2)}.ts`));
          if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), `${name}.ts`));
          return require(name);
        }); return exports;
      }
      const account = await db.financialAccount.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "CASH", currency: "CAD" } }), tag = randomUUID();
      await db.financialTransaction.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ userId: 1, accountId: account.id, description: `${tag} ${i}`, amount: "-100.1234", currency: "CAD", type: "EXPENSE", occurredOn: new Date("2026-11-07"), excludedAmount: i === 0 ? "40.0000" : "0" })) });
      const route = load("src/app/api/finance/exports/[kind]/route.ts");
      async function get(kind, query = {}) { return route.GET(new Request(`http://localhost/api/finance/exports/${kind}?${new URLSearchParams(query)}`), { params: Promise.resolve({ kind }) }); }
      const response = await get("transactions", { account: String(account.id), search: tag, page: "2" }); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/); assert.match(response.headers.get("content-disposition"), /attachment/);
      const csv = await response.text(); assert.equal(csv.split("\r\n").length - 2, 30); assert.ok(csv.includes('"-60.1234"')); assert.ok(csv.includes('"40.0000"'));
      const parsed = load("src/lib/finance/statement-csv.ts").parseStatement(Buffer.from(csv), { delimiter: "AUTO", encoding: "AUTO", headerRow: 1 });
      const money = load("src/lib/finance/reporting.ts");
      const exportedNet = parsed.rows.reduce((sum, row) => sum + money.moneyUnits(row.cells[8]), BigInt(0));
      const [sql] = await db.$queryRaw`SELECT sum(amount + "excludedAmount")::text AS net FROM "FinancialTransaction" WHERE "accountId"=${account.id}`;
      assert.equal(money.moneyText(exportedNet), money.moneyText(money.moneyUnits(sql.net)));
      const empty = await get("transactions", { search: randomUUID() }); assert.equal((await empty.text()).split("\r\n").length - 2, 0);
      assert.equal((await get("transactions", { from: "2026-11-08", to: "2026-11-07" })).status, 400); assert.equal((await get("invalid")).status, 404);
      for (const kind of ["income", "receipts"]) { const result = await get(kind, { search: randomUUID() }); assert.equal(result.status, 200); assert.equal((await result.text()).split("\r\n").length - 2, 0); }
      const transactionServer = load("src/lib/finance/transaction-server.ts");
      const normal = await transactionServer.listTransactions(new URLSearchParams({ account: String(account.id) })); assert.equal(normal.transactions.length, 25); assert.equal(normal.total, 30);
      const max = await db.user.aggregate({ _max: { id: true } });
      const foreign = await db.user.create({ data: { id: max._max.id + 1, email: `${randomUUID()}@test.invalid` } });
      const otherAccount = await db.financialAccount.create({ data: { userId: foreign.id, name: tag, normalizedName: tag, type: "CASH", currency: "CAD" } });
      await db.financialTransaction.create({ data: { userId: foreign.id, accountId: otherAccount.id, description: tag, amount: "-5", currency: "CAD", type: "EXPENSE", occurredOn: new Date("2026-11-07") } });
      const ownedOnly = await get("transactions", { account: String(otherAccount.id) }); assert.equal((await ownedOnly.text()).split("\r\n").length - 2, 0);
      await db.financialTransaction.createMany({ data: Array.from({ length: 5001 }, () => ({ userId: 1, accountId: account.id, description: tag, amount: "-1", currency: "CAD", type: "EXPENSE", occurredOn: new Date("2026-11-07") })) });
      assert.equal((await get("transactions", { account: String(account.id) })).status, 413);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
