require("dotenv/config");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("ETL 01: categories legacy -> app");

  // Διαβάζουμε από legacy schema (Postgres) μέσω raw query
  const rows = await prisma.$queryRawUnsafe(`
    SELECT "Category_ID"::int AS id, "Title"::text AS title
    FROM legacy."legacy_songs_categories"
    ORDER BY "Category_ID" ASC
  `);

  console.log("legacy categories:", rows.length);

  let created = 0;
  for (const r of rows) {
    // upsert με id (κρατάμε ίδια ids)
    await prisma.category.upsert({
      where: { id: r.id },
      update: { title: r.title },
      create: { id: r.id, title: r.title },
    });
    created++;
  }

  console.log("DONE categories:", created);
}

main()
  .catch((e) => {
    console.error("ETL 01 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
