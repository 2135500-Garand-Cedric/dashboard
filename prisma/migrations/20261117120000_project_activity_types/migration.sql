BEGIN;
-- Retain project IDs, legacy context references, tasks, stages and history.
ALTER TABLE "WorkProject" ADD COLUMN "activityTypeId" INTEGER;
INSERT INTO "ActivityType" ("name", "color", "active", "createdAt", "updatedAt")
SELECT DISTINCT ON (lower(trim(c."name"))) trim(c."name"), '#3b82f6', c."active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "WorkContext" c
WHERE EXISTS (SELECT 1 FROM "WorkProject" p WHERE p."contextId" = c.id AND p."userId" = c."userId")
  AND NOT EXISTS (SELECT 1 FROM "ActivityType" a WHERE lower(trim(a.name)) = lower(trim(c.name)))
ORDER BY lower(trim(c.name)), c.id;
UPDATE "WorkProject" p SET "activityTypeId" = (
  SELECT a.id FROM "ActivityType" a JOIN "WorkContext" c ON c.id = p."contextId" AND c."userId" = p."userId"
  WHERE lower(trim(a.name)) = lower(trim(c.name)) ORDER BY a.id LIMIT 1
);
CREATE INDEX "WorkProject_activityTypeId_idx" ON "WorkProject"("activityTypeId");
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
