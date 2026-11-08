import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
function load(path) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  new Function("exports", code)(exports);
  return exports;
}
const { validateReadings, vocabularyReadings, acceptsJapaneseAnswer } = load("../src/lib/japanese/readings.ts");
const { practiceHistoryTotals } = load("../src/lib/japanese/practice-session-types.ts");
test("Kanji readings require at least one nonempty value and preserve all unique readings", () => {
  assert.deepEqual(validateReadings([" にち ", "ひ", "にち"], "", true), ["にち", "ひ"]);
  for (const value of [[], [""], ["ひ", " "], null, "ひ", [42]]) assert.throws(() => validateReadings(value, "", true));
  assert.deepEqual(validateReadings(undefined, "ひ", true), ["ひ"]);
  assert.throws(() => validateReadings(["にち", "ひ"], "", false), /Kanji category only/);
  assert.equal(validateReadings(Array.from({ length: 100 }, (_, i) => `reading ${i}`), "", true).length, 100);
});
test("typed practice accepts every saved reading or Japanese spelling, rejects other answers, and supports old snapshots", () => {
  const word = { japanese: "日", hiragana: "にち", readings: ["にち", "ひ", "か"] };
  for (const answer of ["にち", "ひ", "か", "日", " ひ "]) assert.equal(acceptsJapaneseAnswer(answer, word), true);
  for (const answer of ["", "月", "にち / ひ"]) assert.equal(acceptsJapaneseAnswer(answer, word), false);
  assert.deepEqual(vocabularyReadings({ hiragana: "ひ" }), ["ひ"]);
  assert.deepEqual(vocabularyReadings(word), ["にち", "ひ", "か"]);
});
test("daily totals sum session durations and signed percentage-point changes, excluding gaps between sessions", () => {
  const sessions = [{ durationSeconds: 65, averageBefore: 10, averageAfter: 10.5 }, { durationSeconds: 125, averageBefore: 50, averageAfter: 49.75 }];
  assert.deepEqual(practiceHistoryTotals(sessions), { durationSeconds: 190, percentagePoints: 0.25, partialTime: false, partialImprovement: false });
  const legacy = { durationSeconds: null, averageBefore: null, averageAfter: null };
  assert.deepEqual(practiceHistoryTotals([legacy]), { durationSeconds: null, percentagePoints: null, partialTime: true, partialImprovement: true });
  assert.deepEqual(practiceHistoryTotals([...sessions, legacy]), { durationSeconds: 190, percentagePoints: 0.25, partialTime: true, partialImprovement: true });
  assert.deepEqual(practiceHistoryTotals([]), { durationSeconds: 0, percentagePoints: 0, partialTime: false, partialImprovement: false });
});
