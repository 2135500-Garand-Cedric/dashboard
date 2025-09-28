-- CreateEnum
CREATE TYPE "public"."ActivityVocabStatus" AS ENUM ('WEAK', 'GOOD', 'PERFECT');

-- CreateTable
CREATE TABLE "public"."Activity" (
    "id" SERIAL NOT NULL,
    "activity" TEXT NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivityVocab" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "vocabId" INTEGER NOT NULL,
    "status" "public"."ActivityVocabStatus" NOT NULL DEFAULT 'WEAK',

    CONSTRAINT "ActivityVocab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vocabulary" (
    "id" SERIAL NOT NULL,
    "english" TEXT NOT NULL,
    "japanese" TEXT,
    "hiragana" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "readHiragana" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityVocab_activityId_vocabId_key" ON "public"."ActivityVocab"("activityId", "vocabId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "public"."Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vocabulary_english_hiragana_userId_key" ON "public"."Vocabulary"("english", "hiragana", "userId");

-- AddForeignKey
ALTER TABLE "public"."ActivityVocab" ADD CONSTRAINT "ActivityVocab_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityVocab" ADD CONSTRAINT "ActivityVocab_vocabId_fkey" FOREIGN KEY ("vocabId") REFERENCES "public"."Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Vocabulary" ADD CONSTRAINT "Vocabulary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Vocabulary" ADD CONSTRAINT "Vocabulary_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
