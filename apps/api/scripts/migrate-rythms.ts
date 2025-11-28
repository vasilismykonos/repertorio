// scripts/migrate-rythms.ts
// Migration των ρυθμών από το παλιό WordPress MySQL στη νέα PostgreSQL (Prisma).
//
// ΤΡΟΠΟΣ ΧΡΗΣΗΣ (από /apps/api):
// 1) pnpm --filter api run build
// 2) node dist/scripts/migrate-rythms.js
//
// Απαιτεί να έχεις ορίσει στο .env τα:
// OLD_DB_HOST, OLD_DB_PORT, OLD_DB_USER, OLD_DB_PASSWORD, OLD_DB_NAME

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Rythm migration ξεκίνησε ===');

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

  // Απλή, σταθερή query σύμφωνα με το schema σου
  const sql = `
    SELECT Rythm_ID, Title
    FROM rythms
    WHERE Title IS NOT NULL
      AND Title <> ''
  `;

  console.log('Εκτέλεση query:\n', sql.trim());

  const [rows] = await connection.query<any[]>(sql);

  console.log(`Βρέθηκαν ${rows.length} ρυθμοί στην παλιά βάση.`);

  let processed = 0;
  let skipped = 0;

  for (const row of rows) {
    const rawTitle = row.Title;
    const title = rawTitle ? String(rawTitle).trim() : '';

    if (!title) {
      console.warn('Παράλειψη row χωρίς τίτλο:', row);
      skipped++;
      continue;
    }

    try {
      // Prisma model:
      // model Rythm {
      //   id        Int      @id @default(autoincrement())
      //   title     String   @unique
      //   createdAt DateTime @default(now())
      //   updatedAt DateTime @updatedAt
      // }
      await prisma.rythm.upsert({
        where: { title },
        create: { title },
        update: {},
      });
      processed++;
    } catch (err) {
      console.error(
        `Σφάλμα upsert για τίτλο "${title}" (Rythm_ID=${row.Rythm_ID}):`,
        err,
      );
      skipped++;
    }
  }

  await connection.end();

  console.log('=== Rythm migration ολοκληρώθηκε ===');
  console.log(`Επεξεργάστηκαν: ${processed}, Παραλείφθηκαν: ${skipped}`);
}

main()
  .catch((err) => {
    console.error('Σοβαρό σφάλμα στο migrate-rythms:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
