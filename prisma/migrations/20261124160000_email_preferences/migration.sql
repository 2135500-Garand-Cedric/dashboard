BEGIN;
CREATE TABLE "EmailSettings" (
  "userId" INTEGER NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "recipient" VARCHAR(254),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CHECK (NOT "enabled" OR "recipient" IS NOT NULL)
);
-- Fail closed on upgrade: earlier queued messages have no dashboard consent.
-- Retain their history and payload; never replay them after the switch is enabled.
UPDATE "EmailDelivery" SET "status" = CASE WHEN "firstAttemptAt" IS NULL THEN 'FAILED' ELSE 'UNKNOWN' END,
  "errorCode" = 'EMAIL_DISABLED', "leaseUntil" = NULL, "claimToken" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING';
COMMIT;
