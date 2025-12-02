// scripts/migrate-composer-lyricist.ts
//
// Διαβάζει από το ΠΑΛΙΟ MySQL (songs.Composer, songs.Lyricist)
// μέσω του πίνακα songs_versions, και γεμίζει τον πίνακα
// SongVersionArtist στο Postgres με ρόλους COMPOSER και LYRICIST
// για ΟΛΕΣ τις εκδόσεις (SongVersion) κάθε τραγουδιού.

import "dotenv/config";
import mysql from "mysql2/promise";
import { PrismaClient, VersionArtistRole } from "@prisma/client";

const prisma = new PrismaClient();

type LegacyVersionRow = {
  Version_ID: number;
  New_ID: number | null;
  Song_ID: number;
  Title: string | null;
  Composer: string | null;
  Lyricist: string | null;
};

// helper για parsing "12, 15, 27"
function parseIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "" && /^\d+$/.test(p))
    .map((p) => Number(p))
    .filter((n) => n > 0);
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
      "[FATAL] Λείπουν OLD_DB_* μεταβλητές περιβάλλοντος στο .env του api."
    );
    process.exit(1);
  }

  console.log("=============================================");
  console.log("[*] Εκκίνηση migrate-composer-lyricist.ts (μέσω songs_versions)");
  console.log("=============================================");

  const mysqlConn = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: OLD_DB_PORT ? Number(OLD_DB_PORT) : 3306,
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: "utf8mb4_general_ci",
  });

  console.log("[*] Συνδέθηκα στο MySQL (παλιό repertorio).");

  // Παίρνουμε ΟΛΑ τα versions + τα πεδία του song (Composer, Lyricist)
  const [rowsRaw] = await mysqlConn.execute(
    `
    SELECT
      sv.Version_ID,
      sv.New_ID,
      sv.Song_ID,
      s.Title,
      s.Composer,
      s.Lyricist
    FROM songs_versions sv
    JOIN songs s ON s.Song_ID = sv.Song_ID
    `
  );

  const rows = rowsRaw as LegacyVersionRow[];

  console.log(
    `[*] Βρέθηκαν ${rows.length} rows από songs_versions + songs (MySQL).`
  );

  type SvaEntry = {
    versionId: number;
    artistId: number;
    role: VersionArtistRole;
  };

  const svaEntries: SvaEntry[] = [];

  let skippedNoVersion = 0;
  let skippedNoArtist = 0;

  // Cache για να μην κάνουμε χιλιάδες ίδιες ερωτήσεις
  const artistCache = new Map<number, number | null>();

  // Για αποφυγή διπλοεγγραφών (versionId + artistId + role)
  const uniqueKeySet = new Set<string>();

  async function findArtistIdByLegacy(
    legacyArtistId: number
  ): Promise<number | null> {
    if (artistCache.has(legacyArtistId)) {
      return artistCache.get(legacyArtistId)!;
    }

    const artist = await prisma.artist.findFirst({
      where: { legacyArtistId: legacyArtistId },
      select: { id: true },
    });

    const id = artist ? artist.id : null;
    artistCache.set(legacyArtistId, id);
    return id;
  }

  for (const row of rows) {
    const composerIds = parseIds(row.Composer);
    const lyricistIds = parseIds(row.Lyricist);

    if (composerIds.length === 0 && lyricistIds.length === 0) {
      // Καθόλου καλλιτέχνες σε αυτό το version -> συνεχίζουμε
      continue;
    }

    // Βρίσκουμε το SongVersion στο Postgres
    let version: { id: number } | null = null;

    // 1) Προσπαθούμε με legacyNewId = New_ID
    if (row.New_ID && row.New_ID > 0) {
      const v = await prisma.songVersion.findFirst({
        where: { legacyNewId: row.New_ID },
        select: { id: true },
      });
      if (v) {
        version = v;
      }
    }

    // 2) Fallback: δοκιμή με id = Version_ID (αν έχει γίνει έτσι το migration σου)
    if (!version) {
      const v = await prisma.songVersion.findFirst({
        where: { id: row.Version_ID },
        select: { id: true },
      });
      if (v) {
        version = v;
      }
    }

    if (!version) {
      skippedNoVersion++;
      console.warn(
        `[WARN] Δεν βρέθηκε SongVersion (Postgres) για Version_ID=${row.Version_ID}, New_ID=${row.New_ID}, Song_ID=${row.Song_ID}`
      );
      continue;
    }

    const versionId = version.id;

    // Συνθέτες
    for (const compLegacyId of composerIds) {
      const artistId = await findArtistIdByLegacy(compLegacyId);
      if (!artistId) {
        skippedNoArtist++;
        console.warn(
          `[WARN] Δεν βρέθηκε Artist (Postgres) για Composer Artist_ID=${compLegacyId} (Song_ID=${row.Song_ID}, Version_ID=${row.Version_ID})`
        );
        continue;
      }

      const key = `${versionId}|${artistId}|COMPOSER`;
      if (uniqueKeySet.has(key)) continue;
      uniqueKeySet.add(key);

      svaEntries.push({
        versionId,
        artistId,
        role: VersionArtistRole.COMPOSER,
      });
    }

    // Στιχουργοί
    for (const lyrLegacyId of lyricistIds) {
      const artistId = await findArtistIdByLegacy(lyrLegacyId);
      if (!artistId) {
        skippedNoArtist++;
        console.warn(
          `[WARN] Δεν βρέθηκε Artist (Postgres) για Lyricist Artist_ID=${lyrLegacyId} (Song_ID=${row.Song_ID}, Version_ID=${row.Version_ID})`
        );
        continue;
      }

      const key = `${versionId}|${artistId}|LYRICIST`;
      if (uniqueKeySet.has(key)) continue;
      uniqueKeySet.add(key);

      svaEntries.push({
        versionId,
        artistId,
        role: VersionArtistRole.LYRICIST,
      });
    }
  }

  console.log("[*] Τέλος σάρωσης MySQL versions.");
  console.log(
    `[*] Συνολικά entries για SongVersionArtist (COMPOSER/LYRICIST): ${svaEntries.length}`
  );
  console.log(
    `[*] SongVersion χωρίς αντιστοίχιση στο Postgres: ${skippedNoVersion}`
  );
  console.log(
    `[*] Entries που αγνοήθηκαν επειδή δεν βρέθηκε Artist στο Postgres: ${skippedNoArtist}`
  );

  if (svaEntries.length === 0) {
    console.log(
      "[INFO] Δεν βρέθηκαν καθόλου COMPOSER/LYRICIST για εισαγωγή. Τερματισμός."
    );
    await mysqlConn.end();
    await prisma.$disconnect();
    return;
  }

  console.log("[*] Εισαγωγή SongVersionArtist (COMPOSER/LYRICIST) σε batches...");

  const batchSize = 500;
  for (let i = 0; i < svaEntries.length; i += batchSize) {
    const batch = svaEntries.slice(i, i + batchSize);
    await prisma.songVersionArtist.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(
      `[*] Εισήχθη batch ${i}–${i + batch.length} / ${svaEntries.length}`
    );
  }

  await mysqlConn.end();
  await prisma.$disconnect();

  console.log("=============================================");
  console.log("[OK] migrate-composer-lyricist ολοκληρώθηκε.");
  console.log("=============================================");
}

main().catch((err) => {
  console.error("[FATAL] Σφάλμα στο migrate-composer-lyricist:", err);
  process.exit(1);
});
