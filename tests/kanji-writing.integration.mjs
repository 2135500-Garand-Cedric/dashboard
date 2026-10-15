import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) => dependencies[name] ?? require(name));
  return exports;
}

test("writing session saves its base-word status and counts it in the percentage", { skip: process.env.RUN_KANJI_DB_TEST !== "1" }, async () => {
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  const rollback = new Error("ROLLBACK_TEST_FIXTURE");
  const utils = load("../src/lib/japanese/utils.ts");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const word = await tx.vocabulary.create({ data: {
        userId: 1, categoryId: 3, english: `__writing_test_${Date.now()}__`, japanese: "学校の本", hiragana: "がっこうのほん",
      } });
      const link = await tx.activityVocab.create({ data: { vocabId: word.id, activityId: 5, status: "WEAK" } });
      const { PATCH } = load("../src/app/api/japanese-practice/vocabulary/route.ts", {
        "@/lib/prisma": { prisma: { $transaction: (callback) => callback(tx) } },
        "@/lib/japanese/utils": utils,
        "@/lib/japanese/kanji-writing": load("../src/lib/japanese/kanji-writing.ts"),
      });
      for (const [status, percentage] of [["GOOD", "10.00"], ["PERFECT", "20.00"]]) {
        const response = await PATCH(new Request("http://localhost/api/japanese-practice/vocabulary", {
          method: "PATCH", body: JSON.stringify({ activity: 5, updates: [{ activityVocabId: link.id, status }] }),
          headers: { "Content-Type": "application/json" },
        }));
        assert.equal(response.status, 200);
        const saved = await tx.activityVocab.findUnique({ where: { id: link.id } });
        assert.equal(saved.status, status);
        assert.equal(utils.calculateActivityStats([saved], [1, 2, 3, 4, 5]).percentage, percentage);
      }
      const updated = await tx.vocabulary.findUnique({ where: { id: word.id } });
      assert.ok(updated.lastPracticed);
      throw rollback;
    }, { timeout: 10000 }), (error) => error === rollback);
  } finally {
    await prisma.$disconnect();
  }
});
