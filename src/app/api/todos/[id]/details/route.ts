import { requireOwner } from "@/lib/require-owner";
import { readTaskDetails } from "@/lib/work-management/task-details";
import { workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => readTaskDetails(workId((await context.params).id)), 200, "load");
}
