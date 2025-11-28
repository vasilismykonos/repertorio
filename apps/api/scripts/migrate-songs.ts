// scripts/migrate-songs.ts
// Migration των τραγουδιών από το παλιό MySQL (repertorio.net.songs)
// στη νέα PostgreSQL (Prisma Song).
//
// ΤΡΟΠΟΣ ΧΡΗΣΗΣ (από /apps/api):
// 1) pnpm --filter api run build
// 2) node dist/scripts/migrate-songs.js

import 'dotenv/config';
import { PrismaClient, SongStatus } from '@prisma/client';
import mysql from 'mysql2/promise';

const prisma = new PrismaClient();

// Mapping παλιού status (string) -> SongStatus enum
function mapStatus(oldStatus: string | null | undefined): SongStatus {
  const s = (oldStatus || '').trim().toLowerCase();

  if (!s) return SongStatus.PENDING_APPROVAL;

  if (s === 'pending') return SongStatus.PENDING_APPROVAL;

  // Αν στο μέλλον δεις τιμές όπως 'approved', 'published', 'καταχωρήθηκε', κ.λπ.
  if (s === 'approved' || s === 'published' || s === 'καταχωρήθηκε') {
    return SongStatus.PUBLISHED;
  }

  if (s === 'draft') return SongStatus.DRAFT;

  // Fallback – να μην σκάει ποτέ
  return SongStatus.PENDING_APPROVAL;
}

async function main() {
  console.log('=== Song migration ξεκίνησε ===');

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
    `Σύνδεση σε παλιό MySQL: ${OLD_DB_USER}@${OLD_DB_HOST}:${
      OLD_DB_PORT || 3306
    }/${OLD_DB_NAME}`,
  );

  const connection = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: Number(OLD_DB_PORT || 3306),
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: 'utf8mb4_general_ci',
  });

  // Προφορτώσουμε categories & rythms από Postgres για γρήγορο mapping με map
  const categories = await prisma.category.findMany();
  const rythms = await prisma.rythm.findMany();

  const categoryByTitle = new Map<string, number>();
  for (const c of categories) {
    categoryByTitle.set(c.title, c.id);
  }

  const rythmByTitle = new Map<string, number>();
  for (const r of rythms) {
    rythmByTitle.set(r.title, r.id);
  }

  // SQL: songs + join σε songs_categories και rythms
  const sql = `
    SELECT
      s.Song_ID,
      s.Title,
      s.Lyrics,
      s.FirstLyrics,
      s.Chords,
      s.Characteristics,
      s.Tune_Writed,
      s.Default_Tune,
      s.BasedOn,
      s.Partiture,
      s.Highest_Vocal_Note,
      s.Count_Views,
      s.Status,
      s.Category_ID,
      sc.Title AS CategoryTitle,
      s.Rythm_ID,
      r.Title AS RythmTitle
    FROM songs s
    LEFT JOIN songs_categories sc
      ON s.Category_ID = sc.Category_ID
    LEFT JOIN rythms r
      ON s.Rythm_ID = r.Rythm_ID
  `;

  console.log('Εκτέλεση query για songs...\n', sql.trim());

  const [rows] = await connection.query<any[]>(sql);

  console.log(`Βρέθηκαν ${rows.length} τραγούδια στην παλιά βάση.`);

  let processed = 0;
  let skipped = 0;

  for (const row of rows) {
    const songIdOld: number = row.Song_ID;
    const rawTitle = row.Title;
    const title = rawTitle ? String(rawTitle).trim() : '';

    if (!title) {
      console.warn('Παράλειψη song χωρίς Title:', row);
      skipped++;
      continue;
    }

    // Category mapping
    let categoryId: number | null = null;
    const categoryTitle = row.CategoryTitle
      ? String(row.CategoryTitle).trim()
      : '';
    if (categoryTitle) {
      const cid = categoryByTitle.get(categoryTitle);
      if (cid) {
        categoryId = cid;
      } else {
        console.warn(
          `Προειδοποίηση: Δεν βρέθηκε Category για "${categoryTitle}" (Song_ID=${songIdOld})`,
        );
      }
    }

    // Rythm mapping
    let rythmId: number | null = null;
    const rythmTitle = row.RythmTitle ? String(row.RythmTitle).trim() : '';
    if (rythmTitle) {
      const rid = rythmByTitle.get(rythmTitle);
      if (rid) {
        rythmId = rid;
      } else {
        console.warn(
          `Προειδοποίηση: Δεν βρέθηκε Rythm για "${rythmTitle}" (Song_ID=${songIdOld})`,
        );
      }
    }

    const firstLyrics = row.FirstLyrics
      ? String(row.FirstLyrics).trim()
      : null;
    const lyrics = row.Lyrics ? String(row.Lyrics).trim() : null;
    const chords = row.Chords ? String(row.Chords).trim() : null;
    const characteristics = row.Characteristics
      ? String(row.Characteristics).trim()
      : null;
    const originalKey = row.Tune_Writed
      ? String(row.Tune_Writed).trim()
      : null;
    const defaultKey = row.Default_Tune
      ? String(row.Default_Tune).trim()
      : null;
    const basedOn = row.BasedOn ? String(row.BasedOn).trim() : null;
    const scoreFile = row.Partiture ? String(row.Partiture).trim() : null;
    const highestVocalNote = row.Highest_Vocal_Note
      ? String(row.Highest_Vocal_Note).trim()
      : null;

    const views =
      typeof row.Count_Views === 'number' && !isNaN(row.Count_Views)
        ? row.Count_Views
        : 0;

    const status = mapStatus(row.Status);

    try {
      // Αν υπάρχει ήδη Song με το ίδιο legacySongId, μην δημιουργήσεις διπλό
      const existing = await prisma.song.findFirst({
        where: { legacySongId: songIdOld },
      });

      if (!existing) {
        await prisma.song.create({
          data: {
            title,
            firstLyrics,
            lyrics,
            chords,
            characteristics,
            status,
            originalKey,
            defaultKey,
            basedOn,
            scoreFile,
            highestVocalNote,
            views,
            legacySongId: songIdOld,
            categoryId,
            rythmId,
            createdByUserId: null, // Θα το γεμίσουμε σε άλλο migration
            makamId: null, // TODO: migration για Makam αργότερα
          },
        });
      }

      processed++;
    } catch (err) {
      console.error(
        `Σφάλμα κατά την εισαγωγή Song (Song_ID=${songIdOld}, Title="${title}")`,
        err,
      );
      skipped++;
    }
  }

  await connection.end();

  console.log('=== Song migration ολοκληρώθηκε ===');
  console.log(`Επεξεργάστηκαν: ${processed}, Παραλείφθηκαν: ${skipped}`);
}

main()
  .catch((err) => {
    console.error('Σοβαρό σφάλμα στο migrate-songs:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

