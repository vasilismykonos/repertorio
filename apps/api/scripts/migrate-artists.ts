// scripts/migrate-artists.ts
// Migration των καλλιτεχνών από το παλιό MySQL (repertorio.net.artists)
// στη νέα PostgreSQL (Prisma).
//
// ΤΡΟΠΟΣ ΧΡΗΣΗΣ (από /apps/api):
// 1) pnpm --filter api run build
// 2) node dist/scripts/migrate-artists.js
//
// Απαιτούνται στο .env οι μεταβλητές:
// OLD_DB_HOST, OLD_DB_PORT, OLD_DB_USER, OLD_DB_PASSWORD, OLD_DB_NAME

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Artist migration ξεκίνησε ===');

  const {
    OLD_DB_HOST,
    OLD_DB_PORT,
    OLD_DB_USER,
    OLD_DB_PASSWORD,
    OLD_DB_NAME,
  } = process.env;

  if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
    throw new Error(
      'Λείπουν μεταβλητές OLD_DB_HOST / OLD_DB_USER / OLD_DB_NAME από το .env',
    );
  }

  console.log(
    `Σύνδεση σε παλιό MySQL: ${OLD_DB_USER}@${OLD_DB_HOST}:${OLD_DB_PORT || 3306}/${OLD_DB_NAME}`,
  );

  const connection = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: Number(OLD_DB_PORT || 3306),
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: 'utf8mb4_general_ci',
  });

  // Με βάση το DESCRIBE artists:
  //
  // | Artist_ID | ... | Title | FirstName | LastName | ...
  //
  // Παίρνουμε DISTINCT Title (το εμφανιζόμενο όνομα καλλιτέχνη).
  const sql = `
    SELECT DISTINCT
      Artist_ID,
      Title
    FROM artists
    WHERE Title IS NOT NULL
      AND Title <> ''
  `;

  console.log('Εκτέλεση query:\n', sql.trim());

  const [rows] = await connection.query<any[]>(sql);

  console.log(`Βρέθηκαν ${rows.length} καλλιτέχνες στην παλιά βάση.`);

  let processed = 0;
  let skipped = 0;

  for (const row of rows) {
    const rawTitle = row.Title;
    const title = rawTitle ? String(rawTitle).trim() : '';

    if (!title) {
      console.warn('Παράλειψη row χωρίς Title:', row);
      skipped++;
      continue;
    }

    try {
      // Prisma model:
      // model Artist {
      //   id        Int      @id @default(autoincrement())
      //   title     String
      //   createdAt DateTime @default(now())
      //   updatedAt DateTime @updatedAt
      //   ...
      // }
      //
      // ΔΕΝ χρησιμοποιούμε upsert, γιατί ArtistWhereUniqueInput έχει μόνο id.
      // Κάνουμε findFirst με βάση το title, και αν δεν υπάρχει, create.
      const existing = await prisma.artist.findFirst({
        where: { title },
      });

      if (!existing) {
        await prisma.artist.create({
          data: { title },
        });
      }

      processed++;
    } catch (err) {
      console.error(
        `Σφάλμα για καλλιτέχνη "${title}" (Artist_ID=${row.Artist_ID}):`,
        err,
      );
      skipped++;
    }
  }

  await connection.end();

  console.log('=== Artist migration ολοκληρώθηκε ===');
  console.log(`Επεξεργάστηκαν: ${processed}, Παραλείφθηκαν: ${skipped}`);
}

main()
  .catch((err) => {
    console.error('Σοβαρό σφάλμα στο migrate-artists:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
