-- Keep task/checklist IDs and every original field. Existing checklist rows are not promoted.
ALTER TABLE "Todo" ADD COLUMN "parentId" INTEGER;
CREATE INDEX "Todo_parentId_idx" ON "Todo"("parentId");
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_parent_not_self" CHECK ("parentId" IS NULL OR "parentId" <> "id");
CREATE TABLE "TodoDependency" (
  "dependentId" INTEGER NOT NULL, "prerequisiteId" INTEGER NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'USER', "legacyReviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TodoDependency_pkey" PRIMARY KEY ("dependentId", "prerequisiteId"),
  CONSTRAINT "TodoDependency_no_new_self" CHECK ("dependentId" <> "prerequisiteId" OR "legacyReviewReason" IS NOT NULL)
);
CREATE INDEX "TodoDependency_prerequisiteId_idx" ON "TodoDependency"("prerequisiteId");
ALTER TABLE "TodoDependency" ADD CONSTRAINT "TodoDependency_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TodoDependency" ADD CONSTRAINT "TodoDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "TodoRelation" (
  "firstId" INTEGER NOT NULL, "secondId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TodoRelation_pkey" PRIMARY KEY ("firstId", "secondId"),
  CONSTRAINT "TodoRelation_canonical_pair" CHECK ("firstId" < "secondId")
);
CREATE INDEX "TodoRelation_secondId_idx" ON "TodoRelation"("secondId");
ALTER TABLE "TodoRelation" ADD CONSTRAINT "TodoRelation_firstId_fkey" FOREIGN KEY ("firstId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TodoRelation" ADD CONSTRAINT "TodoRelation_secondId_fkey" FOREIGN KEY ("secondId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BEGIN LEGACY EDGE BACKFILL: direction is dependent -> prerequisite.
-- Import time is not a historical user action. Bad legacy edges with real endpoints
-- are preserved and explicitly marked for review; missing endpoints fail the FK and
-- roll the migration back rather than deleting or inventing a target.
WITH RECURSIVE walk AS (
  SELECT "id" AS start_id, "dependsOnId" AS current_id, ARRAY["id"] AS path
  FROM "Todo" WHERE "dependsOnId" IS NOT NULL
  UNION ALL
  SELECT w.start_id, t."dependsOnId", w.path || w.current_id
  FROM walk w JOIN "Todo" t ON t."id" = w.current_id
  WHERE w.current_id IS NOT NULL AND NOT w.current_id = ANY(w.path)
)
INSERT INTO "TodoDependency" ("dependentId", "prerequisiteId", "origin", "legacyReviewReason")
SELECT t."id", t."dependsOnId", 'LEGACY',
  CASE WHEN t."id" = t."dependsOnId" THEN 'SELF'
       WHEN p."userId" <> t."userId" THEN 'CROSS_OWNER'
       WHEN EXISTS (SELECT 1 FROM walk w WHERE w.start_id = t."id" AND w.current_id = ANY(w.path)) THEN 'CYCLE_PATH'
       ELSE NULL END
FROM "Todo" t LEFT JOIN "Todo" p ON p."id" = t."dependsOnId"
WHERE t."dependsOnId" IS NOT NULL
ON CONFLICT ("dependentId", "prerequisiteId") DO NOTHING;
-- END LEGACY EDGE BACKFILL
