import { timeZoneTestDependency } from "./helpers/time-zone.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
import { compareInventories } from "../scripts/work-management-inventory.mjs";
function load(file, deps = {}) {
  const result = {},
    source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
  new Function("exports", "require", source)(
    result,
    (name) => deps[name] ?? timeZoneTestDependency(name),
  );
  return result;
}
const validation = load("../src/lib/work-management/validation.ts"),
  modules = loadTaskFoundation(validation),
  query = modules["./query"];
test("All Work parses bounded validated filters", () => {
  const parsed = query.parseWorkQuery(
    new URLSearchParams(
      "view=history&q=TASK-0013&context=none&person=2&sort=priority&status=DONE&priority=URGENT&tag=printer",
    ),
  );
  assert.equal(parsed.page, 1);
  assert.equal(parsed.context, "none");
  assert.equal(parsed.person, "2");
  assert.equal(query.WORK_PAGE_SIZE, 30);
  for (const input of [
    "view=bad",
    "status=bad",
    "priority=bad",
    "kind=bad",
    "sort=bad",
    "context=bad",
    "person=0",
    "page=0",
    "page=2147483648",
    `q=${"x".repeat(501)}`,
  ])
    assert.throws(
      () => query.parseWorkQuery(new URLSearchParams(input)),
      validation.WorkValidationError,
    );
});
test("search query always scopes owner, archive/history and optional people/reference correctly", () => {
  const where = query.workQueryWhere(
    query.parseWorkQuery(new URLSearchParams("q=TASK-0013&context=none&person=2&priority=URGENT")),
    1,
  );
  assert.deepEqual(where.AND[0], { userId: 1 });
  assert.deepEqual(where.AND[1], { archivedAt: null });
  assert.ok(JSON.stringify(where).includes('"notIn":["DONE","CANCELLED"]'));
  assert.deepEqual(where.AND.at(-1).OR.at(-1), { id: 13 });
  assert.ok(JSON.stringify(where).includes('"requesterId":2'));
  assert.ok(JSON.stringify(where).includes('"affectedPeople"'));
  assert.ok(JSON.stringify(where).includes('"contextId":null'));
  assert.deepEqual(query.workQueryOrder("priority").at(-1), { id: "desc" });
  const archived = query.workQueryWhere(
    query.parseWorkQuery(new URLSearchParams("view=archived")),
    1,
  );
  assert.deepEqual(archived.AND[1], { archivedAt: { not: null } });
});
test("people activity snapshots preserve readable identities without contact maintenance fields", () => {
  const changes = modules["./task-foundation"].taskChanges(
    { requester: null, affectedPeople: [] },
    {
      requester: { id: 2, name: "Example contact", company: "Example", revision: 9 },
      affectedPeople: [{ contact: { id: 3, name: "Other contact", active: true } }],
    },
  );
  assert.deepEqual(changes.requester.after, { id: 2, name: "Example contact" });
  assert.deepEqual(changes.affectedPeople.after, [{ id: 3, name: "Other contact" }]);
  assert.ok(!JSON.stringify(changes).includes("revision"));
});
test("Phase 03 inventory permits only new nullable people columns and empty contact relations", () => {
  const before = {
    format: 2,
    tables: {
      Todo: { count: 1, hash: "old", rows: ['{"id":1,"title":"original","priority":99}'] },
    },
    columns: [
      { table_name: "Todo", column_name: "id" },
      { table_name: "Todo", column_name: "title" },
      { table_name: "Todo", column_name: "priority" },
    ],
    foreignKeys: [],
    enums: [],
    indexes: [],
  };
  const after = {
    ...before,
    tables: {
      Todo: {
        count: 1,
        hash: "new",
        rows: [
          '{"id":1,"title":"original","priority":99,"requesterId":null,"waitingOnContactId":null}',
        ],
      },
      WorkContact: { count: 0 },
      TodoAffectedContact: { count: 0 },
    },
    columns: [
      ...before.columns,
      { table_name: "Todo", column_name: "requesterId" },
      { table_name: "Todo", column_name: "waitingOnContactId" },
    ],
  };
  assert.deepEqual(compareInventories(before, after, "03"), []);
  assert.ok(
    compareInventories(
      before,
      { ...after, tables: { ...after.tables, WorkContact: { count: 1 } } },
      "03",
    ).some((value) => value.includes("backfill")),
  );
  assert.ok(
    compareInventories(
      before,
      {
        ...after,
        tables: {
          ...after.tables,
          Todo: {
            ...after.tables.Todo,
            rows: [
              '{"id":1,"title":"changed","priority":99,"requesterId":null,"waitingOnContactId":null}',
            ],
          },
        },
      },
      "03",
    ).some((value) => value.includes("records changed")),
  );
});
