import { readSnapshot } from "./read-snapshot";
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
  patchTodoInTransaction,
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
import { activeDraft } from "@/lib/knowledge/draft-core";
import { articleRow, recordArticleRevision } from "@/lib/knowledge/core";
type DB = Prisma.TransactionClient;
export type AttachmentParent =
  WorkParent | { knowledgeArticleId: number } | { knowledgeDraftId: string };
function isDraftParent(parent: AttachmentParent): parent is { knowledgeDraftId: string } {
  return typeof parent !== "number" && "knowledgeDraftId" in parent;
}
function isKnowledgeParent(parent: AttachmentParent): parent is { knowledgeArticleId: number } {
  return typeof parent !== "number" && "knowledgeArticleId" in parent;
}
function supportFields(parent: AttachmentParent) {
  if (isDraftParent(parent))
    return {
      knowledgeDraftId: parent.knowledgeDraftId,
      knowledgeArticleId: null,
      todoId: null,
      projectId: null,
    };
  return isKnowledgeParent(parent)
    ? { knowledgeArticleId: parent.knowledgeArticleId, todoId: null, projectId: null }
    : parentFields(parent);
}
function supportIdentity(parent: AttachmentParent) {
  if (isDraftParent(parent)) return `knowledge-draft:${parent.knowledgeDraftId}`;
  return isKnowledgeParent(parent)
    ? `knowledge:${parent.knowledgeArticleId}`
    : parentIdentity(parent);
}
function supportWhere(parent: AttachmentParent) {
  return {
    ...supportFields(parent),
    userId: WORK_USER_ID,
    ...(isDraftParent(parent)
      ? { knowledgeDraft: { userId: WORK_USER_ID } }
      : isKnowledgeParent(parent)
        ? { knowledgeArticle: { userId: WORK_USER_ID } }
        : typeof parent === "number"
          ? { todo: { userId: WORK_USER_ID } }
          : { project: { userId: WORK_USER_ID } }),
  };
}
async function parentRow(db: DB, parent: AttachmentParent) {
  if (isDraftParent(parent)) return activeDraft(db, parent.knowledgeDraftId);
  if (isKnowledgeParent(parent)) return articleRow(db, parent.knowledgeArticleId);
  return typeof parent === "number" ? todoRow(db, parent) : projectRow(db, parent.projectId);
}
async function appendParentActivity(
  db: DB,
  parent: AttachmentParent,
  action: string,
  changes: Prisma.InputJsonValue,
) {
  if (isDraftParent(parent)) {
    await db.knowledgeDraft.update({
      where: { id: parent.knowledgeDraftId },
      data: { updatedAt: new Date() },
    });
    return;
  }
  if (isKnowledgeParent(parent)) {
    await db.knowledgeArticle.update({
      where: { id: parent.knowledgeArticleId },
      data: { revision: { increment: 1 } },
    });
    await recordArticleRevision(db, parent.knowledgeArticleId, action);
    return;
  }
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
async function noteRevision(
  db: DB,
  note: WorkNote,
  action: string,
  statusChange?: { before: string; after: string },
) {
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
        ...(statusChange ? { statusChange } : {}),
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
  const parsed = noteInput(value);
  const { taskStatus, taskRevision, ...data } = parsed;
  if (typeof parent !== "number" && taskStatus !== null)
    throw new WorkValidationError("Only task notes can change a task status.");
  return mutation(`${parentIdentity(parent)}:note:create`, parsed, command, async (db) => {
    const before = await parentRow(db, parent);
    let statusChange: { before: string; after: string } | undefined;
    let updatedTask: Awaited<ReturnType<typeof patchTodoInTransaction>> | undefined;
    if (typeof parent === "number" && taskStatus !== null) {
      const task = await patchTodoInTransaction(
        db,
        parent,
        { status: taskStatus },
        { ...command, revision: taskRevision! },
      );
      updatedTask = task;
      if ("status" in before && before.status !== task.status)
        statusChange = { before: before.status, after: task.status };
    }
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
    await noteRevision(db, row, "NOTE_CREATED", statusChange);
    return {
      ...row,
      statusChange: statusChange ?? null,
      ...(updatedTask ? { task: updatedTask } : {}),
    };
  });
}
export async function patchNote(
  parent: WorkParent,
  id: number,
  value: unknown,
  command: WorkCommand,
) {
  const parsed = noteInput(value);
  if (parsed.taskStatus !== null)
    throw new WorkValidationError("Change task status when adding a new note.");
  const input = {
    body: parsed.body,
    documentationUrls: parsed.documentationUrls,
    occurredAt: parsed.occurredAt,
  };
  return mutation(`${parentIdentity(parent)}:note:${id}:patch`, parsed, command, async (db) => {
    const row = await noteRow(db, parent, id);
    const data = {
      ...input,
      documentationUrls: Object.hasOwn(value as object, "documentationUrls")
        ? input.documentationUrls
        : row.documentationUrls,
      occurredAt: Object.hasOwn(value as object, "occurredAt") ? input.occurredAt : row.occurredAt,
    };
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
const timelineNoteInclude = {
  todo: { select: { id: true, title: true, userId: true, projectId: true } },
  revisions: {
    where: { revision: 1 },
    select: {
      activity: {
        where: { action: "NOTE_CREATED" },
        select: { changes: true },
      },
    },
  },
} satisfies Prisma.WorkNoteInclude;
type TimelineNote = Prisma.WorkNoteGetPayload<{ include: typeof timelineNoteInclude }>;
function timelineNote(note: TimelineNote) {
  const { revisions, todo, ...record } = note;
  const changes = revisions[0]?.activity[0]?.changes as Record<string, unknown> | undefined;
  return {
    ...record,
    sourceTask: todo ? { id: todo.id, reference: taskReference(todo.id), title: todo.title } : null,
    statusChange: changes?.statusChange ?? null,
  };
}
export async function taskTimeline(parent: WorkParent, params: URLSearchParams) {
  const filter = params.get("filter") || "notes";
  if (!["notes", "all"].includes(filter))
    throw new WorkValidationError("Choose Notes only or All activity.");
  const requested = pageNumber(params),
    pageSize = 20;
  return readSnapshot(prisma, async (db) => {
    await parentRow(db, parent);
    const where =
      typeof parent === "number"
        ? supportWhere(parent)
        : {
            userId: WORK_USER_ID,
            OR: [
              { projectId: parent.projectId, todoId: null, project: { userId: WORK_USER_ID } },
              { projectId: null, todo: { projectId: parent.projectId, userId: WORK_USER_ID } },
            ],
          };
    const activityWhere = {
      ...where,
      action: { notIn: ["KEY_CREATE", "KEY_EDIT", "KEY_REMOVE"] },
    };
    const noteCount = filter === "notes" ? await db.workNote.count({ where }) : 0;
    const followUpCount =
      filter === "notes" && typeof parent === "number"
        ? await db.workFollowUp.count({
            where: { todoId: parent, todo: { userId: WORK_USER_ID }, status: { not: "ACTIVE" } },
          })
        : 0;
    const total =
      filter === "notes"
        ? noteCount + followUpCount
        : await db.workActivity.count({ where: activityWhere });
    const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize))),
      skip = (page - 1) * pageSize;
    if (filter === "notes" && typeof parent === "number") {
      // Page the combined stream in PostgreSQL, rather than fetching all notes
      // or paginating the two record types independently. Values are bound.
      const entries = await db.$queryRaw<{ kind: "note" | "followup"; id: number }[]>`
          SELECT stream.kind, stream.id FROM (
            SELECT 'note'::text AS kind, n.id, n."createdAt" AS "sortAt"
            FROM "WorkNote" n
            WHERE n."todoId" = ${parent} AND n."userId" = ${WORK_USER_ID}
              AND n."projectId" IS NULL
            UNION ALL
            SELECT 'followup'::text AS kind, f.id, COALESCE(f."resolvedAt", f."createdAt") AS "sortAt"
            FROM "WorkFollowUp" f JOIN "Todo" t ON t.id = f."todoId"
            WHERE f."todoId" = ${parent} AND t."userId" = ${WORK_USER_ID}
              AND f.status <> 'ACTIVE'
          ) stream ORDER BY stream."sortAt" DESC, stream.id DESC, stream.kind ASC
          OFFSET ${skip} LIMIT ${pageSize}`;
      const [notes, followUps] = await Promise.all([
        db.workNote.findMany({
          include: timelineNoteInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          where: {
            ...where,
            id: { in: entries.filter((item) => item.kind === "note").map((item) => item.id) },
          },
        }),
        db.workFollowUp.findMany({
          orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
          where: {
            todoId: parent,
            todo: { userId: WORK_USER_ID },
            id: { in: entries.filter((item) => item.kind === "followup").map((item) => item.id) },
          },
        }),
      ]);
      return {
        filter,
        total,
        page,
        pageSize,
        entries,
        notes: notes.map(timelineNote),
        followUps,
        activity: [],
      };
    }
    if (filter === "notes")
      return {
        filter,
        total,
        page,
        pageSize,
        notes: (
          await db.workNote.findMany({
            include: timelineNoteInclude,
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: pageSize,
          })
        ).map(timelineNote),
        activity: [],
      };
    const activity = await db.workActivity.findMany({
      where: activityWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      include: { noteRevision: { include: { note: { include: timelineNoteInclude } } } },
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
          (typeof parent === "number"
            ? entry.noteRevision.note.todoId === parent &&
              entry.noteRevision.note.projectId === null
            : entry.noteRevision.note.projectId === parent.projectId ||
              (entry.noteRevision.note.todo?.userId === WORK_USER_ID &&
                entry.noteRevision.note.todo.projectId === parent.projectId))
            ? { ...entry.noteRevision, note: timelineNote(entry.noteRevision.note) }
            : null,
      })),
    };
  });
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
  knowledgeArticleId: row.knowledgeArticleId,
  inlineImage: row.inlineImage,
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
async function attachmentRow(db: DB, parent: AttachmentParent, id: number) {
  const row = await db.workAttachment.findFirst({
    where: { id, ...supportWhere(parent) },
  });
  if (!row) throw new WorkValidationError("Attachment not found.", 404);
  return row;
}
export async function listAttachments(parent: AttachmentParent, params: URLSearchParams) {
  const requested = pageNumber(params),
    pageSize = 12;
  return readSnapshot(prisma, async (db) => {
    await parentRow(db, parent);
    const where = { ...supportWhere(parent), inlineImage: false },
      total = await db.workAttachment.count({ where });
    const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await db.workAttachment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { total, page, pageSize, items: rows.map(attachmentDTO) };
  });
}
export async function cleanupAttachment(parent: AttachmentParent, id: number) {
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
  parent: AttachmentParent,
  file: PreparedDocument,
  command: WorkCommand,
  replacementId?: number,
  inlineImage = false,
) {
  let stagedKey: string | null = null;
  try {
    const result = (await mutation(
      `${supportIdentity(parent)}:attachment:${replacementId ?? "create"}:upload`,
      {
        ...(inlineImage ? { inlineImage: true } : {}),
        hash: file.contentHash,
        name: file.originalName,
        type: file.mimeType,
        size: file.buffer.length,
      },
      command,
      async (db) => {
        const parentRecord = await parentRow(db, parent);
        if (inlineImage && isKnowledgeParent(parent))
          version(parentRecord as { revision: number }, command);
        if (inlineImage) {
          if (!file.mimeType.startsWith("image/"))
            throw new WorkValidationError(
              "Choose an image for the article. PDFs belong in attachments.",
            );
          const images = await db.workAttachment.aggregate({
            where: { ...supportWhere(parent), inlineImage: true, removedAt: null },
            _count: true,
            _sum: { byteSize: true },
          });
          if (
            images._count >= 30 ||
            (images._sum.byteSize || 0) + file.buffer.length > 100 * 1024 * 1024
          )
            throw new WorkValidationError(
              "Use up to 30 inline images and 100 MB per article or draft.",
              413,
            );
        }
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
              data: { ...data, ...supportFields(parent), userId: WORK_USER_ID, inlineImage },
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
        return {
          ...attachmentDTO(row),
          ...(inlineImage && isKnowledgeParent(parent)
            ? { articleRevision: (await articleRow(db, parent.knowledgeArticleId)).revision }
            : {}),
        };
      },
    )) as ReturnType<typeof attachmentDTO> & { articleRevision?: number };
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
export async function removeAttachment(
  parent: AttachmentParent,
  id: number,
  command: WorkCommand,
  articleRevision?: number,
) {
  const result = (await mutation(
    `${supportIdentity(parent)}:attachment:${id}:remove`,
    articleRevision === undefined ? null : { articleRevision },
    command,
    async (db) => {
      if (isKnowledgeParent(parent) && articleRevision !== undefined)
        version(await articleRow(db, parent.knowledgeArticleId), {
          ...command,
          revision: articleRevision,
        });
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
      return {
        ...attachmentDTO(updated),
        ...(articleRevision !== undefined && isKnowledgeParent(parent)
          ? { articleRevision: (await articleRow(db, parent.knowledgeArticleId)).revision }
          : {}),
      };
    },
  )) as ReturnType<typeof attachmentDTO> & { articleRevision?: number };
  return { ...result, cleanupPending: await cleanupAttachment(parent, id) };
}
export async function retryAttachmentCleanup(
  parent: AttachmentParent,
  id: number,
  command: WorkCommand,
) {
  await mutation(
    `${supportIdentity(parent)}:attachment:${id}:cleanup`,
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
export async function readAttachment(parent: AttachmentParent, id: number) {
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
