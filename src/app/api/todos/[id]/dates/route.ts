import { requireOwner } from "@/lib/require-owner";
import { readTaskDates, taskDateCommand } from "@/lib/work-management/date-server";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => readTaskDates(workId((await context.params).id), new URL(request.url).searchParams),
    200,
    "load",
  );
}
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () =>
    taskDateCommand(workId((await context.params).id), await request.json(), workCommand(request)),
  );
}
