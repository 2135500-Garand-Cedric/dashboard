BEGIN;
-- DropForeignKey
ALTER TABLE "ActivityVocab" DROP CONSTRAINT "ActivityVocab_vocabId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityVocab" DROP CONSTRAINT "ActivityVocab_verbFormId_fkey";

-- DropForeignKey
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "VerbForm" DROP CONSTRAINT "VerbForm_baseVocabId_fkey";

-- DropIndex
DROP INDEX "Practice_sessionKey_key";

-- DropIndex
DROP INDEX "Category_name_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "lastSignedInAt" TIMESTAMPTZ(3),
ADD COLUMN     "role" VARCHAR(10) NOT NULL DEFAULT 'MEMBER',
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ActivityVocab" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "Practice" ALTER COLUMN "userId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "kind" VARCHAR(10) NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "normalizedName" TEXT,
ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "VerbForm" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorUserId" INTEGER;

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "providerAccountId" VARCHAR(200) NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" INTEGER NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,
    "authenticatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" INTEGER NOT NULL,
    "capability" VARCHAR(60) NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","capability")
);

-- CreateTable
CREATE TABLE "UserInvitation" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "usedById" INTEGER,

    CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthLinkIntent" (
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionId" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthLinkIntent_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "VocabularyPackVersion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL,

    CONSTRAINT "VocabularyPackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JapaneseInitialization" (
    "userId" INTEGER NOT NULL,
    "choice" VARCHAR(10) NOT NULL,
    "packVersionId" INTEGER,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JapaneseInitialization_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthRequestBudget" (
    "key" VARCHAR(100) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthRequestBudget_pkey" PRIMARY KEY ("key")
);

-- Explicit IDs in old seeds/backfills can leave sequences behind their rows.
-- Only advance sequences; never reuse deleted record IDs retained in history.
DO $$ DECLARE table_name text; sequence_name text; highest bigint; previous bigint; BEGIN
 FOREACH table_name IN ARRAY ARRAY['User','Category','Vocabulary','VerbForm','ActivityVocab','Practice','JapaneseProgressSnapshot'] LOOP
  sequence_name := pg_get_serial_sequence(format('%I',table_name),'id');
  EXECUTE format('SELECT COALESCE(max(id),0) FROM %I',table_name) INTO highest;
  EXECUTE format('SELECT last_value FROM %s',sequence_name) INTO previous;
  PERFORM setval(sequence_name,GREATEST(highest,previous,1),true);
 END LOOP;
END $$;
-- Preserve existing IDs; derive child ownership from its real parent.
UPDATE "User" SET role='OWNER' WHERE id=1;
UPDATE "Category" SET "userId"=1,"normalizedName"=lower(trim(name)),kind=CASE lower(trim(name)) WHEN 'verb' THEN 'VERB' WHEN 'kanji' THEN 'KANJI' ELSE 'OTHER' END;
INSERT INTO "Category" (name,"normalizedName",kind,"userId")
SELECT DISTINCT c.name,c."normalizedName",c.kind,v."userId" FROM "Vocabulary" v JOIN "Category" c ON c.id=v."categoryId" WHERE v."userId"<>1;
UPDATE "Vocabulary" v SET "categoryId"=copy.id FROM "Category" original,"Category" copy WHERE v."categoryId"=original.id AND v."userId"<>original."userId" AND copy."userId"=v."userId" AND copy."normalizedName"=original."normalizedName";
UPDATE "VerbForm" f SET "userId"=v."userId" FROM "Vocabulary" v WHERE v.id=f."baseVocabId";
UPDATE "ActivityVocab" a SET "userId"=v."userId" FROM "Vocabulary" v WHERE a."vocabId"=v.id;
UPDATE "ActivityVocab" a SET "userId"=f."userId" FROM "VerbForm" f WHERE a."verbFormId"=f.id AND a."vocabId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL, ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "VerbForm" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ActivityVocab" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ActivityVocab" ADD CONSTRAINT "ActivityVocab_one_parent" CHECK (num_nonnulls("vocabId","verbFormId")=1);
-- Legacy maintenance inserts can omit child owner only; the parent supplies it.
CREATE FUNCTION japanese_child_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."userId" IS NULL THEN
  IF TG_TABLE_NAME='VerbForm' THEN SELECT "userId" INTO NEW."userId" FROM "Vocabulary" WHERE id=NEW."baseVocabId";
  ELSIF NEW."vocabId" IS NOT NULL THEN SELECT "userId" INTO NEW."userId" FROM "Vocabulary" WHERE id=NEW."vocabId";
  ELSE SELECT "userId" INTO NEW."userId" FROM "VerbForm" WHERE id=NEW."verbFormId"; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER "VerbForm_derive_owner" BEFORE INSERT ON "VerbForm" FOR EACH ROW EXECUTE FUNCTION japanese_child_owner();
CREATE TRIGGER "ActivityVocab_derive_owner" BEFORE INSERT ON "ActivityVocab" FOR EACH ROW EXECUTE FUNCTION japanese_child_owner();
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actorKind_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorKind_check" CHECK ("actorKind" IN ('OWNER','USER','SYSTEM','ANONYMOUS'));
ALTER TABLE "PushSubscription" ADD COLUMN "sessionId" UUID;
-- Legacy devices have no revocable login binding; explicit re-enrollment is required.
UPDATE "PushSubscription" SET active=false;
UPDATE "PushDelivery" SET status='SKIPPED',"errorCode"='DISABLED',"leaseUntil"=NULL WHERE status='PENDING';
INSERT INTO "AuthAccount" (id,"userId",provider,"providerAccountId") SELECT '051eab4d-12b0-41c0-92e8-c8cbf2a4eb31',id,'github','89470930' FROM "User" WHERE id=1;
INSERT INTO "JapaneseInitialization" ("userId",choice) SELECT id,'EXISTING' FROM "User" WHERE id=1;
INSERT INTO "VocabularyPackVersion" (content,"wordCount") SELECT jsonb_build_object('categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',id,'name',name,'kind',kind) ORDER BY id) FROM "Category" WHERE "userId"=1),'[]'::jsonb),'words',COALESCE(jsonb_agg(jsonb_build_object('key',v.id,'english',v.english,'japanese',v.japanese,'hiragana',v.hiragana,'readings',v.readings,'categoryKey',v."categoryId",'readHiragana',v."readHiragana",'verbType',v."verbType",'forms',COALESCE((SELECT jsonb_agg(jsonb_build_object('formTypeId',f."formTypeId",'form',f.form,'reading',f.reading) ORDER BY f.id) FROM "VerbForm" f WHERE f."baseVocabId"=v.id),'[]'::jsonb)) ORDER BY v.id),'[]'::jsonb)),count(*) FROM "Vocabulary" v WHERE v."userId"=1;

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_userId_provider_key" ON "AuthAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expires_idx" ON "AuthSession"("userId", "expires");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvitation_usedById_key" ON "UserInvitation"("usedById");

-- CreateIndex
CREATE UNIQUE INDEX "Practice_userId_sessionKey_key" ON "Practice"("userId", "sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_normalizedName_key" ON "Category"("userId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vocabulary_id_userId_key" ON "Vocabulary"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerbForm_id_userId_key" ON "VerbForm"("id", "userId");

-- AddForeignKey
ALTER TABLE "ActivityVocab" ADD CONSTRAINT "ActivityVocab_vocabId_userId_fkey" FOREIGN KEY ("vocabId", "userId") REFERENCES "Vocabulary"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ActivityVocab" ADD CONSTRAINT "ActivityVocab_verbFormId_userId_fkey" FOREIGN KEY ("verbFormId", "userId") REFERENCES "VerbForm"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Practice" ADD CONSTRAINT "Practice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VerbForm" ADD CONSTRAINT "VerbForm_baseVocabId_userId_fkey" FOREIGN KEY ("baseVocabId", "userId") REFERENCES "Vocabulary"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "JapaneseProgressSnapshot" ADD CONSTRAINT "JapaneseProgressSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JapaneseInitialization" ADD CONSTRAINT "JapaneseInitialization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
