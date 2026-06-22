ALTER TABLE "UserPresence"
  ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastSessionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "sessionCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "activeMinutes" INTEGER NOT NULL DEFAULT 0;

UPDATE "UserPresence"
SET
  "firstSeenAt" = COALESCE("firstSeenAt", "lastSeenAt"),
  "lastSessionAt" = COALESCE("lastSessionAt", "lastSeenAt"),
  "sessionCount" = GREATEST("sessionCount", 1),
  "activeMinutes" = GREATEST("activeMinutes", 0);

CREATE INDEX IF NOT EXISTS "UserPresence_lastSessionAt_idx" ON "UserPresence"("lastSessionAt");
CREATE INDEX IF NOT EXISTS "UserPresence_sessionCount_idx" ON "UserPresence"("sessionCount");
CREATE INDEX IF NOT EXISTS "UserPresence_activeMinutes_idx" ON "UserPresence"("activeMinutes");
