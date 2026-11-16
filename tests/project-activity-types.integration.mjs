import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";

test(
  "project activity types migrate safely, drive milestone colors and default new task types",
  {
    skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1",
  },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const api = loadWorkServices(db);
    const prefix = `__project_types_${randomUUID()}`;
    const tasks = [],
      projects = [],
      types = [],
      keys = [];
    let foreignUser;
    const command = (revision) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(revision ? { revision } : {}) };
    };
    try {
      await t.test(
        "migration reuses existing colors and preserves project IDs, contexts and extra data",
        async () => {
          await db.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "ActivityType" (id SERIAL PRIMARY KEY,name TEXT UNIQUE,color TEXT,active BOOLEAN,"createdAt" TIMESTAMP,"updatedAt" TIMESTAMP) ON COMMIT DROP',
            );
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "WorkContext" (id INTEGER PRIMARY KEY,"userId" INTEGER,name TEXT,active BOOLEAN) ON COMMIT DROP',
            );
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "WorkProject" (id INTEGER PRIMARY KEY,"userId" INTEGER,"contextId" INTEGER,name TEXT) ON COMMIT DROP',
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO "ActivityType" (name,color,active) VALUES ('School','#123456',true)`,
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO "WorkContext" VALUES (10,1,'school',true),(11,1,'Personal',true),(12,2,'Private',true)`,
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO "WorkProject" VALUES (40,1,10,'Existing school'),(41,1,11,'Existing personal'),(42,1,NULL,'Unclassified'),(43,1,12,'Legacy anomaly')`,
            );
            const before = await tx.$queryRawUnsafe(
              'SELECT id,name,"contextId" FROM "WorkProject" ORDER BY id',
            );
            for (const sql of fs
              .readFileSync(
                "prisma/migrations/20261117120000_project_activity_types/migration.sql",
                "utf8",
              )
              .split(";")) {
              if (sql.trim() && !/^(BEGIN|COMMIT)$/i.test(sql.trim()))
                await tx.$executeRawUnsafe(sql);
            }
            assert.deepEqual(
              await tx.$queryRawUnsafe('SELECT id,name,"contextId" FROM "WorkProject" ORDER BY id'),
              before,
            );
            const rows = await tx.$queryRawUnsafe(
              'SELECT p.id,a.name,a.color FROM "WorkProject" p LEFT JOIN "ActivityType" a ON a.id=p."activityTypeId" ORDER BY p.id',
            );
            assert.equal(rows[0].color, "#123456");
            assert.equal(rows[1].name, "Personal");
            assert.equal(rows[2].name, null);
            assert.equal(rows[3].name, null);
          });
        },
      );
      const a = await db.activityType.create({ data: { name: `${prefix} A`, color: "#15803d" } });
      const b = await db.activityType.create({ data: { name: `${prefix} B`, color: "#7c3aed" } });
      types.push(a.id, b.id);
      let project = await api.projects.createProject(
        { name: prefix, activityTypeId: a.id, startDate: "2026-11-16", targetDate: "2026-12-04" },
        command(),
      );
      projects.push(project.id);
      assert.equal(project.activityType.color, a.color);
      const inherited = await api.server.createTodo(
        { title: prefix, projectId: project.id },
        command(),
      );
      tasks.push(inherited.id);
      assert.equal(inherited.activityTypeId, a.id);
      const override = await api.server.createTodo(
        { title: prefix, projectId: project.id, activityTypeId: b.id },
        command(),
      );
      tasks.push(override.id);
      assert.equal(override.activityTypeId, b.id);
      const unclassified = await api.server.createTodo(
        { title: prefix, projectId: project.id, activityTypeId: null },
        command(),
      );
      tasks.push(unclassified.id);
      assert.equal(unclassified.activityTypeId, null);
      await assert.rejects(
        api.server.createTodo({ title: prefix, company: "Retired" }, command()),
        (error) => error.status === 400,
      );
      await assert.rejects(
        api.server.patchTodo(inherited.id, { course: "Retired" }, command(inherited.revision)),
        (error) => error.status === 400,
      );
      await db.todo.update({
        where: { id: inherited.id },
        data: { company: "Historical", course: "Historical" },
      });
      const current = await api.server.getTodo(inherited.id);
      assert.equal(Object.hasOwn(current, "company"), false);
      assert.equal(Object.hasOwn(current, "course"), false);
      assert.equal(
        (await db.todo.findUnique({ where: { id: inherited.id } })).company,
        "Historical",
      );
      project = await api.projects.getProject(project.id);
      project = await api.projects.patchProject(
        project.id,
        { activityTypeId: b.id },
        command(project.revision),
      );
      const later = await api.server.createTodo(
        { title: prefix, projectId: project.id },
        command(),
      );
      tasks.push(later.id);
      assert.equal(later.activityTypeId, b.id);
      assert.equal(
        (await api.server.getTodo(inherited.id)).activityTypeId,
        a.id,
        "Changing a project must preserve existing task choices",
      );
      project = await api.projects.getProject(project.id);
      project = await api.projects.projectMilestoneCommand(
        project.id,
        { action: "create", label: prefix, date: { kind: "DATE", date: "2026-11-20" } },
        command(project.revision),
      );
      const feed = await api.calendar.calendarFeed(
        new URLSearchParams({
          start: "2026-11-01T00:00:00Z",
          end: "2026-12-01T00:00:00Z",
          project: String(project.id),
          activityType: String(b.id),
        }),
      );
      const milestone = feed.items.find((row) => row.extendedProps.layer === "milestones");
      assert.equal(milestone.borderColor, b.color);
      assert.equal(milestone.extendedProps.activityType, b.name);
      assert.equal(
        (
          await api.projects.listProjects(
            new URLSearchParams({ activityType: String(a.id), q: prefix }),
          )
        ).total,
        0,
      );
      assert.equal(
        (
          await api.projects.listProjects(
            new URLSearchParams({ activityType: String(b.id), q: prefix }),
          )
        ).items[0].id,
        project.id,
      );
      await db.activityType.update({ where: { id: a.id }, data: { active: false } });
      await assert.rejects(
        api.projects.patchProject(project.id, { activityTypeId: a.id }, command(project.revision)),
        /active calendar activity type/,
      );
      foreignUser = await db.user.create({ data: { email: `${prefix}@example.invalid` } });
      const foreign = await db.workProject.create({
        data: { userId: foreignUser.id, name: prefix, activityTypeId: b.id },
      });
      projects.push(foreign.id);
      await assert.rejects(
        api.server.createTodo({ title: prefix, projectId: foreign.id }, command()),
        (error) => error.status === 404,
      );
    } finally {
      await db.workActivity.deleteMany({
        where: { OR: [{ todoId: { in: tasks } }, { projectId: { in: projects } }] },
      });
      await db.todo.deleteMany({ where: { id: { in: tasks } } });
      await db.workKeyDate.deleteMany({ where: { projectId: { in: projects } } });
      await db.workProjectStage.deleteMany({ where: { projectId: { in: projects } } });
      await db.workProject.deleteMany({ where: { id: { in: projects } } });
      await db.activityType.deleteMany({ where: { id: { in: types } } });
      await db.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
      if (foreignUser) await db.user.delete({ where: { id: foreignUser.id } });
      await db.$disconnect();
    }
  },
);
