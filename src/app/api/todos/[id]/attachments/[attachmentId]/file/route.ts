import { requireOwner } from "@/lib/require-owner";
import { workId, workResponse } from "@/lib/work-management/validation";
import { readAttachment } from "@/lib/work-management/supporting";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; attachmentId: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const params = await context.params, id = workId(params.attachmentId);
    const { document, buffer } = await readAttachment(workId(params.id), id), download = new URL(request.url).searchParams.get("download") === "1";
    const extension = document.mimeType === "application/pdf" ? "pdf" : document.mimeType.split("/")[1];
    return new Response(new Uint8Array(buffer), { headers: {
      "Cache-Control": "private, no-store", "Content-Type": document.mimeType, "Content-Length": String(buffer.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="work-${id}.${extension}"; filename*=UTF-8''${encodeURIComponent(document.originalName).replace(/'/g, "%27")}`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch (error) { return workResponse(async () => { throw error; }, 200, "load"); }
}
