import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { listWorkContexts, createWorkContext } from "@/lib/work-management/server";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(() => listWorkContexts(), 200, "load");
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => createWorkContext(await request.json(), workCommand(request, false)), 201);
}
