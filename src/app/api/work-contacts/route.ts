import { requireOwner } from "@/lib/require-owner";
import { listWorkContacts, createWorkContact } from "@/lib/work-management/server";
import { workCommand, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(() => listWorkContacts(new URL(request.url).searchParams), 200, "load");
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => createWorkContact(await request.json(), workCommand(request, false)),
    201,
  );
}
