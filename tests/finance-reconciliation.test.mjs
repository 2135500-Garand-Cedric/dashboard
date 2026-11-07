import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
}
const validation = load("../src/lib/finance/validation.ts"), transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
const rules = load("../src/lib/finance/reconciliation.ts", { "./validation": validation, "./transactions": transactions });
test("reconciliation requests require exact decimals, explicit actions, versions and a retry key", () => {
  const body = { kind: "RECEIPT", sourceId: 1, transactionId: 2, action: "CONFIRM", amount: "900719925474099.1234", expectedRevision: 0, sourceVersion: "v1", targetVersion: "v1", requestKey: randomUUID(), note: "Split payment", acknowledgeAccountDifference: false };
  assert.equal(rules.matchInput(body).amount, body.amount);
  assert.equal(rules.matchInput({ ...body, action: "REJECT", amount: "0" }).amount, "0.0000");
  for (const patch of [{ amount: 10.23 }, { amount: "0" }, { amount: "-1" }, { amount: "1.23456" }, { expectedRevision: -1 }, { sourceId: "1" }, { userId: 2 }, { action: "MERGE" }, { requestKey: "bad" }, { kind: "AI" }, { acknowledgeAccountDifference: "yes" }]) assert.throws(() => rules.matchInput({ ...body, ...patch }));
});
test("deterministic suggestions explain proximity and text similarity, and identical purchases tie", () => {
  assert.equal(rules.textSimilarity("Café École", "CAFE ecole"), 1);
  assert.equal(rules.textSimilarity("Grocery store", "Rent deposit"), 0);
  const source = { accountId: 1, amount: "60.0000", remaining: "60.0000", date: "2026-11-01", label: "Grocery store" };
  const target = { ...source, date: "2026-11-03" };
  const exact = rules.matchScore(source, target);
  assert.equal(exact.score, 100); assert.ok(exact.reasons.includes("Same account"));
  assert.deepEqual(rules.matchScore(source, { ...target, id: 1 }), rules.matchScore(source, { ...target, id: 2 }));
  assert.ok(rules.matchScore(source, { ...target, date: "2026-11-20", label: "Different store" }).score < exact.score);
  assert.ok(rules.matchScore(source, { ...target, amount: "40.0000", remaining: "40.0000" }).reasons.some(reason => /Partial/.test(reason)));
});
