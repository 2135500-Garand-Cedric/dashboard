ALTER TABLE "Vocabulary" ADD COLUMN "readings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Vocabulary" SET "readings" = ARRAY["hiragana"];
