// scripts/migrate-song-versions.ts
// Migration των εκτελέσεων (songs_versions) από MySQL
// στα Prisma models SongVersion & SongVersionArtist.
//
// ΤΡΟΠΟΣ ΧΡΗΣΗΣ (από /apps/api):
// 1) pnpm --filter api run build
// 2) node dist/scripts/migrate-song-versions.js
//
// ΑΠΑΙΤΕΙ:
// - Να έχει προηγηθεί το migrate-songs.ts (ώστε τα Song.legacySongId να υπάρχουν)
// - Να έχουν γίνει τα migrations Artists / Rythms / Categories.

import 'dotenv/config';
import {
  PrismaClient,
  VersionArtistRole,
} from '@prisma/client';
import mysql from 'mysql2/promise';

const prisma = new PrismaClient();

async function main() {
  console.log('=== SongVersion migration ξεκίνησε ===');

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

  // Φορτώνουμε όλους τους Artists από Postgres στη μνήμη: title -> id
  const artists = await prisma.artist.findMany();
  const artistByTitle = new Map<string, number>();
  for (const a of artists) {
    artistByTitle.set(a.title.trim(), a.id);
  }

  // Παίρνουμε τα versions μαζί με τον composer (join σε artists)
  const sql = `
    SELECT
      v.Version_ID,
      v.Song_ID,
      v.SongTitle,
      v.Year,
      v.Youtube,
      v.Youtube_Search,
      v.Player,
      v.Composer_Old,
      v.Composer,
      v.Song_ID_old,
      v.New_ID,
      v.UserID,
      a.Title AS ComposerTitle
    FROM songs_versions v
    LEFT JOIN artists a
      ON v.Composer = a.Artist_ID
  `;

  console.log('Εκτέλεση query για songs_versions...\n', sql.trim());

  const [rows] = await connection.query<any[]>(sql);

  console.log(`Βρέθηκαν ${rows.length} versions στην παλιά βάση.`);

  let processed = 0;
  let skipped = 0;

  for (const row of rows) {
    const versionIdOld: number = row.Version_ID;
    const songIdOld: number | null = row.Song_ID;

    if (!songIdOld) {
      console.warn(
        `Παράλειψη version χωρίς Song_ID (Version_ID=${versionIdOld})`,
      );
      skipped++;
      continue;
    }

    // Βρίσκουμε το αντίστοιχο Song μέσω legacySongId
    const song = await prisma.song.findFirst({
      where: { legacySongId: songIdOld },
    });

    if (!song) {
      console.warn(
        `Δεν βρέθηκε Song για Song_ID=${songIdOld} (Version_ID=${versionIdOld})`,
      );
      skipped++;
      continue;
    }

    const title = row.SongTitle ? String(row.SongTitle).trim() : null;

    let year: number | null = null;
    if (row.Year) {
      const yearNum = parseInt(String(row.Year), 10);
      if (!isNaN(yearNum)) {
        year = yearNum;
      }
    }

    const youtubeUrl = row.Youtube ? String(row.Youtube).trim() : null;
    const youtubeSearch = row.Youtube_Search
      ? String(row.Youtube_Search).trim()
      : null;
    const playerCode = row.Player ? String(row.Player).trim() : null;

    const legacyComposerOld = row.Composer_Old
      ? String(row.Composer_Old).trim()
      : null;
    const legacySongIdOld =
      typeof row.Song_ID_old === 'number' && !isNaN(row.Song_ID_old)
        ? row.Song_ID_old
        : null;
    const legacyNewId =
      typeof row.New_ID === 'number' && !isNaN(row.New_ID)
        ? row.New_ID
        : null;

    // Προς το παρόν δεν χαρτογραφούμε UserID σε User (άλλο migration)
    const createdByUserId: number | null = null;

    try {
      const version = await prisma.songVersion.create({
        data: {
          songId: song.id,
          title,
          year,
          youtubeUrl,
          youtubeSearch,
          playerCode,
          legacyComposerOld,
          legacySongIdOld,
          legacyNewId,
          createdByUserId,
        },
      });

      // Αν υπάρχει ComposerTitle, προσπάθησε να δημιουργήσεις SongVersionArtist (COMPOSER)
      const composerTitleRaw = row.ComposerTitle
        ? String(row.ComposerTitle).trim()
        : '';

      if (composerTitleRaw) {
        const artistId = artistByTitle.get(composerTitleRaw);
        if (artistId) {
          await prisma.songVersionArtist.create({
            data: {
              versionId: version.id,
              artistId,
              role: VersionArtistRole.COMPOSER,
              order: 0,
            },
          });
        } else {
          console.warn(
            `Δεν βρέθηκε Artist με title="${composerTitleRaw}" για Composer (Version_ID=${versionIdOld})`,
          );
        }
      }

      processed++;
    } catch (err) {
      console.error(
        `Σφάλμα κατά την εισαγωγή SongVersion (Version_ID=${versionIdOld}, Song_ID=${songIdOld})`,
        err,
      );
      skipped++;
    }
  }

  await connection.end();

  console.log('=== SongVersion migration ολοκληρώθηκε ===');
  console.log(`Επεξεργάστηκαν: ${processed}, Παραλείφθηκαν: ${skipped}`);
}

main()
  .catch((err) => {
    console.error('Σοβαρό σφάλμα στο migrate-song-versions:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

