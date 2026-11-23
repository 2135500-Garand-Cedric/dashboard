-- Additive only: existing task/event IDs, dates, relationships and history remain intact.
ALTER TABLE "User" ADD COLUMN "holidayCountry" VARCHAR(2), ADD COLUMN "holidayRegion" VARCHAR(10), ADD COLUMN "holidayBanks" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "RecurrenceSeries" (
 "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "kind" VARCHAR(10) NOT NULL CHECK ("kind" IN ('TASK','EVENT')),
 "frequency" VARCHAR(10) NOT NULL CHECK ("frequency" IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
 "anchor" VARCHAR(19) NOT NULL, "timeZone" VARCHAR(100) NOT NULL, "until" VARCHAR(10),
 "active" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1,
 "template" JSONB NOT NULL, "generatedThrough" VARCHAR(10) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 UNIQUE ("id", "userId")
);
CREATE INDEX "RecurrenceSeries_userId_active_generatedThrough_idx" ON "RecurrenceSeries"("userId","active","generatedThrough");
ALTER TABLE "Todo" ADD COLUMN "recurrenceId" INTEGER, ADD COLUMN "recurrenceDate" VARCHAR(10), ADD CONSTRAINT "Todo_recurrenceId_userId_fkey" FOREIGN KEY ("recurrenceId","userId") REFERENCES "RecurrenceSeries"("id","userId") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "Event" ADD COLUMN "recurrenceId" INTEGER, ADD COLUMN "recurrenceDate" VARCHAR(10), ADD CONSTRAINT "Event_recurrenceId_userId_fkey" FOREIGN KEY ("recurrenceId","userId") REFERENCES "RecurrenceSeries"("id","userId") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE UNIQUE INDEX "Todo_recurrenceId_recurrenceDate_key" ON "Todo"("recurrenceId","recurrenceDate");
CREATE UNIQUE INDEX "Event_recurrenceId_recurrenceDate_key" ON "Event"("recurrenceId","recurrenceDate");
CREATE TABLE "RecurrenceSkip" (
 "id" SERIAL PRIMARY KEY, "recurrenceId" INTEGER NOT NULL REFERENCES "RecurrenceSeries"("id") ON DELETE CASCADE,
 "date" VARCHAR(10) NOT NULL, UNIQUE ("recurrenceId","date")
);
