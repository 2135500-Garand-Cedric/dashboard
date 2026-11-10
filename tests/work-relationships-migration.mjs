import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { captureInventory, compareInventories } from "../scripts/work-management-inventory.mjs";
test("Phase 05 migration preserves exact legacy tuples and anomalies; repeat backfill and deploy are no-ops", { skip: process.env.RUN_WORK_RELATIONSHIP_MIGRATION_TEST !== "1" }, async () => {
  assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1"); assert.notEqual(process.env.NODE_ENV, "production");
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, "work-db"); assert.equal(url.pathname, "/work_relationship_fixtures");
  const { PrismaClient } = await import("../src/generated/prisma/index.js"), db = new PrismaClient();
  try {
    const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Todo' AND column_name='parentId'`; assert.equal(columns.length, 0, "Restore a fresh pre-Phase-05 copy; do not reset it.");
    const prefix = `__legacy_graph_${randomUUID()}`, foreign = await db.user.create({ data: { email: `${prefix}@invalid.test`, name: prefix } });
    const ids = [];
    for (let i = 0; i < 8; i++) {
      const [row] = await db.$queryRaw`INSERT INTO "Todo" ("userId","title","status","rewardXp","createdAt","updatedAt") VALUES (${i === 7 ? foreign.id : 1},${prefix},'TODO',15,'2000-01-01','2001-01-01') RETURNING "id"`; ids.push(row.id);
    }
    const pairs = [[ids[0],ids[1]],[ids[2],ids[2]],[ids[3],ids[4]],[ids[4],ids[3]],[ids[5],ids[3]],[ids[6],ids[7]]];
    for (const [dependent, prerequisite] of pairs) await db.$executeRaw`UPDATE "Todo" SET "dependsOnId"=${prerequisite}::integer WHERE "id"=${dependent}::integer`;
    await db.$executeRaw`INSERT INTO "Subtask" ("todoId","title","done","createdAt") VALUES (${ids[0]}::integer,${prefix},true,'2000-01-01')`;
    await db.$executeRaw`INSERT INTO "Event" ("userId","title","linkedTodoId","date","updatedAt") VALUES (1,${prefix},${ids[0]}::integer,'2030-01-01','2001-01-01')`;
    const before = await captureInventory(db);
    const deploy = () => execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "pipe", env: process.env });
    deploy(); const after = await captureInventory(db); assert.deepEqual(compareInventories(before, after, "05"), []);
    const edges = await db.todoDependency.findMany({ where: { dependentId: { in: ids } }, orderBy: { dependentId: "asc" } });
    assert.deepEqual(edges.map(edge => [edge.dependentId,edge.prerequisiteId]), pairs);
    assert.deepEqual(edges.map(edge => edge.legacyReviewReason), [null,"SELF","CYCLE_PATH","CYCLE_PATH","CYCLE_PATH","CROSS_OWNER"]);
    assert.equal(after.tables.WorkActivity.hash, before.tables.WorkActivity.hash); assert.equal(after.tables.User.hash, before.tables.User.hash);
    const sql = readFileSync("prisma/migrations/20261110120000_task_relationships/migration.sql", "utf8").split("-- BEGIN LEGACY EDGE BACKFILL")[1].split("-- END LEGACY EDGE BACKFILL")[0];
    const backfill = sql.slice(sql.indexOf("WITH RECURSIVE")); await db.$executeRawUnsafe(backfill);
    assert.deepEqual(compareInventories(after, await captureInventory(db), "05"), []);
    deploy(); assert.deepEqual(compareInventories(after, await captureInventory(db), "05"), []);
    assert.ok(after.issues.some(issue => issue.includes("anomalies"))); console.log("Legacy direction, timestamps, checklist IDs, calendar links, balances, anomaly flags and repeat migration verified.");
  } finally { await db.$disconnect(); }
});
