import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { retryAttachmentCleanup } from "@/lib/work-management/supporting";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; attachmentId: string }> };
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => { const params = await context.params; return retryAttachmentCleanup(workId(params.id), workId(params.attachmentId), workCommand(request)); });
}
