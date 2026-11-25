import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";
import { searchModules } from "./helpers/search.mjs";

const { types } = searchModules({});
test("global search validates private bounded inputs and supports short Japanese queries", () => {
  assert.equal(types.searchReady("学"), true);
  assert.equal(types.searchReady("が"), true);
  assert.equal(types.searchReady("a"), false);
  assert.equal(types.searchReady("  "), false);
  assert.equal(types.searchInput({ query: " がっこう ", kind: "vocabulary" }).query, "がっこう");
  assert.equal(types.canonicalQuery("task-12"), "TASK-0012");
  assert.equal(types.canonicalQuery("PROJECT-12345"), "PROJECT-12345");
  for (const body of [
    null,
    [],
    { query: 1 },
    { query: "x".repeat(121) },
    { query: "bad\u0000text" },
    { query: "hello", userId: 2 },
    { query: "hello", kind: "unknown" },
    { query: "hello", view: "page", kind: "all" },
    { query: "hello", page: 201 },
    { query: "hello", page: 2 },
    { query: "hello", includeArchived: "true" },
    { query: "hello", view: "export" },
  ])
    assert.throws(() => types.searchInput(body));
});

test("search authorization precedes body reads, timezone lookups and database calls", async () => {
  for (const status of [401, 403]) {
    const fail = () => assert.fail("Denied request accessed private data");
    const route = loadWorkModule("src/app/api/search/route.ts", {
      "@/lib/require-owner": { requireOwner: async () => Response.json({}, { status }) },
      "@/lib/user-settings": { withUserTimeZone: fail },
      "@/lib/search/types": types,
      "@/lib/search/server": { searchDashboard: fail },
    });
    assert.equal(
      (
        await route.POST({
          get body() {
            return fail();
          },
        })
      ).status,
      status,
    );
  }
});

test("search rejects oversized and invalid bodies without leaking input into logs or errors", async () => {
  let searched = 0;
  const route = loadWorkModule("src/app/api/search/route.ts", {
    "@/lib/require-owner": { requireOwner: async () => null },
    "@/lib/user-settings": { withUserTimeZone: (fn) => fn() },
    "@/lib/search/types": types,
    "@/lib/search/server": {
      searchDashboard: async () => {
        searched++;
        return { groups: [] };
      },
    },
  });
  assert.equal(
    (
      await route.POST(
        new Request("http://local/api/search", { method: "POST", body: " ".repeat(5000) }),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await route.POST(
        new Request("http://local/api/search", { method: "POST", body: "{secret-invalid-json" }),
      )
    ).status,
    400,
  );
  const result = await route.POST(
    new Request("http://local/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "VPN" }),
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(searched, 1);
});

test("adapter failures stay explicit and concurrency is capped at three read-only transactions", async () => {
  let concurrent = 0,
    peak = 0,
    reads = 0;
  const db = {
    $transaction: async (action) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      try {
        return await action({
          $executeRawUnsafe: async (sql) =>
            assert.match(sql, /^(SET TRANSACTION READ ONLY|SET LOCAL statement_timeout)/),
          $queryRawUnsafe: async (sql) => {
            reads++;
            await new Promise((resolve) => setTimeout(resolve, 2));
            if (sql.includes('"FinancialTransaction"')) throw new Error("private database error");
            return [];
          },
        });
      } finally {
        concurrent--;
      }
    },
  };
  const { server } = searchModules(db);
  const result = await server.searchDashboard(types.searchInput({ query: "VPN" }));
  assert.equal(peak, 3);
  assert.equal(reads, 7);
  assert.equal(result.groups.length, 7);
  assert.equal(
    result.groups.find((group) => group.kind === "finance").error,
    "Unavailable — Retry",
  );
  assert.equal(result.groups.find((group) => group.kind === "tasks").error, undefined);
  assert.deepEqual(await server.searchDashboard(types.searchInput({ query: "a" })), { groups: [] });
  assert.equal(reads, 7);
});
