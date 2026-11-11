import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
import { assertOriginalRows } from "../scripts/rehearse-work-migrations.mjs";
import { samplePng } from "./helpers/work-support.mjs";

test(
  "realistic work volumes keep reads bounded and note/file/project races atomic",
  {
    skip: process.env.RUN_WORK_RELIABILITY_DB_TEST !== "1",
  },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(process.env.NODE_ENV, "test");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] });
    const api = loadWorkServices(db);
    const prefix = `__phase10_${randomUUID()}`;
    const keys = [],
      ids = [],
      projects = [];
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    const original = await captureInventory(db);
    const report = {};
    try {
      await db.todo.createMany({
        data: Array.from({ length: 1000 }, (_, index) => ({
          userId: 1,
          title: `${prefix} ${index} ${"readable long title ".repeat(6)}`,
          description: "Synthetic volume fixture. ".repeat(80),
          company: prefix,
          status: index % 5 === 0 ? "DONE" : index % 3 === 0 ? "WAITING" : "NEW",
          priorityLevel: index % 7 === 0 ? "URGENT" : "NORMAL",
          rewardXp: 0,
          rewardCoins: 0,
        })),
      });
      ids.push(
        ...(await db.todo.findMany({ where: { company: prefix }, select: { id: true } })).map(
          (row) => row.id,
        ),
      );
      const root = await api.server.getTodo(ids[1]);
      for (let i = 0; i < 55; i++)
        await api.supporting.createNote(
          root.id,
          {
            body: `Synthetic note ${i}: ${"history content ".repeat(70)}`,
            documentationUrls: [],
          },
          command(),
        );
      await t.test(
        "list, date-sort, planning and long timelines stay paginated without read mutations",
        async () => {
          const before = await captureInventory(db);
          const started = performance.now();
          for (const sort of ["updated", "deadline", "followup"]) {
            const first = await api.server.searchWork(
              new URLSearchParams({ company: prefix, sort }),
            );
            const second = await api.server.searchWork(
              new URLSearchParams({ company: prefix, sort, page: "2" }),
            );
            const last = await api.server.searchWork(
              new URLSearchParams({ company: prefix, sort, page: "2147483647" }),
            );
            assert.equal(first.total, 800);
            assert.equal(first.items.length, 30);
            assert.equal(second.items.length, 30);
            assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 60);
            assert.equal(last.page, 27);
            assert.equal(last.items.length, 20);
            assert.ok(Buffer.byteLength(JSON.stringify(first)) < 256 * 1024);
          }
          const planning = await api.myWork.myWork(new URLSearchParams({ company: prefix }));
          assert.equal(planning.totalActive, 800);
          for (const section of Object.values(planning.sections))
            assert.ok(section.items.length <= 6);
          for (const view of ["notes", "all"]) {
            const first = await api.supporting.taskTimeline(
              root.id,
              new URLSearchParams({ filter: view }),
            );
            const last = await api.supporting.taskTimeline(
              root.id,
              new URLSearchParams({ filter: view, page: "999" }),
            );
            assert.equal(first.total, 55);
            assert.equal(first.pageSize, 20);
            assert.equal(last.page, 3);
            assert.equal((view === "notes" ? last.notes : last.activity).length, 15);
          }
          assertOriginalRows(before, await captureInventory(db));
          report.readMilliseconds = Math.round(performance.now() - started);
        },
      );
      await t.test(
        "competing note edits leave one winning revision and replay adds none",
        async () => {
          const note = await api.supporting.createNote(
            root.id,
            { body: "Before race", documentationUrls: [] },
            command(),
          );
          const body = { body: "Winning edit", documentationUrls: [] };
          const key = command(note);
          const results = await Promise.allSettled([
            api.supporting.patchNote(root.id, note.id, body, key),
            api.supporting.patchNote(
              root.id,
              note.id,
              { ...body, body: "Other edit" },
              command(note),
            ),
          ]);
          assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
          const failure = results.find((result) => result.status === "rejected");
          assert.equal(failure.reason.status, 409);
          assert.equal(await db.workNoteRevision.count({ where: { noteId: note.id } }), 2);
          if (results[0].status === "fulfilled") {
            await api.supporting.patchNote(root.id, note.id, body, key);
            assert.equal(await db.workNoteRevision.count({ where: { noteId: note.id } }), 2);
          }
        },
      );
      await t.test(
        "competing file replacements retain exactly one original and reject stale writes",
        async () => {
          const file = {
            buffer: samplePng,
            originalName: "synthetic.png",
            mimeType: "image/png",
            extension: "png",
            contentHash: (await import("node:crypto"))
              .createHash("sha256")
              .update(samplePng)
              .digest("hex"),
          };
          const item = await api.supporting.uploadAttachment(root.id, file, command());
          const results = await Promise.allSettled([
            api.supporting.uploadAttachment(
              root.id,
              { ...file, originalName: "first.png" },
              command(item),
              item.id,
            ),
            api.supporting.uploadAttachment(
              root.id,
              { ...file, originalName: "second.png" },
              command(item),
              item.id,
            ),
          ]);
          assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
          assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
          assert.equal(await db.workAttachment.count({ where: { todoId: root.id } }), 1);
          assert.deepEqual(
            (await api.supporting.readAttachment(root.id, item.id)).buffer,
            samplePng,
          );
        },
      );
      await t.test("competing project moves never split membership or copy the task", async () => {
        for (const suffix of ["A", "B"])
          projects.push(
            await api.projects.createProject({ name: `${prefix} ${suffix}` }, command()),
          );
        const row = await api.server.getTodo(root.id);
        const results = await Promise.allSettled(
          projects.map((project) =>
            api.projects.taskMembership(
              root.id,
              { projectId: project.id, stageId: project.stages[0].id },
              command(row),
            ),
          ),
        );
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
        const saved = await api.server.getTodo(root.id);
        const project = projects.find((project) => project.id === saved.projectId);
        assert.equal(saved.stageId, project.stages[0].id);
        assert.equal(await db.todo.count({ where: { company: prefix } }), 1000);
      });
      console.log(
        `Synthetic volume checks: 1,000 tasks, 55 long notes; bounded read batch ${report.readMilliseconds} ms. Not an enterprise-scale benchmark.`,
      );
    } finally {
      const files = await db.workAttachment.findMany({ where: { todoId: { in: ids } } });
      const directory = process.env.WORK_UPLOAD_DIR || "private/work";
      for (const row of files)
        for (const key of [row.storageKey, ...row.pendingDeletionKeys]) {
          await fs.unlink(path.join(directory, key)).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
      await db.$transaction(async (tx) => {
        await tx.workActivity.deleteMany({
          where: {
            OR: [{ todoId: { in: ids } }, { projectId: { in: projects.map((row) => row.id) } }],
          },
        });
        await tx.workAttachment.deleteMany({ where: { todoId: { in: ids } } });
        await tx.workNoteRevision.deleteMany({ where: { note: { todoId: { in: ids } } } });
        await tx.workNote.deleteMany({ where: { todoId: { in: ids } } });
        await tx.todo.deleteMany({ where: { id: { in: ids } } });
        await tx.workProjectStage.deleteMany({
          where: { projectId: { in: projects.map((row) => row.id) } },
        });
        await tx.workProject.deleteMany({ where: { id: { in: projects.map((row) => row.id) } } });
        await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
      });
      assertOriginalRows(original, await captureInventory(db));
      await db.$disconnect();
    }
  },
);
