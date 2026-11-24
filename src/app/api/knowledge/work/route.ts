import { requireOwner } from "@/lib/require-owner";
import { workId, workResponse } from "@/lib/work-management/validation";
import * as knowledge from "@/lib/knowledge/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () => {
      const params = new URL(request.url).searchParams,
        kind = params.get("kind") || "task";
      return params.has("id")
        ? knowledge.workArticles(kind, workId(params.get("id")), params)
        : knowledge.workOptions(kind, params.get("q") || "");
    },
    200,
    "load",
  );
}
