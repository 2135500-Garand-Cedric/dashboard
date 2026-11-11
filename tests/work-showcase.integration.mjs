import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { workShowcase, assertShowcaseEnvironment } from "../scripts/work-showcase.mjs";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { supportModules } from "./helpers/work-support.mjs";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
import { assertOriginalRows } from "../scripts/rehearse-work-migrations.mjs";

test(
  "opt-in showcase retries unchanged and archives only its own records",
  {
    skip: process.env.RUN_WORK_SHOWCASE_TEST !== "1",
  },
  async () => {
    assertShowcaseEnvironment();
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] });
    const api = loadWorkServices(db);
    const files = supportModules(db).primitives;
    const commands = [];
    const command = (row) => {
      const requestKey = randomUUID();
      commands.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    let sentinel;
    try {
      const result = await workShowcase(db);
      assert.equal(result.taskIds.length, 16);
      assert.equal(result.projectIds.length, 2);
      assert.equal(result.eventIds.length, 11);
      const before = await captureInventory(db);
      assert.equal((await workShowcase(db)).reused, true);
      assertOriginalRows(before, await captureInventory(db));
      const attachments = await db.workAttachment.findMany();
      assert.equal(attachments.length, 2);
      assert.ok(attachments.some((row) => row.projectId));
      assert.ok(attachments.some((row) => row.todoId));
      for (const row of attachments) {
        const original = await api.supporting.readAttachment(
          row.todoId || { projectId: row.projectId },
          row.id,
        );
        const parsed = await files.prepareDocument(
          new File([original.buffer], row.originalName, { type: row.mimeType }),
        );
        assert.equal(parsed.contentHash, row.contentHash);
      }
      assert.equal(await db.workEventConversion.count({ where: { undoneAt: null } }), 1);
      assert.equal(await db.workFollowUp.count({ where: { status: "SNOOZED" } }), 1);
      assert.equal(await db.workNoteRevision.count(), 5); // One v7 note plus two edited showcase notes.
      const planning = await api.myWork.myWork(new URLSearchParams());
      assert.equal(planning.sections.focus.total, 1);
      assert.ok(planning.sections.overdue.total >= 1);
      assert.equal(planning.sections.followups.total, 1);
      sentinel = await api.server.createTodo(
        { title: "Synthetic sentinel outside the example manifest", rewardXp: 0, rewardCoins: 0 },
        command(),
      );
      const originalSentinel = await api.server.getTodo(sentinel.id);
      const user = await db.user.findUniqueOrThrow({ where: { id: 1 } });
      await workShowcase(db, "archive");
      assert.deepEqual(await api.server.getTodo(sentinel.id), originalSentinel);
      assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: 1 } }), user);
      assert.equal(
        await db.todo.count({ where: { id: { in: result.taskIds }, archivedAt: null } }),
        0,
      );
      assert.equal(
        await db.workProject.count({ where: { id: { in: result.projectIds }, archivedAt: null } }),
        0,
      );
      assert.equal((await api.myWork.myWork(new URLSearchParams())).sections.focus.total, 0);
      const archived = await captureInventory(db);
      await workShowcase(db, "archive");
      assertOriginalRows(archived, await captureInventory(db));
      console.log(
        "Showcase seed/retry, valid task/project originals, focus/date/graph/conversion data and exact-manifest archival passed.",
      );
    } finally {
      if (sentinel)
        await db.$transaction(async (tx) => {
          await tx.workActivity.deleteMany({ where: { todoId: sentinel.id } });
          await tx.todo.delete({ where: { id: sentinel.id } });
          await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: commands } } });
        });
      await db.$disconnect();
    }
  },
);
