BEGIN;
ALTER TABLE "ActivityVocab" ADD COLUMN "lastPracticed" TIMESTAMPTZ(3);

-- Recover only practice times that identify the exact word/form and activity.
-- A vocabulary-wide timestamp must never reset a different activity's timer.
WITH recorded AS (
  SELECT av.id, max(coalesce(p."completedAt", p.date) AT TIME ZONE 'UTC') AS practiced_at
  FROM "ActivityVocab" av
  LEFT JOIN "Vocabulary" v ON v.id = av."vocabId"
  LEFT JOIN "VerbForm" vf ON vf.id = av."verbFormId"
  LEFT JOIN "Vocabulary" base ON base.id = vf."baseVocabId"
  JOIN "Practice" p ON p."activityId" = av."activityId"
    AND p."userId" = coalesce(v."userId", base."userId")
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.words) = 'array' THEN p.words ELSE '[]'::jsonb END
  ) word
  WHERE word->>'activityVocabId' = av.id::text
    AND word->>'vocabId' = coalesce(av."vocabId", vf."baseVocabId")::text
  GROUP BY av.id
)
UPDATE "ActivityVocab" av SET "lastPracticed" = recorded.practiced_at
FROM recorded WHERE av.id = recorded.id;
-- Unknown dates stay null and are eligible for review until first practiced.
COMMIT;
