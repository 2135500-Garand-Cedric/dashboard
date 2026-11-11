import { requireOwner } from "@/lib/require-owner";
import { readFocus, setFocus } from "@/lib/work-management/my-work-server";
import { workId, workCommand, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => readFocus(workId((await context.params).id)), 200, "load");
}
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () =>
    setFocus(workId((await context.params).id), await request.json(), workCommand(request)),
  );
}
