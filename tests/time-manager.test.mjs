import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(fs.readFileSync(new URL("../src/app/api/time-manager/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function("exports", "require", code)(exports, () => ({ NextResponse: { json: (data, options) => Response.json(data, options) } }));

test("Time Manager returns readable errors for missing configuration and upstream failures", async () => {
  const originalToken = process.env.TIME_MANAGER_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.TIME_MANAGER_API_KEY;
    globalThis.fetch = async () => { throw new Error("should not fetch without configuration"); };
    assert.equal((await exports.GET()).status, 503);
    process.env.TIME_MANAGER_API_KEY = "test-token";
    for (const fetcher of [
      async () => { throw new Error("network unavailable"); },
      async () => new Response("unavailable", { status: 503 }),
      async () => Response.json({ error: "unexpected response" }),
    ]) {
      globalThis.fetch = fetcher;
      const response = await exports.GET();
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.ok(body.error);
      assert.ok(!body.error.includes("test-token"));
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TIME_MANAGER_API_KEY;
    else process.env.TIME_MANAGER_API_KEY = originalToken;
  }
});

test("Time Manager returns only completed records", async () => {
  const originalToken = process.env.TIME_MANAGER_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.TIME_MANAGER_API_KEY = "test-token";
    const completed = { end_time: "2026-10-17T12:00:00Z", duration_seconds: 100 };
    globalThis.fetch = async () => Response.json([completed, { end_time: null, duration_seconds: null }]);
    assert.deepEqual(await (await exports.GET()).json(), [completed]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TIME_MANAGER_API_KEY;
    else process.env.TIME_MANAGER_API_KEY = originalToken;
  }
});
