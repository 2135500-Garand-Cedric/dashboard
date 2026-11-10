BEGIN;
-- Existing timestamp(3) values remain untouched. Prisma's existing UTC convention is retained.
ALTER TABLE "Event" ADD COLUMN "kind" VARCHAR(30) NOT NULL DEFAULT 'ORDINARY', ADD COLUMN "busy" BOOLEAN,
 ADD COLUMN "timeZone" VARCHAR(100), ADD COLUMN "allDayStart" VARCHAR(10), ADD COLUMN "allDayEnd" VARCHAR(10);
ALTER TABLE "Event" ADD CONSTRAINT "Event_kind_check" CHECK ("kind" IN ('ORDINARY','INFORMATIONAL','WORK_SESSION'));
ALTER TABLE "Event" ADD CONSTRAINT "Event_timing_choice" CHECK (
 ("allDayStart" IS NULL AND "allDayEnd" IS NULL AND ("endDate" IS NULL OR ("date" IS NOT NULL AND "endDate">"date"))) OR
 ("allDayStart" IS NOT NULL AND "allDayEnd" IS NOT NULL AND "date" IS NULL AND "endDate" IS NULL AND "timeZone" IS NULL AND "allDayEnd">"allDayStart"));
ALTER TABLE "Event" ADD CONSTRAINT "Event_calendar_dates" CHECK ("allDayStart" IS NULL OR
 ("allDayStart" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("allDayStart"::date,'YYYY-MM-DD')="allDayStart"
 AND "allDayEnd" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("allDayEnd"::date,'YYYY-MM-DD')="allDayEnd"));
ALTER TABLE "Event" ADD CONSTRAINT "Event_session_times" CHECK ("kind"<>'WORK_SESSION' OR ("date" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate">"date" AND "timeZone" IS NOT NULL AND "allDayStart" IS NULL));
ALTER TABLE "Event" ADD CONSTRAINT "Event_time_zone" CHECK ("timeZone" IS NULL OR ("date" IS NOT NULL AND length("timeZone")>0 AND timezone("timeZone","date") IS NOT NULL));
CREATE TABLE "EventTaskLink" (
 "eventId" INTEGER NOT NULL REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "todoId" INTEGER NOT NULL REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "role" VARCHAR(30) NOT NULL DEFAULT 'RELATED' CHECK ("role" IN ('RELATED','SESSION_TARGET')),
 "origin" TEXT NOT NULL DEFAULT 'USER', "legacyReviewReason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("eventId","todoId")
);
CREATE INDEX "EventTaskLink_todoId_idx" ON "EventTaskLink"("todoId");
CREATE UNIQUE INDEX "EventTaskLink_one_target" ON "EventTaskLink"("eventId") WHERE "role"='SESSION_TARGET';
-- BEGIN LEGACY EVENT LINKS
INSERT INTO "EventTaskLink" ("eventId","todoId","role","origin","legacyReviewReason")
 SELECT e."id",e."linkedTodoId",'RELATED','LEGACY',CASE WHEN t."userId"<>e."userId" THEN 'CROSS_OWNER' ELSE NULL END
 FROM "Event" e JOIN "Todo" t ON t."id"=e."linkedTodoId" WHERE e."linkedTodoId" IS NOT NULL
 ON CONFLICT DO NOTHING;
-- END LEGACY EVENT LINKS
CREATE TABLE "WorkEventConversion" (
 "id" SERIAL PRIMARY KEY, "eventId" INTEGER REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "sourceEventId" INTEGER NOT NULL, "todoId" INTEGER NOT NULL REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "mode" TEXT NOT NULL CHECK ("mode" IN ('RELATED','PLACEHOLDER')), "active" BOOLEAN NOT NULL DEFAULT true,
 "intentHash" VARCHAR(64) NOT NULL, "sourceSnapshot" JSONB NOT NULL, "beforeDeadline" JSONB NOT NULL, "afterDeadline" JSONB NOT NULL,
 "deadlineChanged" BOOLEAN NOT NULL, "eventRevisionAfter" INTEGER NOT NULL, "taskRevisionAfter" INTEGER NOT NULL,
 "createdTask" BOOLEAN NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "undoneAt" TIMESTAMP(3)
);
CREATE INDEX "WorkEventConversion_eventId_active_idx" ON "WorkEventConversion"("eventId","active");
CREATE INDEX "WorkEventConversion_todoId_idx" ON "WorkEventConversion"("todoId");
CREATE UNIQUE INDEX "WorkEventConversion_one_active" ON "WorkEventConversion"("eventId") WHERE "active"=true;
CREATE TABLE "WorkEventActivity" (
 "id" SERIAL PRIMARY KEY, "eventId" INTEGER REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "sourceEventId" INTEGER NOT NULL, "userId" INTEGER NOT NULL, "actorGithubId" TEXT NOT NULL,
 "action" TEXT NOT NULL, "changes" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorkEventActivity_eventId_createdAt_idx" ON "WorkEventActivity"("eventId","createdAt");
-- Deferred check permits atomic event+target changes, including creation/deletion.
CREATE FUNCTION check_work_session_target() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_id integer; event_kind text; event_owner integer; targets integer;
BEGIN
 IF TG_TABLE_NAME='Event' THEN event_id=COALESCE(NEW."id",OLD."id"); ELSE event_id=COALESCE(NEW."eventId",OLD."eventId"); END IF;
 SELECT "kind","userId" INTO event_kind,event_owner FROM "Event" WHERE "id"=event_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*) INTO targets FROM "EventTaskLink" l JOIN "Todo" t ON t."id"=l."todoId" WHERE l."eventId"=event_id AND l."role"='SESSION_TARGET' AND t."userId"=event_owner;
 IF (event_kind='WORK_SESSION' AND targets<>1) OR (event_kind<>'WORK_SESSION' AND EXISTS(SELECT 1 FROM "EventTaskLink" WHERE "eventId"=event_id AND "role"='SESSION_TARGET')) THEN RAISE EXCEPTION 'Invalid work session target'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Event_session_target" AFTER INSERT OR UPDATE ON "Event" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_work_session_target();
CREATE CONSTRAINT TRIGGER "EventTaskLink_session_target" AFTER INSERT OR UPDATE OR DELETE ON "EventTaskLink" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_work_session_target();
COMMIT;
