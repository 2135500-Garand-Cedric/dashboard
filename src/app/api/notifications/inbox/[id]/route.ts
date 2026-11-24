import { requireOwner } from "@/lib/require-owner";
import { inboxHandler } from "@/lib/notifications/inbox-server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return inboxHandler(request, "detail", (await context.params).id);
}
export async function PATCH(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return inboxHandler(request, "update", (await context.params).id);
}
