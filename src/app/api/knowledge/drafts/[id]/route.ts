import { requireOwner } from "@/lib/require-owner";
import { workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { discardImageDraft } from "@/lib/knowledge/images";
import { draftId } from "@/lib/knowledge/draft-core";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => {
    await discardImageDraft(draftId((await context.params).id));
    return { discarded: true };
  });
}
