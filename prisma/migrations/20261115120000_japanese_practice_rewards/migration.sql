BEGIN;
ALTER TABLE "Practice" ADD COLUMN "xpEarned" INTEGER, ADD COLUMN "goldEarned" INTEGER;
ALTER TABLE "Practice" ADD CONSTRAINT "Practice_rewards_nonnegative" CHECK (("xpEarned" IS NULL OR "xpEarned" >= 0) AND ("goldEarned" IS NULL OR "goldEarned" >= 0));
COMMIT;
