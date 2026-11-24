import type { KnowledgeDB } from "./core";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { WorkValidationError } from "@/lib/work-management/validation";
export const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;
export function draftId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
  )
    throw new WorkValidationError("Choose a valid image draft.");
  return value.toLowerCase();
}
export async function activeDraft(db: KnowledgeDB, id: string) {
  const row = await db.knowledgeDraft.findFirst({ where: { id, userId: owner } });
  if (!row)
    throw new WorkValidationError("This image draft is unavailable. Add the images again.", 404);
  if (row.savedArticleId || row.discardedAt)
    throw new WorkValidationError("This image draft has already been saved or discarded.", 409);
  if (Date.now() - row.updatedAt.getTime() > DRAFT_LIFETIME_MS)
    throw new WorkValidationError("This image draft expired. Add the images again.", 410);
  return row;
}
