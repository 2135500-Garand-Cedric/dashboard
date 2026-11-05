import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) => dependencies[name] ?? require(name));
  return exports;
}

test("event completion persists without moving or deleting an event and can be undone", { skip: process.env.RUN_EVENT_DB_TEST !== "1" }, async () => {
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  const rollback = new Error("ROLLBACK_EVENT_COMPLETION_TEST");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const dependencies = {
        "@/lib/require-owner": { requireOwner: async () => null },
        "@/lib/prisma": { prisma: tx },
        "@/lib/event-dates": load("../src/lib/event-dates.ts"),
      };
      const collection = load("../src/app/api/events/route.ts", dependencies);
      const route = load("../src/app/api/events/[id]/route.ts", dependencies);
      const date = "2026-11-13T18:00:00.000Z";
      const endDate = "2026-11-14T18:00:00.000Z";
      const created = await collection.POST(new Request("http://localhost/api/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "__event_completion_test__", date, endDate }),
      }));
      assert.equal(created.status, 201);
      const event = await created.json();
      assert.equal(event.completed, false);
      const context = { params: Promise.resolve({ id: String(event.id) }) };
      const patch = (body) => route.PATCH(new Request(`http://localhost/api/events/${event.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }), context);
      let response = await patch({ completed: true });
      assert.equal(response.status, 200);
      let saved = await (await route.GET(new Request("http://localhost"), context)).json();
      assert.equal(saved.completed, true);
      assert.equal(saved.date, date);
      assert.equal(saved.endDate, endDate);
      response = await patch({ title: "__renamed_completed_event__" });
      assert.equal(response.status, 200);
      saved = await response.json();
      assert.equal(saved.completed, true);
      assert.equal((await patch({ completed: "false" })).status, 400);
      saved = await (await patch({ completed: false })).json();
      assert.equal(saved.completed, false);
      assert.equal(saved.date, date);
      assert.equal(await tx.event.count({ where: { id: event.id } }), 1);
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await prisma.$disconnect();
  }
});
