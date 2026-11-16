import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { supportModules, loadWorkModule } from "./helpers/work-support.mjs";

test(
  "task activity types migrate safely and determine all related calendar colors",
  {
    skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1",
  },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const modules = supportModules(db),
      api = modules.server;
    const cal = loadWorkModule(
      "src/lib/work-management/calendar-server.ts",
      modules.supportingDeps,
    );
    const dates = loadWorkModule("src/lib/work-management/date-server.ts", modules.supportingDeps);
    const prefix = `__activity_${randomUUID()}`;
    const ids = [],
      events = [],
      keys = [];
    const command = (revision) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(revision ? { revision } : {}) };
    };
    let typeA, typeB;
    try {
      await t.test(
        "additive migration reuses label colors and preserves IDs, parents and context records",
        async () => {
          await db.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "ActivityType" (id SERIAL PRIMARY KEY, name TEXT UNIQUE, color TEXT, active BOOLEAN, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP) ON COMMIT DROP',
            );
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "WorkContext" (id INTEGER PRIMARY KEY, "userId" INTEGER, name TEXT, active BOOLEAN) ON COMMIT DROP',
            );
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "Todo" (id INTEGER PRIMARY KEY, "userId" INTEGER, "contextId" INTEGER, "parentId" INTEGER) ON COMMIT DROP',
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO "ActivityType" (name,color,active) VALUES ('School','#123456',true)`,
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO "WorkContext" VALUES (1,1,'school',true),(2,1,'Personal',false),(3,2,'Private',true)`,
            );
            await tx.$executeRawUnsafe(
              'INSERT INTO "Todo" VALUES (40,1,1,NULL),(41,1,2,40),(42,1,NULL,NULL),(43,1,3,NULL)',
            );
            const before = await tx.$queryRawUnsafe(
              'SELECT id,"parentId","contextId" FROM "Todo" ORDER BY id',
            );
            const sql = fs.readFileSync(
              "prisma/migrations/20261116120000_task_activity_types/migration.sql",
              "utf8",
            );
            for (const statement of sql.split(";").filter((part) => part.trim()))
              await tx.$executeRawUnsafe(statement);
            assert.deepEqual(
              await tx.$queryRawUnsafe('SELECT id,"parentId","contextId" FROM "Todo" ORDER BY id'),
              before,
            );
            const rows = await tx.$queryRawUnsafe(
              'SELECT t.id,a.name,a.color,a.active FROM "Todo" t LEFT JOIN "ActivityType" a ON a.id=t."activityTypeId" ORDER BY t.id',
            );
            assert.equal(rows[0].color, "#123456");
            assert.equal(rows[1].name, "Personal");
            assert.equal(rows[1].active, false);
            assert.equal(rows[2].name, null);
            assert.equal(rows[3].name, null, "Foreign contexts are not adopted");
          });
        },
      );
      typeA = await db.activityType.create({ data: { name: `${prefix} A`, color: "#117744" } });
      typeB = await db.activityType.create({ data: { name: `${prefix} B`, color: "#8833cc" } });
      const makeTask = async (type) => {
        const row = await api.createTodo(
          { title: prefix, contextId: null, activityTypeId: type.id },
          command(),
        );
        ids.push(row.id);
        return row;
      };
      const b = await makeTask(typeB),
        a = await makeTask(typeA);
      const makeEvent = async (links, kind = "ORDINARY", tbd = false) => {
        const row = await api.createEvent(
          {
            title: prefix,
            type: typeB.name,
            kind,
            timing: tbd
              ? { kind: "TBD" }
              : {
                  kind: "TIMED",
                  start: { kind: "TIME", local: "2026-11-20T12:00", timeZone: "UTC" },
                  end: { kind: "TIME", local: "2026-11-20T13:00", timeZone: "UTC" },
                },
            links,
          },
          command(),
        );
        events.push(row.id);
        return row;
      };
      const ordinary = await makeEvent([{ todoId: a.id, role: "RELATED" }]);
      const shared = await makeEvent([
        { todoId: a.id, role: "RELATED" },
        { todoId: b.id, role: "RELATED" },
      ]);
      const session = await makeEvent(
        [
          { todoId: a.id, role: "SESSION_TARGET" },
          { todoId: b.id, role: "RELATED" },
        ],
        "WORK_SESSION",
      );
      const tbd = await makeEvent([{ todoId: a.id, role: "RELATED" }], "ORDINARY", true);
      const standaloneTbd = await makeEvent([], "ORDINARY", true);
      await dates.taskDateCommand(
        a.id,
        { action: "deadline", date: { kind: "DATE", date: "2026-11-21" } },
        command((await api.getTodo(a.id)).revision),
      );
      await dates.taskDateCommand(
        a.id,
        { action: "followup-create", date: { kind: "DATE", date: "2026-11-22" } },
        command((await api.getTodo(a.id)).revision),
      );
      const feed = (extra = {}) =>
        cal.calendarFeed(
          new URLSearchParams({
            start: "2026-11-01T00:00:00Z",
            end: "2026-12-01T00:00:00Z",
            ...extra,
          }),
        );
      await t.test(
        "task colors override event labels; target task wins over lower-ID related tasks",
        async () => {
          const all = await feed();
          assert.equal(
            all.tbd.find((row) => row.id === standaloneTbd.id).activityColor,
            typeB.color,
          );
          assert.equal(
            all.tbd.find((row) => row.id === standaloneTbd.id).activityLabel,
            typeB.name,
          );
          const rows = all.items;
          for (const id of [`event:${ordinary.id}`, `event:${session.id}`, `deadline:${a.id}`]) {
            assert.equal(rows.find((row) => row.id === id).borderColor, typeA.color);
          }
          assert.equal(
            rows.find((row) => row.id === `event:${shared.id}`).borderColor,
            typeB.color,
          );
          const followup = rows.find(
            (row) => row.extendedProps.layer === "followups" && row.extendedProps.taskId === a.id,
          );
          assert.equal(followup.borderColor, typeA.color);
          const selected = await feed({ activityType: String(typeA.id) });
          assert.ok(selected.items.some((row) => row.id === `event:${session.id}`));
          assert.ok(!selected.items.some((row) => row.id === `event:${shared.id}`));
          assert.equal(selected.tbd.find((row) => row.id === tbd.id).activityColor, typeA.color);
          assert.equal(selected.tbd.find((row) => row.id === tbd.id).activityLabel, typeA.name);
          assert.ok(
            !(await feed({ activityType: String(typeB.id) })).tbd.some((row) => row.id === tbd.id),
          );
          assert.ok(
            (
              await api.searchWork(
                new URLSearchParams({ activityType: String(typeA.id), q: prefix }),
              )
            ).items.some((row) => row.id === a.id),
          );
        },
      );
      await t.test(
        "event conversion creates a task with the chosen calendar activity type",
        async () => {
          const source = await makeEvent([]);
          const body = {
            mode: "RELATED",
            title: `${prefix} converted`,
            activityTypeId: typeA.id,
            changeDeadline: false,
            deadline: null,
          };
          const preview = await cal.previewConversion(source.id, body);
          const result = await cal.confirmConversion(
            source.id,
            { ...body, previewToken: preview.token },
            command(source.revision),
          );
          ids.push(result.taskId);
          assert.equal((await api.getTodo(result.taskId)).activityTypeId, typeA.id);
        },
      );
      await t.test(
        "live label color changes propagate without duplicating calendar records",
        async () => {
          await db.activityType.update({
            where: { id: typeA.id },
            data: { color: "#223344", active: false },
          });
          assert.equal(
            (await feed()).items.find((row) => row.id === `event:${session.id}`).borderColor,
            "#223344",
          );
          assert.equal(
            (await feed()).tbd.find((row) => row.id === tbd.id).activityColor,
            "#223344",
          );
          await assert.rejects(
            api.createTodo({ title: prefix, activityTypeId: typeA.id }, command()),
            /active calendar activity type/,
          );
          const current = await api.getTodo(a.id);
          await api.patchTodo(
            a.id,
            { title: `${prefix} updated`, activityTypeId: typeA.id },
            command(current.revision),
          );
          assert.equal(await db.event.count({ where: { id: { in: events } } }), events.length);
        },
      );
    } finally {
      for (const id of events)
        await api.deleteEvent(id, command((await api.getEvent(id)).revision));
      await db.workFollowUp.deleteMany({ where: { todoId: { in: ids } } });
      await db.workEventConversion.deleteMany({ where: { todoId: { in: ids } } });
      await db.todo.deleteMany({ where: { id: { in: ids } } });
      await db.activityType.deleteMany({
        where: { id: { in: [typeA?.id, typeB?.id].filter(Boolean) } },
      });
      await db.workMutationReceipt.deleteMany({ where: { userId: 1, requestKey: { in: keys } } });
      await db.$disconnect();
    }
  },
);
