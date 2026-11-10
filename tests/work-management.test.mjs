import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { inventoryIssues, compareInventories } from "../scripts/work-management-inventory.mjs";
function load(file, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  }).outputText;
  new Function("exports", "require", code)(exports, (name) => deps[name]);
  return exports;
}
const validation = load("../src/lib/work-management/validation.ts", {
  "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
});
test("work commands require strong record versions and replay keys", () => {
  const key = "12345678-1234-4234-8234-123456789abc";
  const req = (headers) => new Request("http://localhost", { method: "PATCH", headers });
  assert.deepEqual(validation.workCommand(req({ "Idempotency-Key": key, "If-Match": '"12"' })), {
    requestKey: key,
    revision: 12,
  });
  for (const version of ["", "*", "0", "-1", "1.5", 'W/"2"', '"2", "3"'])
    assert.throws(
      () => validation.workCommand(req({ "Idempotency-Key": key, "If-Match": version })),
      validation.WorkValidationError,
    );
  assert.throws(
    () => validation.workCommand(req({ "If-Match": "2" })),
    validation.WorkValidationError,
  );
  for (const id of ["bad", 0, -1, 1.1, 2147483648]) assert.throws(() => validation.workId(id));
  assert.equal(validation.workId("12"), 12);
});
test("inventories flag owners, unknown values, cross-owner edges and cycles without changing inputs", () => {
  const rows = [
    { id: 1, userId: 1, status: "TODO", priority: 1, dependsOnId: 2 },
    { id: 2, userId: 2, status: "CUSTOM", priority: 10, dependsOnId: 1 },
  ];
  const copy = structuredClone(rows);
  const issues = inventoryIssues(
    rows,
    [{ todoId: 90 }],
    [{ userId: 1, linkedTodoId: 2 }],
    [{ id: 1 }],
    ["TODO", "CUSTOM"],
  );
  for (const word of [
    "owners",
    "statuses",
    "priorities",
    "cycles",
    "checklist",
    "event",
    "prerequisites",
    "enum",
  ])
    assert.ok(
      issues.some((issue) => issue.includes(word)),
      word,
    );
  assert.deepEqual(rows, copy);
});
test("preservation comparison checks row identity/content and schema, allowing only technical additions", () => {
  const before = {
    tables: { Todo: { count: 1, hash: "original" } },
    columns: [{ table_name: "Todo", column_name: "id" }],
    enums: [],
    foreignKeys: [],
  };
  assert.deepEqual(
    compareInventories(before, {
      ...before,
      tables: { ...before.tables, WorkMutationReceipt: { count: 0, hash: "" } },
      columns: [...before.columns, { table_name: "Todo", column_name: "revision" }],
    }),
    [],
  );
  assert.ok(
    compareInventories(before, {
      ...before,
      tables: { Todo: { count: 1, hash: "replacement" } },
    }).includes("Original records changed: Todo"),
  );
  assert.ok(
    compareInventories(before, { ...before, columns: [] }).some((issue) =>
      issue.includes("column changed"),
    ),
  );
});
test("work HTTP errors never expose internal exception contents", async () => {
  const response = await validation.workResponse(async () => {
    throw new Error("private-note-secret");
  });
  assert.equal(response.status, 500);
  assert.ok(!JSON.stringify(await response.json()).includes("private-note-secret"));
  const readResponse = await validation.workResponse(
    async () => {
      throw new Error("private-query-secret");
    },
    200,
    "load",
  );
  assert.equal(readResponse.status, 500);
  assert.deepEqual(await readResponse.json(), {
    error: "Unable to load this data. Reload the page and try again.",
  });
});
test("browser retries retain the same replay key after lost/unreadable responses", async () => {
  const { createWorkWriter } = load("../src/lib/work-management/client.ts");
  const original = global.fetch,
    calls = [];
  try {
    let attempt = 0;
    global.fetch = async (_url, options) => {
      calls.push(options.headers["Idempotency-Key"]);
      attempt++;
      if (attempt === 1) throw new Error("lost connection");
      if (attempt === 2) return new Response("interrupted JSON", { status: 200 });
      return Response.json({ revision: 2 });
    };
    const write = createWorkWriter();
    await assert.rejects(write("/api/todos/1", "PATCH", { status: "DONE" }, 1));
    await assert.rejects(write("/api/todos/1", "PATCH", { status: "DONE" }, 1));
    assert.deepEqual(await write("/api/todos/1", "PATCH", { status: "DONE" }, 1), { revision: 2 });
    assert.equal(new Set(calls).size, 1);
    await write("/api/todos/1", "PATCH", { status: "TODO" }, 2);
    assert.notEqual(calls[3], calls[0]);
  } finally {
    global.fetch = original;
  }
});
