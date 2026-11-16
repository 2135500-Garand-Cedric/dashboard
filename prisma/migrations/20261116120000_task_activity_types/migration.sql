-- Keep legacy contexts and task IDs intact. Reuse matching calendar labels,
-- creating a label only for contexts currently used by tasks.
ALTER TABLE "Todo" ADD COLUMN "activityTypeId" INTEGER;
INSERT INTO "ActivityType" ("name", "color", "active", "createdAt", "updatedAt")
SELECT DISTINCT ON (lower(trim(c."name"))) trim(c."name"), '#3b82f6', c."active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "WorkContext" c
WHERE EXISTS (SELECT 1 FROM "Todo" t WHERE t."contextId" = c."id" AND t."userId" = c."userId")
  AND NOT EXISTS (SELECT 1 FROM "ActivityType" a WHERE lower(trim(a."name")) = lower(trim(c."name")))
ORDER BY lower(trim(c."name")), c."id";
UPDATE "Todo" t SET "activityTypeId" = (
  SELECT a."id" FROM "ActivityType" a JOIN "WorkContext" c ON c."id" = t."contextId" AND c."userId" = t."userId"
  WHERE lower(trim(a."name")) = lower(trim(c."name")) ORDER BY a."id" LIMIT 1
);
CREATE INDEX "Todo_activityTypeId_idx" ON "Todo"("activityTypeId");
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
