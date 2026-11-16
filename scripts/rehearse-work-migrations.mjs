// Explicit disposable-only maintenance. Never reset or connect to a live database.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { captureInventory, compareInventories } from "./work-management-inventory.mjs";

export const workMigrationStages = [
  ["01", "20261109120000_work_mutation_safety"],
  ["02", "20261109130100_canonical_task_foundation"],
  ["03", "20261109150000_work_contacts"],
  ["04", "20261109170000_work_notes_and_attachments"],
  ["05", "20261110120000_task_relationships"],
  ["06", "20261110180000_task_dates"],
  ["07", "20261111120000_calendar_work_layers"],
  ["08", "20261112120000_work_projects"],
  ["09", "20261113120000_work_focus"],
];

export function createMigrationWorkspace(phase) {
  const stage = workMigrationStages.find(([number]) => number === phase);
  assert.ok(stage, "Choose an implemented work migration phase.");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "work-migration-fixture-"));
  fs.mkdirSync(path.join(root, "migrations"));
  fs.copyFileSync("prisma/schema.prisma", path.join(root, "schema.prisma"));
  for (const name of fs.readdirSync("prisma/migrations")) {
    if (name === "migration_lock.toml" || (/^\d/.test(name) && name <= stage[1])) {
      fs.cpSync(path.join("prisma/migrations", name), path.join(root, "migrations", name), {
        recursive: true,
      });
    }
  }
  return {
    schema: path.join(root, "schema.prisma"),
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export function assertRehearsalEnvironment(database = "work_test") {
  const url = new URL(process.env.DATABASE_URL || "file:missing");
  assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1", "Disposable opt-in required.");
  assert.equal(process.env.RUN_WORK_REHEARSAL, "1", "Explicit rehearsal opt-in required.");
  assert.equal(process.env.NODE_ENV, "test", "Only the isolated test environment is allowed.");
  assert.equal(url.hostname, "work-db", "Only the standalone work-db host is allowed.");
  assert.equal(url.pathname, `/${database}`, "Choose the dedicated disposable database.");
}

export function assertOriginalRows(before, after) {
  for (const [name, table] of Object.entries(before.tables)) {
    const keys = before.columns
      .filter((column) => column.table_name === name)
      .map((column) => column.column_name)
      .sort();
    const projected = (rows) =>
      rows
        .map((raw) => {
          const row = JSON.parse(raw);
          return JSON.stringify(Object.fromEntries(keys.map((key) => [key, row[key]])));
        })
        .sort();
    assert.deepEqual(
      projected(after.tables[name]?.rows || []),
      projected(table.rows),
      `Original values or IDs changed in ${name}.`,
    );
  }
}

export async function rehearseMigrations(db, output) {
  assertRehearsalEnvironment();
  const destination = path.resolve(output);
  const publicRoot = fs.realpathSync("public");
  const parent = fs.realpathSync(path.dirname(destination));
  assert.ok(
    parent !== publicRoot && !parent.startsWith(`${publicRoot}${path.sep}`),
    "Inventories must remain private.",
  );
  fs.mkdirSync(destination, { mode: 0o700 }); // Existing evidence is never overwritten.
  const save = (name, value) =>
    fs.writeFileSync(path.join(destination, name), JSON.stringify(value, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  const migrationRoot = path.resolve("prisma/migrations");
  const names = fs
    .readdirSync(migrationRoot)
    .filter((name) => /^\d/.test(name))
    .sort();
  const before = await captureInventory(db);
  assert.ok(!before.tables.WorkMutationReceipt, "Restore a fresh pre-redesign copy first.");
  assert.deepEqual(before.issues, [], "Review baseline integrity issues before migration.");
  save("before.json", before);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "work-migration-chain-"));
  fs.mkdirSync(path.join(scratch, "migrations"));
  fs.copyFileSync("prisma/schema.prisma", path.join(scratch, "schema.prisma"));
  fs.copyFileSync(
    path.join(migrationRoot, "migration_lock.toml"),
    path.join(scratch, "migrations/migration_lock.toml"),
  );
  const deploy = (name) => {
    const result = spawnSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", path.join(scratch, "schema.prisma")],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    fs.writeFileSync(
      path.join(destination, `${name}.log`),
      `${result.stdout || ""}\n${result.stderr || ""}`,
      { flag: "wx", mode: 0o600 },
    );
    assert.equal(result.status, 0, "Migration failed; inspect the private rehearsal log.");
  };
  let previous = before;
  const report = [];
  try {
    for (const [phase, through] of workMigrationStages) {
      for (const name of names.filter((name) => name <= through)) {
        const target = path.join(scratch, "migrations", name);
        if (!fs.existsSync(target))
          fs.cpSync(path.join(migrationRoot, name), target, {
            recursive: true,
          });
      }
      deploy(`phase-${phase}`);
      const current = await captureInventory(db);
      save(`phase-${phase}.json`, current);
      assert.deepEqual(
        compareInventories(previous, current, phase),
        [],
        `Phase ${phase} preservation comparison failed.`,
      );
      assert.deepEqual(current.issues, [], `Phase ${phase} has integrity issues.`);
      assertOriginalRows(before, current);
      if (phase === "01") {
        for (const raw of current.tables.Todo.rows) {
          const row = JSON.parse(raw);
          assert.equal(row.rewardAccountingBasis, "LEGACY_BASELINE");
          assert.equal(row.rewardAppliedXp, row.status === "DONE" ? row.rewardXp : 0);
          assert.equal(row.rewardAppliedCoins, row.status === "DONE" ? row.rewardCoins : 0);
        }
      }
      deploy(`phase-${phase}-repeat`);
      const repeated = await captureInventory(db);
      assert.deepEqual(compareInventories(current, repeated, phase), []);
      assertOriginalRows(current, repeated);
      report.push({
        phase,
        applied: current.migrations.filter((row) => row.finished_at).length,
        originalRowsPreserved: true,
        repeatUnchanged: true,
      });
      previous = current;
      console.log(
        `Phase ${phase}: original fields, IDs, relationships and balances preserved; repeat unchanged.`,
      );
    }
    // This rehearsal deliberately stops at the final work-management migration.
    // Later, separately tested app migrations must remain pending on this copy.
    const laterAppMigrations = [
      "20261114120000_user_display_time_zone",
      "20261115120000_japanese_practice_rewards",
    ];
    assert.deepEqual(previous.pendingMigrations, laterAppMigrations);
    save("report.json", {
      baseline: "restored pre-redesign database",
      stages: report,
      originalTables: Object.keys(before.tables).length,
      originalTasks: before.tables.Todo.count,
      originalEvents: before.tables.Event.count,
      originalChecklists: before.tables.Subtask.count,
      pendingAppMigrations: previous.pendingMigrations,
      productionVerified: false,
    });
    return previous;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const db = new PrismaClient({ log: [] });
  try {
    assert.equal(process.argv.length, 3, "Provide one new private output directory.");
    await rehearseMigrations(db, process.argv[2]);
  } catch {
    console.error(
      "Work migration rehearsal failed. Inspect private evidence; no row contents were logged.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
