/*
  Warnings:

  - You are about to drop the column `editWpIds` on the `List` table. All the data in the column will be lost.
  - You are about to drop the column `ownerWpId` on the `List` table. All the data in the column will be lost.
  - You are about to drop the column `viewWpIds` on the `List` table. All the data in the column will be lost.
  - You are about to drop the column `editWpIds` on the `ListGroup` table. All the data in the column will be lost.
  - You are about to drop the column `ownerWpId` on the `ListGroup` table. All the data in the column will be lost.
  - You are about to drop the column `viewWpIds` on the `ListGroup` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "app"."List_groupId_idx";

-- DropIndex
DROP INDEX "app"."ListGroupMember_groupId_idx";

-- DropIndex
DROP INDEX "app"."ListGroupMember_userId_idx";

-- DropIndex
DROP INDEX "app"."ListItem_listId_idx";

-- DropIndex
DROP INDEX "app"."ListItem_songId_idx";

-- DropIndex
DROP INDEX "app"."ListMember_listId_idx";

-- DropIndex
DROP INDEX "app"."ListMember_userId_idx";

-- DropIndex
DROP INDEX "app"."SongCategory_categoryId_idx";

-- DropIndex
DROP INDEX "app"."SongCategory_songId_idx";

-- DropIndex
DROP INDEX "app"."SongCredit_artistId_idx";

-- DropIndex
DROP INDEX "app"."SongCredit_songId_idx";

-- DropIndex
DROP INDEX "app"."SongVersion_createdByUserId_idx";

-- DropIndex
DROP INDEX "app"."SongVersion_songId_idx";

-- DropIndex
DROP INDEX "app"."SongVersionArtist_artistId_idx";

-- DropIndex
DROP INDEX "app"."SongVersionArtist_versionId_idx";

-- AlterTable
ALTER TABLE "List" DROP COLUMN "editWpIds",
DROP COLUMN "ownerWpId",
DROP COLUMN "viewWpIds";

-- AlterTable
ALTER TABLE "ListGroup" DROP COLUMN "editWpIds",
DROP COLUMN "ownerWpId",
DROP COLUMN "viewWpIds";
