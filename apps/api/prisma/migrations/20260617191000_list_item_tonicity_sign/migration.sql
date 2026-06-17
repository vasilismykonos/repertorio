ALTER TABLE "ListItem"
  ADD COLUMN IF NOT EXISTS "selectedTonicitySign" CHAR(1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ListItem_selectedTonicitySign_check'
  ) THEN
    ALTER TABLE "ListItem"
      ADD CONSTRAINT "ListItem_selectedTonicitySign_check"
      CHECK ("selectedTonicitySign" IS NULL OR "selectedTonicitySign" IN ('+', '-'));
  END IF;
END $$;
