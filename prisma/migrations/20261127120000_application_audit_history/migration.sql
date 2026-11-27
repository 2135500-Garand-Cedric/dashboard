ALTER TABLE "User" ADD COLUMN "auditStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorKind" VARCHAR(12) NOT NULL CHECK ("actorKind" IN ('OWNER','SYSTEM','ANONYMOUS')),
  "actorGithubId" VARCHAR(30), "category" VARCHAR(30) NOT NULL,
  "action" VARCHAR(100) NOT NULL, "outcome" VARCHAR(12) NOT NULL,
  "entityType" VARCHAR(50) NOT NULL, "entityId" VARCHAR(128),
  "entityReference" VARCHAR(160) NOT NULL, "summary" VARCHAR(300) NOT NULL,
  "changes" JSONB NOT NULL, "operationKey" VARCHAR(240) NOT NULL,
  "eventKey" VARCHAR(240) NOT NULL, "originType" VARCHAR(50), "originId" VARCHAR(128)
);
CREATE UNIQUE INDEX "AuditEvent_userId_eventKey_key" ON "AuditEvent"("userId","eventKey");
CREATE INDEX "AuditEvent_userId_occurredAt_id_idx" ON "AuditEvent"("userId","occurredAt","id");
CREATE INDEX "AuditEvent_userId_category_occurredAt_id_idx" ON "AuditEvent"("userId","category","occurredAt","id");
CREATE INDEX "AuditEvent_userId_entityType_entityId_occurredAt_idx" ON "AuditEvent"("userId","entityType","entityId","occurredAt");
