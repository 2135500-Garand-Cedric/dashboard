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
const kanji = load("../src/lib/japanese/kanji-writing.ts");
const utils = load("../src/lib/japanese/utils.ts");
const progress = load("../src/lib/japanese/vocabulary-progress.ts", { "./kanji-writing": kanji, "./utils": utils });
const sessions = load("../src/lib/japanese/practice-sessions.ts", { "@/lib/prisma": {}, "./vocabulary-progress": progress, "./progress-history": {} });
const { parsePracticeSession, buildPracticeReview, serializePractice } = sessions;
const input = () => ({ sessionKey: "12345678-1234-4234-8234-123456789abc", activity: 1, startedAt: "2026-11-06T01:00:00Z", completedAt: "2026-11-06T01:02:05Z", categories: [], starredOnly: false, updates: [{ activityVocabId: 11, status: "PERFECT" }] });

test("session validation rejects missing timing, repeated words, invalid ratings and invalid filters", () => {
  assert.equal(parsePracticeSession(input()).updates.length, 1);
  for (const invalid of [null, {}, { ...input(), sessionKey: "bad" }, { ...input(), startedAt: null }, { ...input(), completedAt: "2026-11-06T00:00:00Z" }, { ...input(), updates: [] }, { ...input(), updates: [...input().updates, ...input().updates] }, { ...input(), updates: [{ activityVocabId: 11, status: "OTHER" }] }, { ...input(), categories: ["1"] }, { ...input(), starredOnly: "true" }]) assert.throws(() => parsePracticeSession(invalid), sessions.PracticeSessionError);
});

function fixture() {
  const link = (id, activityId, status = "WEAK") => ({ id, activityId, status });
  const vocabulary = [
    { id: 1, english: "learn", japanese: "学ぶ", hiragana: "まなぶ", readings: ["まなぶ", "がく"], category: { id: 1, name: "Verb" }, activityVocab: [link(11, 1), link(12, 5)], verbForms: [{ form: "学べば", reading: "まなべば", formType: { name: "ba" }, activityVocab: [link(13, 1)] }] },
    { id: 2, english: "study", japanese: "学", hiragana: "がく", category: { id: 3, name: "Kanji" }, activityVocab: [], verbForms: [] },
  ];
  return {
    vocabulary,
    db: { vocabulary: { findMany: async () => vocabulary }, activity: { findMany: async () => [1, 2, 3, 4, 5].map(id => ({ id, activity: `Activity ${id}` })) }, category: { findMany: async () => [] } },
  };
}

test("read-only overview uses the same whole-list average, including verb forms and kanji eligibility", async () => {
  const { db, vocabulary } = fixture();
  const before = structuredClone(vocabulary);
  const review = await buildPracticeReview(db, { ...input(), updates: [{ activityVocabId: 11, status: "PERFECT" }, { activityVocabId: 13, status: "GOOD" }] });
  assert.equal(review.wordCount, 2);
  assert.equal(review.perfectCount, 1);
  assert.equal(review.goodCount, 1);
  assert.equal(review.weakCount, 0);
  assert.equal(review.durationSeconds, 125);
  assert.equal(review.averageBefore, 0);
  // Verb base: 20%; ba form: 12.5%; verb: 16.25%; two-word list: 8.125%.
  assert.equal(review.averageAfter, 8.125);
  assert.equal(review.words[1].english, "learn (ba)");
  assert.equal(review.words[1].japanese, "学べば");
  assert.deepEqual(review.words[0].readings, ["まなぶ", "がく"]);
  assert.deepEqual(review.words[1].readings, ["まなべば"]);
  assert.deepEqual(review.selectedCategories, []);
  assert.deepEqual(vocabulary, before, "preview must not mutate progress or the supplied records");
});

test("kanji sessions rate only base words and reject links from other activities", async () => {
  const { db } = fixture();
  const review = await buildPracticeReview(db, { ...input(), activity: 5, updates: [{ activityVocabId: 12, status: "PERFECT" }] });
  assert.equal(review.activityName, "Activity 5");
  assert.equal(review.words[0].english, "learn (dictionary form)");
  await assert.rejects(buildPracticeReview(db, { ...input(), activity: 5 }), /does not belong to this activity/);
  await assert.rejects(buildPracticeReview(db, { ...input(), activity: 5, updates: [{ activityVocabId: 13, status: "GOOD" }] }), /does not belong/);
});

test("old practice summaries remain readable without inventing missing details", () => {
  const review = serializePractice({ id: 1, activityId: 1, activity: { activity: "Reading" }, activityName: null, date: new Date(input().completedAt), startedAt: null, completedAt: null, durationSeconds: null, averageBefore: null, averageAfter: null, selectedCategories: null, words: null, starredOnly: false, wordCount: 2, goodCount: 1, weakCount: 1, perfectCount: 0 });
  assert.equal(review.hasDetails, false);
  assert.equal(review.words, null);
  assert.equal(review.averageBefore, null);
  assert.equal(review.wordCount, 2);
});
