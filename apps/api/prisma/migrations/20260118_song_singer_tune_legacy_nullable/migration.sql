-- Make legacyUserTuneId nullable (legacy-only field; new rows will use NULL)
ALTER TABLE app."SongSingerTune"
  ALTER COLUMN "legacyUserTuneId" DROP NOT NULL;
