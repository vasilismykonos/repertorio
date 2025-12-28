require("dotenv/config");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function toNullTrim(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

async function main() {
  console.log("ETL 03: artists legacy -> app");

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "Artist_ID"::int AS "legacyArtistId",
      "Title"::text    AS "title",
      "FirstName"::text AS "firstName",
      "LastName"::text  AS "lastName"
    FROM legacy."legacy_artists"
    ORDER BY "Artist_ID" ASC
  `);

  console.log("legacy artists:", rows.length);

  let processed = 0;

  for (const r of rows) {
    const legacyArtistId = Number(r.legacyArtistId);
    const title = toNullTrim(r.title);

    // Στο legacy σου: Title δεν είναι ποτέ null/empty, αλλά το αφήνουμε safe
    if (!legacyArtistId || !title) continue;

    await prisma.artist.upsert({
      where: { legacyArtistId },
      update: {
        title,
        firstName: toNullTrim(r.firstName),
        lastName: toNullTrim(r.lastName),
      },
      create: {
        legacyArtistId,
        title,
        firstName: toNullTrim(r.firstName),
        lastName: toNullTrim(r.lastName),
      },
    });

    processed++;
    if (processed % 200 === 0) {
      console.log(`...processed ${processed}/${rows.length}`);
    }
  }

  console.log("DONE artists:", processed);
}

main()
  .catch((e) => {
    console.error("ETL 03 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
