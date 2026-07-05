CREATE TABLE "ListGroupList" (
    "listId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListGroupList_pkey" PRIMARY KEY ("listId","groupId")
);

CREATE INDEX "ListGroupList_groupId_idx" ON "ListGroupList"("groupId");
CREATE INDEX "ListGroupList_listId_idx" ON "ListGroupList"("listId");

ALTER TABLE "ListGroupList" ADD CONSTRAINT "ListGroupList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListGroupList" ADD CONSTRAINT "ListGroupList_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ListGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ListGroupList" ("listId", "groupId")
SELECT "id", "groupId"
FROM "List"
WHERE "groupId" IS NOT NULL
ON CONFLICT DO NOTHING;
