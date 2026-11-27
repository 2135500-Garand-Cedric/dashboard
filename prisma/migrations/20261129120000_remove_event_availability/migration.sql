BEGIN;
-- Availability is no longer part of calendar events. Other event data is preserved.
ALTER TABLE "Event" DROP COLUMN "busy";
-- Future recurring copies must not try to insert the retired field.
UPDATE "RecurrenceSeries"
SET template = jsonb_set(template, '{data}', (template->'data') - 'busy')
WHERE kind = 'EVENT' AND jsonb_typeof(template->'data') = 'object' AND (template->'data') ? 'busy';
COMMIT;
