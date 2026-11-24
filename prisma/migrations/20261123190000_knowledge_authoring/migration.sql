-- AlterTable
ALTER TABLE "WorkAttachment" ADD COLUMN     "inlineImage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "knowledgeDraftId" UUID;

-- CreateTable
CREATE TABLE "KnowledgeTemplate" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalizedName" VARCHAR(160) NOT NULL,
    "body" TEXT NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'REFERENCE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KnowledgeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDraft" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "savedArticleId" INTEGER,
    "discardedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KnowledgeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeTemplate_userId_archivedAt_idx" ON "KnowledgeTemplate"("userId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeTemplate_id_userId_key" ON "KnowledgeTemplate"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeTemplate_userId_normalizedName_key" ON "KnowledgeTemplate"("userId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDraft_savedArticleId_key" ON "KnowledgeDraft"("savedArticleId");

-- CreateIndex
CREATE INDEX "KnowledgeDraft_userId_updatedAt_idx" ON "KnowledgeDraft"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDraft_savedArticleId_userId_key" ON "KnowledgeDraft"("savedArticleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDraft_id_userId_key" ON "KnowledgeDraft"("id", "userId");

-- CreateIndex
CREATE INDEX "WorkAttachment_knowledgeDraftId_idx" ON "WorkAttachment"("knowledgeDraftId");

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_knowledgeDraftId_userId_fkey" FOREIGN KEY ("knowledgeDraftId", "userId") REFERENCES "KnowledgeDraft"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeTemplate" ADD CONSTRAINT "KnowledgeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDraft" ADD CONSTRAINT "KnowledgeDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDraft" ADD CONSTRAINT "KnowledgeDraft_savedArticleId_userId_fkey" FOREIGN KEY ("savedArticleId", "userId") REFERENCES "KnowledgeArticle"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "WorkAttachment" DROP CONSTRAINT "WorkAttachment_one_parent";
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_one_parent" CHECK (num_nonnulls("todoId","projectId","knowledgeArticleId","knowledgeDraftId")=1);
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_inline_image" CHECK (NOT "inlineImage" OR ("mimeType" LIKE 'image/%' AND ("knowledgeArticleId" IS NOT NULL OR "knowledgeDraftId" IS NOT NULL)));
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_draft_image" CHECK ("knowledgeDraftId" IS NULL OR "inlineImage");
ALTER TABLE "KnowledgeTemplate" ADD CONSTRAINT "KnowledgeTemplate_type" CHECK (type IN ('REFERENCE','PROCEDURE','TROUBLESHOOTING'));
ALTER TABLE "KnowledgeTemplate" ADD CONSTRAINT "KnowledgeTemplate_content" CHECK (length(trim(name))>0 AND length(trim(body))>0 AND length(body)<=200000 AND revision>0);
