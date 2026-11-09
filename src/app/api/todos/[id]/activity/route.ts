import { requireOwner } from "@/lib/require-owner";
import { workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { taskActivity } from "@/lib/work-management/server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => taskActivity(workId((await context.params).id)), 200, "load");
}
