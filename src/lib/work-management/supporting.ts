import type { Prisma, WorkAttachment, WorkNote } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { taskReference } from "./types";
import {
  appendTaskActivity,
  mutation,
  todoRow,
  version,
  workTransaction,
  WORK_USER_ID,
} from "./server";
import { workId, WorkValidationError, type WorkCommand } from "./validation";
import { noteInput } from "./note-input";
import { documentHash, fileOperation, workFileStore, type PreparedDocument } from "./files";
import {
  projectRow,
  parentFields,
  parentIdentity,
  appendProjectActivity,
  type WorkParent,
} from "./project-core";
type DB = Prisma.TransactionClient;
function supportWhere(parent: WorkParent) {
  return {
    ...parentFields(parent),
    userId: WORK_USER_ID,
    ...(typeof parent === "number"
      ? { todo: { userId: WORK_USER_ID } }
      : { project: { userId: WORK_USER_ID } }),
  };
}
async function parentRow(db: DB, parent: WorkParent) {
  return typeof parent === "number" ? todoRow(db, parent) : projectRow(db, parent.projectId);
}
async function appendParentActivity(
  db: DB,
  parent: WorkParent,
  action: string,
  changes: Prisma.InputJsonValue,
) {
  if (typeof parent === "number") await appendTaskActivity(db, parent, action, changes);
  else await appendProjectActivity(db, parent.projectId, action, changes);
}
const noteInclude = { todo: { select: { userId: true } }, project: { select: { userId: true } } };
async function noteRow(db: DB, parent: WorkParent, id: number) {
  const row = await db.workNote.findFirst({
    where: { id, ...supportWhere(parent) },
    include: noteInclude,
  });
  if (!row) throw new WorkValidationError("Note not found.", 404);
  return row;
}
async function noteRevision(db: DB, note: WorkNote, action: string) {
  const entry = await db.workNoteRevision.create({
    data: {
      noteId: note.id,
      revision: note.revision,
      body: note.body,
      documentationUrls: note.documentationUrls,
      occurredAt: note.occurredAt,
      action,
      actorGithubId: OWNER_GITHUB_ID,
      recordedAt: new Date(),
    },
  });
  await db.workActivity.create({
    data: {
      userId: WORK_USER_ID,
      actorGithubId: OWNER_GITHUB_ID,
      todoId: note.todoId,
      projectId: note.projectId,
      todoReference: note.todoId === null ? null : taskReference(note.todoId),
      noteRevisionId: entry.id,
      action,
      changes: {
        note: {
          before: note.revision > 1 ? { id: note.id, revision: note.revision - 1 } : null,
          after: { id: note.id, revision: note.revision },
        },
      },
      createdAt: entry.recordedAt,
    },
  });
}
export async function createNote(parent: WorkParent, value: unknown, command: WorkCommand) {
  const data = noteInput(value);
  return mutation(`${parentIdentity(parent)}:note:create`, data, command, async (db) => {
    await parentRow(db, parent);
    const now = new Date();
    const row = await db.workNote.create({
      data: {
        ...data,
        ...parentFields(parent),
        userId: WORK_USER_ID,
        actorGithubId: OWNER_GITHUB_ID,
        createdAt: now,
        updatedAt: now,
      },
    });
    await noteRevision(db, row, "NOTE_CREATED");
    return row;
  });
}
export async function patchNote(
  parent: WorkParent,
  id: number,
  value: unknown,
  command: WorkCommand,
) {
  const data = noteInput(value);
  return mutation(`${parentIdentity(parent)}:note:${id}:patch`, data, command, async (db) => {
    const row = await noteRow(db, parent, id);
    version(row, command);
    if (row.removedAt)
      throw new WorkValidationError(
        "This note was removed. Its earlier versions remain in history.",
        409,
      );
    if (
      row.body === data.body &&
      JSON.stringify(row.documentationUrls) === JSON.stringify(data.documentationUrls) &&
      (row.occurredAt?.toISOString() ?? null) === (data.occurredAt?.toISOString() ?? null)
    )
      return row;
    const updated = await db.workNote.update({
      where: { id },
      data: { ...data, revision: { increment: 1 }, updatedAt: new Date() },
    });
    await noteRevision(db, updated, "NOTE_EDITED");
    return updated;
  });
}
export async function removeNote(parent: WorkParent, id: number, command: WorkCommand) {
  return mutation(`${parentIdentity(parent)}:note:${id}:remove`, null, command, async (db) => {
    const row = await noteRow(db, parent, id);
    version(row, command);
    if (row.removedAt) return row;
    const now = new Date();
    const updated = await db.workNote.update({
      where: { id },
      data: {
        body: "",
        documentationUrls: [],
        removedAt: now,
        updatedAt: now,
        revision: { increment: 1 },
      },
    });
    await noteRevision(db, updated, "NOTE_REMOVED");
    return updated;
  });
}
function pageNumber(params: URLSearchParams) {
  return params.has("page") ? workId(params.get("page")) : 1;
}
export async function taskTimeline(parent: WorkParent, params: URLSearchParams) {
  const filter = params.get("filter") || "notes";
  if (!["notes", "all"].includes(filter))
    throw new WorkValidationError("Choose Notes only or All activity.");
  const requested = pageNumber(params),
    pageSize = 20;
  return prisma.$transaction(
    async (db) => {
      await parentRow(db, parent);
      const where = supportWhere(parent);
      const total =
        filter === "notes"
          ? await db.workNote.count({ where })
          : await db.workActivity.count({ where });
      const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize))),
        skip = (page - 1) * pageSize;
      if (filter === "notes")
        return {
          filter,
          total,
          page,
          pageSize,
          notes: await db.workNote.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: pageSize,
          }),
          activity: [],
        };
      const activity = await db.workActivity.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        include: { noteRevision: { include: { note: true } } },
      });
      return {
        filter,
        total,
        page,
        pageSize,
        notes: [],
        activity: activity.map((entry) => ({
          ...entry,
          noteRevision:
            entry.noteRevision?.note.userId === WORK_USER_ID &&
            entry.noteRevision.note.todoId === parentFields(parent).todoId &&
            entry.noteRevision.note.projectId === parentFields(parent).projectId
              ? entry.noteRevision
              : null,
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function noteRevisions(parent: WorkParent, id: number, params: URLSearchParams) {
  const requested = pageNumber(params),
    pageSize = 20;
  return prisma.$transaction(
    async (db) => {
      const note = await noteRow(db, parent, id),
        total = await db.workNoteRevision.count({ where: { noteId: note.id } });
      const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
      return {
        total,
        page,
        pageSize,
        items: await db.workNoteRevision.findMany({
          where: { noteId: note.id },
          orderBy: { revision: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
const attachmentDTO = (row: WorkAttachment) => ({
  id: row.id,
  todoId: row.todoId,
  projectId: row.projectId,
  originalName: row.originalName,
  mimeType: row.mimeType,
  byteSize: row.byteSize,
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  removedAt: row.removedAt,
  cleanupPending: row.pendingDeletionKeys.length > 0,
});
async function attachmentRow(db: DB, parent: WorkParent, id: number) {
  const row = await db.workAttachment.findFirst({
    where: { id, ...supportWhere(parent) },
  });
  if (!row) throw new WorkValidationError("Attachment not found.", 404);
  return row;
}
export async function listAttachments(parent: WorkParent, params: URLSearchParams) {
  const requested = pageNumber(params),
    pageSize = 12;
  return prisma.$transaction(
    async (db) => {
      await parentRow(db, parent);
      const where = supportWhere(parent),
        total = await db.workAttachment.count({ where });
      const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
      const rows = await db.workAttachment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return { total, page, pageSize, items: rows.map(attachmentDTO) };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function cleanupAttachment(parent: WorkParent, id: number) {
  try {
    return await workTransaction(async (db) => {
      const row = await attachmentRow(db, parent, id),
        pending: string[] = [];
      for (const key of row.pendingDeletionKeys) {
        if (key === row.storageKey && !row.removedAt) {
          pending.push(key);
          continue;
        }
        try {
          await workFileStore().remove(key);
        } catch {
          pending.push(key);
        }
      }
      if (JSON.stringify(pending) !== JSON.stringify(row.pendingDeletionKeys))
        await db.workAttachment.update({
          where: { id },
          data: { pendingDeletionKeys: pending, updatedAt: row.updatedAt },
        });
      return pending.length > 0;
    });
  } catch {
    console.error("Work management: private file cleanup is pending.");
    return true;
  }
}
export async function uploadAttachment(
  parent: WorkParent,
  file: PreparedDocument,
  command: WorkCommand,
  replacementId?: number,
) {
  let stagedKey: string | null = null;
  try {
    const result = (await mutation(
      `${parentIdentity(parent)}:attachment:${replacementId ?? "create"}:upload`,
      {
        hash: file.contentHash,
        name: file.originalName,
        type: file.mimeType,
        size: file.buffer.length,
      },
      command,
      async (db) => {
        await parentRow(db, parent);
        const previous = replacementId ? await attachmentRow(db, parent, replacementId) : null;
        if (previous) {
          version(previous, command);
          if (previous.removedAt)
            throw new WorkValidationError(
              "This attachment was removed. Upload a new attachment instead.",
              409,
            );
        }
        stagedKey = await fileOperation(() => workFileStore().write(file));
        const data = {
          originalName: file.originalName,
          mimeType: file.mimeType,
          byteSize: file.buffer.length,
          contentHash: file.contentHash,
          storageKey: stagedKey,
        };
        const row = previous
          ? await db.workAttachment.update({
              where: { id: previous.id },
              data: {
                ...data,
                pendingDeletionKeys: [...previous.pendingDeletionKeys, previous.storageKey],
                revision: { increment: 1 },
              },
            })
          : await db.workAttachment.create({
              data: { ...data, ...parentFields(parent), userId: WORK_USER_ID },
            });
        await appendParentActivity(
          db,
          parent,
          previous ? "ATTACHMENT_REPLACED" : "ATTACHMENT_ADDED",
          {
            attachment: {
              before: previous
                ? { id: previous.id, name: previous.originalName, hash: previous.contentHash }
                : null,
              after: { id: row.id, name: row.originalName, hash: row.contentHash },
            },
          },
        );
        return attachmentDTO(row);
      },
    )) as ReturnType<typeof attachmentDTO>;
    const cleanupPending = await cleanupAttachment(parent, result.id);
    return { ...result, cleanupPending };
  } catch (error) {
    if (stagedKey) {
      // An ambiguous DB commit must never result in deleting a referenced file.
      try {
        if (
          !(await prisma.workAttachment.count({
            where: { OR: [{ storageKey: stagedKey }, { pendingDeletionKeys: { has: stagedKey } }] },
          }))
        )
          await workFileStore().remove(stagedKey);
      } catch {
        console.error("Work management: a staged private file requires maintenance review.");
      }
    }
    throw error;
  }
}
export async function removeAttachment(parent: WorkParent, id: number, command: WorkCommand) {
  const result = (await mutation(
    `${parentIdentity(parent)}:attachment:${id}:remove`,
    null,
    command,
    async (db) => {
      const row = await attachmentRow(db, parent, id);
      version(row, command);
      if (row.removedAt) return attachmentDTO(row);
      const updated = await db.workAttachment.update({
        where: { id },
        data: {
          removedAt: new Date(),
          pendingDeletionKeys: [...row.pendingDeletionKeys, row.storageKey],
          revision: { increment: 1 },
        },
      });
      await appendParentActivity(db, parent, "ATTACHMENT_REMOVED", {
        attachment: { before: { id, name: row.originalName }, after: null },
      });
      return attachmentDTO(updated);
    },
  )) as ReturnType<typeof attachmentDTO>;
  return { ...result, cleanupPending: await cleanupAttachment(parent, id) };
}
export async function retryAttachmentCleanup(parent: WorkParent, id: number, command: WorkCommand) {
  await mutation(
    `${parentIdentity(parent)}:attachment:${id}:cleanup`,
    null,
    command,
    async (db) => {
      const row = await attachmentRow(db, parent, id);
      version(row, command);
      return { id };
    },
  );
  return { id, cleanupPending: await cleanupAttachment(parent, id) };
}
export async function readAttachment(parent: WorkParent, id: number) {
  return workTransaction(async (db) => {
    const row = await attachmentRow(db, parent, id);
    if (row.removedAt) throw new WorkValidationError("This attachment was removed.", 404);
    const buffer = await fileOperation(() => workFileStore().read(row.storageKey));
    if (buffer.length !== row.byteSize || documentHash(buffer) !== row.contentHash)
      throw new WorkValidationError(
        "The stored file differs from its original. Restore it from backup or replace it.",
        409,
      );
    return { document: attachmentDTO(row), buffer };
  });
}
