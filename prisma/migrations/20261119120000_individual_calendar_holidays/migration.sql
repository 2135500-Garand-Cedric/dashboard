-- Preserve old preferences until their one-time conversion into individual choices.
ALTER TABLE "User" ADD COLUMN "holidaySelectionConfigured" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "CalendarHoliday" (
 "id" SERIAL PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "key" VARCHAR(64) NOT NULL,
 "country" VARCHAR(2) NOT NULL, "state" VARCHAR(20) NOT NULL DEFAULT '', "region" VARCHAR(30) NOT NULL DEFAULT '',
 "location" VARCHAR(500) NOT NULL, "name" VARCHAR(500) NOT NULL, "type" VARCHAR(20) NOT NULL,
 "rule" VARCHAR(1000) NOT NULL, "options" JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CalendarHoliday_userId_key_key" ON "CalendarHoliday"("userId","key");
CREATE INDEX "CalendarHoliday_userId_idx" ON "CalendarHoliday"("userId");
