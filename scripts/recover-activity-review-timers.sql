-- One-time repair for the failed 20261118122000_restore_activity_review_timers
-- migration when the original lastPracticed column was retained.
-- Back up first and stop the app/worker. Run with psql -v ON_ERROR_STOP=1.
-- This file never updates Prisma migration history.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';
SET LOCAL TIME ZONE 'UTC';

LOCK TABLE public."ActivityVocab" IN ACCESS EXCLUSIVE MODE;

DO $recovery$
DECLARE
  stored_type text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."_prisma_migrations"
    WHERE migration_name = '20261118121000_drop_unused_practice_timestamp'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public."_prisma_migrations"
    WHERE migration_name = '20261118122000_restore_activity_review_timers'
      AND finished_at IS NULL AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unexpected migration state. Stop and review before recovery.';
  END IF;

  SELECT data_type INTO stored_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ActivityVocab'
    AND column_name = 'lastPracticed';

  IF stored_type = 'timestamp without time zone' THEN
    -- Prisma wrote the original DateTime values as UTC, independent of the
    -- PostgreSQL session timezone. Explicit UTC avoids shifting those instants.
    ALTER TABLE public."ActivityVocab"
      ALTER COLUMN "lastPracticed" TYPE TIMESTAMPTZ(3)
      USING "lastPracticed" AT TIME ZONE 'UTC';
  ELSIF stored_type IS DISTINCT FROM 'timestamp with time zone' THEN
    RAISE EXCEPTION 'Expected an existing timestamp column; found %.', stored_type;
  END IF;
END
$recovery$;

CREATE TEMP TABLE review_timer_before ON COMMIT DROP AS
SELECT id, status, "lastPracticed" FROM public."ActivityVocab";

-- Same exact activity/word/form/owner matching as the original backfill.
-- Retain existing dates when saved session history is missing or older.
WITH recorded AS (
  SELECT av.id, max(coalesce(p."completedAt", p.date) AT TIME ZONE 'UTC') AS practiced_at
  FROM public."ActivityVocab" av
  LEFT JOIN public."Vocabulary" v ON v.id = av."vocabId"
  LEFT JOIN public."VerbForm" vf ON vf.id = av."verbFormId"
  LEFT JOIN public."Vocabulary" base ON base.id = vf."baseVocabId"
  JOIN public."Practice" p ON p."activityId" = av."activityId"
    AND p."userId" = coalesce(v."userId", base."userId")
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.words) = 'array' THEN p.words ELSE '[]'::jsonb END
  ) word
  WHERE word->>'activityVocabId' = av.id::text
    AND word->>'vocabId' = coalesce(av."vocabId", vf."baseVocabId")::text
  GROUP BY av.id
)
UPDATE public."ActivityVocab" av
SET "lastPracticed" = recorded.practiced_at
FROM recorded
WHERE av.id = recorded.id
  AND (av."lastPracticed" IS NULL OR av."lastPracticed" < recorded.practiced_at);

DO $verification$
BEGIN
  IF (SELECT count(*) FROM public."ActivityVocab") <>
     (SELECT count(*) FROM review_timer_before)
    OR EXISTS (
      SELECT 1 FROM review_timer_before before
      LEFT JOIN public."ActivityVocab" after ON after.id = before.id
      WHERE after.id IS NULL OR after.status IS DISTINCT FROM before.status
        OR (before."lastPracticed" IS NOT NULL AND
          (after."lastPracticed" IS NULL OR after."lastPracticed" < before."lastPracticed"))
    ) THEN
    RAISE EXCEPTION 'Preservation check failed; recovery rolled back.';
  END IF;
END
$verification$;

SELECT
  (SELECT count(*) FROM review_timer_before) AS records_before,
  count(*) AS records_after,
  (SELECT count("lastPracticed") FROM review_timer_before) AS dated_before,
  count("lastPracticed") AS dated_after
FROM public."ActivityVocab";

SELECT data_type, datetime_precision FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ActivityVocab'
  AND column_name = 'lastPracticed';
COMMIT;
