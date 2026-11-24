import { requireOwner } from "@/lib/require-owner";
import { inboxHandler } from "@/lib/notifications/inbox-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return inboxHandler(request, "read-all");
}
