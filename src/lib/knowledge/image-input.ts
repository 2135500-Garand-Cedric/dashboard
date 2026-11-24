import type { KnowledgeDB } from "./core";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { WorkValidationError } from "@/lib/work-management/validation";
import { inlineImageIds } from "./markdown";
export async function validateInlineImages(db: KnowledgeDB, body: string, draft: string | null) {
  const ids = inlineImageIds(body);
  if (ids.length > 100)
    throw new WorkValidationError("Use up to 100 image references per article.");
  if (!ids.length) return;
  const count = await db.workAttachment.count({
    where: {
      id: { in: ids },
      userId: owner,
      inlineImage: true,
      removedAt: null,
      OR: [{ knowledgeArticleId: { not: null } }, ...(draft ? [{ knowledgeDraftId: draft }] : [])],
    },
  });
  if (count !== ids.length)
    throw new WorkValidationError(
      "An image is missing, expired, or belongs to another unfinished draft. Add it again before saving.",
    );
}
