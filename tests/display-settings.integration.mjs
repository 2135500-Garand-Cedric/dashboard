import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
import { assertOriginalRows } from "../scripts/rehearse-work-migrations.mjs";

test(
  "timezone migration preserves originals and request settings change display/day grouping only",
  {
    skip: process.env.RUN_DISPLAY_SETTINGS_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(process.env.NODE_ENV, "test");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] });
    const output = "private/work-management/display-settings-rehearsal";
    fs.mkdirSync(output, { mode: 0o700 });
    const save = (name, data) =>
      fs.writeFileSync(`${output}/${name}.json`, JSON.stringify(data), { flag: "wx", mode: 0o600 });
    try {
      const before = await captureInventory(db);
      save("before", before);
      assert.ok(
        !before.columns.some(
          (column) => column.table_name === "User" && column.column_name === "timeZone",
        ),
        "Restore the fresh pre-settings backup first.",
      );
      const deploy = () => execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "pipe" });
      deploy();
      const migrated = await captureInventory(db);
      save("migrated", migrated);
      assertOriginalRows(before, migrated);
      assert.deepEqual(migrated.issues, []);
      assert.deepEqual(migrated.pendingMigrations, []);
      assert.ok(migrated.tables.User.rows.every((raw) => JSON.parse(raw).timeZone === null));
      deploy();
      assertOriginalRows(migrated, await captureInventory(db));
      const rollback = new Error("ROLLBACK_SETTINGS_FIXTURES");
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const adapter = { ...tx, $transaction: (action) => action(tx) };
            const api = loadWorkServices(adapter);
            const now = new Date("2026-11-12T00:30:00Z");
            for (const [timeZone, day] of [
              ["Asia/Tokyo", "2026-11-12"],
              ["America/Los_Angeles", "2026-11-11"],
            ]) {
              await tx.user.update({ where: { id: 1 }, data: { timeZone } });
              await api.settings.withUserTimeZone(async () => {
                await Promise.resolve();
                const work = await api.myWork.myWork(
                  new URLSearchParams({ company: "__settings_no_real_rows__" }),
                  now,
                );
                assert.equal(work.timeZone, timeZone);
                assert.equal(work.date, day);
                assert.equal(api.japaneseDates.torontoDateKey(now), day);
                assert.equal(api.timeZone.getAppTimeZone(), timeZone);
              });
            }
            throw rollback;
          },
          { timeout: 30000 },
        ),
        (error) => error === rollback,
      );
      const after = await captureInventory(db);
      save("after-tests", after);
      assertOriginalRows(migrated, after);
      console.log(
        "Settings migration/retry and scoped Tokyo/Los Angeles work/Japanese dates passed; original fields and all records unchanged.",
      );
    } finally {
      await db.$disconnect();
    }
  },
);
