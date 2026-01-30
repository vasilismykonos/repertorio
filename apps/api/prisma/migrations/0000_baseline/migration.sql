-- CreateEnum
CREATE TYPE "SongStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SongCreditRole" AS ENUM ('COMPOSER', 'LYRICIST');

-- CreateEnum
CREATE TYPE "VersionArtistRole" AS ENUM ('SINGER_FRONT', 'SINGER_BACK', 'SOLOIST', 'MUSICIAN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'AUTHOR', 'CONTRIBUTOR', 'USER');

-- CreateEnum
CREATE TYPE "ListMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ListGroupMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('GENERIC', 'YOUTUBE', 'SPOTIFY', 'PDF', 'AUDIO', 'IMAGE', 'SCORE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacyUserId" INTEGER,
    "avatarUrl" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" SERIAL NOT NULL,
    "legacyArtistId" INTEGER,
    "title" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "wikiUrl" TEXT,
    "sex" TEXT,
    "biography" TEXT,
    "bornYear" INTEGER,
    "dieYear" INTEGER,
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
    "slug" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rythm" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rythm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Song" (
    "id" SERIAL NOT NULL,
    "legacySongId" INTEGER,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "firstLyrics" TEXT,
    "lyrics" TEXT,
    "chords" TEXT,
    "characteristics" TEXT,
    "originalKey" TEXT,
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

-- CreateTable
CREATE TABLE "ListGroup" (
    "id" SERIAL NOT NULL,
    "legacyId" INTEGER,
    "title" TEXT NOT NULL,
    "fullTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "List" (
    "id" SERIAL NOT NULL,
    "legacyId" INTEGER,
    "title" TEXT NOT NULL,
    "groupId" INTEGER,
    "marked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListItem" (
    "id" SERIAL NOT NULL,
    "legacyId" INTEGER,
    "listId" INTEGER NOT NULL,
    "sortId" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "transport" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "chords" TEXT,
    "lyrics" TEXT,
    "songId" INTEGER,

    CONSTRAINT "ListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListMember" (
    "id" SERIAL NOT NULL,
    "listId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "ListMemberRole" NOT NULL,

    CONSTRAINT "ListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListGroupMember" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "ListGroupMemberRole" NOT NULL,

    CONSTRAINT "ListGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongCategory" (
    "id" SERIAL NOT NULL,
    "songId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "type" "AssetType" NOT NULL DEFAULT 'GENERIC',
    "title" TEXT,
    "url" TEXT,
    "filePath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongAsset" (
    "songId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "label" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongAsset_pkey" PRIMARY KEY ("songId","assetId")
);

-- CreateTable
CREATE TABLE "SongTag" (
    "songId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongTag_pkey" PRIMARY KEY ("songId","tagId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyUserId_key" ON "User"("legacyUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_legacyArtistId_key" ON "Artist"("legacyArtistId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_title_key" ON "Category"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Rythm_title_key" ON "Rythm"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Rythm_slug_key" ON "Rythm"("slug");

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
CREATE UNIQUE INDEX "SongCredit_songId_artistId_role_key" ON "SongCredit"("songId", "artistId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "SongVersion_legacyVersionId_key" ON "SongVersion"("legacyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "SongVersionArtist_versionId_artistId_role_key" ON "SongVersionArtist"("versionId", "artistId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ListGroup_legacyId_key" ON "ListGroup"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "List_legacyId_key" ON "List"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ListItem_legacyId_key" ON "ListItem"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ListMember_listId_userId_key" ON "ListMember"("listId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ListGroupMember_groupId_userId_key" ON "ListGroupMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SongCategory_songId_categoryId_key" ON "SongCategory"("songId", "categoryId");

-- CreateIndex
CREATE INDEX "Asset_kind_type_idx" ON "Asset"("kind", "type");

-- CreateIndex
CREATE INDEX "SongAsset_assetId_idx" ON "SongAsset"("assetId");

-- CreateIndex
CREATE INDEX "SongAsset_songId_sort_idx" ON "SongAsset"("songId", "sort");

-- CreateIndex
CREATE INDEX "SongTag_songId_idx" ON "SongTag"("songId");

-- CreateIndex
CREATE INDEX "SongTag_tagId_idx" ON "SongTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_title_key" ON "Tag"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_basedOnSongId_fkey" FOREIGN KEY ("basedOnSongId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_rythmId_fkey" FOREIGN KEY ("rythmId") REFERENCES "Rythm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCredit" ADD CONSTRAINT "SongCredit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCredit" ADD CONSTRAINT "SongCredit_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionArtist" ADD CONSTRAINT "SongVersionArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionArtist" ADD CONSTRAINT "SongVersionArtist_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SongVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ListGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListMember" ADD CONSTRAINT "ListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListMember" ADD CONSTRAINT "ListMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListGroupMember" ADD CONSTRAINT "ListGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ListGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListGroupMember" ADD CONSTRAINT "ListGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCategory" ADD CONSTRAINT "SongCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCategory" ADD CONSTRAINT "SongCategory_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongAsset" ADD CONSTRAINT "SongAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongAsset" ADD CONSTRAINT "SongAsset_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongTag" ADD CONSTRAINT "SongTag_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongTag" ADD CONSTRAINT "SongTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

