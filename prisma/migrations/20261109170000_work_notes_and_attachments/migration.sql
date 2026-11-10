-- New notes/history/private file metadata only. No historical content is inferred.
CREATE TABLE "WorkNote" (
 "id" SERIAL NOT NULL PRIMARY KEY, "userId" INTEGER NOT NULL, "todoId" INTEGER NOT NULL,
 "actorGithubId" TEXT NOT NULL, "body" TEXT NOT NULL, "documentationUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "occurredAt" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "removedAt" TIMESTAMP(3)
);
CREATE TABLE "WorkNoteRevision" (
 "id" SERIAL NOT NULL PRIMARY KEY, "noteId" INTEGER NOT NULL, "revision" INTEGER NOT NULL,
 "body" TEXT NOT NULL, "documentationUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "occurredAt" TIMESTAMP(3),
 "action" TEXT NOT NULL, "actorGithubId" TEXT NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "WorkAttachment" (
 "id" SERIAL NOT NULL PRIMARY KEY, "userId" INTEGER NOT NULL, "todoId" INTEGER NOT NULL,
 "originalName" VARCHAR(200) NOT NULL, "mimeType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL,
 "contentHash" VARCHAR(64) NOT NULL, "storageKey" TEXT NOT NULL, "pendingDeletionKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, "removedAt" TIMESTAMP(3)
);
ALTER TABLE "WorkActivity" ADD COLUMN "noteRevisionId" INTEGER;
CREATE INDEX "WorkNote_userId_todoId_createdAt_idx" ON "WorkNote"("userId","todoId","createdAt");
CREATE UNIQUE INDEX "WorkNoteRevision_noteId_revision_key" ON "WorkNoteRevision"("noteId","revision");
CREATE INDEX "WorkAttachment_userId_todoId_createdAt_idx" ON "WorkAttachment"("userId","todoId","createdAt");
CREATE UNIQUE INDEX "WorkAttachment_storageKey_key" ON "WorkAttachment"("storageKey");
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkNoteRevision" ADD CONSTRAINT "WorkNoteRevision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "WorkNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_noteRevisionId_fkey" FOREIGN KEY ("noteRevisionId") REFERENCES "WorkNoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
