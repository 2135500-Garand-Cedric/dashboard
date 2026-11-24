BEGIN;
-- AlterTable
ALTER TABLE "WorkAttachment" ADD COLUMN     "knowledgeArticleId" INTEGER;

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" VARCHAR(1000) NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "type" VARCHAR(30) NOT NULL DEFAULT 'REFERENCE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleRevision" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tags" TEXT[],
    "action" TEXT NOT NULL,
    "actorGithubId" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeTag" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalizedName" VARCHAR(80) NOT NULL,

    CONSTRAINT "KnowledgeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleTag" (
    "articleId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "KnowledgeArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleLink" (
    "sourceId" INTEGER NOT NULL,
    "targetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "KnowledgeArticleLink_pkey" PRIMARY KEY ("sourceId","targetId")
);

-- CreateTable
CREATE TABLE "KnowledgeTaskLink" (
    "articleId" INTEGER NOT NULL,
    "todoId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "actorGithubId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeTaskLink_pkey" PRIMARY KEY ("articleId","todoId")
);

-- CreateTable
CREATE TABLE "KnowledgeProjectLink" (
    "articleId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "actorGithubId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeProjectLink_pkey" PRIMARY KEY ("articleId","projectId")
);

-- CreateIndex
CREATE INDEX "KnowledgeArticle_userId_archivedAt_updatedAt_idx" ON "KnowledgeArticle"("userId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_id_userId_key" ON "KnowledgeArticle"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleRevision_articleId_revision_key" ON "KnowledgeArticleRevision"("articleId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeTag_id_userId_key" ON "KnowledgeTag"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeTag_userId_normalizedName_key" ON "KnowledgeTag"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "KnowledgeArticleTag_tagId_idx" ON "KnowledgeArticleTag"("tagId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleLink_targetId_idx" ON "KnowledgeArticleLink"("targetId");

-- CreateIndex
CREATE INDEX "KnowledgeTaskLink_todoId_idx" ON "KnowledgeTaskLink"("todoId");

-- CreateIndex
CREATE INDEX "KnowledgeProjectLink_projectId_idx" ON "KnowledgeProjectLink"("projectId");

-- CreateIndex
CREATE INDEX "WorkAttachment_knowledgeArticleId_idx" ON "WorkAttachment"("knowledgeArticleId");

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_knowledgeArticleId_userId_fkey" FOREIGN KEY ("knowledgeArticleId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleRevision" ADD CONSTRAINT "KnowledgeArticleRevision_articleId_userId_fkey" FOREIGN KEY ("articleId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeTag" ADD CONSTRAINT "KnowledgeTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleTag" ADD CONSTRAINT "KnowledgeArticleTag_articleId_userId_fkey" FOREIGN KEY ("articleId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleTag" ADD CONSTRAINT "KnowledgeArticleTag_tagId_userId_fkey" FOREIGN KEY ("tagId", "userId") REFERENCES "KnowledgeTag"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleLink" ADD CONSTRAINT "KnowledgeArticleLink_sourceId_userId_fkey" FOREIGN KEY ("sourceId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleLink" ADD CONSTRAINT "KnowledgeArticleLink_targetId_userId_fkey" FOREIGN KEY ("targetId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeTaskLink" ADD CONSTRAINT "KnowledgeTaskLink_articleId_userId_fkey" FOREIGN KEY ("articleId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeTaskLink" ADD CONSTRAINT "KnowledgeTaskLink_todoId_userId_fkey" FOREIGN KEY ("todoId", "userId") REFERENCES "Todo"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeProjectLink" ADD CONSTRAINT "KnowledgeProjectLink_articleId_userId_fkey" FOREIGN KEY ("articleId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeProjectLink" ADD CONSTRAINT "KnowledgeProjectLink_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "WorkProject"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;


ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_type" CHECK (type IN ('REFERENCE','PROCEDURE','TROUBLESHOOTING'));
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_content" CHECK (length(trim(title))>0 AND length(body)<=200000 AND revision>0);
ALTER TABLE "WorkAttachment" DROP CONSTRAINT "WorkAttachment_one_parent";
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_one_parent" CHECK (num_nonnulls("todoId", "projectId", "knowledgeArticleId")=1);
-- Keep project support ownership enforcement unchanged for notes and activity.
-- Attachments additionally enforce their task/article owner for direct DB writes.
CREATE FUNCTION check_attachment_parent_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."todoId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Todo" WHERE id=NEW."todoId" AND "userId"=NEW."userId") THEN
  RAISE EXCEPTION 'Task attachment owner mismatch';
 END IF;
 IF NEW."knowledgeArticleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "KnowledgeArticle" WHERE id=NEW."knowledgeArticleId" AND "userId"=NEW."userId") THEN
  RAISE EXCEPTION 'Article attachment owner mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "WorkAttachment_parent_owner" BEFORE INSERT OR UPDATE ON "WorkAttachment" FOR EACH ROW EXECUTE FUNCTION check_attachment_parent_owner();
COMMIT;
