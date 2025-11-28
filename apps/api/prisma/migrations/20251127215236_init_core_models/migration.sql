/*
  Warnings:

  - A unique constraint covering the columns `[title]` on the table `Rythm` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Rythm` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SongStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VersionArtistRole" AS ENUM ('SINGER_FRONT', 'SINGER_BACK', 'SOLOIST', 'MUSICIAN', 'COMPOSER');

-- AlterTable
ALTER TABLE "Rythm" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "displayName" TEXT,
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
    "sex" TEXT,
    "bornYear" INTEGER,
    "dieYear" INTEGER,
    "imageUrl" TEXT,
    "biography" TEXT,
    "wikiUrl" TEXT,
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
CREATE TABLE "Makam" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Makam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Song" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "firstLyrics" TEXT,
    "lyrics" TEXT,
    "chords" TEXT,
    "characteristics" TEXT,
    "status" "SongStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "originalKey" TEXT,
    "defaultKey" TEXT,
    "basedOn" TEXT,
    "scoreFile" TEXT,
    "highestVocalNote" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "legacySongId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" INTEGER,
    "categoryId" INTEGER,
    "rythmId" INTEGER,
    "makamId" INTEGER,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVersion" (
    "id" SERIAL NOT NULL,
    "songId" INTEGER NOT NULL,
    "title" TEXT,
    "year" INTEGER,
    "youtubeUrl" TEXT,
    "youtubeSearch" TEXT,
    "playerCode" TEXT,
    "legacyComposerOld" TEXT,
    "legacySongIdOld" INTEGER,
    "legacyNewId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,

    CONSTRAINT "SongVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVersionArtist" (
    "versionId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "role" "VersionArtistRole" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SongVersionArtist_pkey" PRIMARY KEY ("versionId","artistId","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Category_title_key" ON "Category"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Makam_name_key" ON "Makam"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Rythm_title_key" ON "Rythm"("title");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_rythmId_fkey" FOREIGN KEY ("rythmId") REFERENCES "Rythm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_makamId_fkey" FOREIGN KEY ("makamId") REFERENCES "Makam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionArtist" ADD CONSTRAINT "SongVersionArtist_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SongVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionArtist" ADD CONSTRAINT "SongVersionArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
