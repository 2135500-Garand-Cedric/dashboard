import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
import { assertOriginalRows } from "../scripts/rehearse-work-migrations.mjs";

test(
  "practice rewards migration is additive, does not award historical sessions, and safely retries",
  {
    skip: process.env.RUN_PRACTICE_REWARD_MIGRATION_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(process.env.NODE_ENV, "test");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] });
    try {
      const before = await captureInventory(db);
      assert.ok(
        !before.columns.some(
          (row) => row.table_name === "Practice" && row.column_name === "xpEarned",
        ),
        "Use a fresh pre-rewards restore.",
      );
      const output = "private/work-management/practice-rewards-migration";
      fs.mkdirSync(output, { mode: 0o700 });
      const save = (name, value) =>
        fs.writeFileSync(`${output}/${name}.json`, JSON.stringify(value), {
          mode: 0o600,
          flag: "wx",
        });
      save("before", before);
      const deploy = () => execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "pipe" });
      deploy();
      const after = await captureInventory(db);
      assertOriginalRows(before, after);
      assert.deepEqual(after.issues, []);
      assert.deepEqual(after.pendingMigrations, []);
      assert.ok(
        after.tables.Practice.rows.every((raw) => {
          const row = JSON.parse(raw);
          return row.xpEarned === null && row.goldEarned === null;
        }),
      );
      save("after", after);
      deploy();
      assertOriginalRows(after, await captureInventory(db));
      console.log(
        "All original records, user balances and historical practices preserved; additive reward columns remain null for old sessions; repeat unchanged.",
      );
    } finally {
      await db.$disconnect();
    }
  },
);
