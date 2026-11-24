import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
import { workNoteJson } from "@/lib/work-management/files";
import * as knowledge from "@/lib/knowledge/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(() => knowledge.listArticles(new URL(request.url).searchParams), 200, "load");
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () =>
      knowledge.saveArticle(
        null,
        await workNoteJson(request, 1024 * 1024),
        workCommand(request, false),
      ),
    201,
  );
}
