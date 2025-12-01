/*
  Warnings:

  - A unique constraint covering the columns `[wpId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'AUTHOR', 'CONTRIBUTOR', 'SUBSCRIBER', 'USER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentUrl" TEXT,
ADD COLUMN     "darkMode" BOOLEAN,
ADD COLUMN     "devices" TEXT,
ADD COLUMN     "fontSize" INTEGER,
ADD COLUMN     "hideChords" BOOLEAN,
ADD COLUMN     "hideInfo" BOOLEAN,
ADD COLUMN     "redirectField" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER',
ADD COLUMN     "rooms" TEXT,
ADD COLUMN     "userActivationKey" TEXT,
ADD COLUMN     "userLogin" TEXT,
ADD COLUMN     "userNicename" TEXT,
ADD COLUMN     "userRoom" TEXT,
ADD COLUMN     "userStatus" INTEGER,
ADD COLUMN     "userUrl" TEXT,
ADD COLUMN     "viewOtherUserChords" TEXT,
ADD COLUMN     "wpId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_wpId_key" ON "User"("wpId");
