CREATE TABLE "JapaneseProgressSnapshot" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "day" TEXT NOT NULL,
  "average" DOUBLE PRECISION NOT NULL,
  "vocabularyCount" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JapaneseProgressSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JapaneseProgressSnapshot_userId_day_key" ON "JapaneseProgressSnapshot"("userId", "day");
