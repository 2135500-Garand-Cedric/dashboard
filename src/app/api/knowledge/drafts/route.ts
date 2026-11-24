import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
export const runtime = "nodejs";
import { createImageDraft } from "@/lib/knowledge/images";
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () => createImageDraft(await workNoteJson(request), workCommand(request, false)),
    201,
  );
}
