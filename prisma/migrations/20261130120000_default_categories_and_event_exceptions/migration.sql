BEGIN;
ALTER TABLE "Category" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Category" SET name=CASE "normalizedName" WHEN 'verb' THEN 'Verb' ELSE 'Kanji' END,
 kind=CASE "normalizedName" WHEN 'verb' THEN 'VERB' ELSE 'KANJI' END, "isDefault"=true
 WHERE "normalizedName" IN ('verb','kanji');
INSERT INTO "Category" (name,"normalizedName",kind,"userId","isDefault")
 SELECT d.name,d.normalized,d.kind,u.id,true FROM "User" u
 CROSS JOIN (VALUES ('Verb','verb','VERB'),('Kanji','kanji','KANJI')) AS d(name,normalized,kind)
 WHERE NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."userId"=u.id AND c."normalizedName"=d.normalized);
CREATE UNIQUE INDEX "Category_default_kind_key" ON "Category" ("userId",kind) WHERE "isDefault";
ALTER TABLE "Event" ADD COLUMN "recurrenceException" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Event" SET "recurrenceException"=true WHERE "recurrenceId" IS NOT NULL AND revision>1;
COMMIT;
