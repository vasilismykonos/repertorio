/*
  Warnings:

  - A unique constraint covering the columns `[legacyUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legacyUserId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyUserId_key" ON "User"("legacyUserId");
