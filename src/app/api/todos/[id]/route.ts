import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { getTodo, patchTodo, deleteTodo } from "@/lib/work-management/server";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => getTodo(workId((await context.params).id)));
}
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => patchTodo(workId((await context.params).id), await request.json(), workCommand(request)));
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => deleteTodo(workId((await context.params).id), workCommand(request)));
}
