INSERT INTO "VerbFormType" ("name", "description")
VALUES
  ('ba', 'ば conditional form'),
  ('nakereba', 'なければ negative conditional form')
ON CONFLICT ("name") DO NOTHING;
