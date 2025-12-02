import "dotenv/config";
import mysql from "mysql2/promise";
import { PrismaClient, VersionArtistRole } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Τύποι rows από την ΠΑΛΙΑ MySQL
 */
type ArtistRow = {
  Artist_ID: number;
  Title: string | null;
};

type SongRow = {
  Song_ID: number;
  Composer: string | null;
  Lyricist: string | null;
};

type VersionRow = {
  Version_ID: number;
  New_ID: number;
  Song_ID_old: number;
  Singer_Front: string | null;
  Singer_Back: string | null;
  // Αν θέλουμε αργότερα SOLOIST, θα προσθέσουμε εδώ το πεδίο του.
};

/**
 * Βοηθητικό: parse "1, 2, 3" -> [1,2,3]
 */
function parseIds(csv: string | null): number[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Βοηθητικό: normalize τίτλου καλλιτέχνη για map (ίδια λογική με migrate-songs)
 */
function normalizeTitle(title: string): string {
  return title.trim().toUpperCase();
}

async function main() {
  const {
    OLD_DB_HOST,
    OLD_DB_PORT,
    OLD_DB_USER,
    OLD_DB_PASSWORD,
    OLD_DB_NAME,
  } = process.env;

  if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
    console.error(
      "[FATAL] Πρέπει να είναι ορισμένα τα OLD_DB_HOST, OLD_DB_USER, OLD_DB_NAME στο .env"
    );
    process.exit(1);
  }

  const oldDb = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: Number(OLD_DB_PORT ?? "3306"),
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD ?? undefined,
    database: OLD_DB_NAME,
    charset: "utf8mb4",
  });

  console.log("[*] Φόρτωση artists από ΠΑΛΙΑ MySQL...");
  // ΝΕΟ – ΤΥΠΟΑΣΦΑΛΕΣ ΚΑΙ ΧΩΡΙΣ TS ERROR
const [artistRowsRaw] = await oldDb.query(
  `
    SELECT
      Artist_ID,
      Title
    FROM artists
  `,
);

const artistRows = artistRowsRaw as ArtistRow[];

  const artistTitleById = new Map<number, string>();
  for (const row of artistRows) {
    if (!row.Title) continue;
    artistTitleById.set(row.Artist_ID, String(row.Title).trim());
  }
  console.log(`[*] Βρέθηκαν ${artistTitleById.size} καλλιτέχνες (MySQL).`);

  console.log("[*] Φόρτωση songs (Composer / Lyricist) από ΠΑΛΙΑ MySQL...");
  // ΝΕΟ – ΧΩΡΙΣ GENERIC ΣΤΟ query
const [songRowsRaw] = await oldDb.query(
  `
    SELECT
      Song_ID,
      Composer,
      Lyricist
    FROM songs
  `,
);

const songRows = songRowsRaw as SongRow[];

  const songById = new Map<number, SongRow>();
  for (const row of songRows) {
    songById.set(row.Song_ID, row);
  }
  console.log(`[*] Βρέθηκαν ${songById.size} τραγούδια (MySQL).`);

  console.log("[*] Φόρτωση versions (Singer_Front / Singer_Back) από ΠΑΛΙΑ MySQL...");
  // ΝΕΟ – ΙΔΙΑ ΛΟΓΙΚΗ
const [versionRowsRaw] = await oldDb.query(
  `
    SELECT
      New_ID,
      Song_ID,
      Singer_Front,
      Singer_Back
    FROM songs_versions
  `,
);

const versionRows = versionRowsRaw as VersionRow[];

  console.log(`[*] Βρέθηκαν ${versionRows.length} versions (MySQL).`);

  console.log('[*] Φόρτωση καλλιτεχνών από PostgreSQL...');
  const artistsPg = await prisma.artist.findMany();
  const artistIdByNormTitle = new Map<string, number>();
  for (const a of artistsPg) {
    artistIdByNormTitle.set(normalizeTitle(a.title), a.id);
  }
  console.log(`[*] Artists στο Postgres: ${artistsPg.length}`);

  // Καθαρίζουμε τον πίνακα SongVersionArtist για να ξαναγεμίσει "καθαρά"
  console.log('[*] Διαγραφή όλων των εγγραφών από "SongVersionArtist"...');
  await prisma.songVersionArtist.deleteMany({});
  console.log('[*] Ο πίνακας SongVersionArtist καθαρίστηκε.');

  let totalVersionRows = 0;
  let skippedNoVersion = 0;
  let skippedNoArtist = 0;
  let inserted = 0;

  type PendingEntry = {
    versionId: number;
    artistId: number;
    role: VersionArtistRole;
  };

  const batch: PendingEntry[] = [];
  const BATCH_SIZE = 1000;

  function addEntry(
    versionId: number,
    artistTitle: string,
    role: VersionArtistRole
  ) {
    const norm = normalizeTitle(artistTitle);
    const artistId = artistIdByNormTitle.get(norm);

    if (!artistId) {
      skippedNoArtist++;
      if (skippedNoArtist <= 50) {
        console.warn(
          `[WARN] Δεν βρέθηκε Artist στο Postgres για "${artistTitle}" (role=${role}, versionId=${versionId})`
        );
      }
      return;
    }

    batch.push({ versionId, artistId, role });
  }

  async function flushBatch() {
    if (batch.length === 0) return;

    // Αφαιρούμε διπλότυπα (versionId+artistId+role)
    const uniqueMap = new Map<string, PendingEntry>();
    for (const entry of batch) {
      const key = `${entry.versionId}-${entry.artistId}-${entry.role}`;
      uniqueMap.set(key, entry);
    }
    const data = Array.from(uniqueMap.values());
    batch.length = 0;

    const res = await prisma.songVersionArtist.createMany({
      data,
      skipDuplicates: true,
    });

    inserted += res.count;
    console.log(`[*] Εισήχθη batch (${data.length} rows). Σύνολο μέχρι τώρα: ${inserted}`);
  }

  console.log("[*] Έναρξη migration SongVersionArtist από MySQL → Postgres...");

  for (const v of versionRows) {
    totalVersionRows++;

    // Βρίσκουμε το αντίστοιχο SongVersion στο Postgres με βάση το legacyNewId = New_ID
    const version = await prisma.songVersion.findFirst({
      where: { legacyNewId: v.New_ID },
      select: { id: true },
    });

    if (!version) {
      skippedNoVersion++;
      if (skippedNoVersion <= 50) {
        console.warn(
          `[WARN] Δεν βρέθηκε SongVersion (Postgres) για New_ID=${v.New_ID} (Version_ID=${v.Version_ID}, Song_ID_old=${v.Song_ID_old})`
        );
      }
      continue;
    }

    const versionId = version.id;

    // -----------------------------
    // COMPOSER & LYRICIST από τον πίνακα songs
    // -----------------------------
    const songRow = songById.get(v.Song_ID_old);
    if (songRow) {
      const composerIds = parseIds(songRow.Composer);
      const lyricistIds = parseIds(songRow.Lyricist);

      for (const aid of composerIds) {
        const title = artistTitleById.get(aid);
        if (title) {
          addEntry(versionId, title, VersionArtistRole.COMPOSER);
        }
      }

      for (const aid of lyricistIds) {
        const title = artistTitleById.get(aid);
        if (title) {
          addEntry(versionId, title, VersionArtistRole.LYRICIST);
        }
      }
    } else {
      // Αν δεν βρούμε songRow, δεν είναι τραγωδία· απλά δεν θα έχουμε composer/lyricist από αυτό το τραγούδι.
      // Μπορούμε να βάλουμε προαιρετικό debug αν χρειαστεί.
    }

    // -----------------------------
    // SINGER_FRONT από songs_versions
    // -----------------------------
    const frontIds = parseIds(v.Singer_Front);
    for (const aid of frontIds) {
      const title = artistTitleById.get(aid);
      if (title) {
        addEntry(versionId, title, VersionArtistRole.SINGER_FRONT);
      }
    }

    // -----------------------------
    // SINGER_BACK από songs_versions
    // -----------------------------
    const backIds = parseIds(v.Singer_Back);
    for (const aid of backIds) {
      const title = artistTitleById.get(aid);
      if (title) {
        addEntry(versionId, title, VersionArtistRole.SINGER_BACK);
      }
    }

    // Αν μαζευτεί μεγάλο batch, το γράφουμε
    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  // Τελευταίο batch
  await flushBatch();

  await oldDb.end();

  console.log("=============================================");
  console.log("[OK] migrate-song-version-artists ολοκληρώθηκε.");
  console.log(`Σύνολο MySQL versions που επεξεργαστήκαμε: ${totalVersionRows}`);
  console.log(`SongVersion χωρίς αντιστοίχιση στο Postgres: ${skippedNoVersion}`);
  console.log(
    `Ρόλοι που αγνοήθηκαν επειδή δεν βρέθηκε Artist στο Postgres: ${skippedNoArtist}`
  );
  console.log(
    `Συνολικά entries που γράφτηκαν στο SongVersionArtist: ${inserted}`
  );
  console.log("=============================================");
}

main()
  .catch((err) => {
    console.error("[FATAL] Σφάλμα στο migrate-song-version-artists:", err);
    process.exit(1);
  })
  .finally(async () => {
    prisma
      .$disconnect()
      .catch((err) =>
        console.error("Σφάλμα στο prisma.$disconnect:", err)
      );
  });

