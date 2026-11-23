import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { readRecurrence, saveRecurrence } from "@/lib/work-management/recurrence-server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => ({
    series: await readRecurrence("EVENT", workId((await context.params).id)),
  }));
}
export async function POST(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () =>
    saveRecurrence(
      "EVENT",
      workId((await context.params).id),
      await request.json(),
      workCommand(request, request.headers.has("If-Match")),
    ),
  );
}
