BEGIN;
ALTER TABLE "Event" ADD COLUMN "reminderMinutes" INTEGER;
ALTER TABLE "Event" ADD CONSTRAINT "Event_reminderMinutes_check" CHECK ("reminderMinutes" IS NULL OR "reminderMinutes" IN (-1,0,5,15,30,60,1440,10080));
CREATE TABLE "NotificationSettings" (
  "userId" INTEGER PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  events BOOLEAN NOT NULL DEFAULT true,
  sessions BOOLEAN NOT NULL DEFAULT true,
  deadlines BOOLEAN NOT NULL DEFAULT true,
  "followUps" BOOLEAN NOT NULL DEFAULT true,
  milestones BOOLEAN NOT NULL DEFAULT false,
  "showDetails" BOOLEAN NOT NULL DEFAULT true,
  "leadMinutes" INTEGER NOT NULL DEFAULT 15 CHECK ("leadMinutes" IN (0,5,15,30,60,1440,10080)),
  "dateOnlyTime" VARCHAR(5) NOT NULL DEFAULT '09:00' CHECK ("dateOnlyTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "enabledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workerSeenAt" TIMESTAMPTZ(3),
  "workerError" VARCHAR(30),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "PushSubscription" (
  id UUID PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "vapidPublicKey" TEXT NOT NULL,
  label VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "lastSuccessAt" TIMESTAMPTZ(3),
  "lastTestAt" TIMESTAMPTZ(3)
);
CREATE INDEX "PushSubscription_userId_active_idx" ON "PushSubscription"("userId", active);
CREATE TABLE "PushDelivery" (
  id UUID PRIMARY KEY,
  "subscriptionId" UUID NOT NULL REFERENCES "PushSubscription"(id) ON DELETE CASCADE,
  "occurrenceKey" VARCHAR(64) NOT NULL,
  "sourceKind" VARCHAR(20) NOT NULL CHECK ("sourceKind" IN ('EVENT','DEADLINE','FOLLOW_UP','MILESTONE')),
  "sourceId" INTEGER NOT NULL,
  "targetAt" TIMESTAMPTZ(3) NOT NULL,
  "sendAt" TIMESTAMPTZ(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMPTZ(3),
  "errorCode" VARCHAR(30),
  "sentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "PushDelivery_subscriptionId_occurrenceKey_key" ON "PushDelivery"("subscriptionId", "occurrenceKey");
CREATE INDEX "PushDelivery_status_nextAttemptAt_leaseUntil_idx" ON "PushDelivery"(status, "nextAttemptAt", "leaseUntil");
COMMIT;
