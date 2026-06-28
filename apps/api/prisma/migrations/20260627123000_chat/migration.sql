CREATE TABLE "ChatThread" (
  "id" SERIAL NOT NULL,
  "title" VARCHAR(160),
  "isGroup" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastMessageAt" TIMESTAMP(3),
  CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatParticipant" (
  "threadId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReadAt" TIMESTAMP(3),
  "mutedAt" TIMESTAMP(3),
  CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("threadId", "userId")
);

CREATE TABLE "ChatMessage" (
  "id" SERIAL NOT NULL,
  "threadId" INTEGER NOT NULL,
  "senderUserId" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatThread_lastMessageAt_idx" ON "ChatThread"("lastMessageAt");
CREATE INDEX "ChatThread_createdByUserId_idx" ON "ChatThread"("createdByUserId");
CREATE INDEX "ChatParticipant_userId_idx" ON "ChatParticipant"("userId");
CREATE INDEX "ChatParticipant_threadId_idx" ON "ChatParticipant"("threadId");
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");
CREATE INDEX "ChatMessage_senderUserId_idx" ON "ChatMessage"("senderUserId");

ALTER TABLE "ChatThread"
  ADD CONSTRAINT "ChatThread_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatParticipant"
  ADD CONSTRAINT "ChatParticipant_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatParticipant"
  ADD CONSTRAINT "ChatParticipant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
