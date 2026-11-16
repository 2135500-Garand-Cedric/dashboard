BEGIN;
-- The column was removed from Prisma long ago; current practice history uses
-- Practice sessions and Vocabulary.lastPracticed. Do not discard older values
-- if this migration is applied to a database that still contains them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ActivityVocab" WHERE "lastPracticed" IS NOT NULL) THEN
    RAISE EXCEPTION 'ActivityVocab.lastPracticed contains historical values. Preserve/review those values before retiring this column.';
  END IF;
END $$;
ALTER TABLE "ActivityVocab" DROP COLUMN "lastPracticed";
COMMIT;
