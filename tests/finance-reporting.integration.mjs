import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { seedFinanceExamples } from "../scripts/finance-example-data.mjs";
const require = createRequire(import.meta.url);
function load(file, deps = {}) { const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText; const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports; }
test("reports reconcile exactly to SQL ledger movements and example data covers every finance workflow without repeat inserts", { skip: process.env.RUN_FINANCE_REPORT_DB_TEST !== "1" }, async () => {
  const { PrismaClient } = await import("../src/generated/prisma/index.js"); const prisma = new PrismaClient(), root = await mkdtemp(path.join(os.tmpdir(), "finance-report-db-")), rollback = new Error("ROLLBACK_REPORT_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const max = await tx.user.aggregate({ _max: { id: true } }); const owner = await tx.user.create({ data: { id: max._max.id + 1, email: `${randomUUID()}@test.invalid` } });
      const fake = { ...tx, $transaction: callback => callback(tx) };
      const seeded = await seedFinanceExamples(fake, { userId: owner.id, today: "2026-11-07", root });
      assert.equal(seeded.reused, false); assert.equal(seeded.manifest.accountIds.length, 7); assert.ok(seeded.manifest.transactionIds.length > 300); assert.ok(seeded.manifest.receiptIds.length > 45); assert.ok(seeded.manifest.incomeIds.length > 45); assert.ok(seeded.manifest.documentIds.length >= 11);
      const count = await tx.financialTransaction.count({ where: { userId: owner.id } }), files = await readdir(root);
      assert.equal((await seedFinanceExamples(fake, { userId: owner.id, today: "2026-11-07", root })).reused, true); assert.equal(await tx.financialTransaction.count({ where: { userId: owner.id } }), count); assert.deepEqual(await readdir(root), files);
      const validation = load("../src/lib/finance/validation.ts"), transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation }), reporting = load("../src/lib/finance/reporting.ts", { "./validation": validation, "./transactions": transactions });
      const server = load("../src/lib/finance/server.ts", { "next/server": require("next/server"), "./validation": validation });
      const api = load("../src/lib/finance/reporting-server.ts", { "@/lib/prisma": { prisma: fake }, "./server": { ...server, FINANCE_USER_ID: owner.id }, "./reporting": reporting });
      const totals = rows => rows.reduce((sum, row) => sum + reporting.moneyUnits(row.net), BigInt(0));
      for (const query of [{ mode: "month", month: "2026-11" }, { mode: "year", year: "2026" }, { mode: "custom", from: "2024-12-01", to: "2026-11-07" }, { mode: "year", year: "2025", currency: "USD" }, { mode: "month", month: "2026-11", account: String(seeded.manifest.accountIds[2]) }]) {
        const params = reporting.reportFilters(new URLSearchParams({ ...query, dataset: "examples" }));
        const report = await api.financeReport(params);
        const [sql] = await tx.$queryRaw`
          SELECT coalesce(sum(CASE WHEN type='INCOME' THEN amount-"excludedAmount" ELSE 0 END),0)::text AS income,
          coalesce(sum(CASE WHEN type='EXPENSE' THEN -amount-"excludedAmount" WHEN type='REFUND' THEN -amount+"excludedAmount" ELSE 0 END),0)::text AS expenses,
          coalesce(sum(CASE WHEN type='TRANSFER' THEN 0 WHEN amount<0 THEN amount+"excludedAmount" ELSE amount-"excludedAmount" END),0)::text AS net
          FROM "FinancialTransaction" WHERE "userId"=${owner.id} AND currency=${params.currency}
            AND "occurredOn">=${params.from}::date AND "occurredOn"<=${params.to}::date
            AND (${params.accountId}::integer IS NULL OR "accountId"=${params.accountId})
        `;
        assert.equal(report.totals.income, reporting.moneyText(reporting.moneyUnits(sql.income))); assert.equal(report.totals.expenses, reporting.moneyText(reporting.moneyUnits(sql.expenses))); assert.equal(report.totals.net, reporting.moneyText(reporting.moneyUnits(sql.net)));
        assert.equal(reporting.moneyText(totals(report.timeline)), report.totals.net);
        for (const breakdown of [report.spendingByCategory, report.spendingByMerchant, report.spendingByAccount]) assert.equal(reporting.moneyText(totals(breakdown)), report.totals.expenses);
        assert.equal(reporting.moneyText(report.incomeBySource.reduce((sum, row) => sum + reporting.moneyUnits(row.amount), BigInt(0))), report.totals.income);
      }
      const month = await api.financeReport(reporting.reportFilters(new URLSearchParams({ month: "2026-11", dataset: "examples" })));
      assert.ok(month.unmatched.transactionCount > 0); assert.ok(month.unmatched.receiptCount > 0); assert.ok(month.coverage.unresolvedDuplicates > 0); assert.equal(month.coverage.examplesIncluded, true);
      const personal = await api.financeReport(reporting.reportFilters(new URLSearchParams({ month: "2026-11", dataset: "personal" }))); assert.equal(personal.totals.count, 0);
      await assert.rejects(api.financeReport(reporting.reportFilters(new URLSearchParams({ account: "2147483647" }))), /belonging/);
      const docs = await tx.financialDocument.findMany({ where: { userId: owner.id } });
      for (const doc of docs) { const bytes = await readFile(path.join(root, doc.storageKey)); assert.equal(bytes.length, doc.byteSize); if (doc.mimeType === "application/pdf") { assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))); assert.ok(bytes.includes(Buffer.from("startxref"))); } }
      const drafts = await tx.financialImport.findMany({ where: { userId: owner.id, status: "DRAFT" }, include: { entries: true } }); assert.equal(drafts.length, 1); assert.equal(drafts[0].entries.length, 3);
      assert.ok(await tx.financialMatch.count({ where: { userId: owner.id, status: "REJECTED" } })); assert.ok(await tx.financialMatch.count({ where: { userId: owner.id, status: "UNLINKED" } }));
      throw rollback;
    }, { timeout: 120000, isolationLevel: "Serializable" }), error => error === rollback);
  } finally { await prisma.$disconnect(); await rm(root, { recursive: true, force: true }); }
});
