-- AlterTable
ALTER TABLE "KnowledgeArticle" ADD COLUMN     "folderId" INTEGER;

-- CreateTable
CREATE TABLE "KnowledgeFolder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "parentId" INTEGER,
    "color" VARCHAR(7) NOT NULL DEFAULT '#60a5fa',
    "icon" VARCHAR(20) NOT NULL DEFAULT 'folder',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KnowledgeFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeFolder_userId_parentId_idx" ON "KnowledgeFolder"("userId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeFolder_id_userId_key" ON "KnowledgeFolder"("id", "userId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_userId_folderId_archivedAt_idx" ON "KnowledgeArticle"("userId", "folderId", "archivedAt");

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_folderId_userId_fkey" FOREIGN KEY ("folderId", "userId") REFERENCES "KnowledgeFolder"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_parentId_userId_fkey" FOREIGN KEY ("parentId", "userId") REFERENCES "KnowledgeFolder"("id", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- NULL parents share a root namespace. Keep existing article IDs and links untouched.
CREATE UNIQUE INDEX "KnowledgeFolder_sibling_name" ON "KnowledgeFolder" ("userId", coalesce("parentId",0), "normalizedName");
ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_name" CHECK (length(trim(name))>0);
ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_color" CHECK (color ~ '^#[a-fA-F0-9]{6}$');
ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_icon" CHECK (icon IN ('folder','briefcase','server','book','home','code'));
CREATE FUNCTION check_knowledge_folder_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."parentId"=NEW.id OR EXISTS (
  WITH RECURSIVE ancestors AS (
   SELECT id, "parentId" FROM "KnowledgeFolder" WHERE id=NEW."parentId"
   UNION
   SELECT f.id,f."parentId" FROM "KnowledgeFolder" f JOIN ancestors a ON f.id=a."parentId"
  ) SELECT 1 FROM ancestors WHERE id=NEW.id
 ) THEN RAISE EXCEPTION 'Folder hierarchy cannot contain a cycle'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "KnowledgeFolder_no_cycles" BEFORE INSERT OR UPDATE ON "KnowledgeFolder" FOR EACH ROW EXECUTE FUNCTION check_knowledge_folder_cycle();
