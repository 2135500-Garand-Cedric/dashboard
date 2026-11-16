import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { supportModules, loadWorkModule } from "./helpers/work-support.mjs";
test(
  "Phase 05 canonical graph, child tasks and current transition acknowledgements",
  { skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.notEqual(process.env.NODE_ENV, "production");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js"),
      db = new PrismaClient();
    const { server: api, validation, supporting, supportingDeps } = supportModules(db);
    const rel = loadWorkModule("src/lib/work-management/relationships.ts", supportingDeps);
    const ids = [],
      keys = [],
      prefix = `__phase05_${randomUUID()}`;
    const original = await db.user.findUniqueOrThrow({
      where: { id: 1 },
      select: { totalXp: true, coins: true, updatedAt: true },
    });
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    const create = async (extra = {}) => {
      const row = await api.createTodo({ title: prefix, ...extra }, command());
      ids.push(row.id);
      return row;
    };
    const fresh = (row) => api.getTodo(row.id);
    const link = async (a, b, kind = "blocked-by", remove = false) =>
      rel.relationshipCommand(a.id, { kind, targetId: b.id }, command(await fresh(a)), remove);
    const patch = async (row, body) => api.patchTodo(row.id, body, command(await fresh(row)));
    const review = (row, status = "DONE") =>
      rel.readTransition(row.id, new URLSearchParams({ status }));
    const reject = (promise, status = 409) =>
      assert.rejects(
        promise,
        (error) => error instanceof validation.WorkValidationError && error.status === status,
      );
    const count = async () => ({
      links: await db.todoDependency.count(),
      related: await db.todoRelation.count(),
      activities: await db.workActivity.count(),
      receipts: await db.workMutationReceipt.count(),
      balance: await db.user.findUnique({
        where: { id: 1 },
        select: { coins: true, totalXp: true },
      }),
    });
    let foreign;
    try {
      await t.test(
        "checklist is separate from independent child tasks and no hierarchy edge is implied",
        async () => {
          const parent = await create(),
            step = await api.createSubtask(
              parent.id,
              { title: "Checklist stays checklist" },
              command(parent),
            );
          const current = await fresh(parent),
            child = await create({
              title: `${prefix} child`,
              parentId: parent.id,
              parentRevision: current.revision,
            });
          assert.equal(child.parentId, parent.id);
          assert.equal(child.status, "NEW");
          assert.equal(child.dependencyCount, 0);
          assert.equal((await fresh(parent)).childCount, 1);
          assert.equal((await fresh(parent)).subtasks[0].id, step.id);
          await supporting.createNote(
            child.id,
            { body: "Independent child note", documentationUrls: [] },
            command(),
          );
          await patch(child, { status: "DONE" });
          const summary = await fresh(parent);
          assert.equal(summary.status, "NEW");
          assert.equal(summary.completedChildCount, 1);
          assert.equal(summary.subtasks[0].done, false);
          assert.equal(
            (await supporting.taskTimeline(parent.id, new URLSearchParams())).notes.length,
            0,
          );
        },
      );
      await t.test(
        "one parent, missing/foreign/self/cyclic parents and concurrent opposite reparenting",
        async () => {
          const a = await create(),
            b = await create(),
            c = await create();
          await link(b, a, "parent");
          await link(c, b, "parent");
          await reject(link(a, c, "parent"));
          await reject(link(a, a, "parent"));
          await reject(link(c, { id: 2147483647 }, "parent"), 400);
          await link(c, a, "parent");
          assert.equal((await fresh(c)).parentId, a.id);
          const x = await create(),
            y = await create();
          const results = await Promise.allSettled([
            rel.relationshipCommand(x.id, { kind: "parent", targetId: y.id }, command(x)),
            rel.relationshipCommand(y.id, { kind: "parent", targetId: x.id }, command(y)),
          ]);
          assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
          foreign = await db.user.create({
            data: { email: `${prefix}@invalid.test`, name: prefix },
          });
          const other = await db.todo.create({
            data: { title: "PRIVATE FOREIGN", userId: foreign.id },
          });
          ids.push(other.id);
          await reject(link(a, other, "parent"), 400);
          await reject(link(a, other), 400);
          await reject(link(a, other, "related"), 400);
          await assert.rejects(
            rel.readRelationships(other.id, new URLSearchParams()),
            (error) => error.status === 404,
          );
        },
      );
      await t.test(
        "multiple directed prerequisites, Done vs Cancelled, Waiting, archive and legacy adapter protection",
        async () => {
          const a = await create({ waitingOn: "Vendor", workaround: "Temporary workaround" }),
            b = await create(),
            c = await create();
          await link(a, b);
          await link(a, c);
          let row = await fresh(a);
          assert.equal(row.dependencyCount, 2);
          assert.equal(row.dependsOnId, null);
          assert.equal(row.legacyDependencyWritable, false);
          assert.equal(row.blockingCount, 2);
          const before = await count();
          await reject(api.patchTodo(a.id, { dependsOnId: null }, command(row)));
          assert.deepEqual(await count(), before);
          await patch(a, { status: "WAITING" });
          assert.equal((await fresh(a)).isBlocked, true);
          await patch(b, { status: "DONE" });
          assert.equal((await fresh(a)).blockingCount, 1);
          assert.equal((await fresh(a)).status, "WAITING");
          await patch(c, { status: "CANCELLED" });
          assert.equal((await fresh(a)).blockingCount, 1);
          await patch(c, { archived: true });
          assert.equal((await fresh(a)).dependencyCount, 2);
          assert.equal((await fresh(a)).isBlocked, true);
          await reject(patch(a, { status: "IN_PROGRESS" }));
          const snap = await review(a, "IN_PROGRESS"),
            body = {
              status: "IN_PROGRESS",
              transitionToken: snap.token,
              allowBlocked: true,
              overrideReason: "Start with explicitly reviewed workaround",
            };
          const key = command(await fresh(a)),
            started = await api.patchTodo(a.id, body, key);
          assert.equal(started.status, "IN_PROGRESS");
          assert.equal(started.isBlocked, true);
          assert.deepEqual(await api.patchTodo(a.id, body, key), started);
          const log = await db.workActivity.findMany({
            where: { todoId: a.id, action: "BLOCKED_OVERRIDE" },
          });
          assert.equal(log.length, 1);
          assert.ok(JSON.stringify(log[0].changes).includes(body.overrideReason));
        },
      );
      await t.test(
        "dependency duplicates, deep/reverse cycles, concurrent opposite edges and related canonical pair",
        async () => {
          const a = await create(),
            b = await create(),
            c = await create();
          await link(a, b);
          await link(b, c);
          const before = await count();
          await reject(link(a, b));
          await reject(link(c, a));
          await reject(link(a, a));
          assert.deepEqual(await count(), before);
          const x = await create(),
            y = await create();
          const races = await Promise.allSettled([
            rel.relationshipCommand(x.id, { kind: "blocked-by", targetId: y.id }, command(x)),
            rel.relationshipCommand(y.id, { kind: "blocked-by", targetId: x.id }, command(y)),
          ]);
          assert.equal(races.filter((item) => item.status === "fulfilled").length, 1);
          await link(a, c, "related");
          await reject(link(c, a, "related"));
          await reject(link(a, a, "related"));
          const pair = await db.todoRelation.findUnique({
            where: {
              firstId_secondId: { firstId: Math.min(a.id, c.id), secondId: Math.max(a.id, c.id) },
            },
          });
          assert.ok(pair);
          const list = await rel.readRelationships(
            c.id,
            new URLSearchParams({ section: "related" }),
          );
          assert.equal(list.items[0].task.id, a.id);
          const blocks = await rel.readRelationships(
            b.id,
            new URLSearchParams({ section: "blocks" }),
          );
          assert.equal(blocks.items[0].task.id, a.id);
          await link(c, a, "related", true);
          assert.equal((await fresh(a)).relatedCount, 0);
        },
      );
      await t.test(
        "parent closure requires fresh descendant acknowledgement and never cascades rewards or states",
        async () => {
          const parent = await create({ rewardXp: 0, rewardCoins: 0 }),
            child = await create({ parentId: parent.id, parentRevision: parent.revision }),
            grandchild = await create({ parentId: child.id, parentRevision: child.revision });
          const before = await count();
          await reject(patch(parent, { status: "DONE" }));
          assert.deepEqual(await count(), before);
          const snap = await review(parent);
          assert.equal(snap.unfinishedChildCount, 2);
          await patch(grandchild, { status: "CANCELLED" });
          const staleBefore = await count();
          await reject(
            patch(parent, {
              status: "DONE",
              transitionToken: snap.token,
              allowUnfinishedChildren: true,
            }),
          );
          assert.deepEqual(await count(), staleBefore);
          const current = await review(parent);
          const closed = await patch(parent, {
            status: "DONE",
            transitionToken: current.token,
            allowUnfinishedChildren: true,
          });
          assert.equal(closed.status, "DONE");
          assert.equal((await fresh(child)).status, "NEW");
          assert.equal((await fresh(grandchild)).status, "CANCELLED");
          assert.equal((await count()).balance.totalXp, before.balance.totalXp);
          assert.equal(
            await db.workActivity.count({
              where: { todoId: parent.id, action: "UNFINISHED_CHILDREN_ACKNOWLEDGED" },
            }),
            1,
          );
          await reject(
            api.createTodo(
              { title: prefix, parentId: parent.id, parentRevision: closed.revision },
              command(),
            ),
          );
        },
      );
      await t.test(
        "changed/ABA prerequisites and newly added links invalidate confirmation without partial reward/history writes",
        async () => {
          const a = await create({ rewardXp: 0 }),
            b = await create(),
            c = await create();
          await link(a, b);
          const snapshot = await review(a),
            body = {
              status: "DONE",
              transitionToken: snapshot.token,
              allowBlocked: true,
              overrideReason: "Reviewed",
            };
          await patch(b, { status: "WAITING" });
          await patch(b, { status: "NEW" });
          const before = await count();
          await reject(patch(a, body));
          assert.deepEqual(await count(), before);
          const next = await review(a);
          await link(a, c);
          const afterLink = await count();
          await reject(patch(a, { ...body, transitionToken: next.token }));
          assert.deepEqual(await count(), afterLink);
          const latest = await review(a);
          await reject(patch(a, { ...body, transitionToken: latest.token, overrideReason: " " }));
          await patch(a, { ...body, transitionToken: latest.token });
          assert.equal((await fresh(a)).status, "DONE");
        },
      );
      await t.test(
        "late relationship audit failure rolls back graph, mirrors, peer versions, audit and receipt",
        async () => {
          const a = await create(),
            b = await create(),
            before = await count(),
            aBefore = await fresh(a),
            bBefore = await fresh(b),
            key = command(aBefore);
          const failingDb = {
            $transaction: (action, options) =>
              db.$transaction(
                (tx) =>
                  action(
                    new Proxy(tx, {
                      get(target, prop) {
                        if (prop === "workActivity")
                          return {
                            ...target.workActivity,
                            create: async () => {
                              throw new Error("injected graph audit failure");
                            },
                          };
                        return Reflect.get(target, prop);
                      },
                    }),
                  ),
                options,
              ),
          };
          const failureModules = supportModules(failingDb),
            failingRel = loadWorkModule(
              "src/lib/work-management/relationships.ts",
              failureModules.supportingDeps,
            );
          await assert.rejects(
            failingRel.relationshipCommand(a.id, { kind: "blocked-by", targetId: b.id }, key),
            /injected graph audit failure/,
          );
          assert.deepEqual(await count(), before);
          assert.deepEqual(await fresh(a), aBefore);
          assert.deepEqual(await fresh(b), bBefore);
          const result = await rel.relationshipCommand(
            a.id,
            { kind: "blocked-by", targetId: b.id },
            key,
          );
          assert.equal(result.dependencyCount, 1);
        },
      );
      await t.test(
        "relationship views paginate rather than hiding children and graph links",
        async () => {
          const parent = await create();
          for (let index = 0; index < 21; index++) {
            const child = await create();
            await link(parent, child, "child");
          }
          const first = await rel.readRelationships(
              parent.id,
              new URLSearchParams({ section: "children" }),
            ),
            last = await rel.readRelationships(
              parent.id,
              new URLSearchParams({ section: "children", page: "2" }),
            );
          assert.equal(first.total, 21);
          assert.equal(first.items.length, 20);
          assert.equal(last.items.length, 1);
          assert.ok(!first.items.some((item) => item.task.id === last.items[0].task.id));
          assert.equal((await fresh(parent)).childCount, 21);
        },
      );
      await t.test(
        "unlink, retry, parent revision, archived graph and deletion guards retain original tasks",
        async () => {
          const a = await create(),
            b = await create();
          await link(a, b);
          await reject(api.deleteTodo(a.id, command(await fresh(a))));
          await patch(a, { archived: true });
          assert.equal((await fresh(a)).dependencyCount, 1);
          await reject(link(a, b, "blocked-by", true));
          await patch(a, { archived: false });
          const root = await fresh(a),
            key = command(root),
            body = { kind: "blocked-by", targetId: b.id };
          const removed = await rel.relationshipCommand(a.id, body, key, true);
          assert.deepEqual(await rel.relationshipCommand(a.id, body, key, true), removed);
          assert.equal(removed.dependencyCount, 0);
          assert.equal(removed.dependsOnId, null);
          await reject(
            api.createTodo(
              { title: prefix, parentId: a.id, parentRevision: a.revision },
              command(),
            ),
          );
          await reject(api.createTodo({ title: prefix, parentId: a.id }, command()), 428);
        },
      );
    } finally {
      await db.$transaction(async (tx) => {
        await tx.workActivity.deleteMany({ where: { todoId: { in: ids } } });
        await tx.workNoteRevision.deleteMany({ where: { note: { todoId: { in: ids } } } });
        await tx.workNote.deleteMany({ where: { todoId: { in: ids } } });
        await tx.todoDependency.deleteMany({
          where: { OR: [{ dependentId: { in: ids } }, { prerequisiteId: { in: ids } }] },
        });
        await tx.todoRelation.deleteMany({
          where: { OR: [{ firstId: { in: ids } }, { secondId: { in: ids } }] },
        });
        await tx.subtask.deleteMany({ where: { todoId: { in: ids } } });
        await tx.todo.updateMany({
          where: { id: { in: ids } },
          data: { parentId: null, dependsOnId: null },
        });
        await tx.todo.deleteMany({ where: { id: { in: ids } } });
        await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
        if (foreign) await tx.user.delete({ where: { id: foreign.id } });
        await tx.user.update({ where: { id: 1 }, data: original });
      });
      await db.$disconnect();
    }
  },
);
