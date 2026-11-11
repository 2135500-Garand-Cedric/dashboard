import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { captureInventory, compareInventories } from "../scripts/work-management-inventory.mjs";
import { createMigrationWorkspace } from "../scripts/rehearse-work-migrations.mjs";

test(
  "Phase 02 migration preserves legacy null/unknown priorities and custom statuses without guessing history",
  { skip: process.env.RUN_WORK_FOUNDATION_MIGRATION_TEST !== "1" },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.notEqual(process.env.NODE_ENV, "production");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_legacy_fixtures");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const workspace = createMigrationWorkspace("02");
    try {
      const columns =
        await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Todo' AND column_name='priorityLevel'`;
      assert.equal(
        columns.length,
        0,
        "Restore a fresh pre-Phase-02 copy; never reset an existing database for this test.",
      );
      await db.$executeRawUnsafe(
        "ALTER TYPE \"TodoStatus\" ADD VALUE IF NOT EXISTS 'LEGACY_REVIEW'",
      );
      const prefix = `__legacy_fixture_${randomUUID()}`;
      const rows = [];
      for (const [priority, status] of [
        [1, "TODO"],
        [2, "TODO"],
        [3, "DONE"],
        [null, "DONE"],
        [99, "LEGACY_REVIEW"],
      ]) {
        const [row] =
          await db.$queryRaw`INSERT INTO "Todo" ("userId","title","priority","status","rewardXp","createdAt","updatedAt") VALUES (1,${prefix},${priority},${status}::"TodoStatus",30,'2000-01-01','2001-01-01') RETURNING "id"`;
        rows.push(row.id);
      }
      await db.$executeRaw`UPDATE "Todo" SET "dependsOnId"=${rows[2]}::integer WHERE "id"=${rows[0]}::integer`;
      await db.$executeRaw`INSERT INTO "Subtask" ("todoId","title","done") VALUES (${rows[0]}::integer,${prefix},true)`;
      await db.$executeRaw`INSERT INTO "Event" ("userId","title","linkedTodoId","date","updatedAt") VALUES (1,${prefix},${rows[0]}::integer,'2030-01-01','2001-01-01')`;
      const before = await captureInventory(db);
      assert.ok(before.issues.some((value) => value.includes("statuses")));
      assert.ok(before.issues.some((value) => value.includes("priorities")));
      const deploy = () =>
        execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", workspace.schema], {
          cwd: process.cwd(),
          env: process.env,
          stdio: "pipe",
        });
      deploy();
      const after = await captureInventory(db);
      assert.deepEqual(compareInventories(before, after, "02"), []);
      assert.equal(after.tables.WorkActivity.count, 0);
      assert.equal(after.tables.WorkContext.count, 3);
      const mapped = after.tables.Todo.rows
        .map((value) => JSON.parse(value))
        .filter((row) => rows.includes(row.id))
        .sort((a, b) => a.id - b.id);
      assert.deepEqual(
        mapped.map((row) => row.priorityLevel),
        ["LOW", "NORMAL", "HIGH", "NORMAL", null],
      );
      assert.deepEqual(
        mapped.map((row) => row.priority),
        [1, 2, 3, null, 99],
      );
      assert.equal(mapped.at(-1).status, "LEGACY_REVIEW");
      for (const row of mapped) {
        assert.equal(row.contextId, null);
        assert.equal(row.kind, null);
        assert.equal(row.completedAt, null);
        assert.equal(row.cancelledAt, null);
        assert.equal(row.archivedAt, null);
      }
      const defaults =
        await db.$queryRaw`SELECT column_name,column_default FROM information_schema.columns WHERE table_name='Todo' AND column_name IN ('status','priorityLevel','kind')`;
      assert.ok(
        defaults.some((row) => row.column_name === "status" && row.column_default.includes("NEW")),
      );
      assert.ok(
        defaults.some(
          (row) => row.column_name === "priorityLevel" && row.column_default.includes("NORMAL"),
        ),
      );
      assert.ok(
        defaults.some((row) => row.column_name === "kind" && row.column_default.includes("TASK")),
      );
      deploy();
      assert.deepEqual(compareInventories(after, await captureInventory(db), "02"), []);
    } finally {
      await db.$disconnect();
      workspace.dispose();
    }
  },
);
