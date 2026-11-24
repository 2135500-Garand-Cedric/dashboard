import { requireOwner } from "@/lib/require-owner";
import { workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { readInlineImage } from "@/lib/knowledge/images";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const { buffer, mimeType } = await readInlineImage(workId((await context.params).id));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
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
