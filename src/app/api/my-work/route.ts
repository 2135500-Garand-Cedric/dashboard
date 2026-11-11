import { requireOwner } from "@/lib/require-owner";
import { myWork } from "@/lib/work-management/my-work-server";
import { workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(() => myWork(new URL(request.url).searchParams), 200, "load");
}
