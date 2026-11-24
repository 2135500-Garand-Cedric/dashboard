import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
import { listFolders, saveFolder } from "@/lib/knowledge/folders";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(() => listFolders(), 200, "load");
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () => saveFolder(null, await workNoteJson(request), workCommand(request, false)),
    201,
  );
}
