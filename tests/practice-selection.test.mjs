import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";
const { practicePriority, selectPracticeWords } = loadWorkModule(
  "src/lib/japanese/practice-selection.ts",
);
const now = new Date("2026-11-16T22:00:00Z");

test("review becomes due at exactly 14 elapsed days, independent of local calendar/DST", () => {
  assert.equal(
    practicePriority({ status: "PERFECT", lastPracticed: "2026-11-02T22:00:00Z" }, now),
    "WEAK",
  );
  assert.equal(
    practicePriority({ status: "GOOD", lastPracticed: "2026-11-02T22:00:00.001Z" }, now),
    "GOOD",
  );
  assert.equal(practicePriority({ status: "PERFECT", lastPracticed: null }, now), "WEAK");
});
test("old perfect/good words compete in the weak pool while their actual status and input order stay unchanged", () => {
  const due = [
    { id: 1, status: "PERFECT", lastPracticed: "2026-10-01T00:00:00Z" },
    { id: 2, status: "GOOD", lastPracticed: "2026-10-02T00:00:00Z" },
  ];
  const words = [
    ...due,
    { id: 3, status: "GOOD", lastPracticed: now },
    { id: 4, status: "PERFECT", lastPracticed: now },
  ];
  const snapshot = structuredClone(words);
  const selected = selectPracticeWords(words, 2, now);
  assert.deepEqual(selected.map((word) => word.id).sort(), [1, 2]);
  assert.equal(selected.find((word) => word.id === 1).status, "PERFECT");
  assert.equal(selected.find((word) => word.id === 2).status, "GOOD");
  assert.deepEqual(words, snapshot);
  assert.equal(selectPracticeWords(words, 0, now).length, 0);
  assert.equal(selectPracticeWords(words, 100, now).length, words.length);
});
test("the same vocabulary can be due in one activity and still fresh in another", () => {
  assert.equal(
    practicePriority({ status: "PERFECT", lastPracticed: "2026-11-01T22:00:00Z" }, now),
    "WEAK",
  );
  assert.equal(
    practicePriority({ status: "PERFECT", lastPracticed: "2026-11-15T22:00:00Z" }, now),
    "PERFECT",
  );
});
