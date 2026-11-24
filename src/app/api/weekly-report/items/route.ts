import { requireOwner } from "@/lib/require-owner";
import { weeklyResponse } from "@/lib/weekly-report/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return weeklyResponse(request, true);
}
