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
const validation = load("../src/lib/finance/validation.ts");
const transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
const receipts = load("../src/lib/finance/receipts.ts", { "./validation": validation, "./transactions": transactions });
const { incomeInput, incomeAmounts, incomeConfigInput, INCOME_KINDS } = load("../src/lib/finance/income.ts", { "./validation": validation, "./transactions": transactions, "./receipts": receipts });
const base = { sourceId: 1, description: "Regular pay", date: "2026-11-06", currency: "CAD", categoryId: 1, accountId: null, grossAmount: "2000", netAmount: "1500", deductions: [{ typeId: 1, amount: "500" }], transactionAction: "UNMATCHED", requestKey: "ad777fad-4114-46dd-8479-57bedade3883" };
test("income distinguishes gross, deductions, net and optional deposits using exact monetary text", () => {
  assert.equal(incomeInput(base).accountId, null);
  assert.equal(incomeInput(base).grossAmount, "2000.0000");
  assert.equal(incomeInput({ ...base, grossAmount: "" }).grossAmount, null);
  assert.deepEqual(incomeAmounts("2000", [{ amount: "500" }], "1500"), { deductionsTotal: "500.0000", difference: "0.0000" });
  assert.deepEqual(incomeAmounts(null, [{ amount: "1" }], "10"), { deductionsTotal: "1.0000", difference: null });
  assert.equal(incomeAmounts("900719925474099.1234", [{ amount: "0.1" }, { amount: "0.2" }], "900719925474098.8234").difference, "0.0000");
  assert.equal(incomeAmounts("100", [{ amount: "20" }], "81").difference, "-1.0000");
  assert.equal(incomeInput({ ...base, grossAmount: "0", netAmount: "0", deductions: [] }).netAmount, "0.0000");
  assert.equal(incomeInput({ ...base, accountId: 2, transactionAction: "LINK", transactionId: 4 }).transactionId, 4);
});
test("income inputs reject invalid dates, amounts, ownership, deduction lines and deposit instructions", () => {
  for (const patch of [{ userId: 2 }, { sourceId: 0 }, { description: " " }, { date: "2026-02-30" }, { grossAmount: 2000 }, { netAmount: "-1" }, { currency: "ZZZ" }, { periodStart: "2026-11-01" }, { periodStart: false }, { periodStart: "2026-11-02", periodEnd: "2026-11-01" }, { deductions: [{ typeId: 1, amount: "1" }, { typeId: 1, amount: "2" }] }, { deductions: [{ typeId: 1, amount: "-1" }] }, { deductions: [{ typeId: 1, amount: "1", name: "Injected" }] }, { deductions: Array.from({ length: 31 }, (_, index) => ({ typeId: index + 1, amount: "1" })) }, { transactionAction: "TRANSFER" }, { transactionAction: "CREATE" }, { transactionId: 1 }, { requestKey: "invalid" }, { acknowledgeMismatch: "true" }]) assert.throws(() => incomeInput({ ...base, ...patch }), validation.FinanceValidationError);
  const { requestKey, ...editing } = base;
  assert.throws(() => incomeInput(editing, true));
  assert.equal(incomeInput({ ...editing, expectedUpdatedAt: "2026-11-06T12:00:00Z" }, true).requestKey, null);
});
test("income sources and deduction types are customizable with strict owner-safe fields", () => {
  for (const kind of Object.keys(INCOME_KINDS)) assert.equal(incomeConfigInput({ name: "Employer", kind }, true).kind, kind);
  assert.equal(incomeConfigInput({ name: "  Ｔax   federal " }, false).normalizedName, "tax federal");
  assert.deepEqual(incomeConfigInput({ active: false }, false, true), { active: false });
  for (const [data, source] of [[{ name: "" }, false], [{ name: "Tax", userId: 2 }, false], [{ name: "Tax", active: "false" }, false], [{ name: "Employer", kind: "__proto__" }, true], [{ name: "Tax", kind: "EMPLOYMENT" }, false]]) assert.throws(() => incomeConfigInput(data, source));
});
