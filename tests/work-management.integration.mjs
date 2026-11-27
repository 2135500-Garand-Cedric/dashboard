import { timeZoneTestDependency } from "./helpers/time-zone.mjs";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(
    exports,
    (name) => dependencies[name] ?? timeZoneTestDependency(name, dependencies) ?? require(name),
  );
  return exports;
}

test(
  "Work commands: owner scope, retired rewards, atomic/replay-safe lifecycle, graph races, safe deletion, checklist and events",
  { skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.notEqual(process.env.NODE_ENV, "production");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = require("../src/generated/prisma/index.js"),
      prisma = new PrismaClient();
    const validation = load("../src/lib/work-management/validation.ts", {
      "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    });
    const dates = load("../src/lib/event-dates.ts");
    const dependencies = {
      "@/lib/prisma": { prisma },
      "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" },
      "@/lib/event-dates": dates,
      ...loadTaskFoundation(validation),
      "./validation": validation,
    };
    const api = load("../src/lib/work-management/server.ts", dependencies);
    const prefix = `__work_phase01_${randomUUID()}`;
    const original = await prisma.user.findUniqueOrThrow({
      where: { id: 1 },
      select: { totalXp: true, coins: true, updatedAt: true },
    });
    const keys = [];
    const taskIds = new Set();
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    const task = async (extra = {}) => {
      const row = await prisma.todo.create({
        data: { userId: 1, title: prefix, status: "TODO", ...extra },
      });
      taskIds.add(row.id);
      if (extra.dependsOnId)
        await prisma.todoDependency.create({
          data: { dependentId: row.id, prerequisiteId: extra.dependsOnId, origin: "LEGACY" },
        });
      return row;
    };
    const eventIds = new Set();
    const event = async (extra = {}) => {
      const row = await prisma.event.create({ data: { userId: 1, title: prefix, ...extra } });
      eventIds.add(row.id);
      if (row.linkedTodoId)
        await prisma.eventTaskLink.create({
          data: { eventId: row.id, todoId: row.linkedTodoId, role: "RELATED", origin: "LEGACY" },
        });
      return row;
    };
    const fresh = (row) => prisma.todo.findUniqueOrThrow({ where: { id: row.id } });
    const balances = () =>
      prisma.user.findUniqueOrThrow({ where: { id: 1 }, select: { totalXp: true, coins: true } });
    const rejects = (action, status) =>
      assert.rejects(
        action,
        (error) => error instanceof validation.WorkValidationError && error.status === status,
      );
    let foreign;
    try {
      await t.test(
        "resulting prerequisite, omitted versus cleared fields, legacy cycle preservation",
        async () => {
          const prerequisite = await task(),
            done = await task({ status: "DONE" }),
            row = await task({ dependsOnId: done.id });
          const started = await api.patchTodo(row.id, { status: "IN_PROGRESS" }, command(row));
          assert.equal(started.dependsOnId, done.id);
          await rejects(
            api.patchTodo(
              row.id,
              { status: "DONE", dependsOnId: prerequisite.id },
              command(started),
            ),
            409,
          );
          assert.equal((await fresh(row)).status, "IN_PROGRESS");
          assert.equal((await fresh(row)).dependsOnId, done.id);
          const cleared = await api.patchTodo(row.id, { dependsOnId: null }, command(started));
          assert.equal(cleared.dependsOnId, null);
          await rejects(api.patchTodo(row.id, { dependsOnId: row.id }, command(cleared)), 409);
          const cycle = await task();
          await prisma.todo.update({ where: { id: cycle.id }, data: { dependsOnId: cycle.id } });
          await prisma.todoDependency.create({
            data: {
              dependentId: cycle.id,
              prerequisiteId: cycle.id,
              origin: "LEGACY",
              legacyReviewReason: "SELF",
            },
          });
          const preserved = await api.patchTodo(
            cycle.id,
            { description: "legacy anomaly remains reviewable" },
            command(cycle),
          );
          assert.equal(preserved.dependsOnId, cycle.id);
          await rejects(api.patchTodo(row.id, { dependsOnId: cycle.id }, command(cleared)), 409);
        },
      );
      await t.test(
        "completion/reopen preserve balances and legacy snapshots, exact retries and stale/conflicting keys",
        async () => {
          const row = await task({}),
            key = command(row);
          const before = await balances();
          const done = await api.patchTodo(row.id, { status: "DONE" }, key);
          assert.deepEqual(await balances(), {
            totalXp: before.totalXp,
            coins: before.coins,
          });
          assert.deepEqual(await api.patchTodo(row.id, { status: "DONE" }, key), done);
          await rejects(api.patchTodo(row.id, { status: "TODO" }, key), 409);
          await rejects(api.patchTodo(row.id, { status: "DONE" }, command(row)), 409);
          await rejects(api.patchTodo(row.id, { rewardXp: 50 }, command(done)), 400);
          const edited = await api.patchTodo(row.id, { title: `${prefix} updated` }, command(done));
          await api.patchTodo(row.id, { status: "TODO" }, command(edited));
          assert.deepEqual(
            await balances(),
            before,
            "neither completion nor reopening changes balances",
          );
          const legacy = await task({
            status: "DONE",
          });
          await api.patchTodo(legacy.id, { status: "TODO" }, command(legacy));
          assert.deepEqual(await balances(), {
            totalXp: before.totalXp,
            coins: before.coins,
          });
        },
      );
      await t.test(
        "concurrent reverse edges and two-tab completion cannot both commit",
        async () => {
          const a = await task(),
            b = await task();
          const results = await Promise.allSettled([
            api.patchTodo(a.id, { dependsOnId: b.id }, command(a)),
            api.patchTodo(b.id, { dependsOnId: a.id }, command(b)),
          ]);
          assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
          assert.equal(results.find((row) => row.status === "rejected").reason.status, 409);
          const row = await task({}),
            before = await balances();
          const statuses = await Promise.allSettled([
            api.patchTodo(row.id, { status: "DONE" }, command(row)),
            api.patchTodo(row.id, { status: "DONE" }, command(row)),
          ]);
          assert.equal(statuses.filter((row) => row.status === "fulfilled").length, 1);
          assert.deepEqual(await balances(), {
            totalXp: before.totalXp,
            coins: before.coins,
          });
        },
      );
      await t.test(
        "a write failure rolls back task status and receipt without touching balances",
        async () => {
          const row = await task({}),
            key = command(row),
            before = await balances();
          const failing = load("../src/lib/work-management/server.ts", {
            ...dependencies,
            "@/lib/prisma": {
              prisma: {
                $transaction: (action, options) =>
                  prisma.$transaction(
                    (db) =>
                      action(
                        new Proxy(db, {
                          get(target, prop) {
                            if (prop === "todo")
                              return {
                                ...target.todo,
                                update: async () => {
                                  throw new Error("injected write failure");
                                },
                              };
                            return Reflect.get(target, prop);
                          },
                        }),
                      ),
                    options,
                  ),
              },
            },
          });
          await assert.rejects(
            failing.patchTodo(row.id, { status: "DONE" }, key),
            /injected write failure/,
          );
          assert.deepEqual(await balances(), before);
          assert.equal((await fresh(row)).status, "TODO");
          assert.equal(
            await prisma.workMutationReceipt.count({ where: { requestKey: key.requestKey } }),
            0,
          );
          await api.patchTodo(row.id, { status: "DONE" }, key);
          assert.equal((await fresh(row)).status, "DONE");
        },
      );
      await t.test(
        "event deletion preserves task/checklist/dependents/other event; failed task delete preserves checklist",
        async () => {
          const row = await task(),
            dependent = await task({ dependsOnId: row.id });
          const child = await prisma.subtask.create({ data: { title: prefix, todoId: row.id } });
          const first = await event({ linkedTodoId: row.id }),
            second = await event({ linkedTodoId: row.id });
          const key = command(first);
          await api.deleteEvent(first.id, key);
          await api.deleteEvent(first.id, key);
          assert.ok(await fresh(row));
          assert.ok(await prisma.subtask.findUnique({ where: { id: child.id } }));
          assert.equal((await fresh(dependent)).dependsOnId, row.id);
          assert.equal(
            (await prisma.event.findUnique({ where: { id: second.id } })).linkedTodoId,
            row.id,
          );
          await rejects(api.deleteTodo(row.id, command(row)), 409);
          assert.ok(await prisma.subtask.findUnique({ where: { id: child.id } }));
          await api.patchTodo(dependent.id, { dependsOnId: null }, command(dependent));
          await api.deleteTodo(row.id, command(await fresh(row)));
          const remaining = await prisma.event.findUniqueOrThrow({ where: { id: second.id } });
          assert.equal(remaining.linkedTodoId, null);
          assert.equal(remaining.revision, 2);
        },
      );
      await t.test(
        "late delete failure restores already-unlinked events and deleted checklist rows",
        async () => {
          const row = await task(),
            child = await prisma.subtask.create({ data: { todoId: row.id, title: prefix } }),
            linked = await event({ linkedTodoId: row.id });
          const failing = load("../src/lib/work-management/server.ts", {
            ...dependencies,
            "@/lib/prisma": {
              prisma: {
                $transaction: (action, options) =>
                  prisma.$transaction(
                    (db) =>
                      action(
                        new Proxy(db, {
                          get(target, prop) {
                            if (prop === "todo")
                              return {
                                ...target.todo,
                                delete: async () => {
                                  throw new Error("injected delete failure");
                                },
                              };
                            return Reflect.get(target, prop);
                          },
                        }),
                      ),
                    options,
                  ),
              },
            },
          });
          await assert.rejects(failing.deleteTodo(row.id, command(row)), /injected delete failure/);
          assert.ok(await fresh(row));
          assert.ok(await prisma.subtask.findUnique({ where: { id: child.id } }));
          const restored = await prisma.event.findUniqueOrThrow({ where: { id: linked.id } });
          assert.equal(restored.linkedTodoId, row.id);
          assert.equal(restored.revision, 1);
        },
      );
      await t.test(
        "checklist versions and parent versions, owner filtering and foreign-link validation",
        async () => {
          const row = await task(),
            child = await api.createSubtask(row.id, { title: prefix }, command(row));
          assert.equal((await fresh(row)).revision, 2);
          const checked = await api.changeSubtask(child.id, { done: true }, command(child));
          assert.equal(checked.done, true);
          await rejects(api.changeSubtask(child.id, { done: false }, command(child)), 409);
          await rejects(api.patchTodo(row.id, { title: "stale" }, command(row)), 409);
          foreign = await prisma.user.create({
            data: { email: `${randomUUID()}@example.invalid` },
          });
          const other = await task({ userId: foreign.id }),
            otherEvent = await event({ userId: foreign.id });
          const otherChild = await prisma.subtask.create({
            data: { todoId: other.id, title: prefix },
          });
          assert.ok(!(await api.listTodos()).some((value) => value.id === other.id));
          assert.ok(!(await api.listEvents()).some((value) => value.id === otherEvent.id));
          await rejects(api.getTodo(other.id), 404);
          await rejects(api.getEvent(otherEvent.id), 404);
          await rejects(api.patchTodo(other.id, { title: "forbidden" }, command(other)), 404);
          await rejects(api.deleteEvent(otherEvent.id, command(otherEvent)), 404);
          await rejects(api.changeSubtask(otherChild.id, { done: true }, command(otherChild)), 404);
          await rejects(
            api.patchTodo(row.id, { dependsOnId: other.id }, command(await fresh(row))),
            400,
          );
          const own = await event();
          await rejects(api.patchEvent(own.id, { linkedTodoId: other.id }, command(own)), 404);
        },
      );
      await t.test(
        "event dates/completion remain independent and server validation is actionable",
        async () => {
          const row = await api.createEvent(
            { title: prefix, date: "2026-11-13T18:00:00Z", endDate: "2026-11-14T18:00:00Z" },
            command(),
          );
          const updated = await api.patchEvent(row.id, { completed: true }, command(row));
          assert.equal(updated.date, row.date);
          assert.equal(updated.endDate, row.endDate);
          assert.equal(updated.completed, true);
          await rejects(api.patchEvent(row.id, { completed: "yes" }, command(updated)), 400);
          await rejects(api.patchEvent(row.id, { date: null }, command(updated)), 400);
          await rejects(api.createTodo({ title: " " }, command()), 400);
          await rejects(
            api.patchTodo((await task()).id, { status: "UNKNOWN" }, command({ revision: 1 })),
            400,
          );
        },
      );
    } finally {
      await prisma.$transaction(async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(62019, 1)`;
        const ids = [
          ...new Set([
            ...(await db.todo.findMany({ where: { title: prefix }, select: { id: true } })).map(
              (row) => row.id,
            ),
            ...taskIds,
          ]),
        ];
        await db.workActivity.deleteMany({
          where: {
            userId: 1,
            todoReference: { in: ids.map((id) => `TASK-${String(id).padStart(4, "0")}`) },
          },
        });
        await db.eventTaskLink.deleteMany({
          where: { OR: [{ eventId: { in: [...eventIds] } }, { todoId: { in: ids } }] },
        });
        await db.workEventActivity.deleteMany({ where: { sourceEventId: { in: [...eventIds] } } });
        await db.event.deleteMany({ where: { title: prefix } });
        await db.todoDependency.deleteMany({
          where: { OR: [{ dependentId: { in: ids } }, { prerequisiteId: { in: ids } }] },
        });
        await db.todo.updateMany({ where: { id: { in: ids } }, data: { dependsOnId: null } });
        await db.subtask.deleteMany({ where: { todoId: { in: ids } } });
        await db.todo.deleteMany({ where: { id: { in: ids } } });
        await db.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
        await db.user.update({ where: { id: 1 }, data: original });
        if (foreign) await db.user.delete({ where: { id: foreign.id } });
      });
      await prisma.$disconnect();
    }
  },
);
