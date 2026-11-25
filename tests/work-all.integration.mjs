import { timeZoneTestDependency } from "./helpers/time-zone.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { supportModules } from "./helpers/work-support.mjs";
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const exports = {},
    source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
  new Function("exports", "require", source)(
    exports,
    (name) => deps[name] ?? timeZoneTestDependency(name) ?? require(name),
  );
  return exports;
}
test(
  "Phase 03 All Work: contacts, people ownership/history, filters, pagination and mutation safety",
  { skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.notEqual(process.env.NODE_ENV, "production");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = require("../src/generated/prisma"),
      db = new PrismaClient();
    const { validation, server: api, supportingDeps: deps } = supportModules(db);
    const prefix = `__allwork_${randomUUID()}`;
    const taskIds = [],
      contactIds = [],
      keys = [];
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    const create = async (body = {}) => {
      const row = await api.createTodo({ title: prefix, ...body }, command());
      taskIds.push(row.id);
      return row;
    };
    const contact = async (body = {}) => {
      const row = await api.createWorkContact({ name: prefix, ...body }, command());
      contactIds.push(row.id);
      return row;
    };
    const patch = (row, body) => api.patchTodo(row.id, body, command(row));
    const search = (query) => api.searchWork(new URLSearchParams({ q: prefix, ...query }));
    const reject = (promise, status) =>
      assert.rejects(
        promise,
        (error) => error instanceof validation.WorkValidationError && error.status === status,
      );
    let foreign, requester, affected, waiting, assigned;
    try {
      await t.test(
        "contacts are independent of users, optional, replay-safe, versioned and owner-managed",
        async () => {
          const users = await db.user.count(),
            key = command();
          requester = await api.createWorkContact(
            {
              name: `${prefix} requester`,
              company: "Synthetic company",
              email: "person@example.invalid",
              phone: "555-1234",
              notes: "Shared work and finance person",
            },
            key,
          );
          contactIds.push(requester.id);
          assert.deepEqual(
            await api.createWorkContact(
              {
                name: `${prefix} requester`,
                company: "Synthetic company",
                email: "person@example.invalid",
                phone: "555-1234",
                notes: "Shared work and finance person",
              },
              key,
            ),
            requester,
          );
          assert.equal(await db.user.count(), users);
          assert.equal(requester.active, true);
          assert.equal(requester.email, "person@example.invalid");
          assert.equal(requester.phone, "555-1234");
          assert.equal(requester.notes, "Shared work and finance person");
          for (const body of [
            { email: "invalid" },
            { email: "a@example.com,b@example.com" },
            { phone: "x".repeat(41) },
            { notes: "x".repeat(2001) },
          ])
            await reject(api.patchWorkContact(requester.id, body, command(requester)), 400);
          requester = await api.patchWorkContact(
            requester.id,
            { name: `${prefix} renamed requester` },
            command(requester),
          );
          await reject(
            api.patchWorkContact(requester.id, { name: "stale" }, { ...command(), revision: 1 }),
            409,
          );
          affected = await contact({ name: `${prefix} affected` });
          waiting = await contact({ name: `${prefix} waiting` });
          const simple = await create();
          assert.equal(simple.requesterId, null);
          assert.deepEqual(simple.affectedPeople, []);
        },
      );
      await t.test("requester and distinct affected people are atomic and audited", async () => {
        assigned = await create({
          requesterId: requester.id,
          affectedContactIds: [affected.id],

          waitingOn: "Also waiting for shipment",
          status: "WAITING",
        });
        assert.equal(assigned.requester.id, requester.id);
        assert.deepEqual(
          assigned.affectedPeople.map((person) => person.id),
          [affected.id],
        );
        const entry = (await api.taskActivity(assigned.id))[0];
        assert.equal(entry.changes.requester.after.name, requester.name);
        assert.deepEqual(entry.changes.affectedPeople.after, [
          { id: affected.id, name: affected.name },
        ]);
        const count = await db.workActivity.count({ where: { todoId: assigned.id } }),
          key = command(assigned);
        const updated = await api.patchTodo(
          assigned.id,
          { affectedContactIds: [affected.id, requester.id] },
          key,
        );
        assert.deepEqual(
          await api.patchTodo(
            assigned.id,
            { affectedContactIds: [affected.id, requester.id] },
            key,
          ),
          updated,
        );
        assert.equal(await db.workActivity.count({ where: { todoId: assigned.id } }), count + 1);
        await reject(patch(assigned, { requesterId: null }), 409);
        assigned = updated;
        await reject(patch(assigned, { affectedContactIds: [affected.id, affected.id] }), 400);
        assert.equal((await api.getTodo(assigned.id)).affectedPeople.length, 2);
        assigned = await patch(assigned, { priorityLevel: "HIGH" });
        assert.equal(assigned.requesterId, requester.id);
        assert.equal(assigned.affectedPeople.length, 2);
        const failing = load("../src/lib/work-management/server.ts", {
          ...deps,
          "@/lib/prisma": {
            prisma: {
              $transaction: (callback, options) =>
                db.$transaction(
                  (tx) =>
                    callback(
                      new Proxy(tx, {
                        get(target, prop) {
                          if (prop === "workActivity")
                            return {
                              ...target.workActivity,
                              create: async () => {
                                throw new Error("injected people audit failure");
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
        const failureKey = command(assigned);
        await assert.rejects(
          failing.patchTodo(assigned.id, { affectedContactIds: [], requesterId: null }, failureKey),
          /injected people audit failure/,
        );
        assert.equal((await api.getTodo(assigned.id)).affectedPeople.length, 2);
        assert.equal((await api.getTodo(assigned.id)).requesterId, requester.id);
        assert.equal(
          await db.workMutationReceipt.count({ where: { requestKey: failureKey.requestKey } }),
          0,
        );
        await assert.rejects(db.workContact.delete({ where: { id: requester.id } }));
        assert.ok(await db.todo.findUnique({ where: { id: assigned.id } }));
      });
      await t.test(
        "inactive contacts retain existing associations and are searchable but cannot be newly assigned",
        async () => {
          affected = await api.patchWorkContact(affected.id, { active: false }, command(affected));
          const edited = await patch(assigned, {
            affectedContactIds: [affected.id, requester.id],
            nextAction: "Follow up",
          });
          assigned = edited;
          assert.equal(
            edited.affectedPeople.find((person) => person.id === affected.id).active,
            false,
          );
          await reject(create({ requesterId: affected.id }), 400);
          await reject(create({ affectedContactIds: [affected.id] }), 400);
          assert.ok(
            (await api.listWorkContacts(new URLSearchParams({ q: prefix }))).items.some(
              (person) => person.id === affected.id && !person.active,
            ),
          );
          assert.ok(
            (await search({ person: String(affected.id) })).items.some(
              (task) => task.id === assigned.id,
            ),
          );
        },
      );
      await t.test(
        "foreign contacts and tasks are never assignable, readable or searchable",
        async () => {
          foreign = await db.user.create({ data: { email: `${randomUUID()}@example.invalid` } });
          const other = await db.workContact.create({ data: { userId: foreign.id, name: prefix } });
          contactIds.push(other.id);
          const otherTask = await db.todo.create({
            data: { userId: foreign.id, title: prefix, requesterId: other.id },
          });
          taskIds.push(otherTask.id);
          await reject(api.getWorkContact(other.id), 404);
          await reject(api.patchWorkContact(other.id, { active: false }, command(other)), 404);
          await reject(patch(assigned, { requesterId: other.id }), 400);
          await reject(patch(assigned, { waitingOnContactId: other.id }), 400);
          await reject(patch(assigned, { affectedContactIds: [other.id] }), 400);
          assert.equal((await search({ person: String(other.id) })).total, 0);
          assert.ok(
            !(await api.listWorkContacts(new URLSearchParams({ q: prefix }))).items.some(
              (person) => person.id === other.id,
            ),
          );
          const before = await db.todo.count(),
            key = command();
          await reject(api.createTodo({ title: prefix, affectedContactIds: [other.id] }, key), 400);
          assert.equal(await db.todo.count(), before);
          assert.equal(
            await db.workMutationReceipt.count({ where: { requestKey: key.requestKey } }),
            0,
          );
          for (const routePath of [
            "work-items/route.ts",
            "work-contacts/route.ts",
            "work-contacts/[id]/route.ts",
          ]) {
            const route = load(`../src/app/api/${routePath}`, {
              "@/lib/require-owner": {
                requireOwner: async () => Response.json({ error: "denied" }, { status: 403 }),
              },
              "@/lib/work-management/validation": validation,
              "@/lib/work-management/server": api,
            });
            assert.equal(
              (
                await route.GET(new Request("http://localhost?view=all"), {
                  params: Promise.resolve({ id: String(other.id) }),
                })
              ).status,
              403,
            );
            assert.equal(route.DELETE, undefined);
          }
        },
      );
      await t.test(
        "all filters and reference/description search use one owner-scoped result set for both presentations",
        async () => {
          const context = await db.activityType.create({
            data: { name: `${prefix} activity`, color: "#3b82f6" },
          });
          const row = await create({
            title: `${prefix} distinctive`,
            description: `${prefix} description needle`,
            activityTypeId: context.id,
            priorityLevel: "URGENT",
            kind: "ISSUE",
            system: "Synthetic system",
            requesterId: requester.id,
          });
          const filters = {
            activityType: String(context.id),
            priority: "URGENT",
            kind: "ISSUE",
            system: "system",
            person: String(requester.id),
            status: "NEW",
            sort: "priority",
          };
          const list = await search({ ...filters, mode: "list" }),
            board = await search({ ...filters, mode: "board" });
          assert.deepEqual(list, board);
          assert.deepEqual(
            list.items.map((task) => task.id),
            [row.id],
          );
          assert.equal(
            (await api.searchWork(new URLSearchParams({ q: row.reference }))).items[0].id,
            row.id,
          );
          assert.equal((await search({ q: `${prefix} description needle` })).items[0].id, row.id);
          const unclassified = await create({ activityTypeId: null, kind: null });
          assert.ok(
            (await search({ activityType: "none" })).items.some(
              (task) => task.id === unclassified.id,
            ),
          );
          await assert.rejects(create({ company: "Retired" }), (error) => error.status === 400);
          await assert.rejects(create({ course: "Retired" }), (error) => error.status === 400);
          const done = await patch(row, { status: "DONE" });
          assert.ok((await search({})).items.some((task) => task.id === row.id));
          assert.ok((await search({ view: "active" })).items.some((task) => task.id === row.id));
          const archived = await patch(done, { archived: true });
          assert.ok(!(await search({ view: "active" })).items.some((task) => task.id === row.id));
          assert.ok((await search({ view: "archived" })).items.some((task) => task.id === row.id));
          assert.equal((await api.getTodo(archived.id)).id, row.id);
        },
      );
      await t.test(
        "pagination is bounded, stable, counts all matches and clamps stale pages",
        async () => {
          const chunk = `${prefix} paging`;
          for (let index = 0; index < 35; index++)
            await create({
              title: `${chunk} ${String(index).padStart(2, "0")}`,
              priorityLevel: index === 0 ? "URGENT" : "NORMAL",
            });
          const first = await search({ q: chunk, sort: "title" }),
            second = await search({ q: chunk, sort: "title", page: "2" });
          assert.equal(first.items.length, 30);
          assert.equal(first.total, 35);
          assert.equal(second.items.length, 5);
          assert.equal(second.page, 2);
          assert.equal(new Set([...first.items, ...second.items].map((task) => task.id)).size, 35);
          assert.equal((await search({ q: chunk, page: "999", sort: "title" })).page, 2);
          const priority = await search({ q: chunk, sort: "priority" });
          assert.equal(priority.items[0].priorityLevel, "URGENT");
        },
      );
      await t.test(
        "explicit unlink/deletion retains contacts and audit while ordinary changes preserve associations",
        async () => {
          const row = await patch(assigned, {
            requesterId: null,

            affectedContactIds: [],
          });
          assert.equal(row.requester, null);
          assert.deepEqual(row.affectedPeople, []);
          const linked = await create({
            requesterId: requester.id,
            affectedContactIds: [requester.id],
          });
          await api.deleteTodo(linked.id, command(linked));
          assert.equal(await db.todoAffectedContact.count({ where: { todoId: linked.id } }), 0);
          assert.ok(await db.workContact.findUnique({ where: { id: requester.id } }));
          assert.ok(
            (await db.workActivity.findMany({ where: { todoReference: linked.reference } })).every(
              (entry) => entry.todoId === null,
            ),
          );
        },
      );
    } finally {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(62019, 1)`;
        await tx.workActivity.deleteMany({
          where: {
            todoReference: { in: taskIds.map((id) => `TASK-${String(id).padStart(4, "0")}`) },
          },
        });
        await tx.todoAffectedContact.deleteMany({ where: { todoId: { in: taskIds } } });
        await tx.todo.updateMany({ where: { id: { in: taskIds } }, data: { dependsOnId: null } });
        await tx.todo.deleteMany({ where: { id: { in: taskIds } } });
        await tx.activityType.deleteMany({ where: { name: `${prefix} activity` } });
        await tx.workContact.deleteMany({ where: { id: { in: contactIds } } });
        await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
        if (foreign) await tx.user.delete({ where: { id: foreign.id } });
      });
      await db.$disconnect();
    }
  },
);
