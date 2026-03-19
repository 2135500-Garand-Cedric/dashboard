-- AlterTable
ALTER TABLE "public"."Vocabulary" ADD COLUMN     "verbType" TEXT;

-- CreateTable
CREATE TABLE "public"."VerbFormType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "VerbFormType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerbForm" (
    "id" SERIAL NOT NULL,
    "baseVocabId" INTEGER NOT NULL,
    "formTypeId" INTEGER NOT NULL,
    "form" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "irregular" BOOLEAN,

    CONSTRAINT "VerbForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerbFormType_name_key" ON "public"."VerbFormType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "VerbForm_baseVocabId_formTypeId_key" ON "public"."VerbForm"("baseVocabId", "formTypeId");

-- AddForeignKey
ALTER TABLE "public"."VerbForm" ADD CONSTRAINT "VerbForm_baseVocabId_fkey" FOREIGN KEY ("baseVocabId") REFERENCES "public"."Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VerbForm" ADD CONSTRAINT "VerbForm_formTypeId_fkey" FOREIGN KEY ("formTypeId") REFERENCES "public"."VerbFormType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
