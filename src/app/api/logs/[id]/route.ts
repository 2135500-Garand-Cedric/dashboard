import { requireOwner } from "@/lib/require-owner";
import { logDetail } from "@/lib/audit/query";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const detail = await logDetail((await context.params).id);
    return Response.json(detail ?? { error: "Log entry not found." }, {
      status: detail ? 200 : 404,
      headers,
    });
  } catch {
    return Response.json({ error: "Unable to load this log entry." }, { status: 503, headers });
  }
}
