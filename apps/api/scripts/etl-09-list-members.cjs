/* scripts/etl-09-list-members.cjs */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseWpIds(str) {
  if (!str) return [];
  // πιάνει "5,94,1" ή ",5,94,1," ή "5, 94, 1"
  const parts = String(str)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const nums = parts
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);

  // unique
  return Array.from(new Set(nums));
}

function rank(role) {
  // μεγαλύτερο = ισχυρότερο
  if (role === "OWNER") return 3;
  if (role === "EDITOR") return 2;
  return 1; // VIEWER
}

function pickStrongerRole(a, b) {
  return rank(a) >= rank(b) ? a : b;
}

async function main() {
  console.log("ETL 09: list members (legacy ACL -> app.ListMember)");
  const lists = await prisma.list.findMany({
    select: {
      id: true,
      legacyId: true,
      ownerWpId: true,
      viewWpIds: true,
      editWpIds: true,
    },
    orderBy: { id: "asc" },
  });

  console.log("lists:", lists.length);

  let created = 0;
  let skippedNoUser = 0;

  // cache: legacyUserId -> app.User.id
  const userRows = await prisma.user.findMany({
    select: { id: true, legacyUserId: true },
  });
  const legacyToUserId = new Map();
  for (const u of userRows) {
    if (u.legacyUserId != null) legacyToUserId.set(u.legacyUserId, u.id);
  }

  for (const l of lists) {
    const roleByUserId = new Map(); // app.User.id -> role

    // OWNER
    if (l.ownerWpId != null) {
      const uid = legacyToUserId.get(l.ownerWpId);
      if (uid) {
        roleByUserId.set(uid, "OWNER");
      } else {
        skippedNoUser++;
      }
    }

    // EDITORS
    for (const wpId of parseWpIds(l.editWpIds)) {
      const uid = legacyToUserId.get(wpId);
      if (!uid) {
        skippedNoUser++;
        continue;
      }
      const prev = roleByUserId.get(uid);
      roleByUserId.set(uid, prev ? pickStrongerRole(prev, "EDITOR") : "EDITOR");
    }

    // VIEWERS
    for (const wpId of parseWpIds(l.viewWpIds)) {
      const uid = legacyToUserId.get(wpId);
      if (!uid) {
        skippedNoUser++;
        continue;
      }
      const prev = roleByUserId.get(uid);
      roleByUserId.set(uid, prev ? pickStrongerRole(prev, "VIEWER") : "VIEWER");
    }

    // upsert members (idempotent)
    for (const [userId, role] of roleByUserId.entries()) {
      await prisma.listMember.upsert({
        where: {
          listId_userId: { listId: l.id, userId },
        },
        update: { role },
        create: { listId: l.id, userId, role },
      });
      created++;
    }
  }

  console.log("DONE list members");
  console.log("members upserted:", created);
  console.log("skipped (wpId not found in app.User.legacyUserId):", skippedNoUser);
}

main()
  .catch((e) => {
    console.error("ETL 09 failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
