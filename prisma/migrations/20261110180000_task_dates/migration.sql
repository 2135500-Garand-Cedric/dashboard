BEGIN;
ALTER TABLE "Todo" ADD COLUMN "deadlineDate" VARCHAR(10), ADD COLUMN "deadlineAt" TIMESTAMPTZ(3), ADD COLUMN "deadlineTimeZone" VARCHAR(100);
CREATE INDEX "Todo_deadlineDate_idx" ON "Todo"("deadlineDate");
CREATE INDEX "Todo_deadlineAt_idx" ON "Todo"("deadlineAt");
CREATE TABLE "WorkFollowUp" (
 "id" SERIAL PRIMARY KEY, "todoId" INTEGER NOT NULL REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "date" VARCHAR(10), "at" TIMESTAMPTZ(3), "timeZone" VARCHAR(100), "reason" VARCHAR(2000),
 "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', "outcome" VARCHAR(2000), "resolvedAt" TIMESTAMPTZ(3),
 "previousId" INTEGER REFERENCES "WorkFollowUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkFollowUp_status_check" CHECK ("status" IN ('ACTIVE','COMPLETED','SNOOZED','CANCELLED')),
 CONSTRAINT "WorkFollowUp_resolution_check" CHECK (("status"='ACTIVE' AND "resolvedAt" IS NULL AND "outcome" IS NULL) OR ("status"<>'ACTIVE' AND "resolvedAt" IS NOT NULL AND "outcome" IS NOT NULL)),
 CONSTRAINT "WorkFollowUp_not_self" CHECK ("previousId" IS NULL OR "previousId"<>"id")
);
CREATE UNIQUE INDEX "WorkFollowUp_one_active" ON "WorkFollowUp"("todoId") WHERE "status"='ACTIVE';
CREATE UNIQUE INDEX "WorkFollowUp_previousId_key" ON "WorkFollowUp"("previousId");
CREATE INDEX "WorkFollowUp_todoId_status_idx" ON "WorkFollowUp"("todoId","status");
CREATE TABLE "WorkKeyDate" (
 "id" SERIAL PRIMARY KEY, "todoId" INTEGER NOT NULL REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "label" VARCHAR(120) NOT NULL CHECK (length(trim("label"))>0),
 "date" VARCHAR(10), "at" TIMESTAMPTZ(3), "timeZone" VARCHAR(100), "removedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "WorkKeyDate_todoId_removedAt_idx" ON "WorkKeyDate"("todoId","removedAt");
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_date_choice" CHECK (("deadlineDate" IS NULL AND "deadlineAt" IS NULL AND "deadlineTimeZone" IS NULL) OR ("deadlineDate" IS NOT NULL AND "deadlineAt" IS NULL AND "deadlineTimeZone" IS NULL) OR ("deadlineDate" IS NULL AND "deadlineAt" IS NOT NULL AND "deadlineTimeZone" IS NOT NULL));
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_valid_calendar_date" CHECK ("deadlineDate" IS NULL OR ("deadlineDate" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("deadlineDate"::date,'YYYY-MM-DD')="deadlineDate"));
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_valid_time_zone" CHECK ("deadlineTimeZone" IS NULL OR (length("deadlineTimeZone")>0 AND timezone("deadlineTimeZone","deadlineAt") IS NOT NULL));
ALTER TABLE "WorkFollowUp" ADD CONSTRAINT "WorkFollowUp_date_choice" CHECK (("date" IS NOT NULL AND "at" IS NULL AND "timeZone" IS NULL) OR ("date" IS NULL AND "at" IS NOT NULL AND "timeZone" IS NOT NULL));
ALTER TABLE "WorkFollowUp" ADD CONSTRAINT "WorkFollowUp_valid_calendar_date" CHECK ("date" IS NULL OR ("date" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("date"::date,'YYYY-MM-DD')="date"));
ALTER TABLE "WorkFollowUp" ADD CONSTRAINT "WorkFollowUp_valid_time_zone" CHECK ("timeZone" IS NULL OR (length("timeZone")>0 AND timezone("timeZone","at") IS NOT NULL));
ALTER TABLE "WorkKeyDate" ADD CONSTRAINT "WorkKeyDate_date_choice" CHECK (("date" IS NOT NULL AND "at" IS NULL AND "timeZone" IS NULL) OR ("date" IS NULL AND "at" IS NOT NULL AND "timeZone" IS NOT NULL));
ALTER TABLE "WorkKeyDate" ADD CONSTRAINT "WorkKeyDate_valid_calendar_date" CHECK ("date" IS NULL OR ("date" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("date"::date,'YYYY-MM-DD')="date"));
ALTER TABLE "WorkKeyDate" ADD CONSTRAINT "WorkKeyDate_valid_time_zone" CHECK ("timeZone" IS NULL OR (length("timeZone")>0 AND timezone("timeZone","at") IS NOT NULL));
-- No backfill: old dates remain unknown; Event is untouched.
COMMIT;
