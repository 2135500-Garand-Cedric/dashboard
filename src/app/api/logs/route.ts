import { requireOwner } from "@/lib/require-owner";
import { withUserTimeZone } from "@/lib/user-settings";
import { listLogs, AuditQueryError } from "@/lib/audit/query";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new SyntaxError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 4096) {
        await reader.cancel();
        return Response.json({ error: "Log filters are too large." }, { status: 413, headers });
      }
      chunks.push(chunk.value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return Response.json(await withUserTimeZone(() => listLogs(JSON.parse(raw))), { headers });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof AuditQueryError ? error.message : "Unable to load logs. Try again.",
      },
      {
        status: error instanceof AuditQueryError || error instanceof SyntaxError ? 400 : 503,
        headers,
      },
    );
  }
}
