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
const csv = load("../src/lib/finance/statement-csv.ts", { "./validation": validation, "./transactions": transactions });
const imports = load("../src/lib/finance/statement-imports.ts", { "./validation": validation, "./transactions": transactions, "./statement-csv": csv });
const parsing = { delimiter: "AUTO", encoding: "AUTO", headerRow: 1 };
const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2, debitColumn: null, creditColumn: null, currencyColumn: null, typeColumn: null, referenceColumn: null, counterpartyColumn: null, notesColumn: null, categoryColumn: null, amountMode: "SIGNED", signConvention: "INFLOW_POSITIVE", debitDirection: "OUTFLOW", dateFormat: "YYYY-MM-DD", decimal: ".", outflowType: "EXPENSE", inflowType: "REVIEW", expenseCategoryId: 1, incomeCategoryId: 2, typeRules: [], confirmed: true };

test("CSV variations preserve source cells, quoting, line numbers and encodings", () => {
  const input = Buffer.from('\uFEFFDate,Description,Amount\r\n2026-11-06,"Cafe, lunch and ""tea""",-12.50\r\n2026-11-07,"Multi\nline",20\r\n');
  const parsed = csv.parseStatement(input, parsing);
  assert.deepEqual(parsed.headers, ["Date", "Description", "Amount"]);
  assert.deepEqual(parsed.rows[0], { cells: ["2026-11-06", 'Cafe, lunch and "tea"', "-12.50"], line: 2 });
  assert.equal(parsed.rows[1].cells[1], "Multi\nline");
  assert.equal(csv.parseStatement(Buffer.from("sep=;\nDate;Description;Amount\n06/11/2026;Épicerie;12,50\n"), parsing).parsing.detectedDelimiter, ";");
  assert.equal(csv.parseStatement(Buffer.from("sep=;\nDate;Description;Amount\n06/11/2026;Épicerie;12,50\n"), parsing).rows[0].line, 3);
  assert.equal(csv.parseStatement(Buffer.from("Date\tDescription\tAmount\n2026-11-06\tStore\t-2\n"), parsing).parsing.detectedDelimiter, "\t");
  const prefaced = csv.parseStatement(Buffer.from("Account statement\n\nDate;Description;Amount\n2026-11-06;Store;-2\n"), { ...parsing, headerRow: 3 });
  assert.equal(prefaced.rows[0].line, 4);
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Date,Description,Amount\n2026-11-06,École,-2", "utf16le")]);
  assert.equal(csv.parseStatement(utf16, parsing).rows[0].cells[1], "École");
  const latin = Buffer.from("Date;Description;Amount\n2026-11-06;Caf\xe9;-2", "latin1");
  assert.throws(() => csv.parseStatement(latin, parsing), /decode/);
  assert.equal(csv.parseStatement(latin, { ...parsing, encoding: "WINDOWS-1252" }).rows[0].cells[1], "Café");
  for (const text of ['Date,Name,Amount\n2026-11-06,"Unclosed,1', 'Date,Name,Amount\n2026-11-06,"Bad"X,1', '<html>fake CSV</html>', 'Date,Name\n\0,bad']) assert.throws(() => csv.parseStatement(Buffer.from(text), parsing));
  assert.throws(() => csv.parseStatement(Buffer.from(`Date,Description,Amount\n${Array.from({ length: 1001 }, () => "2026-11-06,Store,-2").join("\n")}`), parsing), /1 to 1000|1,000|1000/);
});
test("statement date formats are explicit, calendar-safe and independent of timezone shifts", () => {
  for (const [value, format] of [["2026-11-06", "YYYY-MM-DD"], ["2026/11/6", "YYYY/MM/DD"], ["11/06/2026", "MM/DD/YYYY"], ["06/11/2026", "DD/MM/YYYY"], ["11-6-2026", "MM-DD-YYYY"], ["6-11-2026", "DD-MM-YYYY"], ["20261106", "YYYYMMDD"], ["11/06/26", "MM/DD/YY"], ["06/11/26", "DD/MM/YY"], ["6 nov. 2026", "D MMM YYYY"], ["Nov 6, 2026", "MMM D, YYYY"], ["2026-11-06T23:30:00-05:00", "ISO"]]) assert.equal(csv.statementDate(value, format), "2026-11-06");
  assert.equal(csv.statementDate("6 févr. 2026", "D MMM YYYY"), "2026-02-06");
  assert.equal(csv.statementDate("6 août 2026", "D MMM YYYY"), "2026-08-06");
  assert.notEqual(csv.statementDate("06/11/2026", "DD/MM/YYYY"), csv.statementDate("06/11/2026", "MM/DD/YYYY"));
  for (const value of ["2026-02-29", "2026-11-31", "0000-01-01"]) assert.throws(() => csv.statementDate(value, "YYYY-MM-DD"));
});
test("locale money normalization is decimal-safe and rejects ambiguous or incompatible formatting", () => {
  for (const [value, decimal, result] of [["$1,234.56", ".", "1234.5600"], ["(1 234,56)", ",", "-1234.5600"], ["1.234,5678", ",", "1234.5678"], ["−0.10", ".", "-0.1000"], ["C$12.50", ".", "12.5000"], ["CA$12.50-", ".", "-12.5000"], ["CAD 00012.30", ".", "12.3000"], ["900719925474099.1234", ".", "900719925474099.1234"], ["0", ".", "0.0000"]]) assert.equal(csv.statementAmount(value, decimal, "CAD"), result);
  for (const value of ["1,23", "1,23.45", "1.23456", "1e3", "=1+1", "USD 10", "US$10", "€10", "£10", "¥10", "(−1)", "Infinity", "1000000000000000"]) assert.throws(() => csv.statementAmount(value, ".", "CAD"));
});
test("mapping requires explicit amount conventions and never infers purpose from sign alone", () => {
  const checked = imports.mappingInput(mapping, 4);
  assert.equal(imports.mappedReview(["2026-11-06", "Store", "-12.5"], checked, "CAD").type, "EXPENSE");
  assert.equal(imports.mappedReview(["2026-11-06", "Card payment", "12.5"], checked, "CAD").type, null);
  const card = imports.mappingInput({ ...mapping, signConvention: "OUTFLOW_POSITIVE" }, 4);
  assert.equal(imports.mappedReview(["2026-11-06", "Card purchase", "12.5"], card, "CAD").amount, "-12.5000");
  const separate = imports.mappingInput({ ...mapping, amountMode: "DEBIT_CREDIT", amountColumn: null, debitColumn: 2, creditColumn: 3 }, 4);
  assert.equal(imports.mappedReview(["2026-11-06", "Debit purchase", "50", ""], separate, "CAD").amount, "-50.0000");
  assert.equal(imports.mappedReview(["2026-11-06", "Credit", "0", "1500"], separate, "CAD").amount, "1500.0000");
  assert.match(imports.mappedReview(["2026-11-06", "Bad", "5", "5"], separate, "CAD").amount, /Both debit/);
  assert.match(imports.mappedReview(["2026-11-06", "Invalid grouping", "1.0000"], { ...checked, decimal: "," }, "CAD").amount, /Invalid amount/);
  for (const patch of [{ confirmed: false }, { amountColumn: 100 }, { userId: 2 }, { dateFormat: "AUTO" }, { inflowType: "EXPENSE" }, { outflowType: "INCOME" }, { amountMode: "DEBIT_CREDIT", debitColumn: 2, creditColumn: 2 }]) assert.throws(() => imports.mappingInput({ ...mapping, ...patch }, 4));
  const row = imports.mappedReview(["2026-11-06", "Store", "-12.5"], checked, "CAD");
  assert.throws(() => imports.reviewInput({ ...row, originalData: { changed: true } }));
  assert.throws(() => imports.reviewInput({ ...row, matchId: 2147483648 }));
});
