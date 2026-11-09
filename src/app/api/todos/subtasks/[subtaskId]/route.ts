import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { changeSubtask } from "@/lib/work-management/server";
type Context = { params: Promise<{ subtaskId: string }> };
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => changeSubtask(workId((await context.params).subtaskId), await request.json(), workCommand(request)));
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => changeSubtask(workId((await context.params).subtaskId), {}, workCommand(request), true));
}
