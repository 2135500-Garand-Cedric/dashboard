import { requireOwner } from "@/lib/require-owner";
import { saveBirthday, deleteBirthday } from "@/lib/birthday-server";
import { workResponse, workId } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () =>
    saveBirthday(await request.json(), workId((await context.params).id)),
  );
}
export async function DELETE(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => deleteBirthday(workId((await context.params).id)));
}
