-- CreateEnum
CREATE TYPE "ListMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ListGroupMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

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

-- CreateIndex
CREATE INDEX "ListMember_userId_idx" ON "ListMember"("userId");

-- CreateIndex
CREATE INDEX "ListMember_listId_idx" ON "ListMember"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "ListMember_listId_userId_key" ON "ListMember"("listId", "userId");

-- CreateIndex
CREATE INDEX "ListGroupMember_userId_idx" ON "ListGroupMember"("userId");

-- CreateIndex
CREATE INDEX "ListGroupMember_groupId_idx" ON "ListGroupMember"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ListGroupMember_groupId_userId_key" ON "ListGroupMember"("groupId", "userId");

-- AddForeignKey
ALTER TABLE "ListMember" ADD CONSTRAINT "ListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListMember" ADD CONSTRAINT "ListMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListGroupMember" ADD CONSTRAINT "ListGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ListGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListGroupMember" ADD CONSTRAINT "ListGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
