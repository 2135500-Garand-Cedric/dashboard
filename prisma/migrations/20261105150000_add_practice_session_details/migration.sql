ALTER TABLE "Practice"
  ADD COLUMN "userId" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "sessionKey" TEXT,
  ADD COLUMN "activityName" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "averageBefore" DOUBLE PRECISION,
  ADD COLUMN "averageAfter" DOUBLE PRECISION,
  ADD COLUMN "selectedCategories" JSONB,
  ADD COLUMN "starredOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "words" JSONB;

CREATE UNIQUE INDEX "Practice_sessionKey_key" ON "Practice"("sessionKey");
CREATE INDEX "Practice_userId_date_idx" ON "Practice"("userId", "date");
