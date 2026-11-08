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
test("honorific vocabulary stays independent and add/edit generate all forms and practice links atomically", { skip: process.env.RUN_HONORIFIC_VERB_DB_TEST !== "1" }, async () => {
  const generated = await import("../src/generated/prisma/index.js"), prisma = new generated.PrismaClient(), rollback = new Error("ROLLBACK_HONORIFIC_VERB_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      let index = 0;
      const db = { ...tx, $transaction: async callback => {
        const name = `honorific_${++index}`; await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const result = await callback(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      } };
      const conjugation = load("../src/lib/japanese/conjugation.ts"), next = { NextResponse: { json: (data, init) => Response.json(data, init) } };
      const dependencies = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": next, "@/lib/prisma": { prisma: db }, "@/generated/prisma": generated, "@/lib/japanese/conjugation": conjugation, "@/lib/japanese/dates": {}, "@/lib/japanese/progress-history": { recordJapaneseProgress: async () => {} }, "@/lib/japanese/utils": {}, "@/lib/japanese/kanji-writing": {} };
      const add = load("../src/app/api/japanese-practice/vocabulary/add/route.ts", dependencies), edit = load("../src/app/api/japanese-practice/vocabulary/[id]/route.ts", dependencies);
      const english = `__honorific_${randomUUID()}`, activities = await tx.activity.findMany(); assert.ok(activities.length > 0);
      const request = (body, method = "POST") => new Request("http://localhost/api/japanese-practice/vocabulary/add", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const plainResponse = await add.POST(request({ english, japanese: "行く", hiragana: "いく", categoryId: 1, verbType: "u", starred: false })); assert.equal(plainResponse.status, 200); const plain = (await plainResponse.json()).vocabulary;
      const response = await add.POST(request({ english, japanese: "いらっしゃる", hiragana: "いらっしゃる", categoryId: 1, verbType: "honorific", starred: false })); assert.equal(response.status, 200); const word = (await response.json()).vocabulary;
      assert.notEqual(word.id, plain.id); assert.equal(word.verbType, "honorific");
      async function check(base, reading) {
        const expected = conjugation.conjugateVerb(base, reading, "honorific"), forms = await tx.verbForm.findMany({ where: { baseVocabId: word.id }, include: { formType: true, activityVocab: true } });
        assert.equal(forms.length, 13);
        for (const form of forms) { assert.equal(form.form, expected[form.formType.name].form); assert.equal(form.reading, expected[form.formType.name].reading); assert.deepEqual(form.activityVocab.map(link => link.activityId).sort(), activities.map(activity => activity.id).sort()); assert.ok(form.activityVocab.every(link => link.status === "WEAK")); }
      }
      await check("いらっしゃる", "いらっしゃる");
      const updated = await edit.PATCH(request({ japanese: "下さる", hiragana: "くださる", verbType: "honorific" }, "PATCH"), { params: Promise.resolve({ id: String(word.id) }) }); assert.equal(updated.status, 200); await check("下さる", "くださる");
      const plainForms = await tx.verbForm.findMany({ where: { baseVocabId: plain.id }, include: { formType: true } }); assert.equal(plainForms.find(form => form.formType.name === "masu").form, "行きます");
      const before = await tx.vocabulary.count();
      const invalid = await add.POST(request({ english: `${english}_invalid`, japanese: "行く", hiragana: "いく", categoryId: 1, verbType: "honorific", starred: false })); assert.equal(invalid.status, 400); assert.match((await invalid.json()).error, /ending in る/); assert.equal(await tx.vocabulary.count(), before);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
