CREATE TYPE "WorkPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');
CREATE TYPE "WorkTaskKind" AS ENUM ('TASK', 'ISSUE', 'REQUEST', 'IMPROVEMENT', 'MAINTENANCE');
CREATE TYPE "WorkClosureType" AS ENUM ('OUTCOME_ACHIEVED', 'ACCEPTED_WORKAROUND', 'CANCELLED');
CREATE TABLE "WorkContext" (
  "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, "key" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL, "normalizedName" VARCHAR(80) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkContext_userId_key_key" ON "WorkContext"("userId", "key");
CREATE UNIQUE INDEX "WorkContext_userId_normalizedName_key" ON "WorkContext"("userId", "normalizedName");
-- Catalog definitions only. No tasks, example people or inferred task classifications.
INSERT INTO "WorkContext" ("userId", "key", "name", "normalizedName", "updatedAt")
SELECT u."id", d.key, d.name, lower(d.name), CURRENT_TIMESTAMP FROM "User" u
CROSS JOIN (VALUES ('work','Work'),('school','School'),('personal','Personal')) AS d(key,name)
WHERE u."id" = 1;
ALTER TABLE "Todo"
  ADD COLUMN "priorityLevel" "WorkPriority",
  ADD COLUMN "kind" "WorkTaskKind",
  ADD COLUMN "contextId" INTEGER,
  ADD COLUMN "company" TEXT, ADD COLUMN "course" TEXT, ADD COLUMN "system" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "desiredOutcome" TEXT, ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "waitingOn" TEXT, ADD COLUMN "waitingReason" TEXT,
  ADD COLUMN "workaround" TEXT, ADD COLUMN "completionSummary" TEXT,
  ADD COLUMN "closureType" "WorkClosureType",
  ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);
-- Preserve raw priority and every original field, timestamp, state, link and balance.
-- Unknown numeric priorities remain unclassified in the canonical field.
UPDATE "Todo" SET "priorityLevel" = CASE
  WHEN "priority" = 1 THEN 'LOW'::"WorkPriority"
  WHEN "priority" = 2 OR "priority" IS NULL THEN 'NORMAL'::"WorkPriority"
  WHEN "priority" = 3 THEN 'HIGH'::"WorkPriority"
  ELSE NULL END;
ALTER TABLE "Todo" ALTER COLUMN "status" SET DEFAULT 'NEW';
ALTER TABLE "Todo" ALTER COLUMN "priorityLevel" SET DEFAULT 'NORMAL';
-- Defaults below apply only to future rows. Legacy kind/context/closure remain unknown.
ALTER TABLE "Todo" ALTER COLUMN "kind" SET DEFAULT 'TASK';
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "WorkContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Todo_userId_archivedAt_status_idx" ON "Todo"("userId", "archivedAt", "status");
CREATE INDEX "Todo_contextId_idx" ON "Todo"("contextId");
CREATE TABLE "WorkActivity" (
  "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, "actorGithubId" TEXT NOT NULL,
  "todoId" INTEGER, "todoReference" TEXT NOT NULL, "action" TEXT NOT NULL,
  "changes" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkActivity_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "WorkActivity_userId_todoId_createdAt_idx" ON "WorkActivity"("userId", "todoId", "createdAt");
CREATE INDEX "WorkActivity_userId_todoReference_createdAt_idx" ON "WorkActivity"("userId", "todoReference", "createdAt");
-- Deliberately no historical completion timestamps or activity backfill.
