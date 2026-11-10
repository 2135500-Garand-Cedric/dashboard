import { requireOwner } from "@/lib/require-owner";
import { readTransition } from "@/lib/work-management/relationships";
import { workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => readTransition(workId((await context.params).id), new URL(request.url).searchParams), 200, "load");
}
