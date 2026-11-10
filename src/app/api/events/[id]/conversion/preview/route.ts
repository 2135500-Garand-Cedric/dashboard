import { requireOwner } from "@/lib/require-owner";
import { previewConversion } from "@/lib/work-management/calendar-server";
import { workResponse, workId } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => previewConversion(workId((await context.params).id), await request.json()),
    200,
    "save",
  );
}
