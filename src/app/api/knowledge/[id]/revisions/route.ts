import { requireOwner } from "@/lib/require-owner";
import { workId, workResponse } from "@/lib/work-management/validation";
import * as knowledge from "@/lib/knowledge/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () =>
      knowledge.revisions(workId((await context.params).id), new URL(request.url).searchParams),
    200,
    "load",
  );
}
