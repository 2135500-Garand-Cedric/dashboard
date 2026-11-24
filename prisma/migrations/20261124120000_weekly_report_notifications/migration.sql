-- Add one opt-out category; existing preferences, reminders and deliveries remain.
BEGIN;
ALTER TABLE "NotificationSettings"
  ADD COLUMN "weeklyReports" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "UserNotification" DROP CONSTRAINT "UserNotification_source_check";
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_source_check"
  CHECK ("sourceKind" IN ('EVENT', 'DEADLINE', 'FOLLOW_UP', 'MILESTONE', 'WEEKLY_REPORT'));

ALTER TABLE "PushDelivery" DROP CONSTRAINT "PushDelivery_sourceKind_check";
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_sourceKind_check"
  CHECK ("sourceKind" IN ('EVENT', 'DEADLINE', 'FOLLOW_UP', 'MILESTONE', 'WEEKLY_REPORT'));
COMMIT;
