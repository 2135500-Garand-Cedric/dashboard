import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { listTodos, createTodo } from "@/lib/work-management/server";

export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;
  return workResponse(() => listTodos());
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => createTodo(await request.json(), workCommand(request, false)), 201);
}
