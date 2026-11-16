import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Both databases must be disposable restores of the same pre-cleanup backup.
// Apply the cleanup migration only to work_cleanup_rehearsal, then run this test.
test(
  "cleanup preserves every retained row and archives retired metadata",
  {
    skip: process.env.RUN_MODULE_CLEANUP_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_cleanup_rehearsal");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const after = new PrismaClient({ datasourceUrl: url.toString() });
    url.pathname = "/work_cleanup_baseline";
    const before = new PrismaClient({ datasourceUrl: url.toString() });
    const rows = (db, table) =>
      db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`);
    const retired = [
      "company",
      "course",
      "tags",
      "contextId",
      "waitingOnContactId",
      "rewardXp",
      "rewardCoins",
      "rewardAppliedXp",
      "rewardAppliedCoins",
      "rewardAccountingBasis",
    ];
    try {
      const tables =
        await before.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
      const special = new Set([
        "Todo",
        "WorkProject",
        "WorkContext",
        "WorkActivity",
        "ActivityType",
      ]);
      let compared = 0;
      for (const { tablename } of tables) {
        if (special.has(tablename)) continue;
        const originalRows = await rows(before, tablename);
        const migratedRows = await rows(after, tablename);
        if (tablename === "ActivityVocab") {
          const vocabulary = new Map(
            (await rows(before, "Vocabulary")).map(({ row }) => [row.id, row]),
          );
          const forms = new Map((await rows(before, "VerbForm")).map(({ row }) => [row.id, row]));
          const practices = (await rows(before, "Practice")).map(({ row }) => row);
          const utcTime = (value) =>
            Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
          for (const entry of originalRows) {
            const old = entry.row;
            assert.equal(old.lastPracticed, null);
            const current = migratedRows.find(({ row }) => row.id === old.id).row;
            if (Object.hasOwn(current, "lastPracticed")) {
              const vocabId = old.vocabId ?? forms.get(old.verbFormId)?.baseVocabId;
              const times = practices
                .filter(
                  (practice) =>
                    practice.activityId === old.activityId &&
                    practice.userId === vocabulary.get(vocabId)?.userId &&
                    Array.isArray(practice.words) &&
                    practice.words.some(
                      (word) => word.activityVocabId === old.id && word.vocabId === vocabId,
                    ),
                )
                .map((practice) => utcTime(practice.completedAt ?? practice.date));
              assert.equal(
                current.lastPracticed === null ? null : utcTime(current.lastPracticed),
                times.length ? Math.max(...times) : null,
              );
            }
            delete old.lastPracticed;
            delete current.lastPracticed;
          }
        }
        assert.deepEqual(migratedRows, originalRows, `Changed retained table: ${tablename}`);
        compared++;
      }
      const contexts = new Map((await rows(before, "WorkContext")).map(({ row }) => [row.id, row]));
      const activities = (await rows(after, "WorkActivity")).map(({ row }) => row);
      const types = (await rows(after, "ActivityType")).map(({ row }) => row);
      for (const { row } of await rows(before, "ActivityType")) {
        assert.deepEqual(
          types.find((item) => item.id === row.id),
          row,
        );
      }
      for (const table of ["Todo", "WorkProject"]) {
        const original = (await rows(before, table)).map(({ row }) => row);
        const migrated = (await rows(after, table)).map(({ row }) => row);
        assert.equal(migrated.length, original.length);
        for (const old of original) {
          const expected = { ...old };
          if (expected.activityTypeId === null && expected.contextId !== null) {
            const context = contexts.get(expected.contextId);
            expected.activityTypeId =
              types.find(
                (type) => type.name.trim().toLowerCase() === context.name.trim().toLowerCase(),
              )?.id ?? null;
          }
          for (const field of table === "Todo" ? retired : ["contextId"]) delete expected[field];
          assert.deepEqual(
            migrated.find((row) => row.id === old.id),
            expected,
            `${table} #${old.id}`,
          );
          if (table === "Todo") {
            const facts = activities.find(
              (row) => row.todoId === old.id && row.action === "RETIRED_METADATA_ARCHIVED",
            )?.changes.retiredMetadata.before;
            if (facts) {
              for (const field of retired.filter(
                (key) => !["contextId", "waitingOnContactId"].includes(key),
              ))
                assert.deepEqual(facts[field], old[field]);
              assert.equal(facts.context?.id ?? null, old.contextId);
              assert.equal(facts.waitingOnContact?.id ?? null, old.waitingOnContactId);
            } else {
              assert.equal(old.company, null);
              assert.equal(old.course, null);
              assert.deepEqual(old.tags, []);
              assert.equal(old.contextId, null);
              assert.equal(old.waitingOnContactId, null);
              for (const field of [
                "rewardXp",
                "rewardCoins",
                "rewardAppliedXp",
                "rewardAppliedCoins",
              ])
                assert.equal(old[field], 0);
              assert.equal(old.rewardAccountingBasis, "TRACKED");
            }
          }
        }
      }
      for (const { row } of await rows(before, "WorkActivity"))
        assert.deepEqual(
          activities.find((entry) => entry.id === row.id),
          row,
        );
      for (const context of contexts.values())
        assert.deepEqual(
          activities.find(
            (entry) =>
              entry.action === "RETIRED_CONTEXT_ARCHIVED" &&
              entry.changes.contextDefinition.before.id === context.id,
          )?.changes.contextDefinition.before,
          context,
        );
      const remaining =
        await after.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Todo'`;
      for (const field of retired)
        assert.ok(!remaining.some((column) => column.column_name === field));
      assert.deepEqual(
        await after.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='WorkContext'`,
        [],
      );
      // A different installation may still have historical exercise timestamps.
      // Verify the migration refuses to discard them, using a temporary table
      // that shadows the real table only inside this rollback transaction.
      const timestampSql = readFileSync(
        new URL(
          "../prisma/migrations/20261118121000_drop_unused_practice_timestamp/migration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const guardSql = timestampSql.match(/DO \$\$[\s\S]*?END \$\$;/)[0];
      await assert.rejects(
        after.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'CREATE TEMP TABLE "ActivityVocab" ("lastPracticed" timestamp) ON COMMIT DROP',
          );
          await tx.$executeRawUnsafe('INSERT INTO "ActivityVocab" VALUES (CURRENT_TIMESTAMP)');
          await tx.$executeRawUnsafe(guardSql);
        }),
        /contains historical values/,
      );
      console.log(
        `Compared ${compared} complete retained tables, tasks/projects, prior history, activity types and archived context definitions.`,
      );
    } finally {
      await before.$disconnect();
      await after.$disconnect();
    }
  },
);
