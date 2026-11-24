BEGIN;
CREATE TABLE "EmailDelivery" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" VARCHAR(50) NOT NULL,
  "dedupeKey" VARCHAR(150) NOT NULL,
  "payload" JSONB NOT NULL,
  "message" JSONB,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'UNKNOWN')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "claimToken" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstAttemptAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "providerId" VARCHAR(100),
  "errorCode" VARCHAR(40),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "EmailDelivery_userId_dedupeKey_key" ON "EmailDelivery"("userId", "dedupeKey");
CREATE INDEX "EmailDelivery_userId_status_nextAttemptAt_leaseUntil_idx"
  ON "EmailDelivery"("userId", "status", "nextAttemptAt", "leaseUntil");
COMMIT;
