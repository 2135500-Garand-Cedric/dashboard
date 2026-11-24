import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
export const runtime = "nodejs";
import { readTemplate, saveTemplate } from "@/lib/knowledge/templates";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => readTemplate(workId((await context.params).id)), 200, "load");
}
export async function PATCH(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () =>
    saveTemplate(
      workId((await context.params).id),
      await workNoteJson(request, 1024 * 1024),
      workCommand(request),
    ),
  );
}
