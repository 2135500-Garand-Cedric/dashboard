import { requireOwner } from "@/lib/require-owner";
import { holidayOverview, addHoliday } from "@/lib/holiday-server";
import { workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    () => holidayOverview(new URL(request.url).searchParams.get("country")),
    200,
    "load",
  );
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => addHoliday(await request.json()), 201);
}
