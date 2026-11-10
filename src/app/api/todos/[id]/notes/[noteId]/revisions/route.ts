import { requireOwner } from "@/lib/require-owner";
import { workId, workResponse } from "@/lib/work-management/validation";
import { noteRevisions } from "@/lib/work-management/supporting";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; noteId: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => { const params = await context.params; return noteRevisions(workId(params.id), workId(params.noteId), new URL(request.url).searchParams); }, 200, "load");
}
