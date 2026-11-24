import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
import { saveFolder } from "@/lib/knowledge/folders";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () =>
    saveFolder(
      workId((await context.params).id),
      await workNoteJson(request),
      workCommand(request),
    ),
  );
}
