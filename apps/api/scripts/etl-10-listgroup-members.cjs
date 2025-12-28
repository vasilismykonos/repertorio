/* scripts/etl-10-listgroup-members.cjs */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseWpIds(str) {
  if (!str) return [];
  const parts = String(str)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const nums = parts
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(nums));
}

function rank(role) {
  if (role === "OWNER") return 3;
  if (role === "EDITOR") return 2;
  return 1;
}

function pickStrongerRole(a, b) {
  return rank(a) >= rank(b) ? a : b;
}

async function main() {
  console.log("ETL 10: list group members (legacy ACL -> app.ListGroupMember)");
  const groups = await prisma.listGroup.findMany({
    select: {
      id: true,
      legacyId: true,
      ownerWpId: true,
      viewWpIds: true,
      editWpIds: true,
    },
    orderBy: { id: "asc" },
  });

  console.log("list groups:", groups.length);

  let created = 0;
  let skippedNoUser = 0;

  const userRows = await prisma.user.findMany({
    select: { id: true, legacyUserId: true },
  });
  const legacyToUserId = new Map();
  for (const u of userRows) {
    if (u.legacyUserId != null) legacyToUserId.set(u.legacyUserId, u.id);
  }

  for (const g of groups) {
    const roleByUserId = new Map();

    if (g.ownerWpId != null) {
      const uid = legacyToUserId.get(g.ownerWpId);
      if (uid) roleByUserId.set(uid, "OWNER");
      else skippedNoUser++;
    }

    for (const wpId of parseWpIds(g.editWpIds)) {
      const uid = legacyToUserId.get(wpId);
      if (!uid) {
        skippedNoUser++;
        continue;
      }
      const prev = roleByUserId.get(uid);
      roleByUserId.set(uid, prev ? pickStrongerRole(prev, "EDITOR") : "EDITOR");
    }

    for (const wpId of parseWpIds(g.viewWpIds)) {
      const uid = legacyToUserId.get(wpId);
      if (!uid) {
        skippedNoUser++;
        continue;
      }
      const prev = roleByUserId.get(uid);
      roleByUserId.set(uid, prev ? pickStrongerRole(prev, "VIEWER") : "VIEWER");
    }

    for (const [userId, role] of roleByUserId.entries()) {
      await prisma.listGroupMember.upsert({
        where: {
          groupId_userId: { groupId: g.id, userId },
        },
        update: { role },
        create: { groupId: g.id, userId, role },
      });
      created++;
    }
  }

  console.log("DONE list group members");
  console.log("members upserted:", created);
  console.log("skipped (wpId not found in app.User.legacyUserId):", skippedNoUser);
}

main()
  .catch((e) => {
    console.error("ETL 10 failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
