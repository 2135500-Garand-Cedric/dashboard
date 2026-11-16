import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(name, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(new URL(`../src/lib/finance/${name}.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  new Function("exports", "require", code)(exports, (key) => deps[key] ?? require(key));
  return exports;
}
const validation = load("validation"),
  transactions = load("transactions", { "./validation": validation }),
  csv = load("statement-csv", { "./validation": validation, "./transactions": transactions });
const imports = load("statement-imports", {
  "./validation": validation,
  "./transactions": transactions,
  "./statement-csv": csv,
});
const fixed = load("fixed-statement", {
  "./validation": validation,
  "./transactions": transactions,
  "./statement-imports": imports,
});
const period = { periodStart: "2026-11-01", periodEnd: "2026-11-30" };
const parse = (text) =>
  csv.parseStatement(Buffer.from(text), { delimiter: "AUTO", encoding: "AUTO", headerRow: 1 });
test("fixed statements preserve reference strings, exact amounts, direction and the selected period", () => {
  const parsed = parse(
    'date,ref #,description,amount\n2026-11-06,00001,"Coffee, lunch",-12.3456\n2026-11-07,00002,Pay,+1000.10\n',
  );
  assert.deepEqual(fixed.fixedStatementPeriod(period, parsed), { ...period, matchingOnly: true });
  const expense = fixed.fixedReview(parsed.rows[0].cells, "CAD"),
    income = fixed.fixedReview(parsed.rows[1].cells, "CAD");
  assert.equal(expense.reference, "00001");
  assert.equal(expense.description, "Coffee, lunch");
  assert.equal(expense.amount, "-12.3456");
  assert.equal(expense.type, "EXPENSE");
  assert.equal(income.amount, "1000.1000");
  assert.equal(income.type, "INCOME");
  fixed.assertFixedReview(expense, { ...expense, type: "TRANSFER" });
  fixed.assertFixedReview(income, { ...income, type: "TRANSFER" });
});
test("fixed statements reject missing periods, extra/reordered columns, invalid or zero amounts, duplicate references and out-of-period dates", () => {
  const good = parse("date,ref #,description,amount\n2026-11-06,1,Purchase,-12\n");
  for (const value of [
    {},
    { periodStart: "2026-11-30", periodEnd: "2026-11-01" },
    { periodStart: "2026-11-01", periodEnd: "2026-11-31" },
  ])
    assert.throws(() => fixed.fixedStatementPeriod(value, good));
  for (const text of [
    "date,description,ref #,amount\n2026-11-06,Purchase,1,-12\n",
    "date,ref #,description,amount,type\n2026-11-06,1,Purchase,-12,EXPENSE\n",
    "date,ref #,description,amount\n2026-12-01,1,Purchase,-12\n",
    "date,ref #,description,amount\n2026-11-06,1,Purchase,0\n",
    "date,ref #,description,amount\n2026-11-06,1,Purchase,nope\n",
    "date,ref #,description,amount\n2026-11-06,1,Purchase,-12\n2026-11-07,1,Another purchase,-12\n",
  ])
    assert.throws(() => fixed.fixedStatementPeriod(period, parse(text)));
});
test("matching cannot rewrite bank values or turn a signed row into an incompatible type", () => {
  const source = fixed.fixedReview(["2026-11-06", "00001", "Purchase", "-12"], "CAD");
  for (const patch of [
    { amount: "-10.0000" },
    { date: "2026-11-07" },
    { description: "Edited" },
    { currency: "USD" },
    { reference: "2" },
    { type: "INCOME" },
    { type: "REFUND" },
    { categoryId: 1 },
    { otherAccountId: 2 },
    { allowDuplicate: true },
  ])
    assert.throws(() => fixed.assertFixedReview(source, { ...source, ...patch }));
});

const prefill = load("statement-prefill", {
  "./transactions": transactions,
  "./validation": validation,
});
test("statement form prefill validates exact money, date, account and currency without creating activity", () => {
  assert.deepEqual(
    prefill.statementPrefill({
      date: "2026-11-06",
      description: "Groceries & lunch",
      amount: "12.3456",
      accountId: "12",
      currency: "CAD",
    }),
    {
      date: "2026-11-06",
      description: "Groceries & lunch",
      amount: "12.3456",
      accountId: "12",
      currency: "CAD",
    },
  );
  assert.deepEqual(
    prefill.statementPrefill({ date: "bad", amount: "-2", accountId: "0", currency: "FAKE" }),
    {},
  );
  assert.deepEqual(
    prefill.statementPrefill({ date: ["2026-11-06"], amount: ["12"], accountId: ["1"] }),
    {},
  );
});
