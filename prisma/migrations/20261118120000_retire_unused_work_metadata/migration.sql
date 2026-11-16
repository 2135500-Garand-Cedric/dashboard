BEGIN;
-- Preserve retired values in the existing append-only history before removing
-- them from the live task schema. Never alter XP/gold balances or task IDs.
INSERT INTO "WorkActivity" ("userId", "actorGithubId", "todoId", "todoReference", "action", "changes")
SELECT t."userId", 'schema-maintenance', t.id, 'TASK-' || lpad(t.id::text, greatest(4, length(t.id::text)), '0'),
  'RETIRED_METADATA_ARCHIVED', jsonb_build_object('retiredMetadata', jsonb_build_object(
    'before', jsonb_build_object(
      'company', t.company, 'course', t.course, 'tags', t.tags,
      'context', (SELECT to_jsonb(c) FROM "WorkContext" c WHERE c.id = t."contextId"),
      'waitingOnContact', (SELECT to_jsonb(c) FROM "WorkContact" c WHERE c.id = t."waitingOnContactId"),
      'rewardXp', t."rewardXp", 'rewardCoins', t."rewardCoins",
      'rewardAppliedXp', t."rewardAppliedXp", 'rewardAppliedCoins', t."rewardAppliedCoins",
      'rewardAccountingBasis', t."rewardAccountingBasis"),
    'after', NULL))
FROM "Todo" t
WHERE t.company IS NOT NULL OR t.course IS NOT NULL OR cardinality(t.tags) > 0
  OR t."contextId" IS NOT NULL OR t."waitingOnContactId" IS NOT NULL
  OR t."rewardXp" <> 0 OR t."rewardCoins" <> 0 OR t."rewardAppliedXp" <> 0
  OR t."rewardAppliedCoins" <> 0 OR t."rewardAccountingBasis" <> 'TRACKED';

INSERT INTO "WorkActivity" ("userId", "actorGithubId", "projectId", "action", "changes")
SELECT p."userId", 'schema-maintenance', p.id, 'RETIRED_METADATA_ARCHIVED',
  jsonb_build_object('retiredContext', jsonb_build_object('before', to_jsonb(c), 'after', NULL))
FROM "WorkProject" p JOIN "WorkContext" c ON c.id = p."contextId";

-- Also retain definitions that have never been assigned to a task/project.
INSERT INTO "WorkActivity" ("userId", "actorGithubId", "todoReference", "action", "changes")
SELECT c."userId", 'schema-maintenance', 'RETIRED-CONTEXT-' || c.id, 'RETIRED_CONTEXT_ARCHIVED',
  jsonb_build_object('contextDefinition', jsonb_build_object('before', to_jsonb(c), 'after', NULL))
FROM "WorkContext" c;

-- Contexts created since the earlier activity-type migrations must not lose
-- their classification. Existing explicit activity-type choices take precedence.
INSERT INTO "ActivityType" (name, color, active, "createdAt", "updatedAt")
SELECT DISTINCT ON (lower(trim(c.name))) trim(c.name), '#3b82f6', c.active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "WorkContext" c
WHERE (EXISTS (SELECT 1 FROM "Todo" t WHERE t."contextId" = c.id AND t."activityTypeId" IS NULL)
    OR EXISTS (SELECT 1 FROM "WorkProject" p WHERE p."contextId" = c.id AND p."activityTypeId" IS NULL))
  AND NOT EXISTS (SELECT 1 FROM "ActivityType" a WHERE lower(trim(a.name)) = lower(trim(c.name)))
ORDER BY lower(trim(c.name)), c.id;
UPDATE "Todo" t SET "activityTypeId" = (
  SELECT a.id FROM "WorkContext" c JOIN "ActivityType" a ON lower(trim(a.name)) = lower(trim(c.name))
  WHERE c.id = t."contextId" AND c."userId" = t."userId" ORDER BY a.id LIMIT 1
) WHERE t."activityTypeId" IS NULL AND t."contextId" IS NOT NULL;
UPDATE "WorkProject" p SET "activityTypeId" = (
  SELECT a.id FROM "WorkContext" c JOIN "ActivityType" a ON lower(trim(a.name)) = lower(trim(c.name))
  WHERE c.id = p."contextId" AND c."userId" = p."userId" ORDER BY a.id LIMIT 1
) WHERE p."activityTypeId" IS NULL AND p."contextId" IS NOT NULL;

ALTER TABLE "Todo"
  DROP COLUMN company, DROP COLUMN course, DROP COLUMN tags,
  DROP COLUMN "contextId", DROP COLUMN "waitingOnContactId",
  DROP COLUMN "rewardXp", DROP COLUMN "rewardCoins", DROP COLUMN "rewardAppliedXp",
  DROP COLUMN "rewardAppliedCoins", DROP COLUMN "rewardAccountingBasis";
ALTER TABLE "WorkProject" DROP COLUMN "contextId";
DROP TABLE "WorkContext";
COMMIT;
