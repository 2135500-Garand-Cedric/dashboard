import { requireOwner } from "@/lib/require-owner";
import { removeHoliday, updateHoliday } from "@/lib/holiday-server";
import { workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => removeHoliday(workId((await context.params).id)));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () =>
    updateHoliday(workId((await context.params).id), await request.json()),
  );
}
