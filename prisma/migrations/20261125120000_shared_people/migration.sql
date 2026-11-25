BEGIN;
ALTER TABLE "WorkContact" ADD COLUMN "email" VARCHAR(254), ADD COLUMN "phone" VARCHAR(40), ADD COLUMN "notes" VARCHAR(2000);
ALTER TABLE "FinancialReimbursementPlan" ALTER COLUMN person TYPE VARCHAR(120);
ALTER TABLE "FinancialReimbursementPlan" ADD COLUMN "contactId" INTEGER;
CREATE TEMP TABLE reimbursement_people_map (
  "userId" INTEGER NOT NULL,
  key TEXT NOT NULL,
  "contactId" INTEGER NOT NULL,
  PRIMARY KEY ("userId", key)
) ON COMMIT DROP;
-- Reuse a uniquely identifiable existing contact. Ambiguous names get a separate
-- directory entry rather than guessing which existing person owes the money.
INSERT INTO reimbursement_people_map
SELECT p."userId", LOWER(TRIM(p.person)), MIN(c.id)
FROM (SELECT DISTINCT "userId", person FROM "FinancialReimbursementPlan") p
JOIN "WorkContact" c ON c."userId" = p."userId" AND LOWER(TRIM(c.name)) = LOWER(TRIM(p.person))
GROUP BY p."userId", LOWER(TRIM(p.person)) HAVING COUNT(DISTINCT c.id) = 1;
WITH names AS (
  SELECT p."userId", LOWER(TRIM(p.person)) AS key, MIN(TRIM(p.person)) AS name
  FROM "FinancialReimbursementPlan" p
  LEFT JOIN reimbursement_people_map m ON m."userId" = p."userId" AND m.key = LOWER(TRIM(p.person))
  WHERE m."contactId" IS NULL GROUP BY p."userId", LOWER(TRIM(p.person))
), inserted AS (
  INSERT INTO "WorkContact" ("userId", name, notes, active, revision, "createdAt", "updatedAt")
  SELECT "userId", name, 'Created from existing reimbursement tracking.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM names
  RETURNING id, "userId", name
)
INSERT INTO reimbursement_people_map SELECT "userId", LOWER(TRIM(name)), id FROM inserted;
UPDATE "FinancialReimbursementPlan" p SET "contactId" = m."contactId"
FROM reimbursement_people_map m WHERE m."userId" = p."userId" AND m.key = LOWER(TRIM(p.person));
ALTER TABLE "FinancialReimbursementPlan" ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "FinancialReimbursementPlan" ADD CONSTRAINT "FinancialReimbursementPlan_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "WorkContact"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "FinancialReimbursementPlan_expenseId_person_key";
CREATE UNIQUE INDEX "FinancialReimbursementPlan_expenseId_contactId_key" ON "FinancialReimbursementPlan"("expenseId", "contactId");
CREATE INDEX "FinancialReimbursementPlan_contactId_idx" ON "FinancialReimbursementPlan"("contactId");
COMMIT;
