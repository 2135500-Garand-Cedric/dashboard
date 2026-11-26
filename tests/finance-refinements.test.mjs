import assert from "node:assert/strict";
import test from "node:test";
import { financeRefinements } from "./helpers/finance-refinements.mjs";
const modules = financeRefinements({});
const { accountBalance, balanceInput } = modules["./balances"];
const { buildReport, reportFilters, moneyUnits } = modules["./reporting"];
const { buildOverview } = modules["./overview"];
const date = "2026-11-25";
const movement = (amount, extra = {}) => ({ date, amount, excludedAmount: "0", ...extra });

test("balance corrections preserve exact cash movements, same-day edits and future-date boundaries", () => {
  const rows = [
    movement("500.10"),
    movement("-100.05"),
    movement("20"),
    movement("-25"),
    movement("-10", { excludedAmount: "10" }),
    movement("999", { date: "2026-12-01" }),
  ];
  assert.equal(accountBalance(rows, [], date).amount, "395.0500");
  const checkpoints = [{ date, amount: "1000", ledgerAmount: "395.05" }];
  assert.equal(accountBalance(rows, checkpoints, date).amount, "1000.0000");
  assert.equal(accountBalance([...rows, movement("-12.34")], checkpoints, date).amount, "987.6600");
  assert.equal(
    accountBalance([...rows, movement("50", { date: "2020-01-01" })], checkpoints, date).amount,
    "1050.0000",
  );
  assert.equal(accountBalance([movement("-500"), movement("200")], [], date).amount, "-300.0000");
  assert.equal(
    accountBalance(rows, [{ date: "2026-12-01", amount: "1", ledgerAmount: "0" }], date).amount,
    "395.0500",
  );
  assert.equal(balanceInput({ date, amount: "0", expectedRevision: 0 }, date).amount, "0");
  for (const patch of [
    { date: "2026-12-01" },
    { amount: "2.123" },
    { amount: "NaN" },
    { expectedRevision: -1 },
    { userId: 2 },
  ])
    assert.throws(() => balanceInput({ date, amount: "1", expectedRevision: 0, ...patch }, date));
});
const row = (id, type, amount, categoryId, extra = {}) => ({
  id,
  type,
  amount,
  categoryId,
  accountId: 1,
  currency: "CAD",
  date,
  excludedAmount: "0",
  source: "MANUAL",
  statementBacked: false,
  description: `Activity ${id}`,
  counterparty: null,
  ...extra,
});
function dataset() {
  return {
    today: date,
    accounts: [{ id: 1, name: "Bank", type: "CHEQUING", active: true, currency: "CAD" }],
    categories: [
      { id: 1, name: "Rent", type: "EXPENSE", active: true },
      { id: 2, name: "School", type: "EXPENSE", active: true },
    ],
    transactions: [
      row(1, "EXPENSE", "-1000", 1),
      row(2, "EXPENSE", "-1000", 2),
      row(3, "REFUND", "2000", null),
    ],
    reimbursements: [
      { expenseId: 1, paymentId: 3, amount: "1000" },
      { expenseId: 2, paymentId: 3, amount: "1000" },
    ],
    reimbursementPlans: [
      { expenseId: 1, person: "Dad", expected: "1000" },
      { expenseId: 2, person: "Dad", expected: "1000" },
    ],
    sources: [],
    income: [],
    receipts: [],
    matches: [],
    examples: { accountIds: [], incomeIds: [], receiptIds: [] },
  };
}
test("one reimbursement payment is split by covered expense category without duplicating cash or counts", () => {
  const data = dataset(),
    filters = reportFilters(new URLSearchParams("mode=month&month=2026-11"), date);
  const report = buildReport(data, filters, date);
  assert.equal(report.totals.refunds, "2000.0000");
  assert.equal(report.totals.count, 3);
  assert.equal(report.spendingByCategory.length, 2);
  assert.ok(
    report.spendingByCategory.every((row) => row.refunds === "1000.0000" && row.net === "0.0000"),
  );
  for (const categoryId of [1, 2]) {
    const scoped = buildReport(data, { ...filters, categoryId }, date);
    assert.equal(scoped.totals.purchases, "1000.0000");
    assert.equal(scoped.totals.refunds, "1000.0000");
    assert.equal(scoped.totals.count, 2);
  }
  assert.equal(buildOverview(data, filters).awaitingReimbursements.total, "0.0000");
});
test("partial/unallocated repayments and prior-month outstanding expenses remain explicit", () => {
  const data = dataset(),
    filters = reportFilters(new URLSearchParams("mode=month&month=2026-11"), date);
  data.transactions[0].date = "2026-10-01";
  data.reimbursements = [{ expenseId: 1, paymentId: 3, amount: "600" }];
  const report = buildReport(data, filters, date);
  assert.equal(report.spendingByCategory.find((row) => row.name === "Rent").refunds, "600.0000");
  assert.equal(
    report.spendingByCategory.find((row) => row.name === "Unallocated refunds").refunds,
    "1400.0000",
  );
  assert.equal(
    report.spendingByCategory.reduce((sum, row) => sum + moneyUnits(row.net), BigInt(0)),
    moneyUnits(report.totals.expenses),
  );
  const pending = buildOverview(data, filters).awaitingReimbursements;
  assert.equal(pending.count, 2);
  assert.equal(pending.total, "1400.0000");
  assert.equal(pending.expenses.find((row) => row.id === 1).remaining, "400.0000");
});
test("refunds need no blanket category and income sources accept configurable owned type IDs", () => {
  const refund = modules["./transactions"].transactionInput({
    date,
    description: "Combined repayment",
    type: "REFUND",
    amount: "2000",
    currency: "CAD",
    accountId: 1,
    categoryId: null,
    requestKey: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(refund.categoryId, null);
  const data = dataset();
  data.reimbursements = [];
  data.transactions[2].categoryId = 1;
  const unallocated = buildReport(
    data,
    reportFilters(new URLSearchParams("mode=month&month=2026-11"), date),
    date,
  );
  assert.equal(
    unallocated.spendingByCategory.find((row) => row.name === "Unallocated refunds").refunds,
    "2000.0000",
  );
  assert.equal(modules["./income"].incomeConfigInput({ name: "Dad", typeId: 42 }, true).typeId, 42);
  assert.throws(() => modules["./income"].incomeConfigInput({ name: "Dad", typeId: "bad" }, true));
});

test("balance and income-type endpoints reject non-owners before body/params/database access", async () => {
  const { loadWorkModule } = await import("./helpers/work-support.mjs");
  for (const status of [401, 403]) {
    const fail = () => assert.fail("Denied request accessed input or private data");
    const deps = {
      "@/lib/require-owner": { requireOwner: async () => Response.json({}, { status }) },
      "@/lib/prisma": { prisma: new Proxy({}, { get: fail }) },
      "@/lib/user-settings": { withUserTimeZone: fail },
      "@/lib/finance/balance-server": { listBalances: fail, setAccountBalance: fail },
      "@/lib/finance/validation": { financeId: fail },
      "@/lib/finance/income": { incomeConfigInput: fail },
      "@/lib/finance/server": { FINANCE_USER_ID: 1, financeHeaders: {}, financeError: fail },
    };
    for (const [path, method] of [
      ["balances", "GET"],
      ["accounts/[id]/balance", "POST"],
      ["income-source-types", "GET"],
      ["income-source-types", "POST"],
      ["income-source-types/[id]", "PATCH"],
    ]) {
      const route = loadWorkModule(`src/app/api/finance/${path}/route.ts`, deps);
      assert.equal(
        (
          await route[method](
            { json: fail },
            {
              get params() {
                return fail();
              },
            },
          )
        ).status,
        status,
      );
    }
  }
});
