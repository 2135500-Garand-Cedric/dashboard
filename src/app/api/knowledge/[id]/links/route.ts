import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
import * as knowledge from "@/lib/knowledge/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () =>
    knowledge.changeWorkLink(
      workId((await context.params).id),
      await workNoteJson(request),
      workCommand(request, false),
    ),
  );
}
