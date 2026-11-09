import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const technical = { Todo: ["revision", "rewardAppliedXp", "rewardAppliedCoins", "rewardAccountingBasis"], Event: ["revision"], Subtask: ["revision"] };
const hash = value => createHash("sha256").update(value).digest("hex");
const identifier = value => `"${value.replace(/"/g, '""')}"`;

export function inventoryIssues(todos, subtasks, events, users, statuses) {
  const issues = [];
  const tasks = new Map(todos.map(row => [row.id, row]));
  if (!users.some(row => row.id === 1)) issues.push("Configured owner user 1 is missing.");
  if (todos.some(row => row.userId !== 1) || events.some(row => row.userId !== 1)) issues.push("Unexpected task/event owners require review; no rows were reassigned.");
  if (["TODO", "IN_PROGRESS", "DONE"].some(value => !statuses.includes(value))) issues.push("Expected task enum values are missing; review schema drift.");
  if (statuses.some(value => !["TODO", "IN_PROGRESS", "DONE"].includes(value))) issues.push("Unrecognized task enum values require reviewed mapping.");
  if (todos.some(row => !["TODO", "IN_PROGRESS", "DONE"].includes(row.status))) issues.push("Unrecognized task statuses require reviewed mapping.");
  if (todos.some(row => row.priority !== null && ![1, 2, 3].includes(row.priority))) issues.push("Unrecognized priorities require reviewed mapping.");
  if (todos.some(row => row.rewardXp < 0 || row.rewardCoins < 0)) issues.push("Negative legacy task rewards require review.");
  if (subtasks.some(row => !tasks.has(row.todoId))) issues.push("Orphan checklist rows require review.");
  if (events.some(row => row.linkedTodoId !== null && (!tasks.has(row.linkedTodoId) || tasks.get(row.linkedTodoId).userId !== row.userId))) issues.push("Missing/cross-owner event associations require review.");
  if (todos.some(row => row.dependsOnId !== null && (!tasks.has(row.dependsOnId) || tasks.get(row.dependsOnId).userId !== row.userId))) issues.push("Missing/cross-owner prerequisites require review.");
  const complete = new Set();
  for (const row of todos) {
    const seen = new Set(); let current = row.id;
    while (current !== null && tasks.has(current) && !complete.has(current)) {
      if (seen.has(current)) { issues.push("Legacy dependency cycles require review; edges were preserved."); break; }
      seen.add(current); current = tasks.get(current).dependsOnId;
    }
    for (const id of seen) complete.add(id);
  }
  return [...new Set(issues)];
}
export function compareInventories(before, after) {
  const differences = [];
  for (const [name, table] of Object.entries(before.tables)) {
    if (!after.tables[name] || table.hash !== after.tables[name].hash || table.count !== after.tables[name].count) differences.push(`Original records changed: ${name}`);
  }
  for (const name of Object.keys(after.tables)) if (!(name in before.tables) && name !== "WorkMutationReceipt") differences.push(`Unexpected new table: ${name}`);
  for (const column of before.columns) if (!after.columns.some(value => JSON.stringify(value) === JSON.stringify(column))) differences.push(`Original column changed: ${column.table_name}.${column.column_name}`);
  for (const column of after.columns) if (!before.columns.some(value => value.table_name === column.table_name && value.column_name === column.column_name) && column.table_name !== "WorkMutationReceipt" && !technical[column.table_name]?.includes(column.column_name)) differences.push(`Unexpected new column: ${column.table_name}.${column.column_name}`);
  for (const index of before.indexes ?? []) if (!(after.indexes ?? []).some(value => JSON.stringify(value) === JSON.stringify(index))) differences.push(`An original index changed: ${index.indexname}`);
  if (JSON.stringify(before.enums) !== JSON.stringify(after.enums)) differences.push("Enum values changed.");
  for (const key of before.foreignKeys) if (!after.foreignKeys.some(value => JSON.stringify(value) === JSON.stringify(key))) differences.push("An original foreign key changed.");
  return [...new Set(differences)];
}
export async function captureInventory(prisma) {
  return prisma.$transaction(async db => {
    await db.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await db.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    const tables = {};
    const names = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    for (const { tablename } of names) {
      if (tablename === "_prisma_migrations") continue;
      const excluded = technical[tablename] ?? [];
      // SQL text retains exact decimals/timestamps instead of coercing JSON numbers.
      const rows = await db.$queryRawUnsafe(`SELECT (to_jsonb(t) - ARRAY[${excluded.map(key => `'${key}'`).join(",")}]::text[])::text AS row FROM public.${identifier(tablename)} t ORDER BY 1`);
      const values = rows.map(row => row.row);
      tables[tablename] = { count: values.length, hash: hash(values.join("\n")), rows: values };
    }
    const columns = await db.$queryRawUnsafe("SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name,column_name");
    const enums = await db.$queryRawUnsafe("SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder");
    const foreignKeys = await db.$queryRawUnsafe("SELECT c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public' ORDER BY c.conname");
    const indexes = await db.$queryRawUnsafe("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename,indexname");
    const migrations = names.some(row => row.tablename === "_prisma_migrations") ? await db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name') : [];
    const todos = (tables.Todo?.rows ?? []).map(row => JSON.parse(row));
    const subtasks = (tables.Subtask?.rows ?? []).map(row => JSON.parse(row));
    const events = (tables.Event?.rows ?? []).map(row => JSON.parse(row));
    const users = (tables.User?.rows ?? []).map(row => JSON.parse(row));
    const issues = inventoryIssues(todos, subtasks, events, users, enums.filter(row => row.typname === "TodoStatus").map(row => row.enumlabel));
    const expected = { Todo: ["id", "title", "description", "status", "priority", "rewardXp", "rewardCoins", "userId", "dependsOnId", "createdAt", "updatedAt"], Subtask: ["id", "todoId", "title", "done", "createdAt"], Event: ["id", "title", "description", "date", "endDate", "completed", "type", "userId", "linkedTodoId", "createdAt", "updatedAt"] };
    for (const [table, required] of Object.entries(expected)) for (const column of required) if (!columns.some(row => row.table_name === table && row.column_name === column)) issues.push(`Required legacy column missing: ${table}.${column}`);
    const migrationRoot = path.join(root, "prisma/migrations");
    const local = await readdir(migrationRoot);
    for (const row of migrations) {
      if (!row.finished_at && !row.rolled_back_at) issues.push("An unfinished migration requires review.");
      if (!local.includes(row.migration_name)) issues.push(`Applied migration is absent locally: ${row.migration_name}`);
      else if (hash(await readFile(path.join(migrationRoot, row.migration_name, "migration.sql"))) !== row.checksum) issues.push(`Migration checksum differs: ${row.migration_name}`);
    }
    return { format: 1, capturedAt: new Date().toISOString(), ownerDatabaseUserId: 1, tables, columns, enums, foreignKeys, indexes, migrations, pendingMigrations: local.filter(name => /^\d/.test(name) && !migrations.some(row => row.migration_name === name && row.finished_at)), issues };
  }, { timeout: 60000 });
}
async function main() {
  if (process.env.WORK_MANAGEMENT_INVENTORY !== "1" || process.env.NODE_ENV === "production" || !process.env.DATABASE_URL) throw new Error("Explicit nonproduction inventory environment required.");
  const args = process.argv.slice(2); const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--output", "--compare"].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error("Use --output <private-file> [--compare <before-file>].");
    options[args[i]] = path.resolve(args[i + 1]);
  }
  if (!options["--output"]) throw new Error("A private output path is required.");
  const output = options["--output"];
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const parent = await realpath(path.dirname(output)), publicRoot = await realpath(path.join(root, "public"));
  if (parent === publicRoot || parent.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Inventory output must not be public.");
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient({ log: [] });
  try {
    const inventory = await captureInventory(prisma);
    const differences = options["--compare"] ? compareInventories(JSON.parse(await readFile(options["--compare"], "utf8")), inventory) : [];
    const file = await open(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(JSON.stringify(inventory)); } finally { await file.close(); }
    console.log(JSON.stringify({ tables: Object.fromEntries(Object.entries(inventory.tables).map(([name, value]) => [name, value.count])), issues: inventory.issues, pendingMigrations: inventory.pendingMigrations, differences }, null, 2));
    if (inventory.issues.length || differences.length) process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error("Work inventory failed. Check the explicit nonproduction connection, schema and private output path. No credentials or row contents were logged."); process.exitCode = 1; });
