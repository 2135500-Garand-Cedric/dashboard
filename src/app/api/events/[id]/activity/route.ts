import { requireOwner } from "@/lib/require-owner";
import { eventActivity } from "@/lib/work-management/calendar-server";
import { workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => eventActivity(workId((await context.params).id)), 200, "load");
}
