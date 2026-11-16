import assert from "node:assert/strict";
import test from "node:test";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
import { seedWorkExamples } from "../scripts/work-example-data.mjs";
test(
  "Phase 07 requested examples are labelled, resumable/idempotent and change only verified samples",
  { skip: process.env.RUN_WORK_EXAMPLE_TEST !== "1" },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js"),
      db = new PrismaClient({ log: [] }),
      previous = process.env.ALLOW_WORK_EXAMPLES;
    process.env.ALLOW_WORK_EXAMPLES = "1";
    try {
      const before = await captureInventory(db),
        result = await seedWorkExamples(db);
      assert.ok(result.taskIds.length >= 14);
      assert.ok(result.eventIds.length >= 9);
      const after = await captureInventory(db),
        changedEvents = new Set([...result.editedEventIds, ...result.convertedEventIds]);
      for (const [table, entry] of Object.entries(before.tables))
        for (const raw of entry.rows) {
          if (table === "Event" && changedEvents.has(JSON.parse(raw).id)) continue;
          assert.ok(
            after.tables[table].rows.includes(raw),
            `Original row changed outside the approved examples: ${table}`,
          );
        }
      assert.equal(before.tables.User.hash, after.tables.User.hash);
      assert.equal(after.issues.length, 0);
      for (const id of result.taskIds) {
        const row = await db.todo.findUniqueOrThrow({ where: { id } });
        assert.ok(row.title.startsWith("[Example]"));
        assert.equal(Object.hasOwn(row, "rewardXp"), false);
        assert.equal(Object.hasOwn(row, "rewardCoins"), false);
      }
      for (const row of result.sourceSnapshots) {
        assert.equal(row.description, "Sample calendar event for development.");
        assert.equal(row.taskLinks.length, 0);
      }
      const repeated = await seedWorkExamples(db);
      assert.equal(repeated.reused, true);
      const final = await captureInventory(db);
      for (const [table, entry] of Object.entries(after.tables))
        assert.equal(final.tables[table].hash, entry.hash, `Repeat example load changed ${table}`);
      console.log(
        `Verified ${result.taskIds.length} tasks, ${result.eventIds.length} new events, ${result.editedEventIds.length} updated verified samples and ${result.convertedEventIds.length} converted placeholders. Original non-example rows and all balances preserved.`,
      );
    } finally {
      if (previous === undefined) delete process.env.ALLOW_WORK_EXAMPLES;
      else process.env.ALLOW_WORK_EXAMPLES = previous;
      await db.$disconnect();
    }
  },
);
