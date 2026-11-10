-- Add contacts and optional people associations; no inferred people or history.
CREATE TABLE "WorkContact" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "company" VARCHAR(120),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkContact_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Todo" ADD COLUMN "requesterId" INTEGER, ADD COLUMN "waitingOnContactId" INTEGER;
CREATE TABLE "TodoAffectedContact" (
  "todoId" INTEGER NOT NULL,
  "contactId" INTEGER NOT NULL,
  CONSTRAINT "TodoAffectedContact_pkey" PRIMARY KEY ("todoId", "contactId")
);
CREATE INDEX "WorkContact_userId_active_name_idx" ON "WorkContact"("userId", "active", "name");
CREATE INDEX "Todo_requesterId_idx" ON "Todo"("requesterId");
CREATE INDEX "Todo_waitingOnContactId_idx" ON "Todo"("waitingOnContactId");
CREATE INDEX "TodoAffectedContact_contactId_idx" ON "TodoAffectedContact"("contactId");
ALTER TABLE "WorkContact" ADD CONSTRAINT "WorkContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "WorkContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_waitingOnContactId_fkey" FOREIGN KEY ("waitingOnContactId") REFERENCES "WorkContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TodoAffectedContact" ADD CONSTRAINT "TodoAffectedContact_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TodoAffectedContact" ADD CONSTRAINT "TodoAffectedContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WorkContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
