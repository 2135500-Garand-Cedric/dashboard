import { requireOwner } from "@/lib/require-owner";
import { workResponse } from "@/lib/work-management/validation";
import * as knowledge from "@/lib/knowledge/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(() => knowledge.tagOptions(), 200, "load");
}
