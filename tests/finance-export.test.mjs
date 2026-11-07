import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/finance/csv-export.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
const rules = {}; new Function("exports", "require", compiled)(rules, require);
test("CSV preserves exact money, escapes quotes/newlines and neutralizes spreadsheet formulas in text", () => {
  const output = rules.csv([["Merchant", "Notes", "Money"], ['=HYPERLINK("bad")', "line1\r\nline2", { decimal: "-900719925474099.1234" }], [" \t+cmd", "@SUM(A1)", "-1+2"]]);
  assert.ok(output.startsWith("\uFEFF")); assert.ok(output.includes('"\'=HYPERLINK(""bad"")"')); assert.ok(output.includes('"line1\r\nline2"')); assert.ok(output.includes('"-900719925474099.1234"')); assert.ok(output.includes('"\' \t+cmd"')); assert.ok(output.includes('"\'@SUM(A1)"')); assert.ok(output.includes('"\'-1+2"'));
  assert.throws(() => rules.csv([[{ decimal: "1e3" }]])); assert.throws(() => rules.csv([[{ decimal: "=1" }]]));
});
test("transaction export retains original and counted values plus both transfer currencies", () => {
  const output = rules.transactionCsv([{ id: 1, date: "2026-11-07", description: "Expense", type: "EXPENSE", account: { id: 1, name: "Bank" }, currency: "CAD", amount: "-100.0000", ledgerAmount: "-60.0000", excludedAmount: "40.0000", category: null, source: "MANUAL", transfer: { id: "pair", transactionId: 2, account: { name: "USD" }, currency: "USD", ledgerAmount: "72.5000" } }]);
  for (const value of ["-100.0000", "-60.0000", "40.0000", "CAD", "USD", "72.5000"]) assert.ok(output.includes(`"${value}"`));
});
test("metadata exports keep unknown gross blank, all allocations and authenticated document links", () => {
  const record = { id: 3, date: "2026-11-07", currency: "CAD", account: null, category: null, source: null, notes: "", allocations: [{ transactionId: 10, amount: "40.0000" }, { transactionId: 11, amount: "60.0000" }], document: { originalName: "private.pdf" }, grossAmount: null, netAmount: "100.0000", deductionsTotal: "0.0000", deductions: [], subtotal: "100.0000", tax: "0.0000", tip: "0.0000", total: "100.0000" };
  const receipt = rules.receiptCsv([record]), income = rules.incomeCsv([record]);
  assert.ok(receipt.includes("/api/finance/receipts/3/document?download=1")); assert.ok(income.includes("/api/finance/income/3/document?download=1")); assert.ok(receipt.includes('""transactionId"":10')); assert.ok(receipt.includes('""transactionId"":11')); assert.ok(!income.includes("undefined"));
});
