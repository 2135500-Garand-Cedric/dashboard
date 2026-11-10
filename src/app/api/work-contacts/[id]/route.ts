import { requireOwner } from "@/lib/require-owner";
import { getWorkContact, patchWorkContact } from "@/lib/work-management/server";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => getWorkContact(workId((await context.params).id)), 200, "load");
}
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => patchWorkContact(workId((await context.params).id), await request.json(), workCommand(request)));
}
