import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => { assert.ok(name in dependencies, `Missing ${name}`); return dependencies[name]; });
  return exports;
}
const validation = load("../src/lib/finance/validation.ts");
const { transactionInput, decimalAmount, calendarDate, displayAmount } = load("../src/lib/finance/transactions.ts", { "./validation": validation });
const base = { date: "2026-11-05", description: "Cash purchase", amount: "50", currency: "CAD", type: "EXPENSE", accountId: 1, categoryId: 2, requestKey: "ad777fad-4114-46dd-8479-57bedade3883" };

test("transaction money remains exact decimal text, including values beyond floating point precision", () => {
  assert.equal(decimalAmount("900719925474099.1234"), "900719925474099.1234");
  assert.equal(decimalAmount("0.1"), "0.1000");
  assert.equal(decimalAmount("-5.20", true), "-5.2000");
  assert.equal(displayAmount("-900719925474099.1234", "CAD"), "−900,719,925,474,099.1234 CAD");
  assert.equal(displayAmount("0.3000", "USD"), "+0.30 USD");
  for (const value of [0.1, "0", "-0.0000", "-5", "1e3", "1,000", "1.00001", "1000000000000000", "NaN", "01", "--1"]) assert.throws(() => decimalAmount(value), validation.FinanceValidationError);
});
test("dates are calendar dates and transaction categories, ownership fields, and directions are validated", () => {
  assert.equal(calendarDate("2024-02-29"), "2024-02-29");
  for (const date of ["2026-02-29", "2026-11-31", "2026-13-01", "0000-01-01", "2026-11-05T23:00:00Z"]) assert.throws(() => calendarDate(date));
  assert.equal(transactionInput(base).amount, "50.0000");
  assert.equal(transactionInput(base).counterparty, null);
  for (const changes of [{ userId: 2 }, { source: "IMPORTED" }, { categoryId: null }, { accountId: 2147483648 }, { type: "__proto__" }, { currency: "ZZZ" }, { requestKey: "bad" }, { description: " " }, { notes: "\0" }, { allowDuplicate: "yes" }]) assert.throws(() => transactionInput({ ...base, ...changes }));
  assert.equal(transactionInput({ ...base, type: "REFUND" }).type, "REFUND");
  assert.equal(transactionInput({ ...base, type: "ADJUSTMENT", categoryId: null, amount: "-4" }).amount, "-4.0000");
  assert.throws(() => transactionInput({ ...base, type: "TRANSFER", categoryId: null, destinationAccountId: 1 }));
  assert.equal(transactionInput({ ...base, type: "TRANSFER", categoryId: null, destinationAccountId: 3, destinationAmount: "35" }).destinationAmount, "35.0000");
  const { requestKey, ...editing } = base;
  assert.throws(() => transactionInput(editing, true), /version/);
  assert.equal(transactionInput({ ...editing, expectedUpdatedAt: "2026-11-05T12:00:00Z" }, true).requestKey, null);
});
