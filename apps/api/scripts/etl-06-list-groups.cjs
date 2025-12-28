require("dotenv/config");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function toNullTrim(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toBool(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "t" || s === "yes";
}

function toIntOrNull(v) {
  const s = toNullTrim(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log("ETL 06: list groups legacy -> app");

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "Group_List_ID"::int AS "legacyId",
      "Title"::text        AS "title",
      "FullTitle"::text    AS "fullTitle",
      "UserID"             AS "userId",
      "New_View"::text     AS "newView",
      "New_Edit"::text     AS "newEdit"
    FROM legacy."legacy_group_lists"
    ORDER BY "Group_List_ID" ASC
  `);

  console.log("legacy group_lists:", rows.length);

  let processed = 0;

  for (const r of rows) {
    const legacyId = Number(r.legacyId);
    const title = toNullTrim(r.title) ?? "";

    if (!legacyId || !title) continue;

    await prisma.listGroup.upsert({
      where: { legacyId },
      update: {
        title,
        fullTitle: toNullTrim(r.fullTitle),
        ownerWpId: toIntOrNull(r.userId),
        viewWpIds: toNullTrim(r.newView),
        editWpIds: toNullTrim(r.newEdit),
      },
      create: {
        legacyId,
        title,
        fullTitle: toNullTrim(r.fullTitle),
        ownerWpId: toIntOrNull(r.userId),
        viewWpIds: toNullTrim(r.newView),
        editWpIds: toNullTrim(r.newEdit),
      },
    });

    processed++;
  }

  console.log("DONE list groups:", processed);
}

main()
  .catch((e) => {
    console.error("ETL 06 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
