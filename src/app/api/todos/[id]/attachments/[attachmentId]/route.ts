import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { uploadAttachment, removeAttachment } from "@/lib/work-management/supporting";
import { getTodo } from "@/lib/work-management/server";
import { workUpload } from "@/lib/work-management/files";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; attachmentId: string }> };
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => { const params = await context.params, id = workId(params.id), attachmentId = workId(params.attachmentId), command = workCommand(request); await getTodo(id); return uploadAttachment(id, await workUpload(request), command, attachmentId); });
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => { const params = await context.params; return removeAttachment(workId(params.id), workId(params.attachmentId), workCommand(request)); });
}
