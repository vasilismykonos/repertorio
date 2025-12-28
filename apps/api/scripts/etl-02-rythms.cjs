require("dotenv/config");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("ETL 02: rythms legacy -> app");

  const rows = await prisma.$queryRawUnsafe(`
    SELECT "Rythm_ID"::int AS id, "Title"::text AS title
    FROM legacy."legacy_rythms"
    ORDER BY "Rythm_ID" ASC
  `);

  console.log("legacy rythms:", rows.length);

  let done = 0;
  for (const r of rows) {
    await prisma.rythm.upsert({
      where: { id: r.id },
      update: { title: r.title },
      create: { id: r.id, title: r.title },
    });
    done++;
  }

  console.log("DONE rythms:", done);
}

main()
  .catch((e) => {
    console.error("ETL 02 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
