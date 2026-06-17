-- Add optional tone/singer-tune selection to list items.
ALTER TABLE "ListItem"
  ADD COLUMN IF NOT EXISTS "selectedTonicity" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "selectedSingerTuneId" INTEGER;

CREATE INDEX IF NOT EXISTS "ListItem_selectedSingerTuneId_idx"
  ON "ListItem" ("selectedSingerTuneId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ListItem_selectedSingerTuneId_fkey'
  ) THEN
    ALTER TABLE "ListItem"
      ADD CONSTRAINT "ListItem_selectedSingerTuneId_fkey"
      FOREIGN KEY ("selectedSingerTuneId")
      REFERENCES "SongSingerTune"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END$$;
