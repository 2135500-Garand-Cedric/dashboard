/*
  Warnings:

  - You are about to drop the column `irregular` on the `VerbForm` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[activityId,verbFormId]` on the table `ActivityVocab` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."ActivityVocab" ADD COLUMN     "verbFormId" INTEGER,
ALTER COLUMN "vocabId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."VerbForm" DROP COLUMN "irregular";

-- CreateIndex
CREATE UNIQUE INDEX "ActivityVocab_activityId_verbFormId_key" ON "public"."ActivityVocab"("activityId", "verbFormId");

-- AddForeignKey
ALTER TABLE "public"."ActivityVocab" ADD CONSTRAINT "ActivityVocab_verbFormId_fkey" FOREIGN KEY ("verbFormId") REFERENCES "public"."VerbForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
