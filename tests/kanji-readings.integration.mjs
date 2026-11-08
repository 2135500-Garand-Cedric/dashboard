import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const exports = {}; new Function("exports", "require", code)(exports, name => dependencies[name] ?? require(name)); return exports;
}
test("Kanji add/edit, vocabulary/practice APIs and saved session snapshots retain all readings; invalid edits roll back", { skip: process.env.RUN_KANJI_READINGS_DB_TEST !== "1" }, async () => {
  const generated = await import("../src/generated/prisma/index.js"), prisma = new generated.PrismaClient(), rollback = new Error("ROLLBACK_KANJI_READINGS_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      let index = 0;
      const db = { ...tx, $transaction: async callback => {
        const name = `readings_${++index}`; await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const result = await callback(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      } };
      const readings = load("../src/lib/japanese/readings.ts"), kanji = load("../src/lib/japanese/kanji-writing.ts"), utils = load("../src/lib/japanese/utils.ts");
      const progress = load("../src/lib/japanese/vocabulary-progress.ts", { "./kanji-writing": kanji, "./utils": utils });
      const dependencies = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } }, "@/lib/prisma": { prisma: db }, "@/generated/prisma": generated, "@/lib/japanese/readings": readings, "@/lib/japanese/conjugation": load("../src/lib/japanese/conjugation.ts"), "@/lib/japanese/dates": {}, "@/lib/japanese/progress-history": { recordJapaneseProgress: async () => {} }, "@/lib/japanese/utils": utils, "@/lib/japanese/kanji-writing": kanji, "@/lib/japanese/vocabulary-progress": progress };
      const add = load("../src/app/api/japanese-practice/vocabulary/add/route.ts", dependencies), edit = load("../src/app/api/japanese-practice/vocabulary/[id]/route.ts", dependencies), vocabulary = load("../src/app/api/japanese-practice/vocabulary/route.ts", dependencies);
      const category = await tx.category.findFirst({ where: { name: { equals: "kanji", mode: "insensitive" } } }); assert.ok(category);
      const request = (body, method = "POST") => new Request("http://localhost/api/vocabulary", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const english = `__readings_${randomUUID()}`;
      const response = await add.POST(request({ english, japanese: "日", readings: ["にち", "ひ", "か"], categoryId: category.id, starred: true }));
      assert.equal(response.status, 200); const word = (await response.json()).vocabulary; assert.equal(word.hiragana, "にち"); assert.deepEqual(word.readings, ["にち", "ひ", "か"]);
      const context = { params: Promise.resolve({ id: String(word.id) }) };
      const updated = await edit.PATCH(request({ readings: ["ひ", "にち", "じつ", "か"] }, "PATCH"), context); assert.equal(updated.status, 200);
      assert.equal((await updated.json()).vocabulary.hiragana, "ひ");
      const expected = ["ひ", "にち", "じつ", "か"];
      assert.deepEqual((await (await edit.GET(request({}), context)).json()).vocabulary.readings, expected);
      assert.deepEqual((await (await vocabulary.GET()).json()).find(value => value.id === word.id).readings, expected);
      for (const activity of [1, 2, 3, 4, 5]) {
        const result = await vocabulary.POST(request({ activity, categories: [category.id], nbWords: 1000 })); assert.equal(result.status, 200);
        const body = await result.json(); const selected = body.words.find(value => value.japanese === "日" && value.english === english); assert.ok(selected, JSON.stringify(Object.keys(body))); assert.deepEqual(selected.readings, expected); assert.equal(selected.category_name, category.name);
      }
      for (const bad of [[], [" "], ["にち", ""], null, "ひ"]) {
        const invalid = await edit.PATCH(request({ readings: bad }, "PATCH"), context); assert.equal(invalid.status, 400); assert.deepEqual((await tx.vocabulary.findUnique({ where: { id: word.id } })).readings, expected);
      }
      const count = await tx.vocabulary.count();
      assert.equal((await add.POST(request({ english: `${english}_invalid`, japanese: "日", readings: [], categoryId: category.id }))).status, 400); assert.equal(await tx.vocabulary.count(), count);
      const service = load("../src/lib/japanese/practice-sessions.ts", { "@/lib/prisma": { prisma: db }, "./vocabulary-progress": progress, "./progress-history": { recordJapaneseProgress: async () => {} } });
      const link = await tx.activityVocab.findFirst({ where: { vocabId: word.id, activityId: 3 } });
      const saved = await service.savePracticeSession({ sessionKey: randomUUID(), activity: 3, startedAt: "2026-11-08T17:00:00Z", completedAt: "2026-11-08T17:02:00Z", categories: [category.id], starredOnly: false, updates: [{ activityVocabId: link.id, status: "PERFECT" }] });
      assert.deepEqual(saved.words[0].readings, expected);
      await edit.PATCH(request({ readings: ["にち"] }, "PATCH"), context);
      assert.deepEqual((await tx.practice.findUnique({ where: { id: saved.id } })).words[0].readings, expected, "history must retain the readings shown during practice");
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});

test("development examples have durable overview details and reseeding preserves session identities and live ratings", { skip: process.env.RUN_KANJI_READINGS_DB_TEST !== "1" }, async () => {
  const { PrismaClient } = await import("../src/generated/prisma/index.js"), prisma = new PrismaClient(), rollback = new Error("ROLLBACK_STATISTICS_EXAMPLES");
  assert.equal(process.env.NODE_ENV, "development", "Example seeding must run only in development");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: 1 } });
      const categories = Object.fromEntries((await tx.category.findMany()).map(category => [category.name, category]));
      const activities = (await tx.activity.findMany()).map(activity => [activity.id, activity.activity]);
      const before = await tx.activityVocab.findMany({ select: { id: true, status: true }, orderBy: { id: "asc" } });
      const seed = require("../prisma/seed-statistics-demo.js");
      await seed(tx, user, categories, activities);
      const first = await tx.practice.findMany({ where: { userId: 1, sessionKey: { not: null } }, orderBy: { id: "asc" } });
      const examples = first.filter(session => session.completedAt && session.completedAt.getUTCMinutes() === 17 && session.activityName);
      assert.ok(examples.length >= 300);
      for (const session of examples) {
        assert.equal(session.words.length, session.wordCount);
        assert.equal(session.words.filter(word => word.status === "WEAK").length, session.weakCount);
        assert.equal(session.words.filter(word => word.status === "GOOD").length, session.goodCount);
        assert.equal(session.words.filter(word => word.status === "PERFECT").length, session.perfectCount);
        assert.equal((session.completedAt - session.startedAt) / 1000, session.durationSeconds);
        assert.equal(typeof session.averageBefore, "number"); assert.equal(typeof session.averageAfter, "number");
        assert.ok(session.words.every(word => word.categoryName && word.readings.length > 0));
      }
      assert.ok(examples.some(session => session.words.some(word => word.readings.length > 1)));
      await seed(tx, user, categories, activities);
      const second = await tx.practice.findMany({ where: { userId: 1, sessionKey: { not: null } }, orderBy: { id: "asc" } });
      assert.deepEqual(second.map(session => [session.id, session.sessionKey]), first.map(session => [session.id, session.sessionKey]));
      const after = await tx.activityVocab.findMany({ where: { id: { in: before.map(link => link.id) } }, select: { id: true, status: true }, orderBy: { id: "asc" } });
      assert.deepEqual(after, before);
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
