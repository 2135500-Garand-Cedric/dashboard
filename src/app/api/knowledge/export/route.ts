import { requireOwner } from "@/lib/require-owner";
import { exportKnowledge } from "@/lib/knowledge/export";
import { workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id");
    const bytes = await exportKnowledge(id ? workId(id) : undefined);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="knowledge.zip"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return workResponse(
      async () => {
        throw error;
      },
      200,
      "load",
    );
  }
}
