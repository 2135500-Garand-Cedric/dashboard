CREATE UNIQUE INDEX "CalendarHoliday_id_userId_key" ON "CalendarHoliday"("id","userId");
CREATE TABLE "CalendarBirthday" (
 "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "name" VARCHAR(200) NOT NULL, "month" INTEGER NOT NULL, "day" INTEGER NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "CalendarBirthday_valid_date" CHECK ("month" BETWEEN 1 AND 12 AND "day" BETWEEN 1 AND EXTRACT(DAY FROM (make_date(2000,"month",1) + INTERVAL '1 month - 1 day')))
);
CREATE UNIQUE INDEX "CalendarBirthday_id_userId_key" ON "CalendarBirthday"("id","userId");
CREATE UNIQUE INDEX "CalendarBirthday_userId_name_month_day_key" ON "CalendarBirthday"("userId","name","month","day");
CREATE TABLE "CalendarOccasionTaskLink" (
 "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, "holidayId" INTEGER, "birthdayId" INTEGER, "todoId" INTEGER NOT NULL,
 "date" VARCHAR(10) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CalendarOccasionTaskLink_one_parent" CHECK (num_nonnulls("holidayId","birthdayId")=1),
 CONSTRAINT "CalendarOccasionTaskLink_holidayId_userId_fkey" FOREIGN KEY ("holidayId","userId") REFERENCES "CalendarHoliday"("id","userId") ON DELETE CASCADE ON UPDATE NO ACTION,
 CONSTRAINT "CalendarOccasionTaskLink_birthdayId_userId_fkey" FOREIGN KEY ("birthdayId","userId") REFERENCES "CalendarBirthday"("id","userId") ON DELETE CASCADE ON UPDATE NO ACTION,
 CONSTRAINT "CalendarOccasionTaskLink_todoId_userId_fkey" FOREIGN KEY ("todoId","userId") REFERENCES "Todo"("id","userId") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "CalendarOccasionTaskLink_holidayId_date_todoId_key" ON "CalendarOccasionTaskLink"("holidayId","date","todoId");
CREATE UNIQUE INDEX "CalendarOccasionTaskLink_birthdayId_date_todoId_key" ON "CalendarOccasionTaskLink"("birthdayId","date","todoId");
CREATE INDEX "CalendarOccasionTaskLink_todoId_date_idx" ON "CalendarOccasionTaskLink"("todoId","date");
