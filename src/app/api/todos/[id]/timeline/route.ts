import { requireOwner } from "@/lib/require-owner";
import { workId, workResponse } from "@/lib/work-management/validation";
import { taskTimeline } from "@/lib/work-management/supporting";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => taskTimeline(workId((await context.params).id), new URL(request.url).searchParams),
    200,
    "load",
  );
}
