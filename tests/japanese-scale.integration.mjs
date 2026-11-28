import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { accountModules } from "./helpers/accounts.mjs";

test(
  "3,400 words and 500 conjugated verbs load statistics and save a 1,000-word practice atomically",
  { skip: process.env.RUN_JAPANESE_SCALE_TEST !== "1", timeout: 180000 },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const db = new PrismaClient({ log: [] });
    const modules = accountModules(db);
    const { vocabularyProgress } = modules.load(
      "src/lib/japanese/vocabulary-progress.ts",
    );
    const base = process.env.AUTH_TEST_URL || "http://localhost:3000";
    let user;
    try {
      for (const id of [1, 2, 3, 4, 5])
        await db.activity.upsert({
          where: { id },
          create: { id, activity: `Scale activity ${id}` },
          update: {},
        });
      user = await db.user.create({
        data: {
          name: `Japanese scale ${randomUUID()}`,
          timeZone: "UTC",
          initialization: { create: { choice: "EMPTY" } },
        },
      });
      await db.userPermission.createMany({ data: [
        "japanese.vocabulary.read", "japanese.vocabulary.manage", "japanese.practice", "japanese.statistics.read", "japanese.history.read",
      ].map((capability) => ({ userId: user.id, capability })) });
      const category = await db.category.create({
        data: {
          userId: user.id,
          name: "Vocabulary",
          normalizedName: "vocabulary",
          kind: "OTHER",
        },
      });
      const verb = await db.category.create({
        data: {
          userId: user.id,
          name: "Verb",
          normalizedName: "verb",
          kind: "VERB",
          isDefault: true,
        },
      });
      await db.vocabulary.createMany({
        data: Array.from({ length: 3400 }, (_, i) => ({
          userId: user.id,
          english: `Scale word ${i}`,
          japanese: i < 500 ? "たべる" : "かな",
          hiragana: i < 500 ? "たべる" : "かな",
          readings: [],
          categoryId: i < 500 ? verb.id : category.id,
        })),
      });
      const words = await db.vocabulary.findMany({
        where: { userId: user.id },
        orderBy: { id: "asc" },
      });
      let formTypes = await db.verbFormType.findMany();
      if (formTypes.length < 15) {
        for (const name of [
          "masu",
          "masen",
          "mashita",
          "masen deshita",
          "te",
          "ta",
          "nai",
          "nakatta",
          "ba",
          "nakereba",
          "tai",
          "potential",
          "volitional",
          "passive",
          "causative",
        ])
          await db.verbFormType.upsert({
            where: { name },
            create: { name },
            update: {},
          });
        formTypes = await db.verbFormType.findMany();
      }
      await db.verbForm.createMany({
        data: words
          .filter((word) => word.categoryId === verb.id)
          .flatMap((word) =>
            formTypes.map((type) => ({
              userId: user.id,
              baseVocabId: word.id,
              formTypeId: type.id,
              form: "たべます",
              reading: "たべます",
            })),
          ),
      });
      const forms = await db.verbForm.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      await db.activityVocab.createMany({
        data: words.flatMap((word) =>
          [1, 2, 3, 4, 5].map((activityId) => ({
            userId: user.id,
            vocabId: word.id,
            activityId,
            status: "WEAK",
          })),
        ),
      });
      for (let offset = 0; offset < forms.length; offset += 1000)
        await db.activityVocab.createMany({
          data: forms.slice(offset, offset + 1000).flatMap((form) =>
            [1, 2, 3, 4].map((activityId) => ({
              userId: user.id,
              verbFormId: form.id,
              activityId,
              status: "WEAK",
            })),
          ),
        });
      const token = randomBytes(32).toString("base64url");
      await db.authSession.create({
        data: {
          userId: user.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expires: new Date(Date.now() + 3600000),
        },
      });
      const headers = {
        cookie: `next-auth.session-token=${token}`,
        origin: process.env.NEXTAUTH_URL || base,
        "Content-Type": "application/json",
      };
      async function call(path, body) {
        const start = performance.now();
        const response = await fetch(base + path, {
          method: body ? "POST" : "GET",
          headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(60000),
        });
        const result = await response.json();
        assert.equal(
          response.status,
          200,
          `${path}: ${JSON.stringify(result)}`,
        );
        return { result, elapsed: Math.round(performance.now() - start) };
      }
      const totalLinks = await db.activityVocab.count({
        where: { userId: user.id },
      });
      const before = await call(
        "/api/japanese-practice/statistics?period=year",
      );
      assert.equal(before.result.summary.vocabularyCount, 3400);
      assert.equal(before.result.summary.average, 0);
      const targets = await db.activityVocab.findMany({
        where: { userId: user.id, activityId: 1 },
        take: 1000,
        orderBy: { id: "asc" },
      });
      const input = {
        sessionKey: randomUUID(),
        activity: 1,
        categories: [],
        starredOnly: false,
        startedAt: new Date(Date.now() - 60000).toISOString(),
        completedAt: new Date().toISOString(),
        updates: targets.map((row, i) => ({
          activityVocabId: row.id,
          status: i % 3 === 0 ? "WEAK" : i % 3 === 1 ? "GOOD" : "PERFECT",
        })),
      };
      const preview = await call(
        "/api/japanese-practice/practice-sessions/preview",
        input,
      );
      assert.equal(await db.practice.count({ where: { userId: user.id } }), 0);
      const saved = await call(
        "/api/japanese-practice/practice-sessions",
        input,
      );
      const retry = await call(
        "/api/japanese-practice/practice-sessions",
        input,
      );
      assert.equal(saved.result.review.id, retry.result.review.id);
      assert.equal(await db.practice.count({ where: { userId: user.id } }), 1);
      assert.equal(saved.result.review.wordCount, 1000);
      assert.equal(saved.result.review.xpEarned, 999);
      assert.equal(saved.result.review.goldEarned, 200);
      assert.ok(
        Math.abs(
          saved.result.review.averageAfter - preview.result.review.averageAfter,
        ) < 1e-10,
      );
      const profile = await db.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      assert.equal(profile.totalXp, 999);
      assert.equal(profile.coins, 200);
      assert.equal(
        await db.activityVocab.count({
          where: { userId: user.id, lastPracticed: { not: null } },
        }),
        1000,
      );
      // Independent expected average: only activity 1 of each selected base
      // word changed. Kana-only words exclude the kanji-writing activity; every
      // conjugation remains weak and has equal weight with its verb's base.
      const ratings = new Map(
        targets.map((link, i) => [link.vocabId, input.updates[i].status]),
      );
      const scores = { WEAK: 0, GOOD: 0.5, PERFECT: 1 };
      const applicable = (await db.activity.findMany()).filter(
        (activity) => activity.id !== 5,
      ).length;
      const expected =
        words.reduce(
          (sum, word) =>
            sum +
            Number(
              (
                (scores[ratings.get(word.id) || "WEAK"] * 100) /
                applicable /
                (word.categoryId === verb.id ? formTypes.length + 1 : 1)
              ).toFixed(2),
            ),
          0,
        ) / 3400;
      const snapshot = await db.japaneseProgressSnapshot.findFirstOrThrow({
        where: { userId: user.id },
      });
      assert.ok(
        Math.abs(snapshot.average - expected) < 1e-10,
        `${snapshot.average} != ${expected}; activities=${applicable}, formsPerVerb=${formTypes.length}`,
      );
      const list = await call("/api/japanese-practice/vocabulary");
      assert.equal(list.result.length, 3400);
      await call("/api/japanese-practice/activities/stats");
      const after = await call(
        "/api/japanese-practice/statistics?period=month",
      );
      assert.ok(Math.abs(after.result.summary.average - expected) < 1e-10);
      assert.equal(after.result.summary.practiced, 1000);
      console.log(
        JSON.stringify({
          vocabulary: words.length,
          verbs: 500,
          forms: forms.length,
          activityLinks: totalLinks,
          statisticsBeforeMs: before.elapsed,
          previewMs: preview.elapsed,
          saveMs: saved.elapsed,
          retryMs: retry.elapsed,
          statisticsAfterMs: after.elapsed,
        }),
      );
    } finally {
      if (user) {
        await db.auditEvent.deleteMany({ where: { userId: user.id } });
        await db.practice.deleteMany({ where: { userId: user.id } });
        await db.japaneseProgressSnapshot.deleteMany({
          where: { userId: user.id },
        });
        await db.activityVocab.deleteMany({ where: { userId: user.id } });
        await db.verbForm.deleteMany({ where: { userId: user.id } });
        await db.vocabulary.deleteMany({ where: { userId: user.id } });
        await db.category.deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      }
      await db.$disconnect();
    }
  },
);
