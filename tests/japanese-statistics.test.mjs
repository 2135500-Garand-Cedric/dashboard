import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) => {
    assert.ok(name in dependencies, `Missing test dependency ${name}`);
    return dependencies[name];
  });
  return exports;
}
const dates = load("../src/lib/japanese/dates.ts");
const { buildJapaneseStatistics, statisticsStartDate } = load("../src/lib/japanese/statistics.ts", { "./dates": dates });
const kanji = load("../src/lib/japanese/kanji-writing.ts");
const utils = load("../src/lib/japanese/utils.ts");
const { vocabularyProgress } = load("../src/lib/japanese/vocabulary-progress.ts", { "./kanji-writing": kanji, "./utils": utils });

test("Toronto day includes evening practice after midnight UTC in summer and winter", () => {
  for (const [now, start, end] of [
    ["2026-10-18T01:30:00Z", "2026-10-17T04:00:00.000Z", "2026-10-18T04:00:00.000Z"],
    ["2026-12-18T02:30:00Z", "2026-12-17T05:00:00.000Z", "2026-12-18T05:00:00.000Z"],
  ]) {
    const range = dates.torontoDayRange(new Date(now));
    assert.equal(range.start.toISOString(), start);
    assert.equal(range.end.toISOString(), end);
  }
});

test("Toronto day ranges handle both daylight saving transitions", () => {
  const spring = dates.torontoDayRange(new Date("2026-03-08T18:00:00Z"));
  const autumn = dates.torontoDayRange(new Date("2026-11-01T18:00:00Z"));
  assert.equal((spring.end - spring.start) / 3600000, 23);
  assert.equal((autumn.end - autumn.start) / 3600000, 25);
  assert.equal(dates.torontoDateKey(new Date("2026-10-18T04:00:00Z")), "2026-10-18");
});

test("statistics fill all 30 days, split writing from other practice, and bucket by Toronto day", () => {
  const data = buildJapaneseStatistics(new Date("2026-10-18T01:00:00Z"), [
    { date: new Date("2026-10-18T00:30:00Z"), activityId: 1, perfectCount: 3, goodCount: 2, weakCount: 1, wordCount: 6 },
    { date: new Date("2026-10-18T00:45:00Z"), activityId: 5, perfectCount: 1, goodCount: 0, weakCount: 2, wordCount: 3 },
    { date: new Date("2026-08-01T12:00:00Z"), activityId: 1, perfectCount: 99, goodCount: 0, weakCount: 0, wordCount: 99 },
  ], [
    { addedDate: new Date("2026-10-18T00:00:00Z"), category: { name: "Verb" } },
    { addedDate: new Date("2026-01-01T12:00:00Z"), category: null },
  ], [{ percentage: 50, worstStatus: "GOOD" }, { percentage: 0, worstStatus: "WEAK" }], [
    { day: "2026-10-15", average: 20 }, { day: "2026-10-17", average: 25 },
  ]);
  assert.equal(data.days.length, 30);
  assert.equal(data.days[0].date, "2026-09-18");
  assert.equal(data.days[0].average, null);
  assert.equal(data.days.at(-2).average, 20);
  assert.deepEqual(data.days.at(-1), {
    date: "2026-10-17", vocab: { perfect: 3, good: 2, weak: 1, total: 6 },
    kanji: { perfect: 1, good: 0, weak: 2, total: 3 }, added: { perfect: 0, good: 1, weak: 0, total: 1 }, average: 25,
  });
  assert.deepEqual(data.summary, { practiced: 6, kanji: 3, added: 1, vocabularyCount: 2, average: 25 });
  assert.ok(data.categories.some((category) => category.name === "Uncategorized"));
});

test("history carries a prior snapshot into the window and empty data has no invented averages", () => {
  const date = new Date("2026-10-17T12:00:00Z");
  const empty = buildJapaneseStatistics(date, [], [], [], []);
  assert.ok(empty.days.every((day) => day.average === null && day.vocab.total === 0));
  assert.equal(empty.summary.average, 0);
  const carried = buildJapaneseStatistics(date, [], [], [], [{ day: "2026-08-01", average: 32 }]);
  assert.ok(carried.days.every((day) => day.average === 32));
});

test("list and history use the same equal-weight base/form calculation", () => {
  const perfect = [1, 2, 3, 4, 5].map((activityId) => ({ activityId, status: "PERFECT" }));
  const values = vocabularyProgress([
    { japanese: "学", category: { name: "Kanji" }, activityVocab: perfect, verbForms: [] },
    { japanese: "学ぶ", category: { name: "Verb" }, activityVocab: perfect, verbForms: [{ activityVocab: [] }] },
  ], [1, 2, 3, 4, 5]);
  assert.equal(values[0].percentage, 100);
  assert.equal(values[1].percentage, 50);
  assert.equal(values[1].worstStatus, "WEAK");
});

test("year view sums 12 calendar months and uses each month-end average", () => {
  const now = new Date("2026-03-17T12:00:00Z");
  const practice = (date, count, activityId = 1) => ({
    date: new Date(date), activityId, perfectCount: count, goodCount: 0, weakCount: 0, wordCount: count,
  });
  const data = buildJapaneseStatistics(now, [
    practice("2026-03-01T04:59:00Z", 3), // Still February in Toronto.
    practice("2026-03-01T05:00:00Z", 4),
    practice("2026-03-02T12:00:00Z", 5, 5),
    practice("2025-03-31T12:00:00Z", 99), // Outside the year window.
    practice("2026-04-01T12:00:00Z", 99), // Future date.
  ], [{ addedDate: new Date("2026-02-15T12:00:00Z"), category: { name: "Vocabulary" } }],
  [{ percentage: 70, worstStatus: "GOOD" }], [
    { day: "2026-01-31", average: 25 },
    { day: "2026-02-01", average: 40 },
    { day: "2026-02-28", average: 50 },
    { day: "2026-03-01", average: 60 },
    { day: "2026-03-16", average: 70 },
    { day: "2026-03-31", average: 99 },
  ], "year");
  assert.equal(data.period, "year");
  assert.equal(data.days.length, 12);
  assert.equal(data.days[0].date, "2025-04-01");
  assert.equal(data.days[0].average, null);
  assert.equal(data.days.at(-3).average, 25);
  assert.equal(data.days.at(-2).average, 50);
  assert.equal(data.days.at(-2).vocab.total, 3);
  assert.equal(data.days.at(-2).added.good, 1);
  assert.equal(data.days.at(-1).average, 70);
  assert.equal(data.days.at(-1).vocab.total, 4);
  assert.equal(data.days.at(-1).kanji.total, 5);
  assert.equal(data.summary.practiced, 7);
  assert.equal(data.summary.kanji, 5);
  assert.equal(statisticsStartDate(now, "year"), "2025-04-01");
  assert.equal(statisticsStartDate(now, "month"), "2026-02-16");
});

test("monthly averages include leap day and carry forward when month-end has no snapshot", () => {
  const data = buildJapaneseStatistics(new Date("2024-04-10T12:00:00Z"), [], [], [], [
    { day: "2024-02-28", average: 35 },
    { day: "2024-02-29", average: 48 },
    { day: "2024-04-01", average: 77 },
  ], "year");
  assert.equal(data.days.find((day) => day.date === "2024-02-01").average, 48);
  assert.equal(data.days.find((day) => day.date === "2024-03-01").average, 48);
  assert.equal(data.days.at(-1).average, 77);
});
