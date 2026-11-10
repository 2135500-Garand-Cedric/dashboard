import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { createNote } from "@/lib/work-management/supporting";
import { workNoteJson } from "@/lib/work-management/files";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => createNote(workId((await context.params).id), await workNoteJson(request), workCommand(request, false)), 201);
}
