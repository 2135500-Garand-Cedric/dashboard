import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

function load(file) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const exports = {};
  new Function("exports", code)(exports);
  return exports;
}
const { getKnownKanji, isKanjiWritingEligible, getApplicableActivityIds } = load("../src/lib/japanese/kanji-writing.ts");
const { calculateActivityStats } = load("../src/lib/japanese/utils.ts");
const known = getKnownKanji([
  { japanese: "学", category: { name: "Kanji" } },
  { japanese: "校", category: { name: "kanji" } },
  { japanese: "本", category: { name: "Kanji" } },
  { japanese: "食べる", category: { name: "Verb" } },
]);

test("only Kanji-category characters establish known kanji", () => {
  assert.deepEqual([...known], ["学", "校", "本"]);
});

test("accepts compounds and mixed hiragana/katakana, including long vowels", () => {
  for (const text of ["学校", "学校の本", "本のカバー", "学校へ", "本ガ", "本カ\u3099"]) {
    assert.equal(isKanjiWritingEligible(text, known), true, text);
  }
});

test("rejects unknown kanji, kana-only words, Latin, numbers, punctuation and empty words", () => {
  for (const text of ["学校食", "学校1", "学校A", "学校。", "学校 本", "ほん", "カバー", "", null]) {
    assert.equal(isKanjiWritingEligible(text, known), false, String(text));
  }
});

test("writing contributes only to eligible dictionary forms", () => {
  assert.deepEqual(getApplicableActivityIds([1, 2, 3, 4, 5], true), [1, 2, 3, 4, 5]);
  assert.deepEqual(getApplicableActivityIds([1, 2, 3, 4, 5], false), [1, 2, 3, 4]);
  assert.deepEqual(getApplicableActivityIds([1, 2, 3, 4, 5], true, true), [1, 2, 3, 4]);
});

test("eligible base uses five exercises, forms use four, and missing statuses count as WEAK", () => {
  const links = [1, 2, 3, 4].map((activityId) => ({ activityId, status: "PERFECT" }));
  assert.deepEqual(calculateActivityStats(links, [1, 2, 3, 4, 5]), { worstStatus: "WEAK", percentage: "80.00" });
  assert.equal(calculateActivityStats([...links, { activityId: 5, status: "GOOD" }], [1, 2, 3, 4, 5]).percentage, "90.00");
  assert.equal(calculateActivityStats([...links, { activityId: 5, status: "WEAK" }], [1, 2, 3, 4]).percentage, "100.00");
  assert.deepEqual(calculateActivityStats([], []), { worstStatus: "WEAK", percentage: "0.00" });
});
