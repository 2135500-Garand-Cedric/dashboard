import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
}
const validation = load("../src/lib/finance/validation.ts"), transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
const reporting = load("../src/lib/finance/reporting.ts", { "./validation": validation, "./transactions": transactions });
const { buildReport, reportFilters, moneyUnits: units, moneyText } = reporting;
function fixture() {
  return { accounts: [{ id: 1, name: "Bank", currency: "CAD", type: "CHEQUING", active: true }, { id: 2, name: "Visa", currency: "CAD", type: "CREDIT_CARD", active: true }, { id: 3, name: "Cash", currency: "CAD", type: "CASH", active: false }, { id: 4, name: "USD", currency: "USD", type: "SAVINGS", active: true }], categories: [{ id: 1, name: "Food", type: "EXPENSE", active: true }, { id: 2, name: "Salary", type: "INCOME", active: true }], sources: [{ id: 1, name: "Employer", kind: "EMPLOYMENT" }], transactions: [], receipts: [], income: [], matches: [], examples: { accountIds: [], receiptIds: [], incomeIds: [] } };
}
const row = (id, amount, type, extra = {}) => ({ id, accountId: 1, categoryId: type === "INCOME" ? 2 : ["TRANSFER", "ADJUSTMENT"].includes(type) ? null : 1, date: "2026-11-06", amount, excludedAmount: "0.0000", currency: "CAD", type, source: "MANUAL", statementBacked: false, description: `Movement ${id}`, counterparty: "Store", ...extra });
const match = (kind, sourceId, transactionId, amount, extra = {}) => ({ kind, receiptId: kind === "RECEIPT" ? sourceId : null, incomeRecordId: kind === "INCOME" ? sourceId : null, sourceTransactionId: kind === "DUPLICATE" ? sourceId : null, transactionId, amount, status: "CONFIRMED", ...extra });
const filters = extra => reportFilters(new URLSearchParams({ month: "2026-11", ...extra }), "2026-11-06");
function assertReconciles(report) {
  const sum = (rows, key) => rows.reduce((sum, row) => sum + units(row[key]), BigInt(0));
  assert.equal(moneyText(units(report.totals.income) - units(report.totals.expenses) + units(report.totals.adjustments)), report.totals.net);
  assert.equal(moneyText(sum(report.timeline, "income")), report.totals.income);
  assert.equal(moneyText(sum(report.timeline, "expenses")), report.totals.expenses);
  assert.equal(moneyText(sum(report.timeline, "net")), report.totals.net);
  for (const key of ["spendingByAccount", "spendingByCategory", "spendingByMerchant"]) assert.equal(moneyText(sum(report[key], "net")), report.totals.expenses);
  assert.equal(moneyText(sum(report.incomeBySource, "amount")), report.totals.income);
}
test("ledger totals exclude receipt/pay-stub duplication, confirmed aliases, transfers and card bill payments", () => {
  const data = fixture();
  data.transactions = [row(1, "1500", "INCOME"), row(2, "-100", "EXPENSE", { accountId: 2 }), row(3, "20", "REFUND", { accountId: 2 }), row(4, "-100", "TRANSFER"), row(5, "100", "TRANSFER", { accountId: 2 }), row(6, "-25", "EXPENSE", { excludedAmount: "25" }), row(7, "-25", "EXPENSE", { source: "IMPORTED", statementBacked: true }), row(8, "-100", "EXPENSE", { excludedAmount: "40" }), row(9, "-40", "EXPENSE", { source: "IMPORTED", statementBacked: true }), row(10, "-2.0001", "ADJUSTMENT"), row(11, "35", "INCOME", { counterparty: "Reimbursement" }), row(12, "-999", "EXPENSE", { currency: "USD", accountId: 4 })];
  data.receipts = [{ id: 1, accountId: 2, categoryId: 1, date: "2026-11-06", total: "100", currency: "CAD", merchant: "Store", transactionId: 2 }];
  data.income = [{ id: 1, accountId: 1, categoryId: 2, sourceId: 1, date: "2026-11-06", gross: "2000", net: "1500", deductions: "500", currency: "CAD", transactionId: 1, description: "Salary" }];
  data.matches = [match("DUPLICATE", 6, 7, "25"), match("DUPLICATE", 8, 9, "40"), match("RECEIPT", 1, 2, "100"), match("INCOME", 1, 1, "1500")];
  const report = buildReport(data, filters());
  assert.equal(report.totals.income, "1535.0000"); assert.equal(report.totals.purchases, "225.0000"); assert.equal(report.totals.refunds, "20.0000"); assert.equal(report.totals.expenses, "205.0000"); assert.equal(report.totals.net, "1327.9999");
  assert.equal(report.earnings.gross, "2000.0000"); assert.equal(report.earnings.net, "1500.0000"); assert.equal(report.incomeBySource.find(row => row.key === "1").amount, "1500.0000");
  assert.ok(!report.recent.some(row => row.id === 6)); assert.equal(report.unmatched.receiptCount, 0); assertReconciles(report);
});
test("refunds can make period spending negative; account/category/currency and example filters remain consistent", () => {
  const data = fixture(); data.transactions = [row(1, "-100", "EXPENSE", { date: "2026-10-20" }), row(2, "30", "REFUND"), row(3, "-10", "EXPENSE", { accountId: 3 }), row(4, "12.50", "INCOME", { accountId: 4, currency: "USD" })]; data.examples.accountIds = [3];
  const all = buildReport(data, filters()); assert.equal(all.totals.expenses, "-20.0000"); assert.equal(all.totals.net, "20.0000"); assertReconciles(all);
  const personal = buildReport(data, filters({ dataset: "personal" })); assert.equal(personal.totals.expenses, "-30.0000");
  const examples = buildReport(data, filters({ dataset: "examples" })); assert.equal(examples.totals.expenses, "10.0000"); assert.equal(examples.coverage.examplesIncluded, true);
  const bank = buildReport(data, filters({ account: "1", category: "1" })); assert.equal(bank.totals.expenses, "-30.0000"); assertReconciles(bank);
  const usd = buildReport(data, filters({ currency: "USD" })); assert.equal(usd.totals.income, "12.5000"); assertReconciles(usd);
  assert.throws(() => buildReport(data, filters({ account: "4" })), /currency/); assert.throws(() => buildReport(data, filters({ account: "999" })), /belonging/);
});
test("split net deposits, partial alias shares, unassigned remainders and overlapping documents do not overstate income sources", () => {
  const data = fixture(); data.transactions = [row(1, "100", "INCOME", { excludedAmount: "40" }), row(2, "40", "INCOME", { statementBacked: true, source: "IMPORTED" }), row(3, "50", "INCOME")];
  data.income = [{ id: 1, sourceId: 1, accountId: 1, categoryId: 2, date: "2026-11-06", gross: "150", net: "100", deductions: "50", currency: "CAD", transactionId: 1, description: "Pay" }];
  data.matches = [match("INCOME", 1, 1, "100"), match("DUPLICATE", 1, 2, "40")];
  let report = buildReport(data, filters()); assert.equal(report.totals.income, "150.0000"); assert.equal(report.incomeBySource.find(row => row.key === "1").amount, "100.0000"); assert.equal(report.incomeBySource.find(row => row.key === "unattributed").amount, "50.0000"); assertReconciles(report);
  data.income.push({ ...data.income[0], id: 2, transactionId: 3, net: "50" }, { ...data.income[0], id: 3, transactionId: 3, net: "50" });
  data.matches.push(match("INCOME", 2, 3, "50"), match("INCOME", 3, 3, "50"));
  report = buildReport(data, filters()); assert.equal(report.coverage.overlappingIncome, 1); assert.equal(report.incomeBySource.find(row => row.key === "overlap").amount, "50.0000"); assertReconciles(report);
});
test("date ranges are calendar safe; empty buckets and trend totals remain exact beyond Number precision", () => {
  assert.equal(filters().to, "2026-11-30"); assert.equal(filters({ mode: "year", year: "2024" }).to, "2024-12-31"); assert.equal(filters({ month: "2024-02" }).to, "2024-02-29");
  for (const extra of [{ month: "2026-13" }, { mode: "custom", from: "2026-02-29", to: "2026-03-01" }, { mode: "custom", from: "2026-11-07", to: "2026-11-06" }, { mode: "custom", from: "1900-01-01", to: "2026-11-06" }, { currency: "BOGUS" }, { account: "0" }, { year: "0", mode: "year" }]) assert.throws(() => filters(extra));
  const data = fixture(); data.transactions = [row(1, "900719925474099.1234", "INCOME"), row(2, "900719925474099.1234", "INCOME"), row(3, "-0.0001", "EXPENSE")];
  const report = buildReport(data, filters()); assert.equal(report.totals.income, "1801439850948198.2468"); assert.equal(report.totals.net, "1801439850948198.2467"); assert.equal(report.timeline.length, 30); assert.equal(report.monthlyTrend.length, 12); assert.equal(report.yearlyTrend.length, 5); assertReconciles(report);
  const year = buildReport(data, filters({ mode: "year", year: "2026" })); assert.equal(year.interval, "month"); assert.equal(year.timeline.length, 12); assertReconciles(year);
});
