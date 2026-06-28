CREATE TYPE "UserHistoryEventType" AS ENUM ('SONG_VIEW', 'SONG_SEARCH');

CREATE TABLE "UserHistoryEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "UserHistoryEventType" NOT NULL,
    "songId" INTEGER,
    "searchTerm" VARCHAR(300),
    "path" VARCHAR(600),
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserHistoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserHistoryEvent_userId_occurredAt_idx" ON "UserHistoryEvent"("userId", "occurredAt");
CREATE INDEX "UserHistoryEvent_userId_type_occurredAt_idx" ON "UserHistoryEvent"("userId", "type", "occurredAt");
CREATE INDEX "UserHistoryEvent_songId_idx" ON "UserHistoryEvent"("songId");

ALTER TABLE "UserHistoryEvent"
ADD CONSTRAINT "UserHistoryEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserHistoryEvent"
ADD CONSTRAINT "UserHistoryEvent_songId_fkey"
FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
