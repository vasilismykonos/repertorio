-- CreateEnum
CREATE TYPE "SongStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SongCreditRole" AS ENUM ('COMPOSER', 'LYRICIST');

-- CreateEnum
CREATE TYPE "VersionArtistRole" AS ENUM ('SINGER_FRONT', 'SINGER_BACK', 'SOLOIST', 'MUSICIAN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'AUTHOR', 'CONTRIBUTOR', 'USER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" SERIAL NOT NULL,
    "legacyArtistId" INTEGER,
    "title" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rythm" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rythm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Song" (
    "id" SERIAL NOT NULL,
    "legacySongId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "firstLyrics" TEXT,
    "lyrics" TEXT,
    "chords" TEXT,
    "characteristics" TEXT,
    "originalKey" TEXT,
    "defaultKey" TEXT,
    "highestVocalNote" TEXT,
    "basedOnSongId" INTEGER,
    "categoryId" INTEGER,
    "rythmId" INTEGER,
    "scoreFile" TEXT,
    "hasScore" BOOLEAN NOT NULL DEFAULT false,
    "status" "SongStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" INTEGER,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongCredit" (
    "id" SERIAL NOT NULL,
    "songId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "role" "SongCreditRole" NOT NULL,

    CONSTRAINT "SongCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVersion" (
    "id" SERIAL NOT NULL,
    "legacyVersionId" INTEGER,
    "songId" INTEGER NOT NULL,
    "title" TEXT,
    "year" INTEGER,
    "youtubeUrl" TEXT,
    "youtubeSearch" TEXT,
    "playerCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,

    CONSTRAINT "SongVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVersionArtist" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "role" "VersionArtistRole" NOT NULL,

    CONSTRAINT "SongVersionArtist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_legacyArtistId_key" ON "Artist"("legacyArtistId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_title_key" ON "Category"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Rythm_title_key" ON "Rythm"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Song_legacySongId_key" ON "Song"("legacySongId");

-- CreateIndex
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");

-- CreateIndex
CREATE INDEX "Song_categoryId_idx" ON "Song"("categoryId");

-- CreateIndex
CREATE INDEX "Song_rythmId_idx" ON "Song"("rythmId");

-- CreateIndex
CREATE INDEX "Song_createdByUserId_idx" ON "Song"("createdByUserId");

-- CreateIndex
CREATE INDEX "SongCredit_artistId_idx" ON "SongCredit"("artistId");

-- CreateIndex
CREATE INDEX "SongCredit_songId_idx" ON "SongCredit"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "SongCredit_songId_artistId_role_key" ON "SongCredit"("songId", "artistId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "SongVersion_legacyVersionId_key" ON "SongVersion"("legacyVersionId");

-- CreateIndex
CREATE INDEX "SongVersion_songId_idx" ON "SongVersion"("songId");

-- CreateIndex
CREATE INDEX "SongVersion_createdByUserId_idx" ON "SongVersion"("createdByUserId");

-- CreateIndex
CREATE INDEX "SongVersionArtist_artistId_idx" ON "SongVersionArtist"("artistId");

-- CreateIndex
CREATE INDEX "SongVersionArtist_versionId_idx" ON "SongVersionArtist"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "SongVersionArtist_versionId_artistId_role_key" ON "SongVersionArtist"("versionId", "artistId", "role");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_basedOnSongId_fkey" FOREIGN KEY ("basedOnSongId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_rythmId_fkey" FOREIGN KEY ("rythmId") REFERENCES "Rythm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCredit" ADD CONSTRAINT "SongCredit_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCredit" ADD CONSTRAINT "SongCredit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionArtist" ADD CONSTRAINT "SongVersionArtist_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SongVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionArtist" ADD CONSTRAINT "SongVersionArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
