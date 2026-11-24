import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { removeInlineImage } from "@/lib/knowledge/images";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => {
    const revision = request.headers.get("If-Article-Match");
    return removeInlineImage(
      workId((await context.params).id),
      workCommand(request),
      revision ? workId(revision) : undefined,
    );
  });
}
