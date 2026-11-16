import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";

test(
  "combined task details preserve complete sections, ownership and fresh reads with one task lookup",
  {
    skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const prefix = `__task_details_${randomUUID()}`;
    const ids = [];
    let ownerProject, foreignProject, foreignUser, event;
    try {
      foreignUser = await db.user.create({ data: { email: `${prefix}@example.invalid` } });
      ownerProject = await db.workProject.create({ data: { userId: 1, name: prefix } });
      foreignProject = await db.workProject.create({
        data: { userId: foreignUser.id, name: `${prefix} private` },
      });
      const stage = await db.workProjectStage.create({
        data: { projectId: ownerProject.id, name: "Plan" },
      });
      const task = await db.todo.create({
        data: {
          userId: 1,
          title: prefix,
          projectId: ownerProject.id,
          stageId: stage.id,
          deadlineDate: "2030-01-02",
        },
      });
      ids.push(task.id);
      for (let index = 0; index < 25; index++) {
        const child = await db.todo.create({
          data: {
            userId: 1,
            title: `${prefix} ${index}`,
            ...(index === 24 ? { parentId: task.id } : {}),
          },
        });
        ids.push(child.id);
        if (index < 24)
          await db.todoRelation.create({ data: { firstId: task.id, secondId: child.id } });
      }
      const foreign = await db.todo.create({
        data: { userId: foreignUser.id, title: `${prefix} private` },
      });
      ids.push(foreign.id);
      await db.todoDependency.createMany({
        data: [
          { dependentId: task.id, prerequisiteId: ids[1] },
          { dependentId: ids[2], prerequisiteId: task.id },
        ],
      });
      const note = await db.workNote.create({
        data: { userId: 1, todoId: task.id, actorGithubId: "89470930", body: "Initial note" },
      });
      await db.workAttachment.create({
        data: {
          userId: 1,
          todoId: task.id,
          originalName: "example.pdf",
          mimeType: "application/pdf",
          byteSize: 12,
          contentHash: "a".repeat(64),
          storageKey: `${prefix}.pdf`,
        },
      });
      await db.workFollowUp.create({
        data: { todoId: task.id, date: "2030-01-03", reason: "Active" },
      });
      await db.workFollowUp.create({
        data: {
          todoId: task.id,
          date: "2020-01-01",
          status: "COMPLETED",
          resolvedAt: new Date(),
          reason: "Resolved",
          outcome: "Contacted requester",
        },
      });
      event = await db.event.create({
        data: {
          userId: 1,
          title: prefix,
          kind: "WORK_SESSION",
          timeZone: "UTC",
          busy: true,
          taskLinks: { create: { todoId: task.id, role: "SESSION_TARGET" } },
          date: new Date("2030-01-04T10:00:00Z"),
          endDate: new Date("2030-01-04T11:00:00Z"),
        },
      });
      let rootLookups = 0;
      const counted = db.$extends({
        query: {
          todo: {
            findFirst({ args, query }) {
              if (args.where?.id === task.id) rootLookups++;
              return query(args);
            },
          },
        },
      });
      const services = loadWorkServices(counted);
      const before = await db.todo.findUniqueOrThrow({ where: { id: task.id } });
      const first = await services.taskDetails.readTaskDetails(task.id);
      assert.equal(
        rootLookups,
        1,
        "Ownership and the full task graph must be read once, not once per section",
      );
      assert.equal(first.task.id, task.id);
      const seed = (path) => first.initial[path].data;
      assert.equal(
        seed(`/api/todos/${task.id}/relationships?section=related&page=1`).items.length,
        20,
      );
      assert.equal(
        seed(`/api/todos/${task.id}/relationships?section=related&page=2`).items.length,
        4,
      );
      for (const section of ["children", "blocked-by", "blocks"])
        assert.equal(
          seed(`/api/todos/${task.id}/relationships?section=${section}&page=1`).items.length,
          1,
        );
      const timeline = seed(`/api/todos/${task.id}/timeline?filter=notes&page=1`);
      assert.equal(timeline.notes[0].id, note.id);
      assert.equal(timeline.followUps.length, 1);
      assert.equal(timeline.total, 2);
      assert.equal(seed(`/api/todos/${task.id}/attachments?page=1`).items.length, 1);
      assert.equal(seed(`/api/todos/${task.id}/dates`).activeFollowUp.reason, "Active");
      assert.equal(seed(`/api/todos/${task.id}/calendar?page=1`).items[0].id, event.id);
      assert.ok(
        seed("/api/projects?view=active&page=1").items.some((row) => row.id === ownerProject.id),
      );
      assert.ok(
        !seed("/api/projects?view=active&page=1").items.some((row) => row.id === foreignProject.id),
      );
      assert.equal(seed(`/api/projects/${ownerProject.id}`).stages[0].id, stage.id);
      assert.deepEqual(
        await db.todo.findUniqueOrThrow({ where: { id: task.id } }),
        before,
        "Opening details is read-only",
      );
      await db.workNote.update({ where: { id: note.id }, data: { body: "Fresh note" } });
      const second = await services.taskDetails.readTaskDetails(task.id);
      assert.equal(
        second.initial[`/api/todos/${task.id}/timeline?filter=notes&page=1`].data.notes[0].body,
        "Fresh note",
      );
      await assert.rejects(
        services.taskDetails.readTaskDetails(foreign.id),
        (error) => error.status === 404,
      );
      await assert.rejects(
        services.taskDetails.readTaskDetails(2147483647),
        (error) => error.status === 404,
      );
    } finally {
      await db.$transaction([
        db.eventTaskLink.deleteMany({ where: { todoId: { in: ids } } }),
        db.event.deleteMany({ where: { id: event?.id ?? -1 } }),
      ]);
      await db.workAttachment.deleteMany({ where: { todoId: { in: ids } } });
      await db.workNote.deleteMany({ where: { todoId: { in: ids } } });
      await db.workFollowUp.deleteMany({ where: { todoId: { in: ids } } });
      await db.todoRelation.deleteMany({
        where: { OR: [{ firstId: { in: ids } }, { secondId: { in: ids } }] },
      });
      await db.todoDependency.deleteMany({
        where: { OR: [{ dependentId: { in: ids } }, { prerequisiteId: { in: ids } }] },
      });
      await db.todo.updateMany({
        where: { id: { in: ids } },
        data: { parentId: null, stageId: null, projectId: null },
      });
      await db.todo.deleteMany({ where: { id: { in: ids } } });
      if (ownerProject) {
        await db.workProjectStage.deleteMany({ where: { projectId: ownerProject.id } });
        await db.workProject.delete({ where: { id: ownerProject.id } });
      }
      if (foreignProject) await db.workProject.delete({ where: { id: foreignProject.id } });
      if (foreignUser) await db.user.delete({ where: { id: foreignUser.id } });
      await db.$disconnect();
    }
  },
);
