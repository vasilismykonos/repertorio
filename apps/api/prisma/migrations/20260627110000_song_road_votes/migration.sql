CREATE TABLE "SongRoadVote" (
  "id" SERIAL NOT NULL,
  "songId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "road" VARCHAR(120) NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 3,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SongRoadVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SongRoadVote_song_user_unique" ON "SongRoadVote"("songId", "userId");
CREATE INDEX "SongRoadVote_songId_idx" ON "SongRoadVote"("songId");
CREATE INDEX "SongRoadVote_userId_idx" ON "SongRoadVote"("userId");
CREATE INDEX "SongRoadVote_road_idx" ON "SongRoadVote"("road");

ALTER TABLE "SongRoadVote"
  ADD CONSTRAINT "SongRoadVote_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SongRoadVote"
  ADD CONSTRAINT "SongRoadVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
