import { requireOwner } from "@/lib/require-owner";
import { undoConversion } from "@/lib/work-management/calendar-server";
import { workResponse, workId, workCommand } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () =>
      undoConversion(workId((await context.params).id), await request.json(), workCommand(request)),
    200,
    "save",
  );
}
