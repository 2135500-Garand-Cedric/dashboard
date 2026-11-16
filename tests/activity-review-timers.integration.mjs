import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadWorkModule as load } from "./helpers/work-support.mjs";

const enabled = process.env.RUN_ACTIVITY_REVIEW_TIMER_DB_TEST === "1";
test(
  "activity timers drive selection independently for base words and verb forms; previews/retries do not restart them",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const rollback = new Error("ROLLBACK_TIMERS");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            for (const id of [1, 2, 5])
              await tx.activity.upsert({
                where: { id },
                update: {},
                create: { id, activity: `Timer test ${id}` },
              });
            const maximum = await tx.category.aggregate({ _max: { id: true } });
            const category = await tx.category.create({
              data: { id: (maximum._max.id ?? 0) + 1, name: `Timer ${randomUUID()}` },
            });
            const word = await tx.vocabulary.create({
              data: {
                userId: 1,
                categoryId: category.id,
                english: "timer word",
                japanese: "食べる",
                hiragana: "たべる",
              },
            });
            const recentWord = await tx.vocabulary.create({
              data: {
                userId: 1,
                categoryId: category.id,
                english: "recent word",
                japanese: "みる",
                hiragana: "みる",
              },
            });
            const old = new Date(Date.now() - 15 * 86400000),
              now = new Date();
            const first = await tx.activityVocab.create({
              data: { activityId: 1, vocabId: word.id, status: "PERFECT", lastPracticed: old },
            });
            const second = await tx.activityVocab.create({
              data: { activityId: 2, vocabId: word.id, status: "PERFECT", lastPracticed: old },
            });
            await tx.activityVocab.create({
              data: { activityId: 1, vocabId: recentWord.id, status: "GOOD", lastPracticed: now },
            });
            const formMax = await tx.verbFormType.aggregate({ _max: { id: true } });
            const formType = await tx.verbFormType.create({
              data: { id: (formMax._max.id ?? 0) + 1, name: `Timer form ${randomUUID()}` },
            });
            const form = await tx.verbForm.create({
              data: {
                baseVocabId: word.id,
                formTypeId: formType.id,
                form: "食べます",
                reading: "たべます",
              },
            });
            const formLink = await tx.activityVocab.create({
              data: { activityId: 1, verbFormId: form.id, status: "PERFECT", lastPracticed: old },
            });
            const kanji = load("src/lib/japanese/kanji-writing.ts"),
              utils = load("src/lib/japanese/utils.ts");
            const progress = load("src/lib/japanese/vocabulary-progress.ts", {
              "./kanji-writing": kanji,
              "./utils": utils,
            });
            const dates = load("src/lib/japanese/dates.ts");
            const history = load("src/lib/japanese/progress-history.ts", {
              "./dates": dates,
              "./vocabulary-progress": progress,
            });
            const selection = load("src/lib/japanese/practice-selection.ts");
            const prisma = { ...tx, $transaction: (callback) => callback(tx) };
            const sessions = load("src/lib/japanese/practice-sessions.ts", {
              "@/lib/prisma": { prisma },
              "./vocabulary-progress": progress,
              "./progress-history": history,
            });
            const api = load("src/app/api/japanese-practice/vocabulary/route.ts", {
              "@/lib/require-owner": { requireOwner: async () => null },
              "@/lib/prisma": { prisma },
              "@/lib/japanese/kanji-writing": kanji,
              "@/lib/japanese/vocabulary-progress": progress,
              "@/lib/japanese/progress-history": history,
              "@/lib/japanese/practice-selection": selection,
            });
            const request = (body, method = "POST") =>
              new Request("http://localhost/api/japanese-practice/vocabulary", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
            const selected = await api.POST(
              request({ activity: 1, nbWords: 1, categories: [category.id] }),
            );
            assert.equal(selected.status, 200);
            const result = await selected.json();
            assert.ok(
              [first.id, formLink.id].includes(result.words[0].id),
              "overdue perfect outranks a recently practiced good word",
            );
            assert.equal(
              result.words[0].status,
              "PERFECT",
              "the border still sees the true saved rating",
            );
            assert.deepEqual(
              (await tx.activityVocab.findUnique({ where: { id: first.id } })).lastPracticed,
              old,
              "selection cannot reset the timer",
            );
            const input = {
              sessionKey: randomUUID(),
              activity: 1,
              categories: [category.id],
              starredOnly: false,
              startedAt: new Date(now.getTime() - 60000).toISOString(),
              completedAt: now.toISOString(),
              updates: [
                { activityVocabId: first.id, status: "GOOD" },
                { activityVocabId: formLink.id, status: "PERFECT" },
              ],
            };
            await sessions.buildPracticeReview(tx, input);
            assert.deepEqual(
              (await tx.activityVocab.findUnique({ where: { id: first.id } })).lastPracticed,
              old,
              "review is read-only",
            );
            await sessions.savePracticeSession(input);
            for (const id of [first.id, formLink.id])
              assert.deepEqual(
                (await tx.activityVocab.findUnique({ where: { id } })).lastPracticed,
                now,
              );
            assert.deepEqual(
              (await tx.activityVocab.findUnique({ where: { id: second.id } })).lastPracticed,
              old,
            );
            const later = new Date(now.getTime() + 1000);
            await tx.activityVocab.update({
              where: { id: first.id },
              data: { lastPracticed: later },
            });
            await sessions.savePracticeSession(input);
            assert.deepEqual(
              (await tx.activityVocab.findUnique({ where: { id: first.id } })).lastPracticed,
              later,
              "retry must not overwrite a newer timer",
            );
            const other = await api.POST(
              request({ activity: 2, nbWords: 1, categories: [category.id] }),
            );
            assert.equal((await other.json()).words[0].id, second.id);
            const patched = await api.PATCH(
              request(
                { activity: 2, updates: [{ activityVocabId: second.id, status: "GOOD" }] },
                "PATCH",
              ),
            );
            assert.equal(patched.status, 200);
            assert.ok(
              (await tx.activityVocab.findUnique({ where: { id: second.id } })).lastPracticed > old,
            );
            assert.deepEqual(
              (await tx.activityVocab.findUnique({ where: { id: first.id } })).lastPracticed,
              later,
            );
            throw rollback;
          },
          { timeout: 30000 },
        ),
        (error) => {
          if (error !== rollback) throw error;
          return true;
        },
      );
    } finally {
      await db.$disconnect();
    }
  },
);

test(
  "restoration recovers only exact per-activity history, including verb forms",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient(),
      rollback = new Error("ROLLBACK_TIMER_HISTORY");
    try {
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'CREATE TEMP TABLE "ActivityVocab" (id int,"activityId" int,"vocabId" int,"verbFormId" int,"lastPracticed" timestamptz,status text DEFAULT \'PERFECT\') ON COMMIT DROP',
          );
          await tx.$executeRawUnsafe(
            'CREATE TEMP TABLE "Vocabulary" (id int,"userId" int,"lastPracticed" timestamptz) ON COMMIT DROP',
          );
          await tx.$executeRawUnsafe(
            'CREATE TEMP TABLE "VerbForm" (id int,"baseVocabId" int) ON COMMIT DROP',
          );
          await tx.$executeRawUnsafe(
            'CREATE TEMP TABLE "Practice" ("activityId" int,"userId" int,"completedAt" timestamp,date timestamp,words jsonb) ON COMMIT DROP',
          );
          await tx.$executeRawUnsafe(
            "INSERT INTO \"Vocabulary\" VALUES (1,1,'2026-12-01'),(2,2,'2026-12-01')",
          );
          await tx.$executeRawUnsafe('INSERT INTO "VerbForm" VALUES (20,1)');
          await tx.$executeRawUnsafe(
            'INSERT INTO "ActivityVocab" (id,"activityId","vocabId","verbFormId") VALUES (10,1,1,NULL),(11,2,1,NULL),(12,1,NULL,20),(13,1,2,NULL)',
          );
          for (const [activity, user, date, words] of [
            [1, 1, "2026-11-01", [{ activityVocabId: 10, vocabId: 1 }]],
            [
              1,
              1,
              "2026-11-02",
              [
                { activityVocabId: 10, vocabId: 1 },
                { activityVocabId: 12, vocabId: 1 },
              ],
            ],
            [2, 1, "2026-11-03", [{ activityVocabId: 10, vocabId: 1 }]],
            [
              1,
              2,
              "2026-11-04",
              [
                { activityVocabId: 10, vocabId: 1 },
                { activityVocabId: 13, vocabId: 1 },
              ],
            ],
            [1, 1, "2026-11-05", {}],
          ])
            await tx.$executeRawUnsafe(
              'INSERT INTO "Practice" VALUES ($1,$2,$3::timestamp,$3::timestamp,$4::jsonb)',
              activity,
              user,
              date,
              JSON.stringify(words),
            );
          await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
          const sql = readFileSync(
            new URL(
              "../prisma/migrations/20261118122000_restore_activity_review_timers/migration.sql",
              import.meta.url,
            ),
            "utf8",
          );
          await tx.$executeRawUnsafe(
            sql.slice(sql.indexOf("WITH recorded AS ("), sql.indexOf("-- Unknown dates")),
          );
          const rows = await tx.$queryRawUnsafe('SELECT * FROM "ActivityVocab" ORDER BY id');
          assert.deepEqual(
            rows.map((row) => row.lastPracticed?.toISOString() ?? null),
            ["2026-11-02T00:00:00.000Z", null, "2026-11-02T00:00:00.000Z", null],
          );
          assert.ok(rows.every((row) => row.status === "PERFECT"));
          throw rollback;
        }),
        (error) => {
          if (error !== rollback) throw error;
          return true;
        },
      );
    } finally {
      await db.$disconnect();
    }
  },
);
