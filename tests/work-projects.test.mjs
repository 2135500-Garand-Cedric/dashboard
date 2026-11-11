import assert from "node:assert/strict";
import test from "node:test";
import { compareInventories } from "../scripts/work-management-inventory.mjs";

test("Phase 08 preservation distinguishes an unchanged pre-migration database from inferred membership", () => {
  const before = {
    format: 2,
    tables: {
      Todo: {
        count: 1,
        hash: "before",
        rows: [JSON.stringify({ id: 1, title: "Keep original task" })],
      },
    },
    columns: [
      { table_name: "Todo", column_name: "id" },
      { table_name: "Todo", column_name: "title" },
    ],
    enums: [],
    foreignKeys: [],
    indexes: [],
  };
  assert.deepEqual(compareInventories(before, structuredClone(before), "08"), []);
  const after = {
    ...before,
    tables: {
      Todo: {
        count: 1,
        hash: "after",
        rows: [
          JSON.stringify({ id: 1, title: "Keep original task", projectId: null, stageId: null }),
        ],
      },
      WorkProject: { count: 0, rows: [] },
      WorkProjectStage: { count: 0, rows: [] },
    },
    columns: [
      ...before.columns,
      { table_name: "Todo", column_name: "projectId" },
      { table_name: "Todo", column_name: "stageId" },
    ],
  };
  assert.deepEqual(compareInventories(before, after, "08"), []);
  const inferred = structuredClone(after);
  inferred.tables.Todo.rows = [
    JSON.stringify({ id: 1, title: "Keep original task", projectId: 12, stageId: null }),
  ];
  assert.ok(
    compareInventories(before, inferred, "08").includes("Unexpected project membership backfill."),
  );
  const invented = structuredClone(after);
  invented.tables.WorkProject = { count: 1, rows: [JSON.stringify({ id: 12 })] };
  assert.ok(
    compareInventories(before, invented, "08").includes("Unexpected project or stage backfill."),
  );
});
