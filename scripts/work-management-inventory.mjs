import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const technical = {
  Todo: ["revision", "rewardAppliedXp", "rewardAppliedCoins", "rewardAccountingBasis"],
  Event: ["revision"],
  Subtask: ["revision"],
};
const foundationColumns = [
  "priorityLevel",
  "kind",
  "contextId",
  "company",
  "course",
  "system",
  "tags",
  "desiredOutcome",
  "nextAction",
  "waitingOn",
  "waitingReason",
  "workaround",
  "completionSummary",
  "closureType",
  "completedAt",
  "cancelledAt",
  "archivedAt",
];
const knownStatuses = ["TODO", "IN_PROGRESS", "DONE", "NEW", "BACKLOG", "WAITING", "CANCELLED"];
const newEnums = {
  WorkPriority: ["URGENT", "HIGH", "NORMAL", "LOW"],
  WorkTaskKind: ["TASK", "ISSUE", "REQUEST", "IMPROVEMENT", "MAINTENANCE"],
  WorkClosureType: ["OUTCOME_ACHIEVED", "ACCEPTED_WORKAROUND", "CANCELLED"],
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const identifier = (value) => `"${value.replace(/"/g, '""')}"`;

export function inventoryIssues(todos, subtasks, events, users, statuses) {
  const issues = [];
  const tasks = new Map(todos.map((row) => [row.id, row]));
  if (!users.some((row) => row.id === 1)) issues.push("Configured owner user 1 is missing.");
  if (todos.some((row) => row.userId !== 1) || events.some((row) => row.userId !== 1))
    issues.push("Unexpected task/event owners require review; no rows were reassigned.");
  if (["TODO", "IN_PROGRESS", "DONE"].some((value) => !statuses.includes(value)))
    issues.push("Expected task enum values are missing; review schema drift.");
  if (statuses.some((value) => !knownStatuses.includes(value)))
    issues.push("Unrecognized task enum values require reviewed mapping.");
  if (todos.some((row) => !knownStatuses.includes(row.status)))
    issues.push("Unrecognized task statuses require reviewed mapping.");
  if (todos.some((row) => row.priority !== null && ![1, 2, 3].includes(row.priority)))
    issues.push("Unrecognized priorities require reviewed mapping.");
  if (todos.some((row) => row.rewardXp < 0 || row.rewardCoins < 0))
    issues.push("Negative legacy task rewards require review.");
  if (subtasks.some((row) => !tasks.has(row.todoId)))
    issues.push("Orphan checklist rows require review.");
  if (
    events.some(
      (row) =>
        row.linkedTodoId !== null &&
        (!tasks.has(row.linkedTodoId) || tasks.get(row.linkedTodoId).userId !== row.userId),
    )
  )
    issues.push("Missing/cross-owner event associations require review.");
  if (
    todos.some(
      (row) =>
        row.dependsOnId !== null &&
        (!tasks.has(row.dependsOnId) || tasks.get(row.dependsOnId).userId !== row.userId),
    )
  )
    issues.push("Missing/cross-owner prerequisites require review.");
  const complete = new Set();
  for (const row of todos) {
    const seen = new Set();
    let current = row.id;
    while (current !== null && tasks.has(current) && !complete.has(current)) {
      if (seen.has(current)) {
        issues.push("Legacy dependency cycles require review; edges were preserved.");
        break;
      }
      seen.add(current);
      current = tasks.get(current).dependsOnId;
    }
    for (const id of seen) complete.add(id);
  }
  return [...new Set(issues)];
}
export function compareInventories(before, after, phase = "01") {
  const differences = [],
    foundation = phase === "02",
    contacts = phase === "03",
    notes = phase === "04",
    graph = phase === "05",
    dates = phase === "06",
    calendar = phase === "07",
    projects = phase === "08";
  if (
    (foundation || contacts || notes || graph || dates || calendar || projects) &&
    before.format !== 2
  )
    return ["Capture a fresh format-2 baseline before this migration."];
  const allowedTables = projects
    ? ["WorkProject", "WorkProjectStage"]
    : calendar
      ? ["EventTaskLink", "WorkEventConversion", "WorkEventActivity"]
      : dates
        ? ["WorkFollowUp", "WorkKeyDate"]
        : graph
          ? ["TodoDependency", "TodoRelation"]
          : notes
            ? ["WorkNote", "WorkNoteRevision", "WorkAttachment"]
            : contacts
              ? ["WorkContact", "TodoAffectedContact"]
              : foundation
                ? ["WorkMutationReceipt", "WorkContext", "WorkActivity"]
                : ["WorkMutationReceipt"];
  const allowedColumns = (table, column) =>
    technical[table]?.includes(column) ||
    (projects &&
      ((table === "Todo" && ["projectId", "stageId"].includes(column)) ||
        (["WorkActivity", "WorkNote", "WorkAttachment", "WorkKeyDate"].includes(table) &&
          column === "projectId") ||
        (table === "WorkKeyDate" && column === "completedAt"))) ||
    (calendar &&
      table === "Event" &&
      ["kind", "busy", "timeZone", "allDayStart", "allDayEnd"].includes(column)) ||
    (dates &&
      table === "Todo" &&
      ["deadlineDate", "deadlineAt", "deadlineTimeZone"].includes(column)) ||
    (graph && table === "Todo" && column === "parentId") ||
    (foundation && table === "Todo" && foundationColumns.includes(column)) ||
    (contacts && table === "Todo" && ["requesterId", "waitingOnContactId"].includes(column)) ||
    (notes && table === "WorkActivity" && column === "noteRevisionId");
  for (const [name, table] of Object.entries(before.tables)) {
    const current = after.tables[name];
    if (current && table.count === current.count && table.hash === current.hash) continue;
    let equal = false;
    if (
      current &&
      table.count === current.count &&
      [
        "Todo",
        "Event",
        "Subtask",
        "WorkActivity",
        "WorkNote",
        "WorkAttachment",
        "WorkKeyDate",
      ].includes(name) &&
      table.rows &&
      current.rows
    ) {
      const added = after.columns
        .filter(
          (column) =>
            column.table_name === name &&
            !before.columns.some(
              (old) => old.table_name === name && old.column_name === column.column_name,
            ),
        )
        .map((column) => column.column_name);
      if (added.every((column) => allowedColumns(name, column))) {
        const excluded = before.format === 1 ? [...added, ...(technical[name] ?? [])] : added;
        const canonical = (rows, strip) =>
          rows
            .map((raw) => {
              const row = JSON.parse(raw);
              return JSON.stringify(
                Object.fromEntries(
                  Object.entries(row)
                    .filter(([key]) => !strip.includes(key))
                    .sort(([a], [b]) => a.localeCompare(b)),
                ),
              );
            })
            .sort();
        equal =
          JSON.stringify(canonical(table.rows, [])) ===
          JSON.stringify(canonical(current.rows, excluded));
      }
    }
    if (!equal) differences.push(`Original records changed: ${name}`);
  }
  for (const name of Object.keys(after.tables))
    if (!(name in before.tables) && !allowedTables.includes(name))
      differences.push(`Unexpected new table: ${name}`);
  if (
    notes &&
    ["WorkNote", "WorkNoteRevision", "WorkAttachment"].some(
      (name) => !(name in before.tables) && after.tables[name]?.count,
    )
  )
    differences.push("Unexpected note, revision or attachment backfill.");
  if (
    contacts &&
    ["WorkContact", "TodoAffectedContact"].some(
      (name) => !(name in before.tables) && after.tables[name]?.count,
    )
  )
    differences.push("Unexpected contact or people backfill.");
  if (foundation && !("WorkActivity" in before.tables) && after.tables.WorkActivity?.count)
    differences.push("Unexpected historical work activity backfill.");
  if (graph && !("TodoDependency" in before.tables) && "TodoDependency" in after.tables) {
    const tasks = (before.tables.Todo?.rows ?? []).map(JSON.parse);
    const expected = tasks
      .filter((task) => task.dependsOnId !== null)
      .map((task) => `${task.id}:${task.dependsOnId}`)
      .sort();
    const edges = (after.tables.TodoDependency?.rows ?? []).map(JSON.parse);
    if (
      JSON.stringify(expected) !==
        JSON.stringify(edges.map((edge) => `${edge.dependentId}:${edge.prerequisiteId}`).sort()) ||
      edges.some((edge) => edge.origin !== "LEGACY")
    )
      differences.push("Legacy dependency directions/tuples changed during backfill.");
    if (
      after.tables.TodoRelation?.count ||
      (after.tables.Todo?.rows ?? []).some((raw) => JSON.parse(raw).parentId !== null)
    )
      differences.push("Unexpected child or related-task backfill.");
  }
  if (dates && !("WorkFollowUp" in before.tables) && "WorkFollowUp" in after.tables) {
    if (
      after.tables.WorkFollowUp.count ||
      after.tables.WorkKeyDate?.count ||
      (after.tables.Todo?.rows ?? []).some((raw) => {
        const row = JSON.parse(raw);
        return (
          row.deadlineDate !== null || row.deadlineAt !== null || row.deadlineTimeZone !== null
        );
      })
    )
      differences.push("Unexpected task-date backfill: old dates must remain unknown.");
  }
  if (calendar && !("EventTaskLink" in before.tables) && "EventTaskLink" in after.tables) {
    const expected = (before.tables.Event?.rows ?? [])
      .map(JSON.parse)
      .filter((row) => row.linkedTodoId !== null)
      .map((row) => `${row.id}:${row.linkedTodoId}`)
      .sort();
    const links = after.tables.EventTaskLink.rows.map(JSON.parse);
    if (
      JSON.stringify(expected) !==
        JSON.stringify(links.map((row) => `${row.eventId}:${row.todoId}`).sort()) ||
      links.some((row) => row.role !== "RELATED" || row.origin !== "LEGACY")
    )
      differences.push("Legacy event-task associations changed during backfill.");
    if (
      after.tables.WorkEventConversion?.count ||
      after.tables.WorkEventActivity?.count ||
      after.tables.Event.rows.some((raw) => {
        const row = JSON.parse(raw);
        return (
          row.kind !== "ORDINARY" ||
          row.busy !== null ||
          row.timeZone !== null ||
          row.allDayStart !== null ||
          row.allDayEnd !== null
        );
      })
    )
      differences.push(
        "Unexpected event meaning, times or historical conversion/activity backfill.",
      );
  }
  if (
    projects &&
    before.tables.Todo &&
    after.tables.Todo &&
    after.columns.some(
      (column) => column.table_name === "Todo" && column.column_name === "projectId",
    ) &&
    after.tables.Todo.rows.some((raw) => {
      const row = JSON.parse(raw);
      return row.projectId !== null || row.stageId !== null;
    }) &&
    !before.columns.some(
      (column) => column.table_name === "Todo" && column.column_name === "projectId",
    )
  )
    differences.push("Unexpected project membership backfill.");
  if (
    projects &&
    !before.tables.WorkProject &&
    (after.tables.WorkProject?.count || after.tables.WorkProjectStage?.count)
  )
    differences.push("Unexpected project or stage backfill.");
  for (const column of before.columns) {
    const current = after.columns.find(
      (value) => value.table_name === column.table_name && value.column_name === column.column_name,
    );
    if (JSON.stringify(column) === JSON.stringify(current)) continue;
    const statusDefault =
      foundation &&
      column.table_name === "Todo" &&
      column.column_name === "status" &&
      current &&
      /'TODO'/.test(column.column_default) &&
      /'NEW'/.test(current.column_default) &&
      JSON.stringify({ ...column, column_default: null }) ===
        JSON.stringify({ ...current, column_default: null });
    const projectParent =
      projects &&
      current &&
      column.is_nullable === "NO" &&
      current.is_nullable === "YES" &&
      ((["WorkNote", "WorkAttachment", "WorkKeyDate"].includes(column.table_name) &&
        column.column_name === "todoId") ||
        (column.table_name === "WorkActivity" && column.column_name === "todoReference")) &&
      JSON.stringify({ ...column, is_nullable: "YES" }) === JSON.stringify(current);
    if (!statusDefault && !projectParent)
      differences.push(`Original column changed: ${column.table_name}.${column.column_name}`);
  }
  for (const column of after.columns)
    if (
      !before.columns.some(
        (value) =>
          value.table_name === column.table_name && value.column_name === column.column_name,
      ) &&
      !allowedTables.includes(column.table_name) &&
      !allowedColumns(column.table_name, column.column_name)
    )
      differences.push(`Unexpected new column: ${column.table_name}.${column.column_name}`);
  for (const index of before.indexes ?? [])
    if (!(after.indexes ?? []).some((value) => JSON.stringify(value) === JSON.stringify(index)))
      differences.push(`An original index changed: ${index.indexname}`);
  for (const row of before.enums)
    if (!after.enums.some((value) => JSON.stringify(value) === JSON.stringify(row)))
      differences.push("An original enum value changed.");
  for (const row of after.enums)
    if (!before.enums.some((value) => JSON.stringify(value) === JSON.stringify(row))) {
      if (
        !foundation ||
        !(row.typname === "TodoStatus"
          ? ["NEW", "BACKLOG", "WAITING", "CANCELLED"].includes(row.enumlabel)
          : newEnums[row.typname]?.includes(row.enumlabel))
      )
        differences.push("Unexpected enum values added.");
    }
  for (const key of before.foreignKeys)
    if (!after.foreignKeys.some((value) => JSON.stringify(value) === JSON.stringify(key)))
      differences.push("An original foreign key changed.");
  return [...new Set(differences)];
}
export async function captureInventory(prisma) {
  return prisma.$transaction(
    async (db) => {
      await db.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await db.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      const tables = {};
      const names = await db.$queryRawUnsafe(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      );
      for (const { tablename } of names) {
        if (tablename === "_prisma_migrations") continue;
        // Full SQL JSON text keeps exact money and phase-01 accounting baselines.
        const rows = await db.$queryRawUnsafe(
          `SELECT to_jsonb(t)::text AS row FROM public.${identifier(tablename)} t ORDER BY 1`,
        );
        const values = rows.map((row) => row.row);
        tables[tablename] = { count: values.length, hash: hash(values.join("\n")), rows: values };
      }
      const columns = await db.$queryRawUnsafe(
        "SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name,column_name",
      );
      const enums = await db.$queryRawUnsafe(
        "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
      );
      const foreignKeys = await db.$queryRawUnsafe(
        "SELECT c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public' ORDER BY c.conname",
      );
      const indexes = await db.$queryRawUnsafe(
        "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename,indexname",
      );
      const migrations = names.some((row) => row.tablename === "_prisma_migrations")
        ? await db.$queryRawUnsafe(
            'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
          )
        : [];
      const todos = (tables.Todo?.rows ?? []).map((row) => JSON.parse(row));
      const subtasks = (tables.Subtask?.rows ?? []).map((row) => JSON.parse(row));
      const events = (tables.Event?.rows ?? []).map((row) => JSON.parse(row));
      const users = (tables.User?.rows ?? []).map((row) => JSON.parse(row));
      const issues = inventoryIssues(
        todos,
        subtasks,
        events,
        users,
        enums.filter((row) => row.typname === "TodoStatus").map((row) => row.enumlabel),
      );
      const contacts = new Map(
        (tables.WorkContact?.rows ?? []).map((raw) => {
          const row = JSON.parse(raw);
          return [row.id, row];
        }),
      );
      if (
        todos.some((task) =>
          [task.requesterId, task.waitingOnContactId].some(
            (id) => id != null && contacts.get(id)?.userId !== task.userId,
          ),
        )
      )
        issues.push("Missing/cross-owner task contacts require review.");
      const taskOwners = new Map(todos.map((task) => [task.id, task.userId]));
      if (
        (tables.TodoAffectedContact?.rows ?? []).some((raw) => {
          const link = JSON.parse(raw);
          return (
            !taskOwners.has(link.todoId) ||
            contacts.get(link.contactId)?.userId !== taskOwners.get(link.todoId)
          );
        })
      )
        issues.push("Missing/cross-owner affected people require review.");
      const projects = new Map(
        (tables.WorkProject?.rows ?? []).map((raw) => {
          const row = JSON.parse(raw);
          return [row.id, row];
        }),
      );
      const stages = new Map(
        (tables.WorkProjectStage?.rows ?? []).map((raw) => {
          const row = JSON.parse(raw);
          return [row.id, row];
        }),
      );
      if (
        todos.some(
          (task) =>
            (task.projectId != null && projects.get(task.projectId)?.userId !== task.userId) ||
            (task.stageId != null &&
              (!task.projectId || stages.get(task.stageId)?.projectId !== task.projectId)),
        )
      )
        issues.push("Invalid project membership/owner/stage requires review.");
      const supportOwner = (row) =>
        row.projectId != null
          ? row.todoId == null
            ? projects.get(row.projectId)?.userId
            : undefined
          : taskOwners.get(row.todoId);
      const notes = new Map(
        (tables.WorkNote?.rows ?? []).map((raw) => {
          const row = JSON.parse(raw);
          return [row.id, row];
        }),
      );
      if (
        [...notes.values()].some((note) => supportOwner(note) !== note.userId) ||
        (tables.WorkAttachment?.rows ?? []).some((raw) => {
          const row = JSON.parse(raw);
          return supportOwner(row) !== row.userId;
        })
      )
        issues.push("Missing/cross-owner task supporting records require review.");
      const revisions = new Map(
        (tables.WorkNoteRevision?.rows ?? []).map((raw) => {
          const row = JSON.parse(raw);
          return [row.id, row];
        }),
      );
      if (
        (tables.WorkActivity?.rows ?? []).some((raw) => {
          const row = JSON.parse(raw),
            note =
              row.noteRevisionId == null
                ? null
                : notes.get(revisions.get(row.noteRevisionId)?.noteId);
          return (
            row.noteRevisionId != null &&
            (!note ||
              note.userId !== row.userId ||
              note.todoId !== row.todoId ||
              (note.projectId ?? null) !== (row.projectId ?? null))
          );
        })
      )
        issues.push("Cross-record note activity requires review.");
      if (tables.TodoDependency) {
        const edges = tables.TodoDependency.rows.map(JSON.parse),
          byId = new Map(todos.map((task) => [task.id, task]));
        if (
          edges.some(
            (edge) =>
              !byId.has(edge.dependentId) ||
              !byId.has(edge.prerequisiteId) ||
              byId.get(edge.dependentId)?.userId !== byId.get(edge.prerequisiteId)?.userId ||
              edge.legacyReviewReason,
          )
        )
          issues.push(
            "Canonical legacy dependency anomalies require review; no edges were erased.",
          );
        if (
          todos.some((task) => {
            const outgoing = edges.filter((edge) => edge.dependentId === task.id);
            return task.dependsOnId !== (outgoing.length === 1 ? outgoing[0].prerequisiteId : null);
          })
        )
          issues.push("Legacy dependency mirror disagrees with canonical edges.");
        if (
          todos.some(
            (task) => task.parentId != null && byId.get(task.parentId)?.userId !== task.userId,
          )
        )
          issues.push("Missing/cross-owner task parent requires review.");
        for (const task of todos) {
          const seen = new Set();
          let current = task;
          while (current) {
            if (seen.has(current.id)) {
              issues.push("Hierarchy cycle requires review.");
              break;
            }
            seen.add(current.id);
            current = byId.get(current.parentId);
          }
        }
        const adjacency = new Map();
        for (const edge of edges) {
          const list = adjacency.get(edge.dependentId) ?? [];
          list.push(edge.prerequisiteId);
          adjacency.set(edge.dependentId, list);
        }
        const done = new Set();
        for (const task of todos) {
          const active = new Set(),
            stack = [{ id: task.id, exit: false }];
          while (stack.length) {
            const node = stack.pop();
            if (node.exit) {
              active.delete(node.id);
              done.add(node.id);
              continue;
            }
            if (active.has(node.id)) {
              issues.push("Canonical dependency cycle requires review.");
              break;
            }
            if (done.has(node.id)) continue;
            active.add(node.id);
            stack.push({ id: node.id, exit: true });
            for (const id of adjacency.get(node.id) ?? []) stack.push({ id, exit: false });
          }
        }
        if (
          (tables.TodoRelation?.rows ?? []).some((raw) => {
            const edge = JSON.parse(raw);
            return (
              edge.firstId >= edge.secondId ||
              !byId.has(edge.firstId) ||
              byId.get(edge.firstId)?.userId !== byId.get(edge.secondId)?.userId
            );
          })
        )
          issues.push("Invalid related-task pair requires review.");
      }
      if (tables.WorkFollowUp) {
        const followUps = tables.WorkFollowUp.rows.map(JSON.parse),
          byId = new Map(followUps.map((row) => [row.id, row])),
          active = new Set();
        for (const row of followUps) {
          if (!taskOwners.has(row.todoId)) issues.push("Follow-up without a task requires review.");
          if (
            row.previousId !== null &&
            (byId.get(row.previousId)?.todoId !== row.todoId ||
              byId.get(row.previousId)?.status !== "SNOOZED")
          )
            issues.push("Cross-task or invalid follow-up predecessor requires review.");
          if (row.status === "ACTIVE") {
            if (active.has(row.todoId)) issues.push("Multiple active follow-ups require review.");
            active.add(row.todoId);
            if (
              todos.some(
                (task) => task.id === row.todoId && ["DONE", "CANCELLED"].includes(task.status),
              )
            )
              issues.push("Closed task has an active follow-up requiring review.");
          }
        }
        if (
          (tables.WorkKeyDate?.rows ?? []).some(
            (raw) => supportOwner(JSON.parse(raw)) === undefined,
          )
        )
          issues.push("Key date without one valid task or project requires review.");
      }
      if (tables.EventTaskLink) {
        const links = tables.EventTaskLink.rows.map(JSON.parse),
          eventMap = new Map(events.map((row) => [row.id, row]));
        for (const event of events) {
          const outgoing = links.filter((row) => row.eventId === event.id);
          if (event.linkedTodoId !== (outgoing.length === 1 ? outgoing[0].todoId : null))
            issues.push("Legacy event link mirror disagrees with canonical associations.");
          const targets = outgoing.filter((row) => row.role === "SESSION_TARGET");
          if (
            event.kind === "WORK_SESSION"
              ? targets.length !== 1 || !event.date || !event.endDate
              : targets.length !== 0
          )
            issues.push("Invalid session target/timing requires review.");
        }
        if (
          links.some(
            (link) =>
              !eventMap.has(link.eventId) ||
              taskOwners.get(link.todoId) !== eventMap.get(link.eventId)?.userId ||
              link.legacyReviewReason,
          )
        )
          issues.push("Legacy event association anomalies require review; links were preserved.");
      }
      const expected = {
        Todo: [
          "id",
          "title",
          "description",
          "status",
          "priority",
          "rewardXp",
          "rewardCoins",
          "userId",
          "dependsOnId",
          "createdAt",
          "updatedAt",
        ],
        Subtask: ["id", "todoId", "title", "done", "createdAt"],
        Event: [
          "id",
          "title",
          "description",
          "date",
          "endDate",
          "completed",
          "type",
          "userId",
          "linkedTodoId",
          "createdAt",
          "updatedAt",
        ],
      };
      for (const [table, required] of Object.entries(expected))
        for (const column of required)
          if (!columns.some((row) => row.table_name === table && row.column_name === column))
            issues.push(`Required legacy column missing: ${table}.${column}`);
      const migrationRoot = path.join(root, "prisma/migrations");
      const local = await readdir(migrationRoot);
      for (const row of migrations) {
        if (!row.finished_at && !row.rolled_back_at)
          issues.push("An unfinished migration requires review.");
        if (!local.includes(row.migration_name))
          issues.push(`Applied migration is absent locally: ${row.migration_name}`);
        else if (
          hash(await readFile(path.join(migrationRoot, row.migration_name, "migration.sql"))) !==
          row.checksum
        )
          issues.push(`Migration checksum differs: ${row.migration_name}`);
      }
      return {
        format: 2,
        capturedAt: new Date().toISOString(),
        ownerDatabaseUserId: 1,
        tables,
        columns,
        enums,
        foreignKeys,
        indexes,
        migrations,
        pendingMigrations: local.filter(
          (name) =>
            /^\d/.test(name) &&
            !migrations.some((row) => row.migration_name === name && row.finished_at),
        ),
        issues,
      };
    },
    { timeout: 60000 },
  );
}
async function main() {
  if (
    process.env.WORK_MANAGEMENT_INVENTORY !== "1" ||
    process.env.NODE_ENV === "production" ||
    !process.env.DATABASE_URL
  )
    throw new Error("Explicit nonproduction inventory environment required.");
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--output", "--compare", "--phase"].includes(args[i]) || !args[i + 1] || options[args[i]])
      throw new Error("Use --output <private-file> [--compare <before-file>].");
    options[args[i]] = args[i] === "--phase" ? args[i + 1] : path.resolve(args[i + 1]);
  }
  if (
    options["--phase"] &&
    !["01", "02", "03", "04", "05", "06", "07", "08"].includes(options["--phase"])
  )
    throw new Error("Choose a supported phase.");
  if (!options["--output"]) throw new Error("A private output path is required.");
  const output = options["--output"];
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const parent = await realpath(path.dirname(output)),
    publicRoot = await realpath(path.join(root, "public"));
  if (parent === publicRoot || parent.startsWith(`${publicRoot}${path.sep}`))
    throw new Error("Inventory output must not be public.");
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient({ log: [] });
  try {
    const inventory = await captureInventory(prisma);
    const differences = options["--compare"]
      ? compareInventories(
          JSON.parse(await readFile(options["--compare"], "utf8")),
          inventory,
          options["--phase"] ?? "01",
        )
      : [];
    const file = await open(
      output,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify(inventory));
    } finally {
      await file.close();
    }
    console.log(
      JSON.stringify(
        {
          tables: Object.fromEntries(
            Object.entries(inventory.tables).map(([name, value]) => [name, value.count]),
          ),
          issues: inventory.issues,
          pendingMigrations: inventory.pendingMigrations,
          differences,
        },
        null,
        2,
      ),
    );
    if (inventory.issues.length || differences.length) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      "Work inventory failed. Check the explicit nonproduction connection, schema and private output path. No credentials or row contents were logged.",
    );
    process.exitCode = 1;
  });
