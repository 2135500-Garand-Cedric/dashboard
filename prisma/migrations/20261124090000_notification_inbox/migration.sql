ALTER TABLE "NotificationSettings"
  ADD COLUMN "inboxStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "categoryStartedAt" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "UserNotification" (
  "id" UUID NOT NULL,
  "userId" INTEGER NOT NULL,
  "occurrenceKey" VARCHAR(64) NOT NULL,
  "sourceKind" VARCHAR(20) NOT NULL,
  "sourceId" INTEGER NOT NULL,
  "category" VARCHAR(20) NOT NULL,
  "titleSnapshot" VARCHAR(150) NOT NULL,
  "labelSnapshot" VARCHAR(40) NOT NULL,
  "sourceDate" VARCHAR(10),
  "targetAt" TIMESTAMPTZ(3) NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "lifecycle" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "retiredReason" VARCHAR(40),
  "retiredAt" TIMESTAMPTZ(3),
  "readAt" TIMESTAMPTZ(3),
  "dismissedAt" TIMESTAMPTZ(3),
  "snoozedUntil" TIMESTAMPTZ(3),
  "generation" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "UserNotification_source_check" CHECK ("sourceKind" IN ('EVENT', 'DEADLINE', 'FOLLOW_UP', 'MILESTONE')),
  CONSTRAINT "UserNotification_lifecycle_check" CHECK ("lifecycle" IN ('ACTIVE', 'RESOLVED', 'SUPERSEDED', 'EXPIRED')),
  CONSTRAINT "UserNotification_generation_check" CHECK ("generation" >= 0 AND "revision" > 0)
);
CREATE UNIQUE INDEX "UserNotification_userId_occurrenceKey_key" ON "UserNotification"("userId", "occurrenceKey");
CREATE INDEX "UserNotification_userId_lifecycle_dueAt_id_idx" ON "UserNotification"("userId", "lifecycle", "dueAt", "id");
CREATE INDEX "UserNotification_userId_readAt_dismissedAt_snoozedUntil_idx" ON "UserNotification"("userId", "readAt", "dismissedAt", "snoozedUntil");
ALTER TABLE "PushDelivery" ADD COLUMN "notificationId" UUID, ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "UserNotification"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
DROP INDEX "PushDelivery_subscriptionId_occurrenceKey_key";
CREATE UNIQUE INDEX "PushDelivery_subscriptionId_occurrenceKey_generation_key" ON "PushDelivery"("subscriptionId", "occurrenceKey", "generation");
CREATE INDEX "PushDelivery_notificationId_idx" ON "PushDelivery"("notificationId");

-- A simple FK cannot enforce ownership across these two independent relations.
CREATE FUNCTION check_notification_delivery_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."notificationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "UserNotification" n JOIN "PushSubscription" s ON s."userId" = n."userId"
    WHERE n.id = NEW."notificationId" AND s.id = NEW."subscriptionId"
  ) THEN
    RAISE EXCEPTION 'Notification delivery ownership mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_delivery_owner BEFORE INSERT OR UPDATE ON "PushDelivery"
  FOR EACH ROW EXECUTE FUNCTION check_notification_delivery_owner();
-- Prevent later owner reassignment from breaking the same invariant.
CREATE FUNCTION immutable_notification_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" <> OLD."userId" THEN
    RAISE EXCEPTION 'Notification ownership cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_owner BEFORE UPDATE ON "UserNotification"
  FOR EACH ROW EXECUTE FUNCTION immutable_notification_owner();
CREATE TRIGGER subscription_owner BEFORE UPDATE ON "PushSubscription"
  FOR EACH ROW EXECUTE FUNCTION immutable_notification_owner();
