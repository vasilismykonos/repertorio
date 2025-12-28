require("dotenv/config");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function toNullTrim(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toIntOrNull(v) {
  const s = toNullTrim(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "t" || s === "yes";
}

async function main() {
  console.log("ETL 07: lists legacy -> app");

  // map legacy group id -> app group id
  const groups = await prisma.listGroup.findMany({
    select: { id: true, legacyId: true },
  });
  const groupIdByLegacy = new Map(groups.map((g) => [g.legacyId, g.id]));

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "List_ID"::int       AS "legacyId",
      "Title"::text        AS "title",
      "Group_List_ID"::text AS "groupLegacyId",
      "Marked"             AS "marked",
      "UserID"             AS "userId",
      "View"::text         AS "view",
      "Edit"::text         AS "edit"
    FROM legacy."legacy_lists"
    ORDER BY "List_ID" ASC
  `);

  console.log("legacy lists:", rows.length);

  let processed = 0;

  for (const r of rows) {
    const legacyId = Number(r.legacyId);
    const title = toNullTrim(r.title) ?? "";
    if (!legacyId || !title) continue;

    const groupLegacyId = toIntOrNull(r.groupLegacyId);
    const groupId = groupLegacyId ? (groupIdByLegacy.get(groupLegacyId) ?? null) : null;

    await prisma.list.upsert({
      where: { legacyId },
      update: {
        title,
        groupId,
        ownerWpId: toIntOrNull(r.userId),
        viewWpIds: toNullTrim(r.view),
        editWpIds: toNullTrim(r.edit),
        marked: toBool(r.marked),
      },
      create: {
        legacyId,
        title,
        groupId,
        ownerWpId: toIntOrNull(r.userId),
        viewWpIds: toNullTrim(r.view),
        editWpIds: toNullTrim(r.edit),
        marked: toBool(r.marked),
      },
    });

    processed++;
  }

  console.log("DONE lists:", processed);
}

main()
  .catch((e) => {
    console.error("ETL 07 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
