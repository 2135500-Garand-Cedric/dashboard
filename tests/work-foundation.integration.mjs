import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  new Function("exports", "require", code)(exports, name => deps[name] ?? require(name)); return exports;
}
test("Phase 02 foundation: defaults, contexts, every status, closure/history, archive, ownership and atomic audit", { skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1" }, async t => {
  assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1"); assert.notEqual(process.env.NODE_ENV, "production");
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, "work-db"); assert.equal(url.pathname, "/work_test");
  const { PrismaClient } = require("../src/generated/prisma/index.js"), db = new PrismaClient();
  const validation = load("../src/lib/work-management/validation.ts", { "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } } });
  const deps = { ...loadTaskFoundation(validation), "./validation": validation, "@/lib/prisma": { prisma: db }, "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" }, "@/lib/event-dates": load("../src/lib/event-dates.ts") };
  const api = load("../src/lib/work-management/server.ts", deps), prefix = `__foundation_${randomUUID()}`;
  const ids = new Set(), keys = [], contextIds = [];
  const original = await db.user.findUniqueOrThrow({ where: { id: 1 }, select: { totalXp: true, coins: true, updatedAt: true } });
  const command = row => { const requestKey = randomUUID(); keys.push(requestKey); return { requestKey, ...(row ? { revision: row.revision } : {}) }; };
  const create = async (extra = {}) => { const row = await api.createTodo({ title: prefix, ...extra }, command()); ids.add(row.id); return row; };
  const patch = (row, body) => api.patchTodo(row.id, body, command(row));
  const reject = (promise, status) => assert.rejects(promise, error => error instanceof validation.WorkValidationError && error.status === status);
  const activity = id => db.workActivity.findMany({ where: { todoId: id }, orderBy: { id: "asc" } });
  let foreign;
  try {
    await t.test("title-only capture defaults to New/Normal/Personal; legacy raw values are immutable historical data", async () => {
      const row = await create(); assert.equal(row.status, "NEW"); assert.equal(row.priorityLevel, "NORMAL"); assert.equal(row.kind, "TASK"); assert.equal(row.context.key, "personal"); assert.equal(row.legacyPriority, null); assert.match(row.reference, /^TASK-\d{4,}$/);
      const entries = await activity(row.id); assert.equal(entries.length, 1); assert.equal(entries[0].action, "CREATED"); assert.equal(entries[0].actorGithubId, "89470930"); assert.ok(entries[0].createdAt instanceof Date);
      const legacy = await db.todo.create({ data: { userId: 1, title: prefix, status: "DONE", priority: 99, priorityLevel: null, contextId: null, kind: null } }); ids.add(legacy.id);
      const edited = await patch(legacy, { nextAction: "Review metadata only" }); assert.equal(edited.completedAt, null); assert.equal(edited.contextId, null); assert.equal(edited.kind, null); assert.equal(edited.priorityLevel, null); assert.equal(edited.legacyPriority, 99);
      const assigned = await patch(edited, { priorityLevel: "URGENT" }); assert.equal(assigned.legacyPriority, 99); assert.equal(assigned.priority, null); assert.equal((await db.todo.findUnique({ where: { id: assigned.id } })).priority, 99);
      await reject(patch(assigned, { priority: null }), 409);
    });
    await t.test("custom contexts are owner-scoped, versioned, retain labels and can be deactivated without changing tasks", async () => {
      const key = command(); const context = await api.createWorkContext({ name: prefix }, key); contextIds.push(context.id);
      assert.deepEqual(await api.createWorkContext({ name: prefix }, key), context);
      await reject(api.createWorkContext({ name: prefix.toUpperCase() }, command()), 409);
      const row = await create({ contextId: context.id, priorityLevel: "HIGH", company: "Example company", kind: "REQUEST", system: "Printer", tags: ["test", " test "] });
      assert.deepEqual(row.tags, ["test"]); assert.equal(row.context.id, context.id);
      const inactive = await api.patchWorkContext(context.id, { active: false }, command(context)); assert.equal(inactive.active, false);
      await reject(api.patchWorkContext(context.id, { name: "stale" }, command(context)), 409);
      await reject(create({ contextId: context.id }), 400);
      const edited = await patch(row, { contextId: context.id, desiredOutcome: "Print a test page" }); assert.equal(edited.context.id, context.id);
      const removed = await patch(edited, { contextId: null }); assert.equal(removed.contextId, null);
      const changes = (await activity(row.id)).at(-1); assert.equal(changes.action, "CONTEXT_CHANGED"); assert.equal(changes.changes.context.before.name, prefix); assert.equal(changes.changes.context.after, null);
    });
    await t.test("all seven statuses are reachable without a forced sequence; closure/reopening retains prior facts", async () => {
      let row = await create({ priorityLevel: "URGENT", nextAction: "Undated important work" });
      for (const status of ["WAITING", "BACKLOG", "IN_PROGRESS", "TODO", "DONE"]) row = await patch(row, { status });
      assert.ok(row.completedAt); const completedAt = row.completedAt;
      row = await patch(row, { status: "TODO" }); assert.equal(row.completedAt, null); assert.equal(row.closureType, null);
      row = await patch(row, { status: "CANCELLED", completionSummary: "No longer needed" }); assert.ok(row.cancelledAt); assert.equal(row.closureType, "CANCELLED");
      const history = await activity(row.id); assert.ok(history.some(entry => entry.action === "REOPENED" && entry.changes.completedAt.before === completedAt));
      assert.ok(history.some(entry => entry.action === "COMPLETED")); assert.equal(history.at(-1).action, "CANCELLED");
      const reopened = await patch(row, { status: "NEW" }); assert.equal(reopened.cancelledAt, null); assert.equal(reopened.completionSummary, null);
    });
    await t.test("Waiting/workaround/blocked are independent and accepted-workaround closure is explicit and explained", async () => {
      const prerequisite = await create(), row = await create({ dependsOnId: prerequisite.id, waitingOn: "Replacement shipment", waitingReason: "Vendor delivery", workaround: "Use a spare" });
      const waiting = await patch(row, { status: "WAITING" }); assert.equal(waiting.workaround, "Use a spare");
      const count = (await activity(waiting.id)).length;
      await reject(patch(waiting, { status: "DONE", closureMode: "ACCEPTED_WORKAROUND", acceptWorkaround: true, completionSummary: "Approved spare" }), 409); assert.equal((await activity(waiting.id)).length, count);
      const ready = await patch(prerequisite, { status: "DONE" }); assert.equal(ready.status, "DONE");
      for (const body of [{ status: "DONE", closureMode: "ACCEPTED_WORKAROUND" }, { status: "DONE", closureMode: "ACCEPTED_WORKAROUND", acceptWorkaround: true }]) await reject(patch(waiting, body), 400);
      const closed = await patch(waiting, { status: "DONE", closureMode: "ACCEPTED_WORKAROUND", acceptWorkaround: true, completionSummary: "Explicitly accepted spare as final outcome" });
      assert.equal(closed.closureType, "ACCEPTED_WORKAROUND");
      await reject(patch(closed, { completionSummary: null }), 400); await reject(patch(closed, { workaround: "" }), 400);
    });
    await t.test("archive/restore preserve links, checklist, dates, status and rewards and retain direct access", async () => {
      const row = await create(), child = await api.createSubtask(row.id, { title: prefix }, command(row));
      const current = await api.getTodo(row.id);
      const linked = await db.event.create({ data: { title: prefix, userId: 1, linkedTodoId: row.id, date: new Date("2026-11-13T17:00:00Z") } });
      const archived = await patch(current, { archived: true }); assert.ok(archived.archivedAt); assert.equal(archived.status, "NEW");
      assert.ok(!(await api.listTodos()).some(value => value.id === row.id)); assert.ok((await api.listTodos(true)).some(value => value.id === row.id)); assert.equal((await api.getTodo(row.id)).id, row.id);
      assert.deepEqual(await db.event.findUnique({ where: { id: linked.id } }), linked); assert.ok(await db.subtask.findUnique({ where: { id: child.id } }));
      await reject(patch(archived, { status: "DONE" }), 409);
      const restored = await patch(archived, { archived: false }); assert.equal(restored.archivedAt, null); assert.equal(restored.status, "NEW");
      assert.ok((await activity(row.id)).some(entry => entry.action === "ARCHIVED")); assert.equal((await activity(row.id)).at(-1).action, "RESTORED");
    });
    await t.test("replay/conflict and failure of audit insert cannot duplicate history or partially change balances", async () => {
      const row = await create({ rewardXp: 21, rewardCoins: 4 }), key = command(row);
      const completed = await api.patchTodo(row.id, { status: "DONE" }, key); const count = (await activity(row.id)).length;
      assert.deepEqual(await api.patchTodo(row.id, { status: "DONE" }, key), completed); assert.equal((await activity(row.id)).length, count);
      await reject(patch(row, { status: "DONE" }), 409); assert.equal((await activity(row.id)).length, count);
      const second = await create({ rewardXp: 30, rewardCoins: 8 });
      const balance = await db.user.findUnique({ where: { id: 1 }, select: { totalXp: true, coins: true } }); const beforeCount = (await activity(second.id)).length; const failKey = command(second);
      const failing = load("../src/lib/work-management/server.ts", { ...deps, "@/lib/prisma": { prisma: { $transaction: (callback, options) => db.$transaction(tx => callback(new Proxy(tx, { get(target, prop) { if (prop === "workActivity") return { ...target.workActivity, create: async () => { throw new Error("injected audit failure"); } }; return Reflect.get(target, prop); } })), options) } } });
      await assert.rejects(failing.patchTodo(second.id, { status: "DONE" }, failKey), /injected audit failure/);
      assert.deepEqual(await db.user.findUnique({ where: { id: 1 }, select: { totalXp: true, coins: true } }), balance);
      assert.equal((await db.todo.findUnique({ where: { id: second.id } })).status, "NEW"); assert.equal((await activity(second.id)).length, beforeCount); assert.equal(await db.workMutationReceipt.count({ where: { requestKey: failKey.requestKey } }), 0);
    });
    await t.test("history and contexts cannot be read or reassigned across owners; timestamps/activity are not writable fields", async () => {
      foreign = await db.user.create({ data: { email: `${randomUUID()}@example.invalid` } });
      const context = await db.workContext.create({ data: { userId: foreign.id, key: prefix, name: prefix, normalizedName: prefix } });
      const other = await db.todo.create({ data: { userId: foreign.id, title: prefix } }); ids.add(other.id);
      await reject(api.taskActivity(other.id), 404); await reject(api.patchWorkContext(context.id, { active: false }, command(context)), 404);
      const row = await create(); await reject(patch(row, { contextId: context.id }), 400);
      await reject(patch(row, { createdAt: "2000-01-01" }), 400); await reject(patch(row, { activity: [] }), 400);
      const route = load("../src/app/api/todos/[id]/activity/route.ts", { "@/lib/require-owner": { requireOwner: async () => Response.json({ error: "denied" }, { status: 403 }) }, "@/lib/work-management/validation": validation, "@/lib/work-management/server": api });
      assert.equal(route.PATCH, undefined); assert.equal(route.DELETE, undefined); assert.equal((await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: String(row.id) }) })).status, 403);
    });
    await t.test("explicit task deletion retains immutable audit facts and reference without a task cascade", async () => {
      const row = await create(); await api.deleteTodo(row.id, command(row));
      const history = await db.workActivity.findMany({ where: { userId: 1, todoReference: row.reference } });
      assert.ok(history.some(entry => entry.action === "CREATED")); assert.ok(history.some(entry => entry.action === "DELETED")); assert.ok(history.every(entry => entry.todoId === null));
    });
  } finally {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(62019, 1)`;
      const all = [...ids];
      await tx.workActivity.deleteMany({ where: { todoReference: { in: all.map(id => `TASK-${String(id).padStart(4,"0")}`) } } });
      await tx.event.deleteMany({ where: { title: prefix } }); await tx.subtask.deleteMany({ where: { todoId: { in: all } } });
      await tx.todo.updateMany({ where: { id: { in: all } }, data: { dependsOnId: null } }); await tx.todo.deleteMany({ where: { id: { in: all } } });
      await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } }); await tx.workContext.deleteMany({ where: { id: { in: contextIds } } });
      if (foreign) { await tx.workContext.deleteMany({ where: { userId: foreign.id } }); await tx.user.delete({ where: { id: foreign.id } }); }
      await tx.user.update({ where: { id: 1 }, data: original });
    });
    await db.$disconnect();
  }
});
