ALTER TABLE "Song"
  ADD COLUMN IF NOT EXISTS "isInstrumental" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Song_isInstrumental_idx"
  ON "Song"("isInstrumental");

CREATE TABLE IF NOT EXISTS "_migration_backup_SongTag_Organiko_20260620" AS
SELECT st.*
FROM "SongTag" st
JOIN "Tag" t ON t.id = st."tagId"
WHERE t.title = 'Οργανικό'
   OR lower(t.slug) = lower('οργανικό');

UPDATE "Song" s
SET "isInstrumental" = true
WHERE EXISTS (
  SELECT 1
  FROM "SongTag" st
  JOIN "Tag" t ON t.id = st."tagId"
  WHERE st."songId" = s.id
    AND (
      t.title = 'Οργανικό'
      OR lower(t.slug) = lower('οργανικό')
    )
);

DELETE FROM "SongTag" st
USING "Tag" t
WHERE st."tagId" = t.id
  AND (
    t.title = 'Οργανικό'
    OR lower(t.slug) = lower('οργανικό')
  );
