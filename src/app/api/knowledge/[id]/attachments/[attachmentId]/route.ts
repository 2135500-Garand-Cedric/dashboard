import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import {
  uploadAttachment,
  removeAttachment,
  renameAttachment,
} from "@/lib/work-management/supporting";
import { articleRow } from "@/lib/knowledge/core";
import { prisma } from "@/lib/prisma";
import { workUpload, workNoteJson } from "@/lib/work-management/files";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; attachmentId: string }> };
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => {
    const params = await context.params,
      id = workId(params.id),
      attachmentId = workId(params.attachmentId),
      command = workCommand(request);
    await articleRow(prisma, id);
    if (request.headers.get("content-type")?.split(";")[0].trim() === "application/json")
      return renameAttachment(
        { knowledgeArticleId: id },
        attachmentId,
        await workNoteJson(request, 4096),
        command,
      );
    return uploadAttachment(
      { knowledgeArticleId: id },
      await workUpload(request),
      command,
      attachmentId,
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => {
    const params = await context.params;
    return removeAttachment(
      { knowledgeArticleId: workId(params.id) },
      workId(params.attachmentId),
      workCommand(request),
    );
  });
}
