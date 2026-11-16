import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supportModules, loadWorkModule } from "./helpers/work-support.mjs";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
import { assertOriginalRows } from "../scripts/rehearse-work-migrations.mjs";

test(
  "Notes only pages existing notes and resolved follow-ups as one owner-scoped, read-only stream",
  {
    skip: process.env.RUN_TASK_FOLLOWUP_TIMELINE_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] });
    const modules = supportModules(db);
    const dates = loadWorkModule("src/lib/work-management/date-server.ts", modules.supportingDeps);
    const keys = [],
      ids = [];
    let foreign;
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    try {
      const task = await modules.server.createTodo(
        { title: `Follow-up timeline ${randomUUID()}`, contextId: null },
        command(),
      );
      ids.push(task.id);
      for (let index = 0; index < 12; index++)
        await db.workNote.create({
          data: {
            todoId: task.id,
            userId: 1,
            actorGithubId: "89470930",
            body: `Original note ${index}`,
            documentationUrls: [],
            createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)),
            occurredAt: new Date("2040-01-01"),
          },
        });
      const history = [];
      for (let index = 0; index < 16; index++)
        history.push(
          await db.workFollowUp.create({
            data: {
              todoId: task.id,
              date: "2020-02-01",
              reason: `Original follow-up ${index}`,
              status: "COMPLETED",
              outcome: "FOLLOW_UP_COMPLETED",
              createdAt: new Date("2020-01-01"),
              resolvedAt: new Date(Date.UTC(2021, 0, 1, 0, index)),
            },
          }),
        );
      const scheduled = await dates.taskDateCommand(
        task.id,
        {
          action: "followup-create",
          date: { kind: "DATE", date: "2027-01-01" },
          reason: "Contact the team",
        },
        command(await modules.server.getTodo(task.id)),
      );
      const before = await captureInventory(db);
      const first = await modules.supporting.taskTimeline(
        task.id,
        new URLSearchParams("filter=notes"),
      );
      const second = await modules.supporting.taskTimeline(
        task.id,
        new URLSearchParams("filter=notes&page=2"),
      );
      const last = await modules.supporting.taskTimeline(
        task.id,
        new URLSearchParams("filter=notes&page=999"),
      );
      assert.equal(first.total, 28);
      assert.equal(first.entries.length, 20);
      assert.equal(second.entries.length, 8);
      assert.deepEqual(last, second);
      assert.deepEqual(
        first.entries.slice(0, 16).map((entry) => entry.id),
        history.map((item) => item.id).reverse(),
      );
      assert.ok(first.entries.slice(0, 16).every((entry) => entry.kind === "followup"));
      assert.equal(
        new Set([...first.entries, ...second.entries].map((entry) => `${entry.kind}:${entry.id}`))
          .size,
        28,
      );
      assertOriginalRows(before, await captureInventory(db));
      const active = (await dates.readTaskDates(task.id, new URLSearchParams())).activeFollowUp;
      const key = command(scheduled),
        body = { action: "followup-complete", id: active.id, reason: "Team contacted" };
      const completed = await dates.taskDateCommand(task.id, body, key);
      await dates.taskDateCommand(task.id, body, key);
      assert.equal(completed.status, "NEW");
      assert.equal(completed.supportingRecordCount, 29);
      const updated = await modules.supporting.taskTimeline(task.id, new URLSearchParams());
      assert.equal(updated.total, 29);
      assert.deepEqual(updated.entries[0], { kind: "followup", id: active.id });
      assert.equal(
        updated.followUps.find((item) => item.id === active.id).outcome,
        "Team contacted",
      );
      assert.equal(
        await db.workNote.count({ where: { todoId: task.id } }),
        12,
        "No copied or invented notes.",
      );
      foreign = await db.user.create({ data: { email: `${randomUUID()}@invalid.test` } });
      const alien = await db.todo.create({ data: { userId: foreign.id, title: "Foreign task" } });
      ids.push(alien.id);
      await assert.rejects(
        modules.supporting.taskTimeline(alien.id, new URLSearchParams()),
        (error) => error.status === 404,
      );
      assert.ok(!updated.followUps.some((item) => item.todoId !== task.id));
    } finally {
      try {
        await db.workActivity.deleteMany({ where: { todoId: { in: ids } } });
        await db.workNote.deleteMany({ where: { todoId: { in: ids } } });
        await db.workFollowUp.deleteMany({ where: { todoId: { in: ids } } });
        await db.todo.deleteMany({ where: { id: { in: ids } } });
        await db.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
        if (foreign) await db.user.delete({ where: { id: foreign.id } });
      } finally {
        await db.$disconnect();
      }
    }
  },
);
