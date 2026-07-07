CREATE TABLE IF NOT EXISTS "ListShareLink" (
  "id" SERIAL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "listId" INTEGER NOT NULL,
  "createdByUserId" INTEGER NOT NULL,
  "role" "ListMemberRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ListShareLink_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ListShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ListShareLink_token_key" ON "ListShareLink"("token");
CREATE INDEX IF NOT EXISTS "ListShareLink_listId_idx" ON "ListShareLink"("listId");
CREATE INDEX IF NOT EXISTS "ListShareLink_createdByUserId_idx" ON "ListShareLink"("createdByUserId");
CREATE INDEX IF NOT EXISTS "ListShareLink_token_idx" ON "ListShareLink"("token");
