import { requireOwner } from "@/lib/require-owner";
import { taskMembership } from "@/lib/work-management/project-server";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () =>
    taskMembership(workId((await context.params).id), await request.json(), workCommand(request)),
  );
}
