import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { supportModules, loadWorkModule, samplePng, samplePdf } from "./helpers/work-support.mjs";
const require = createRequire(import.meta.url);
test(
  "Phase 04: versioned notes, immutable timeline, private attachment lifecycle, ownership and rollback",
  { skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.notEqual(process.env.NODE_ENV, "production");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    assert.equal(process.env.WORK_UPLOAD_DIR, "/app/private/work");
    const { PrismaClient } = require("../src/generated/prisma"),
      db = new PrismaClient();
    const {
        server,
        supporting: api,
        primitives,
        files,
        validation,
        supportingDeps,
      } = supportModules(db),
      prefix = `__support_${randomUUID()}`;
    const tasks = [],
      keys = [],
      storedKeys = new Set();
    let foreign, note, task;
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    const create = async () => {
      const row = await server.createTodo({ title: prefix }, command());
      tasks.push(row.id);
      return row;
    };
    const reject = (promise, status) =>
      assert.rejects(
        promise,
        (error) => error instanceof validation.WorkValidationError && error.status === status,
      );
    const original = {
      body: "<script>window.bad = true</script>\nObserved the test result.",
      documentationUrls: ["https://example.com/guide"],
      occurredAt: "2026-10-30T19:00:00-04:00",
    };
    try {
      await t.test(
        "notes are optional, timestamped by server, separate from description and preserve immutable snapshots",
        async () => {
          task = await create();
          const before = Date.now(),
            key = command();
          note = await api.createNote(task.id, original, key);
          assert.deepEqual(await api.createNote(task.id, original, key), note);
          assert.ok(new Date(note.createdAt).getTime() >= before);
          assert.equal(note.occurredAt, "2026-10-30T23:00:00.000Z");
          assert.equal((await server.getTodo(task.id)).description, null);
          assert.equal((await server.getTodo(task.id)).revision, task.revision);
          const edited = await api.patchNote(
            task.id,
            note.id,
            { ...original, body: "Updated note\nMore details" },
            command(note),
          );
          assert.equal(edited.createdAt, note.createdAt);
          assert.equal(edited.revision, 2);
          assert.ok(new Date(edited.updatedAt) >= new Date(note.updatedAt));
          await reject(api.patchNote(task.id, note.id, original, command(note)), 409);
          const noOp = await api.patchNote(
            task.id,
            note.id,
            { ...original, body: edited.body },
            command(edited),
          );
          assert.equal(noOp.revision, 2);
          const revisions = await api.noteRevisions(task.id, note.id, new URLSearchParams());
          assert.equal(revisions.total, 2);
          assert.equal(revisions.items[1].body, original.body);
          assert.equal(revisions.items[0].body, edited.body);
          note = edited;
        },
      );
      await t.test(
        "Notes/All activity are ordered by recorded time, not occurred-at, and cannot mutate automatic entries",
        async () => {
          const second = await api.createNote(
            task.id,
            { ...original, body: "Second note", occurredAt: "2001-01-01T00:00:00Z" },
            command(),
          );
          const notes = await api.taskTimeline(task.id, new URLSearchParams("filter=notes"));
          assert.equal(notes.notes[0].id, second.id);
          assert.equal(notes.activity.length, 0);
          const all = await api.taskTimeline(task.id, new URLSearchParams("filter=all"));
          assert.ok(all.activity.some((entry) => entry.action === "CREATED"));
          assert.ok(
            all.activity.some(
              (entry) => entry.action === "NOTE_EDITED" && entry.noteRevision.body === note.body,
            ),
          );
          await reject(
            api.patchNote(
              task.id,
              note.id,
              { ...original, createdAt: "2000-01-01" },
              command(note),
            ),
            400,
          );
          const removed = await api.removeNote(task.id, note.id, command(note));
          assert.ok(removed.removedAt);
          assert.equal(removed.body, "");
          const history = await api.noteRevisions(task.id, note.id, new URLSearchParams());
          assert.equal(history.total, 3);
          assert.equal(history.items.at(-1).body, original.body);
          await reject(api.patchNote(task.id, note.id, original, command(removed)), 409);
          await reject(server.deleteTodo(task.id, command(task)), 409);
          const archived = await server.patchTodo(task.id, { archived: true }, command(task));
          assert.ok(archived.archivedAt);
          assert.equal((await api.taskTimeline(task.id, new URLSearchParams())).total, 2);
        },
      );
      await t.test(
        "cross-owner and cross-task note/file access is denied without borrowed finance authorization",
        async () => {
          foreign = await db.user.create({ data: { email: `${randomUUID()}@example.invalid` } });
          const otherTask = await db.todo.create({ data: { userId: foreign.id, title: prefix } });
          tasks.push(otherTask.id);
          const otherNote = await db.workNote.create({
            data: {
              userId: foreign.id,
              todoId: otherTask.id,
              actorGithubId: "foreign",
              body: "private",
            },
          });
          const otherVersion = await db.workNoteRevision.create({
            data: {
              noteId: otherNote.id,
              revision: 1,
              body: "foreign revision contents",
              documentationUrls: [],
              action: "NOTE_CREATED",
              actorGithubId: "foreign",
            },
          });
          const badActivity = await db.workActivity.create({
            data: {
              userId: 1,
              todoId: task.id,
              todoReference: task.reference,
              noteRevisionId: otherVersion.id,
              action: "NOTE_CREATED",
              actorGithubId: "foreign",
              changes: {},
            },
          });
          assert.equal(
            (await api.taskTimeline(task.id, new URLSearchParams("filter=all"))).activity.find(
              (entry) => entry.id === badActivity.id,
            ).noteRevision,
            null,
          );
          await reject(api.taskTimeline(otherTask.id, new URLSearchParams()), 404);
          await reject(api.noteRevisions(task.id, otherNote.id, new URLSearchParams()), 404);
          await reject(api.patchNote(task.id, otherNote.id, original, command(otherNote)), 404);
          await reject(api.removeNote(task.id, otherNote.id, command(otherNote)), 404);
          await reject(api.readAttachment(task.id, 2147483000), 404);
          const foreignFile = await db.workAttachment.create({
            data: {
              userId: foreign.id,
              todoId: otherTask.id,
              originalName: "private.png",
              mimeType: "image/png",
              byteSize: samplePng.length,
              contentHash: files.documentHash(samplePng),
              storageKey: `${randomUUID()}.png`,
            },
          });
          await reject(api.readAttachment(otherTask.id, foreignFile.id), 404);
          await reject(api.removeAttachment(task.id, foreignFile.id, command(foreignFile)), 404);
          const unrelated = await create();
          await reject(api.noteRevisions(unrelated.id, note.id, new URLSearchParams()), 404);
        },
      );
      await t.test(
        "note/audit failures roll back content, revision snapshots and replay receipts atomically",
        async () => {
          const current = await api.createNote(task.id, original, command()),
            key = command(current);
          const failingServer = {
            ...server,
            mutation: (operation, input, cmd, action) =>
              server.mutation(operation, input, cmd, (tx) =>
                action(
                  new Proxy(tx, {
                    get(target, prop) {
                      if (prop === "workActivity")
                        return {
                          ...target.workActivity,
                          create: async () => {
                            throw new Error("injected note audit failure");
                          },
                        };
                      return Reflect.get(target, prop);
                    },
                  }),
                ),
              ),
          };
          const failing = loadWorkModule("src/lib/work-management/supporting.ts", {
            ...supportingDeps,
            "./server": failingServer,
          });
          await assert.rejects(
            failing.patchNote(task.id, current.id, { ...original, body: "must rollback" }, key),
            /injected/,
          );
          assert.equal(
            (await db.workNote.findUnique({ where: { id: current.id } })).body,
            original.body,
          );
          assert.equal(await db.workNoteRevision.count({ where: { noteId: current.id } }), 1);
          assert.equal(
            await db.workMutationReceipt.count({ where: { requestKey: key.requestKey } }),
            0,
          );
        },
      );
      await t.test(
        "upload/read/retry preserve original bytes; replacement keeps stable record and removes obsolete bytes after commit",
        async () => {
          const parent = await create(),
            png = await primitives.prepareDocument(
              new File([samplePng], "camera.png", { type: "image/png" }),
            ),
            key = command();
          const attachment = await api.uploadAttachment(parent.id, png, key),
            stored = await db.workAttachment.findUnique({ where: { id: attachment.id } });
          storedKeys.add(stored.storageKey);
          assert.ok(!("storageKey" in attachment));
          assert.deepEqual((await api.readAttachment(parent.id, attachment.id)).buffer, samplePng);
          assert.deepEqual(await api.uploadAttachment(parent.id, png, key), attachment);
          assert.equal(await db.workAttachment.count({ where: { todoId: parent.id } }), 1);
          await reject(api.readAttachment(task.id, attachment.id), 404);
          const pdf = await primitives.prepareDocument(
            new File([samplePdf()], "scan.pdf", { type: "application/pdf" }),
          );
          const failReplacement = loadWorkModule("src/lib/work-management/supporting.ts", {
            ...supportingDeps,
            "./server": {
              ...server,
              appendTaskActivity: async () => {
                throw new Error("injected replacement failure");
              },
            },
          });
          await assert.rejects(
            failReplacement.uploadAttachment(parent.id, pdf, command(attachment), attachment.id),
            /injected replacement/,
          );
          assert.deepEqual((await api.readAttachment(parent.id, attachment.id)).buffer, samplePng);
          const replaced = await api.uploadAttachment(
              parent.id,
              pdf,
              command(attachment),
              attachment.id,
            ),
            fresh = await db.workAttachment.findUnique({ where: { id: attachment.id } });
          storedKeys.add(fresh.storageKey);
          assert.equal(replaced.id, attachment.id);
          assert.equal(replaced.revision, attachment.revision + 1);
          assert.deepEqual(
            (await api.readAttachment(parent.id, attachment.id)).buffer,
            samplePdf(),
          );
          await assert.rejects(files.workFileStore().read(stored.storageKey));
          await reject(
            api.uploadAttachment(parent.id, png, command(attachment), attachment.id),
            409,
          );
          await fs.writeFile(files.workFileStore().path(fresh.storageKey), Buffer.from("tampered"));
          await reject(api.readAttachment(parent.id, attachment.id), 409);
          await fs.writeFile(files.workFileStore().path(fresh.storageKey), samplePdf());
          const removed = await api.removeAttachment(parent.id, attachment.id, command(replaced));
          assert.ok(removed.removedAt);
          assert.equal(removed.cleanupPending, false);
          await reject(api.readAttachment(parent.id, attachment.id), 404);
          assert.ok(await db.workAttachment.findUnique({ where: { id: attachment.id } }));
          await assert.rejects(files.workFileStore().read(fresh.storageKey));
          await reject(server.deleteTodo(parent.id, command(parent)), 409);
        },
      );
      await t.test(
        "failed database writes clean staged files; failed unlink remains durable and retryable",
        async () => {
          const parent = await create(),
            png = await primitives.prepareDocument(
              new File([samplePng], "camera.png", { type: "image/png" }),
            );
          const before = new Set(await fs.readdir(process.env.WORK_UPLOAD_DIR));
          const failWrite = loadWorkModule("src/lib/work-management/supporting.ts", {
            ...supportingDeps,
            "./files": {
              ...files,
              workFileStore: () => ({
                ...files.workFileStore(),
                write: async () => {
                  throw new Error("injected disk failure");
                },
              }),
            },
          });
          await assert.rejects(
            failWrite.uploadAttachment(parent.id, png, command()),
            /injected disk/,
          );
          assert.equal(await db.workAttachment.count({ where: { todoId: parent.id } }), 0);
          const failingServer = {
            ...server,
            appendTaskActivity: async () => {
              throw new Error("injected attachment audit failure");
            },
          };
          const failing = loadWorkModule("src/lib/work-management/supporting.ts", {
            ...supportingDeps,
            "./server": failingServer,
          });
          await assert.rejects(failing.uploadAttachment(parent.id, png, command()), /injected/);
          assert.deepEqual(new Set(await fs.readdir(process.env.WORK_UPLOAD_DIR)), before);
          assert.equal(await db.workAttachment.count({ where: { todoId: parent.id } }), 0);
          const item = await api.uploadAttachment(parent.id, png, command()),
            row = await db.workAttachment.findUnique({ where: { id: item.id } });
          storedKeys.add(row.storageKey);
          const real = files.workFileStore(),
            broken = {
              ...files,
              workFileStore: () => ({
                ...real,
                remove: async () => {
                  throw new Error("injected unlink failure");
                },
              }),
            };
          const pending = loadWorkModule("src/lib/work-management/supporting.ts", {
            ...supportingDeps,
            "./files": broken,
          });
          const removed = await pending.removeAttachment(parent.id, item.id, command(item));
          assert.equal(removed.cleanupPending, true);
          assert.ok(
            (
              await db.workAttachment.findUnique({ where: { id: item.id } })
            ).pendingDeletionKeys.includes(row.storageKey),
          );
          assert.equal(
            (await api.retryAttachmentCleanup(parent.id, item.id, command(removed))).cleanupPending,
            false,
          );
          await assert.rejects(real.read(row.storageKey));
        },
      );
    } finally {
      const records = await db.workAttachment.findMany({ where: { todoId: { in: tasks } } });
      for (const row of records) {
        storedKeys.add(row.storageKey);
        row.pendingDeletionKeys.forEach((key) => storedKeys.add(key));
      }
      for (const key of storedKeys)
        await files
          .workFileStore()
          .remove(key)
          .catch(() => {});
      await db.$transaction(async (tx) => {
        await tx.workActivity.deleteMany({ where: { todoId: { in: tasks } } });
        await tx.workNoteRevision.deleteMany({ where: { note: { todoId: { in: tasks } } } });
        await tx.workNote.deleteMany({ where: { todoId: { in: tasks } } });
        await tx.workAttachment.deleteMany({ where: { todoId: { in: tasks } } });
        await tx.todo.deleteMany({ where: { id: { in: tasks } } });
        await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
        if (foreign) await tx.user.delete({ where: { id: foreign.id } });
      });
      await db.$disconnect();
    }
  },
);
