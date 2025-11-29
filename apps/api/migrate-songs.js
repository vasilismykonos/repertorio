// migrate-songs.js
// Μεταφορά τραγουδιών από παλιά MySQL σε PostgreSQL (Prisma) με ΙΔΙΑ IDs

require("dotenv").config();
const mysql = require("mysql2/promise");
const { PrismaClient, SongStatus } = require("@prisma/client");

const prisma = new PrismaClient();


// ΡΥΘΜΙΣΕ αυτά για την ΠΑΛΙΑ MySQL (WordPress)
const MYSQL_CONFIG = {
  host: "localhost",          // ή IP MySQL
  user: "chatgpt1",            // βάλε τον δικό σου
  password: "VQ.wS@P58QJMTNtN",    // βάλε το δικό σου
  database: "repertorio.net",   // όνομα DB που έχει τον πίνακα songs
  charset: "utf8mb4",
};


const BATCH_SIZE = 500;

/**
 * Χαρτογράφηση του παλιού Status (string) → νέο SongStatus enum.
 */
function mapStatus(oldStatus) {
  if (!oldStatus) return SongStatus.PUBLISHED;

  const s = String(oldStatus).trim();

  if (s === "Καταχωρήθηκε" || s === "Ενεργό" || s === "Published") {
    return SongStatus.PUBLISHED;
  }
  if (s === "Πρόχειρο" || s === "Draft") {
    return SongStatus.DRAFT;
  }
  if (s === "Υπό έγκριση" || s === "Pending") {
    return SongStatus.PENDING_APPROVAL;
  }
  if (s === "Αρχείο" || s === "Archived") {
    return SongStatus.ARCHIVED;
  }

  return SongStatus.PUBLISHED;
}

/**
 * Χαρτογράφηση row MySQL → Prisma Song (create data)
 */
function mapSongRowToPrismaCreate(row) {
  // Casting σε αριθμούς εκεί που το Prisma περιμένει Int
  const id = row.Song_ID != null ? Number(row.Song_ID) : null;
  const categoryId =
    row.Category_ID != null && row.Category_ID !== ""
      ? Number(row.Category_ID)
      : null;
  const rythmId =
    row.Rythm_ID != null && row.Rythm_ID !== ""
      ? Number(row.Rythm_ID)
      : null;

  return {
    // ΚΡΑΤΑΜΕ ΙΔΙΟ ID
    id,

    title: row.Title || "",
    firstLyrics: row.FirstLyrics || null,
    lyrics: row.Lyrics || null,
    chords: row.Chords || null,
    characteristics: row.Characteristics || null,

    status: mapStatus(row.Status),

    originalKey: row.Tune_Writed || null,
    defaultKey: row.Default_Tune || null,
    basedOn: row.BasedOn || null,
    scoreFile: row.Partiture || null,
    highestVocalNote: row.Highest_Vocal_Note || null,

    // Προς το παρόν χωρίς views από MySQL
    views: 0,

    legacySongId: null,

    // Foreign keys (ΠΡΕΠΕΙ να υπάρχουν Category/Rythm με αυτά τα IDs στο PostgreSQL)
    categoryId,
    rythmId,
    makamId: null,

    createdByUserId: null,
  };
}

async function migrateSongs() {
  console.log("Ξεκινάει migration τραγουδιών...");

  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  console.log("Σύνδεση με MySQL OK.");

  const [countRows] = await mysqlConn.execute(
    "SELECT COUNT(*) AS total FROM songs"
  );
  const total = countRows[0].total;
  console.log(`Συνολικά τραγούδια στη MySQL: ${total}`);

  let offset = 0;
  let migrated = 0;

  while (offset < total) {
    console.log(`Διαβάζω batch από offset ${offset}...`);

    const [rows] = await mysqlConn.execute(
      `
      SELECT
        Song_ID,
        Title,
        FirstLyrics,
        Lyrics,
        Chords,
        Characteristics,
        Status,
        Tune_Writed,
        Default_Tune,
        BasedOn,
        Partiture,
        Highest_Vocal_Note,
        Category_ID,
        Rythm_ID
      FROM songs
      ORDER BY Song_ID ASC
      LIMIT ? OFFSET ?
      `,
      [BATCH_SIZE, offset]
    );

    if (!rows || rows.length === 0) {
      console.log("Δεν βρέθηκαν άλλα rows, τερματίζω.");
      break;
    }

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const data = mapSongRowToPrismaCreate(row);

        try {
          await tx.song.upsert({
            where: { id: data.id },
            update: {
              title: data.title,
              firstLyrics: data.firstLyrics,
              lyrics: data.lyrics,
              chords: data.chords,
              characteristics: data.characteristics,
              status: data.status,
              originalKey: data.originalKey,
              defaultKey: data.defaultKey,
              basedOn: data.basedOn,
              scoreFile: data.scoreFile,
              highestVocalNote: data.highestVocalNote,
              views: data.views,
              legacySongId: data.legacySongId,
              categoryId: data.categoryId,
              rythmId: data.rythmId,
              makamId: data.makamId,
              createdByUserId: data.createdByUserId,
            },
            create: data,
          });

          migrated++;
        } catch (err) {
          console.error(
            `Σφάλμα στο τραγούδι με ID ${data.id}:`,
            err.message || err
          );
          // Αν θέλεις να σταματάει στο πρώτο σοβαρό λάθος:
          // throw err;
        }
      }
    });

    console.log(`Μέχρι τώρα έχουν μεταφερθεί ${migrated} τραγούδια.`);
    offset += BATCH_SIZE;
  }

  await mysqlConn.end();
  console.log(`ΤΕΛΟΣ: Μεταφέρθηκαν/ενημερώθηκαν ${migrated} τραγούδια.`);
}

migrateSongs()
  .catch((err) => {
    console.error("Γενικό σφάλμα στο migration:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log("Prisma disconnect OK.");
  });
