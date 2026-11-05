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
const { accountInput, categoryInput, financeId, FinanceValidationError } = validation;
const account = { name: "Everyday account", type: "CHEQUING", currency: "CAD", maskedIdentifier: "**** 1234" };

test("account inputs normalize names and currencies, support all account types, and use strict booleans", () => {
  for (const type of Object.keys(validation.ACCOUNT_TYPES)) {
    const result = accountInput({ ...account, name: "  Everyday   Ａccount ", currency: " cad ", type });
    assert.equal(result.name, "Everyday Account");
    assert.equal(result.normalizedName, "everyday account");
    assert.equal(result.currency, "CAD");
    assert.equal(result.active, true);
  }
  assert.deepEqual(accountInput({ active: false }, true), { active: false });
  assert.equal(accountInput({ ...account, maskedIdentifier: "" }).maskedIdentifier, null);
  assert.equal(accountInput({ ...account, maskedIdentifier: "1234" }).maskedIdentifier, "1234");
  assert.equal(accountInput({ ...account, maskedIdentifier: "•••• 1234" }).maskedIdentifier, "•••• 1234");
});

test("account validation rejects full identifiers, invalid currency/types and client-controlled ownership", () => {
  for (const invalid of [null, [], {}, { ...account, name: " " }, { ...account, name: "x".repeat(101) }, { ...account, currency: "ZZZ" }, { ...account, type: "toString" }, { ...account, type: "__proto__" }, { ...account, active: "false" }, { ...account, userId: 2 }, { ...account, maskedIdentifier: "1234567890123456" }, { ...account, maskedIdentifier: "1234 5678 9012 3456" }, { ...account, maskedIdentifier: "**** 12345678" }, { ...account, maskedIdentifier: 1234 }]) {
    assert.throws(() => accountInput(invalid), FinanceValidationError);
  }
  assert.throws(() => accountInput({}, true), /No account changes/);
});

test("finance categories have separate income/expense types, normalized names and partial status edits", () => {
  assert.deepEqual(categoryInput({ name: "  Dining   out ", type: "EXPENSE" }), { name: "Dining out", normalizedName: "dining out", type: "EXPENSE", active: true });
  assert.equal(categoryInput({ name: "Salary", type: "INCOME" }).type, "INCOME");
  assert.deepEqual(categoryInput({ active: false }, true), { active: false });
  for (const invalid of [{ name: "Salary", type: "TRANSFER" }, { name: "Food", type: "EXPENSE", userId: 2 }, { name: "Food", type: "EXPENSE", active: 0 }]) assert.throws(() => categoryInput(invalid), FinanceValidationError);
  for (const id of ["0", "-1", "1.1", "1abc", "9007199254740993"]) assert.throws(() => financeId(id), /Invalid record/);
  assert.equal(financeId("123"), 123);
});

test("finance error responses never echo ORM internals or financial payloads", async () => {
  const { financeError } = load("../src/lib/finance/server.ts", { "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } }, "./validation": validation });
  const duplicate = financeError({ code: "P2002", message: "SECRET_FINANCIAL_PAYLOAD" }, "create account");
  assert.equal(duplicate.status, 409);
  assert.ok(!(await duplicate.text()).includes("SECRET"));
  assert.equal(financeError(new SyntaxError("invalid"), "create account").status, 400);
  const original = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values.join(" "));
  try {
    const failure = financeError(new Error("SECRET_FINANCIAL_PAYLOAD"), "create the account");
    assert.equal(failure.status, 500);
    assert.ok(!(await failure.text()).includes("SECRET"));
    assert.ok(logs.every(message => !message.includes("SECRET")));
  } finally { console.error = original; }
});
