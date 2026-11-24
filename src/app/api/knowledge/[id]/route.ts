import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
import * as knowledge from "@/lib/knowledge/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () =>
      knowledge.articleDetail(workId((await context.params).id), new URL(request.url).searchParams),
    200,
    "load",
  );
}
export async function PATCH(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () =>
    knowledge.saveArticle(
      workId((await context.params).id),
      await workNoteJson(request, 1024 * 1024),
      workCommand(request),
    ),
  );
}
