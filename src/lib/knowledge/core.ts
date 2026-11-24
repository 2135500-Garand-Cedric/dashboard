import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner, OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { WorkValidationError } from "@/lib/work-management/validation";
export type KnowledgeDB = Prisma.TransactionClient;
export const articleSummarySelect = {
  folderId: true,
  id: true,
  title: true,
  summary: true,
  type: true,
  pinned: true,
  revision: true,
  archivedAt: true,
  updatedAt: true,
} as const;
export async function articleRow(db: KnowledgeDB, id: number) {
  const row = await db.knowledgeArticle.findFirst({ where: { id, userId: owner } });
  if (!row) throw new WorkValidationError("Article not found.", 404);
  return row;
}
export async function recordArticleRevision(db: KnowledgeDB, id: number, action: string) {
  const article = await articleRow(db, id);
  const tags = await db.knowledgeArticleTag.findMany({
    where: { articleId: id, userId: owner },
    include: { tag: true },
    orderBy: { tagId: "asc" },
  });
  await db.knowledgeArticleRevision.create({
    data: {
      articleId: id,
      userId: owner,
      revision: article.revision,
      title: article.title,
      summary: article.summary,
      body: article.body,
      type: article.type,
      tags: tags.map((entry) => entry.tag.name),
      action,
      actorGithubId: OWNER_GITHUB_ID,
    },
  });
}
