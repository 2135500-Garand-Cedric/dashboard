import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { patchNote, removeNote } from "@/lib/work-management/supporting";
import { workNoteJson } from "@/lib/work-management/files";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; noteId: string }> };
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => { const params = await context.params; return patchNote(workId(params.id), workId(params.noteId), await workNoteJson(request), workCommand(request)); });
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => { const params = await context.params; return removeNote(workId(params.id), workId(params.noteId), workCommand(request)); });
}
