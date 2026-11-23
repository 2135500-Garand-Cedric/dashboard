import { requireOwner } from "@/lib/require-owner";
import { readOccasion } from "@/lib/calendar-occasion-server";
import { workResponse, workId } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () => {
      const { kind, id } = await context.params;
      return readOccasion(kind, workId(id), new URL(request.url).searchParams.get("date"));
    },
    200,
    "load",
  );
}
