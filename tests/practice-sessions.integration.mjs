import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => dependencies[name] ?? require(name));
  return exports;
}

test("session review is read-only; Okay atomically saves durable details and history without duplicate retries", { skip: process.env.RUN_PRACTICE_SESSION_DB_TEST !== "1" }, async () => {
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  const rollback = new Error("ROLLBACK_PRACTICE_SESSION_FIXTURE");
  const kanji = load("../src/lib/japanese/kanji-writing.ts");
  const utils = load("../src/lib/japanese/utils.ts");
  const dates = load("../src/lib/japanese/dates.ts");
  const progress = load("../src/lib/japanese/vocabulary-progress.ts", { "./kanji-writing": kanji, "./utils": utils });
  const history = load("../src/lib/japanese/progress-history.ts", { "./dates": dates, "./vocabulary-progress": progress });
  const json = { NextResponse: { json: (data, options) => Response.json(data, options) } };
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const db = { ...tx, $transaction: callback => callback(tx) };
      const sessions = load("../src/lib/japanese/practice-sessions.ts", { "@/lib/prisma": { prisma: db }, "./vocabulary-progress": progress, "./progress-history": history });
      const lastCategory = await tx.category.aggregate({ _max: { id: true } });
      const category = await tx.category.create({ data: { id: (lastCategory._max.id ?? 0) + 1, name: `__session_category_${randomUUID()}` } });
      const word = await tx.vocabulary.create({ data: { userId: 1, categoryId: category.id, english: `__session_word_${randomUUID()}`, japanese: "学校", hiragana: "がっこう", starred: true } });
      const links = await Promise.all([1, 5].map(activityId => tx.activityVocab.create({ data: { activityId, vocabId: word.id } })));
      const input = { sessionKey: randomUUID(), activity: 1, startedAt: "2026-11-06T00:58:55Z", completedAt: "2026-11-06T01:00:00Z", categories: [category.id], starredOnly: true, updates: [{ activityVocabId: links[0].id, status: "PERFECT" }] };
      const previewRoute = load("../src/app/api/japanese-practice/practice-sessions/preview/route.ts", { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": json, "@/lib/prisma": { prisma: db }, "@/lib/japanese/practice-sessions": sessions });
      const beforeCount = await tx.practice.count();
      const response = await previewRoute.POST(new Request("http://localhost/api/preview", { method: "POST", body: JSON.stringify(input) }));
      assert.equal(response.status, 200);
      const { review } = await response.json();
      assert.equal(review.durationSeconds, 65);
      assert.equal(review.perfectCount, 1);
      assert.equal(review.id, null);
      assert.equal(await tx.practice.count(), beforeCount);
      assert.equal((await tx.activityVocab.findUnique({ where: { id: links[0].id } })).status, "WEAK");
      const saved = await sessions.savePracticeSession(sessions.parsePracticeSession(input));
      assert.equal(saved.id !== null, true);
      assert.ok(Math.abs(saved.averageBefore - review.averageBefore) < 1e-9);
      assert.ok(Math.abs(saved.averageAfter - review.averageAfter) < 1e-9);
      assert.equal(saved.words[0].previousStatus, "WEAK");
      assert.equal(saved.words[0].status, "PERFECT");
      assert.equal(saved.selectedCategories[0].name, category.name);
      assert.equal(saved.starredOnly, true);
      assert.equal((await tx.activityVocab.findUnique({ where: { id: links[0].id } })).status, "PERFECT");
      const snapshot = await tx.japaneseProgressSnapshot.findUnique({ where: { userId_day: { userId: 1, day: dates.torontoDateKey(new Date()) } } });
      assert.ok(Math.abs(snapshot.average - saved.averageAfter) < 1e-9);
      assert.equal(await tx.practice.count(), beforeCount + 1);
      const retried = await sessions.savePracticeSession(input);
      assert.equal(retried.id, saved.id);
      assert.equal(await tx.practice.count(), beforeCount + 1);
      const bad = { ...input, sessionKey: randomUUID(), updates: [{ activityVocabId: links[1].id, status: "GOOD" }] };
      await assert.rejects(sessions.savePracticeSession(bad), /does not belong/);
      assert.equal(await tx.practice.count(), beforeCount + 1);
      assert.equal((await tx.activityVocab.findUnique({ where: { id: links[1].id } })).status, "WEAK");
      const writing = await sessions.savePracticeSession({ ...input, sessionKey: randomUUID(), activity: 5, updates: [{ activityVocabId: links[1].id, status: "GOOD" }] });
      const otherUser = await tx.practice.create({ data: { userId: 999999, activityId: 1, date: new Date(input.completedAt), wordCount: 1, weakCount: 1, goodCount: 0, perfectCount: 0 } });
      const dependencies = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": json, "@/lib/prisma": { prisma: db }, "@/lib/japanese/practice-sessions": sessions, "@/lib/japanese/dates": dates };
      const listRoute = load("../src/app/api/japanese-practice/practice-sessions/route.ts", dependencies);
      const detailRoute = load("../src/app/api/japanese-practice/practice-sessions/[id]/route.ts", dependencies);
      for (const [kind, included, excluded] of [["vocab", saved.id, writing.id], ["kanji", writing.id, saved.id]]) {
        const result = await listRoute.GET(new Request(`http://localhost/api/sessions?date=2026-11-05&kind=${kind}`));
        const { sessions: found } = await result.json();
        assert.ok(found.some(item => item.id === included));
        assert.ok(!found.some(item => item.id === excluded || item.id === otherUser.id));
      }
      const monthly = await listRoute.GET(new Request("http://localhost/api/sessions?date=2026-11-01&kind=vocab&range=month"));
      assert.ok((await monthly.json()).sessions.some(item => item.id === saved.id));
      assert.equal((await listRoute.GET(new Request("http://localhost/api/sessions?date=2026-02-30"))).status, 400);
      await tx.vocabulary.delete({ where: { id: word.id } });
      await tx.category.delete({ where: { id: category.id } });
      const detail = await detailRoute.GET(new Request("http://localhost/api/session"), { params: Promise.resolve({ id: String(saved.id) }) });
      const { review: historical } = await detail.json();
      assert.equal(historical.words[0].english, word.english, "stored words survive deletion of vocabulary");
      assert.equal(historical.selectedCategories[0].name, category.name);
      assert.equal(historical.averageAfter, saved.averageAfter);
      assert.equal((await detailRoute.GET(new Request("http://localhost/api/session"), { params: Promise.resolve({ id: String(otherUser.id) }) })).status, 404);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
