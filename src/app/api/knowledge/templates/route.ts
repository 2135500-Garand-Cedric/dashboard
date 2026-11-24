import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
export const runtime = "nodejs";
import { listTemplates, saveTemplate } from "@/lib/knowledge/templates";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(() => listTemplates(new URL(request.url).searchParams), 200, "load");
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () =>
      saveTemplate(null, await workNoteJson(request, 1024 * 1024), workCommand(request, false)),
    201,
  );
}
