-- AlterTable
ALTER TABLE "public"."Vocabulary" ADD COLUMN     "addedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastPracticed" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."Practice" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wordCount" INTEGER NOT NULL,
    "perfectCount" INTEGER NOT NULL,
    "goodCount" INTEGER NOT NULL,
    "weakCount" INTEGER NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Practice" ADD CONSTRAINT "Practice_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
