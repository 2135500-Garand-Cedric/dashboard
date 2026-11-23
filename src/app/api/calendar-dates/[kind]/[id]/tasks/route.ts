import { requireOwner } from "@/lib/require-owner";
import { occasionTaskCommand } from "@/lib/calendar-occasion-server";
import { workResponse, workId } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ kind: string; id: string }> };
export async function POST(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => {
    const { kind, id } = await context.params;
    return occasionTaskCommand(kind, workId(id), await request.json());
  });
}
export async function DELETE(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => {
    const { kind, id } = await context.params;
    return occasionTaskCommand(kind, workId(id), await request.json(), true);
  });
}
