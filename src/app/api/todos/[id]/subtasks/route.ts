import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { createSubtask } from "@/lib/work-management/server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => createSubtask(workId((await context.params).id), await request.json(), workCommand(request)), 201);
}
