-- CreateTable
CREATE TABLE "SongCategory" (
    "id" SERIAL NOT NULL,
    "songId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongCategory_songId_idx" ON "SongCategory"("songId");

-- CreateIndex
CREATE INDEX "SongCategory_categoryId_idx" ON "SongCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SongCategory_songId_categoryId_key" ON "SongCategory"("songId", "categoryId");

-- AddForeignKey
ALTER TABLE "SongCategory" ADD CONSTRAINT "SongCategory_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCategory" ADD CONSTRAINT "SongCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
