import { requireOwner } from "@/lib/require-owner";
import { taskCalendar } from "@/lib/work-management/calendar-server";
import { workResponse, workId } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => taskCalendar(workId((await context.params).id), new URL(request.url).searchParams),
    200,
    "load",
  );
}
