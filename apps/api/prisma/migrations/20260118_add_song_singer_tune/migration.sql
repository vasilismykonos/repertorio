-- apps/api/prisma/migrations/20260118_add_song_singer_tune/migration.sql

-- 1) Create table (canonical)
CREATE TABLE IF NOT EXISTS app."SongSingerTune" (
  id                      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "songId"                integer NOT NULL,
  "singerUserId"          integer NOT NULL,
  "createdByUserId"       integer NULL,
  "tune"                  varchar(32) NOT NULL,

  -- legacy-only (nullable for new rows)
  "legacyUserTuneId"      integer NULL,
  "legacySongId"          integer NULL,
  "singerLegacyUserId"    integer NULL,
  "createdByLegacyUserId" integer NULL,

  "createdAt"             timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) Make legacyUserTuneId nullable (safe even if already nullable)
ALTER TABLE app."SongSingerTune"
  ALTER COLUMN "legacyUserTuneId" DROP NOT NULL;

-- 3) Constraints + FKs (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SongSingerTune_songId_singerUserId_key') THEN
    ALTER TABLE app."SongSingerTune"
      ADD CONSTRAINT "SongSingerTune_songId_singerUserId_key"
      UNIQUE ("songId", "singerUserId");
  END IF;

  -- Unique legacy id (allows multiple NULLs in Postgres)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SongSingerTune_legacyUserTuneId_key') THEN
    ALTER TABLE app."SongSingerTune"
      ADD CONSTRAINT "SongSingerTune_legacyUserTuneId_key"
      UNIQUE ("legacyUserTuneId");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SongSingerTune_songId_fkey') THEN
    ALTER TABLE app."SongSingerTune"
      ADD CONSTRAINT "SongSingerTune_songId_fkey"
      FOREIGN KEY ("songId") REFERENCES app."Song"(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SongSingerTune_singerUserId_fkey') THEN
    ALTER TABLE app."SongSingerTune"
      ADD CONSTRAINT "SongSingerTune_singerUserId_fkey"
      FOREIGN KEY ("singerUserId") REFERENCES app."User"(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SongSingerTune_createdByUserId_fkey') THEN
    ALTER TABLE app."SongSingerTune"
      ADD CONSTRAINT "SongSingerTune_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES app."User"(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

-- 4) Indexes
CREATE INDEX IF NOT EXISTS "SongSingerTune_songId_idx"
  ON app."SongSingerTune" ("songId");

CREATE INDEX IF NOT EXISTS "SongSingerTune_singerUserId_idx"
  ON app."SongSingerTune" ("singerUserId");

CREATE INDEX IF NOT EXISTS "SongSingerTune_createdByUserId_idx"
  ON app."SongSingerTune" ("createdByUserId");
