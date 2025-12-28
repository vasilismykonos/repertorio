-- CreateTable
CREATE TABLE "ListGroup" (
    "id" SERIAL NOT NULL,
    "legacyId" INTEGER,
    "title" TEXT NOT NULL,
    "fullTitle" TEXT,
    "ownerWpId" INTEGER,
    "viewWpIds" TEXT,
    "editWpIds" TEXT,
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
    "ownerWpId" INTEGER,
    "viewWpIds" TEXT,
    "editWpIds" TEXT,
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

-- CreateIndex
CREATE UNIQUE INDEX "ListGroup_legacyId_key" ON "ListGroup"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "List_legacyId_key" ON "List"("legacyId");

-- CreateIndex
CREATE INDEX "List_groupId_idx" ON "List"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ListItem_legacyId_key" ON "ListItem"("legacyId");

-- CreateIndex
CREATE INDEX "ListItem_listId_idx" ON "ListItem"("listId");

-- CreateIndex
CREATE INDEX "ListItem_songId_idx" ON "ListItem"("songId");

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ListGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
