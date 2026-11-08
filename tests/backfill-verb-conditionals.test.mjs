import assert from "node:assert/strict";
import test from "node:test";
import { backfill } from "../scripts/backfill-verb-conditionals.mjs";

function fixture() {
  const types = [{ id: 1, name: "ba" }, { id: 2, name: "nakereba" }];
  const forms = [{ id: 10, baseVocabId: 1, formTypeId: 1, form: "custom existing form", reading: "custom reading" }];
  const links = [{ verbFormId: 10, activityId: 1, status: "PERFECT" }];
  const verbs = [
    { id: 1, japanese: "食べる", hiragana: "たべる", verbType: "ru" },
    { id: 2, japanese: "見る", hiragana: "みる", verbType: null },
  ];
  let writes = 0;
  const prisma = {
    vocabulary: { findMany: async () => verbs.map((verb) => ({
      ...verb,
      verbForms: forms.filter((form) => form.baseVocabId === verb.id).map((form) => ({
        ...form, formType: types.find((type) => type.id === form.formTypeId),
        activityVocab: links.filter((link) => link.verbFormId === form.id),
      })),
    })) },
    activity: { findMany: async () => [{ id: 1 }, { id: 2 }] },
    verbFormType: { upsert: async ({ where }) => {
      writes += 1;
      return types.find((type) => type.name === where.name);
    } },
    verbForm: {
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        writes += 1;
        let count = 0;
        for (const form of data) {
          if (!forms.some((existing) => existing.baseVocabId === form.baseVocabId && existing.formTypeId === form.formTypeId)) {
            forms.push({ ...form, id: 10 + forms.length });
            count += 1;
          }
        }
        return { count };
      },
      findMany: async ({ where }) => forms.filter((form) => form.baseVocabId === where.baseVocabId && where.formTypeId.in.includes(form.formTypeId)),
    },
    activityVocab: { createMany: async ({ data, skipDuplicates }) => {
      assert.equal(skipDuplicates, true);
      writes += 1;
      let count = 0;
      for (const link of data) {
        if (!links.some((existing) => existing.verbFormId === link.verbFormId && existing.activityId === link.activityId)) {
          links.push(link);
          count += 1;
        }
      }
      return { count };
    } },
    $transaction: async (callback) => callback(prisma),
  };
  return { prisma, verbs, forms, links, writes: () => writes };
}

const conjugate = () => ({
  ba: { form: "食べれば", reading: "たべれば" },
  nakereba: { form: "食べなければ", reading: "たべなければ" },
});

test("dry run reports missing records and skipped verbs without writing", async () => {
  const database = fixture();
  const logs = [];
  const result = await backfill(database.prisma, conjugate, { log: (line) => logs.push(line) });
  assert.deepEqual(result, { scanned: 2, affected: 1, forms: 1, practiceRecords: 3, skipped: 1 });
  assert.equal(database.writes(), 0);
  assert.ok(logs.some((line) => line.includes("SKIPPED verb 2")));
});

test("apply preserves custom forms and progress, creates missing links, and can be rerun", async () => {
  const database = fixture();
  const result = await backfill(database.prisma, conjugate, { apply: true, log: () => {} });
  assert.equal(result.forms, 1);
  assert.equal(result.practiceRecords, 3);
  assert.equal(database.forms[0].form, "custom existing form");
  assert.equal(database.links[0].status, "PERFECT");
  assert.ok(database.links.slice(1).every((link) => link.status === "WEAK"));
  const repeated = await backfill(database.prisma, conjugate, { apply: true, log: () => {} });
  assert.equal(repeated.forms, 0);
  assert.equal(repeated.practiceRecords, 0);
  assert.equal(database.forms.length, 2);
  assert.equal(database.links.length, 4);
});

test("bad readings and conjugator failures are reported instead of generating forms", async () => {
  const database = fixture();
  database.verbs[0].hiragana = "invalid";
  const invalid = await backfill(database.prisma, conjugate, { log: () => {} });
  assert.equal(invalid.skipped, 2);
  database.verbs[0].hiragana = "たべる";
  const failed = await backfill(database.prisma, () => { throw new Error("unsupported ending"); }, { log: () => {} });
  assert.equal(failed.skipped, 2);
  assert.equal(database.writes(), 0);
});

test("conditional backfill recognizes the honorific ending type", async () => {
  const database = fixture(); database.verbs[0] = { id: 1, japanese: "いらっしゃる", hiragana: "いらっしゃる", verbType: "honorific" };
  let seen = false;
  const result = await backfill(database.prisma, (base, reading, type) => { assert.equal(type, "honorific"); seen = true; return conjugate(); }, { log: () => {} });
  assert.equal(seen, true); assert.equal(result.skipped, 1); assert.equal(result.affected, 1);
});
