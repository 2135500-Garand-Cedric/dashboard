import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { mutation, workTransaction } from "@/lib/work-management/server";
import {
  cleanupAttachment,
  removeAttachment,
  uploadAttachment,
  type AttachmentParent,
} from "@/lib/work-management/supporting";
import {
  documentHash,
  fileOperation,
  workFileStore,
  type PreparedDocument,
} from "@/lib/work-management/files";
import {
  workBody,
  workId,
  WorkValidationError,
  type WorkCommand,
} from "@/lib/work-management/validation";
import { articleRow, type KnowledgeDB } from "./core";
import { activeDraft, draftId, DRAFT_LIFETIME_MS } from "./draft-core";
export const imageSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  byteSize: true,
  revision: true,
  knowledgeArticleId: true,
  knowledgeDraftId: true,
} as const;
export async function cleanupImageDrafts(now = new Date()) {
  const cutoff = new Date(now.getTime() - DRAFT_LIFETIME_MS);
  const rows = await prisma.knowledgeDraft.findMany({
    where: {
      userId: owner,
      savedArticleId: null,
      OR: [{ updatedAt: { lt: cutoff } }, { discardedAt: { not: null } }],
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: 10,
  });
  for (const draft of rows) await discardImageDraft(draft.id, cutoff);
}
export async function discardImageDraft(id: string, expiredBefore?: Date) {
  const files = await workTransaction(async (db) => {
    const draft = await db.knowledgeDraft.findFirst({ where: { id, userId: owner } });
    if (
      !draft ||
      draft.savedArticleId ||
      (!draft.discardedAt && expiredBefore && draft.updatedAt >= expiredBefore)
    )
      return [];
    await db.knowledgeDraft.update({
      where: { id },
      data: { discardedAt: draft.discardedAt || new Date() },
    });
    const rows = await db.workAttachment.findMany({
      where: { knowledgeDraftId: id, userId: owner },
    });
    for (const file of rows)
      if (!file.removedAt)
        await db.workAttachment.update({
          where: { id: file.id },
          data: {
            removedAt: new Date(),
            revision: { increment: 1 },
            pendingDeletionKeys: [...new Set([...file.pendingDeletionKeys, file.storageKey])],
          },
        });
    return rows.map((row) => row.id);
  });
  for (const file of files) await cleanupAttachment({ knowledgeDraftId: id }, file);
  // Keep metadata if filesystem cleanup needs a retry. Never delete a referenced file.
  await workTransaction(async (db) => {
    const draft = await db.knowledgeDraft.findFirst({
      where: { id, userId: owner, savedArticleId: null, discardedAt: { not: null } },
    });
    if (!draft) return;
    const pending = await db.workAttachment.count({
      where: {
        knowledgeDraftId: id,
        OR: [{ removedAt: null }, { NOT: { pendingDeletionKeys: { isEmpty: true } } }],
      },
    });
    if (pending) return;
    await db.workAttachment.deleteMany({ where: { knowledgeDraftId: id, userId: owner } });
    await db.knowledgeDraft.delete({ where: { id } });
  });
}
export async function createImageDraft(value: unknown, command: WorkCommand) {
  const body = workBody(value, ["id"]),
    id = draftId(body.id);
  await cleanupImageDrafts();
  return mutation("knowledge:image-draft:create", { id }, command, async (db) => {
    const existing = await db.knowledgeDraft.findFirst({ where: { id, userId: owner } });
    if (existing) {
      await activeDraft(db, id);
      return { id };
    }
    if (
      (await db.knowledgeDraft.count({
        where: { userId: owner, savedArticleId: null, discardedAt: null },
      })) >= 20
    )
      throw new WorkValidationError(
        "You have too many unfinished image drafts. Discard an unused draft or try again after it expires.",
        409,
      );
    await db.knowledgeDraft.create({ data: { id, userId: owner } });
    return { id };
  });
}
export function imageParent(params: URLSearchParams): AttachmentParent {
  const article = params.get("articleId"),
    draft = params.get("draftId");
  if (!!article === !!draft) throw new WorkValidationError("Choose an article or image draft.");
  return article ? { knowledgeArticleId: workId(article) } : { knowledgeDraftId: draftId(draft) };
}
export async function listInlineImages(parent: AttachmentParent) {
  return prisma.$transaction(
    async (db) => {
      let where;
      if (typeof parent !== "number" && "knowledgeArticleId" in parent) {
        await articleRow(db, parent.knowledgeArticleId);
        where = { knowledgeArticleId: parent.knowledgeArticleId };
      } else if (typeof parent !== "number" && "knowledgeDraftId" in parent) {
        await activeDraft(db, parent.knowledgeDraftId);
        where = { knowledgeDraftId: parent.knowledgeDraftId };
      } else throw new WorkValidationError("Choose an article or image draft.");
      return db.workAttachment.findMany({
        where: { ...where, userId: owner, inlineImage: true, removedAt: null },
        select: imageSelect,
        orderBy: { createdAt: "asc" },
        take: 30,
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function uploadInlineImage(
  parent: AttachmentParent,
  file: PreparedDocument,
  command: WorkCommand,
) {
  if (!file.mimeType.startsWith("image/"))
    throw new WorkValidationError(
      "Choose a JPEG, PNG, WebP or single-frame GIF. PDFs belong in attachments.",
    );
  return uploadAttachment(parent, file, command, undefined, true);
}
export async function imageRow(db: KnowledgeDB, id: number) {
  const row = await db.workAttachment.findFirst({
    where: { id, userId: owner, inlineImage: true, removedAt: null },
  });
  if (!row) throw new WorkValidationError("Image not found.", 404);
  return row;
}
export async function readInlineImage(id: number) {
  return workTransaction(async (db) => {
    const row = await imageRow(db, id);
    if (row.knowledgeDraftId) await activeDraft(db, row.knowledgeDraftId);
    else if (row.knowledgeArticleId) await articleRow(db, row.knowledgeArticleId);
    else throw new WorkValidationError("Image not found.", 404);
    const buffer = await fileOperation(() => workFileStore().read(row.storageKey));
    if (buffer.length !== row.byteSize || documentHash(buffer) !== row.contentHash)
      throw new WorkValidationError(
        "The image differs from its saved original. Restore it from backup.",
        409,
      );
    return { buffer, mimeType: row.mimeType };
  });
}
export async function removeInlineImage(
  id: number,
  command: WorkCommand,
  articleRevision?: number,
) {
  const row = await imageRow(prisma, id);
  if (row.knowledgeArticleId) {
    if (articleRevision === undefined)
      throw new WorkValidationError("Reload the article before removing an image.", 428);
    return removeAttachment(
      { knowledgeArticleId: row.knowledgeArticleId },
      id,
      command,
      articleRevision,
    );
  }
  if (!row.knowledgeDraftId) throw new WorkValidationError("Image not found.", 404);
  await activeDraft(prisma, row.knowledgeDraftId);
  return removeAttachment({ knowledgeDraftId: row.knowledgeDraftId }, id, command);
}
