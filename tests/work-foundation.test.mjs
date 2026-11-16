import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
import { compareInventories } from "../scripts/work-management-inventory.mjs";
const validation = {};
{
  const code = ts.transpileModule(
    fs.readFileSync(new URL("../src/lib/work-management/validation.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
  ).outputText;
  new Function("exports", "require", code)(validation, () => ({}));
}
const { "./types": types, "./task-foundation": fields } = loadTaskFoundation(validation);
const row = (extra) => ({
  status: "TODO",
  priorityLevel: "NORMAL",
  archivedAt: null,
  workaround: null,
  closureType: null,
  completionSummary: null,
  ...extra,
});
test("references and reviewed legacy mappings retain unknown priorities without renumbering", () => {
  assert.equal(types.taskReference(142), "TASK-0142");
  assert.equal(types.taskReference(123456), "TASK-123456");
  for (const [raw, level] of [
    [1, "LOW"],
    [2, "NORMAL"],
    [3, "HIGH"],
    [null, "NORMAL"],
    [99, null],
  ])
    assert.equal(types.legacyPriorityLevel(raw), level);
  assert.equal(fields.parseTaskFields({ priority: 2 }).priorityLevel, "NORMAL");
  assert.throws(() => fields.parseTaskFields({ priority: 1, priorityLevel: "HIGH" }));
  for (const body of [
    { status: "CUSTOM" },
    { priorityLevel: "MEDIUM" },
    { archived: "true" },
    { activityTypeId: -1 },
    { kind: "EXAM" },
  ])
    assert.throws(() => fields.parseTaskFields(body));
});
test("closure timestamps are server supplied, legacy dates stay unknown on metadata edits, and reopening clears current closure only", () => {
  const now = new Date("2026-11-09T18:00:00Z");
  const closed = fields.lifecycleData(row(), { status: "DONE" }, {}, now);
  assert.equal(closed.completedAt, now);
  assert.equal(closed.closureType, "OUTCOME_ACHIEVED");
  assert.deepEqual(
    fields.lifecycleData(row({ status: "DONE" }), { nextAction: "metadata edit" }, {}, now),
    { nextAction: "metadata edit" },
  );
  const reopened = fields.lifecycleData(row({ status: "DONE" }), { status: "TODO" }, {}, now);
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.completionSummary, null);
  assert.equal(fields.activityAction(row({ status: "DONE" }), row(), { status: {} }), "REOPENED");
  assert.throws(() => fields.lifecycleData(row({ archivedAt: now }), { status: "DONE" }, {}, now));
  assert.equal(fields.lifecycleData(row(), {}, { archived: true }, now).archivedAt, now);
});
test("workaround completion needs explicit acceptance, actual workaround and explanation; its evidence cannot be silently erased", () => {
  const now = new Date();
  const original = row({ workaround: "Use the spare device" });
  for (const body of [{}, { acceptWorkaround: false }])
    assert.throws(() =>
      fields.lifecycleData(
        original,
        { status: "DONE", completionSummary: "Accepted" },
        { ...body, closureMode: "ACCEPTED_WORKAROUND" },
        now,
      ),
    );
  assert.throws(() =>
    fields.lifecycleData(
      original,
      { status: "DONE" },
      { closureMode: "ACCEPTED_WORKAROUND", acceptWorkaround: true },
      now,
    ),
  );
  const result = fields.lifecycleData(
    original,
    { status: "DONE", completionSummary: "Accepted while replacement is ordered" },
    { closureMode: "ACCEPTED_WORKAROUND", acceptWorkaround: true },
    now,
  );
  assert.equal(result.closureType, "ACCEPTED_WORKAROUND");
  assert.throws(() =>
    fields.lifecycleData(
      row({
        status: "DONE",
        closureType: "ACCEPTED_WORKAROUND",
        workaround: "Spare",
        completionSummary: "Approved",
      }),
      { completionSummary: null },
      {},
      now,
    ),
  );
});
test("audit changes retain independent snapshots, omit no-ops and record only actual differences", () => {
  const before = { status: "TODO", priorityLevel: "NORMAL", context: { id: 1, name: "School" } };
  assert.deepEqual(fields.taskChanges(before, before), {});
  const changes = fields.taskChanges(before, { ...before, status: "DONE" });
  assert.deepEqual(changes, { status: { before: "TODO", after: "DONE" } });
  assert.equal(fields.activityAction(before, { ...before, status: "DONE" }, changes), "COMPLETED");
});
test("phase-02 inventory permits only declared additive fields/enums/defaults and detects original/reward data changes", () => {
  const old = { id: 1, priority: 99, status: "TODO", rewardAppliedXp: 25 };
  const columns = Object.keys(old).map((column_name) => ({ table_name: "Todo", column_name }));
  const before = {
    format: 2,
    tables: { Todo: { count: 1, hash: "a", rows: [JSON.stringify(old)] } },
    columns,
    enums: [{ typname: "TodoStatus", enumlabel: "TODO", enumsortorder: 1 }],
    foreignKeys: [],
  };
  const next = { ...old, priorityLevel: null, contextId: null };
  const after = {
    ...before,
    tables: {
      Todo: { count: 1, hash: "b", rows: [JSON.stringify(next)] },
      WorkContext: { count: 3 },
      WorkActivity: { count: 0 },
    },
    columns: [
      ...columns,
      { table_name: "Todo", column_name: "priorityLevel" },
      { table_name: "Todo", column_name: "contextId" },
    ],
    enums: [...before.enums, { typname: "TodoStatus", enumlabel: "NEW", enumsortorder: 2 }],
  };
  assert.deepEqual(compareInventories(before, after, "02"), []);
  assert.ok(
    compareInventories(
      before,
      {
        ...after,
        tables: {
          ...after.tables,
          Todo: { ...after.tables.Todo, rows: [JSON.stringify({ ...next, rewardAppliedXp: 0 })] },
        },
      },
      "02",
    ).includes("Original records changed: Todo"),
  );
  assert.ok(
    compareInventories(
      before,
      { ...after, tables: { ...after.tables, WorkActivity: { count: 1 } } },
      "02",
    ).some((value) => value.includes("historical")),
  );
});

test("retired task metadata is rejected by the public command schema", () => {
  for (const key of [
    "rewardXp",
    "rewardCoins",
    "tags",
    "contextId",
    "waitingOnContactId",
    "company",
    "course",
  ]) {
    assert.throws(() => validation.workBody({ [key]: 0 }, fields.TASK_FIELDS));
  }
});

test("closing automatically archives and reopening returns the task to active work", () => {
  const now = new Date("2026-11-13T15:00:00Z");
  for (const status of ["DONE", "CANCELLED"]) {
    const closed = fields.lifecycleData(row(), { status }, {}, now);
    assert.equal(closed.archivedAt, now);
    const reopened = fields.lifecycleData(
      row({ status, archivedAt: now }),
      { status: "TODO" },
      {},
      new Date(now.getTime() + 1000),
    );
    assert.equal(reopened.archivedAt, null);
    assert.equal(reopened.completedAt, null);
    assert.equal(reopened.cancelledAt, null);
  }
});

test("activity-type assignments retain readable audit facts without restoring contexts", () => {
  const changes = fields.taskChanges(
    { activityType: { id: 1, name: "School", color: "#3b82f6" } },
    { activityType: { id: 2, name: "Work", color: "#f43f5e" } },
  );
  assert.deepEqual(changes.activityType, {
    before: { id: 1, name: "School" },
    after: { id: 2, name: "Work" },
  });
  assert.equal(fields.activityAction(row(), row(), changes), "ACTIVITY_TYPE_CHANGED");
});
