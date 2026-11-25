import { requireOwner } from "@/lib/require-owner";
import { withUserTimeZone } from "@/lib/user-settings";
import { searchInput, SearchValidationError } from "@/lib/search/types";
import { searchDashboard } from "@/lib/search/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    // Read incrementally so a misleading Content-Length cannot bypass the cap.
    const reader = request.body?.getReader();
    if (!reader) throw new SearchValidationError("Enter a valid search.");
    const decoder = new TextDecoder();
    let raw = "",
      bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          return Response.json({ error: "Search request is too large." }, { status: 413, headers });
        }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const input = searchInput(JSON.parse(raw));
    return Response.json(await withUserTimeZone(() => searchDashboard(input)), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SearchValidationError
            ? error.message
            : error instanceof SyntaxError
              ? "Enter a valid search."
              : "Search is temporarily unavailable. Please try again.",
      },
      {
        status: error instanceof SearchValidationError || error instanceof SyntaxError ? 400 : 503,
        headers,
      },
    );
  }
}
