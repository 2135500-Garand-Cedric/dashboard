import { requireOwner } from "@/lib/require-owner";
import { calendarFeed } from "@/lib/work-management/calendar-server";
import { workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => calendarFeed(new URL(request.url).searchParams), 200, "load");
}
