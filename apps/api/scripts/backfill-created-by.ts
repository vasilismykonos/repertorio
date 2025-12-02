// apps/api/scripts/backfill-song-users.ts
//
// Backfill των createdByUserId σε Song & SongVersion
// χρησιμοποιώντας τα παλιά UserID από MySQL (songs, songs_versions).
//
// ΤΡΟΠΟΣ ΧΡΗΣΗΣ (από /apps/api):
// 1) pnpm --filter api build
// 2) node dist/scripts/backfill-song-users.js

import "dotenv/config";
import mysql from "mysql2/promise";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const {
    OLD_DB_HOST,
    OLD_DB_PORT,
    OLD_DB_USER,
    OLD_DB_PASSWORD,
    OLD_DB_NAME,
  } = process.env;

  if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
    throw new Error(
      "Λείπουν κάποια από τα OLD_DB_* env vars (OLD_DB_HOST, OLD_DB_USER, OLD_DB_NAME)."
    );
  }

  const mysqlPort = OLD_DB_PORT ? parseInt(OLD_DB_PORT, 10) : 3306;

  console.log("[*] Σύνδεση στην παλιά MySQL...");
  const conn = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: mysqlPort,
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: "utf8mb4_unicode_ci",
  });

  try {
    // =============================
    // 1) SONGS: Song.createdByUserId
    // =============================

    console.log("[*] Backfill createdByUserId για Song...");

    const [songRows] = await conn.query<any[]>(`
      SELECT Song_ID, UserID
      FROM songs
      WHERE UserID IS NOT NULL AND UserID <> 0
    `);

    console.log(`[Song] Βρέθηκαν ${songRows.length} rows με UserID.`);

    let songUpdated = 0;
    let songSkippedNoUser = 0;
    let songSkippedNoSong = 0;

    for (const row of songRows) {
      const songIdOld: number = row.Song_ID;
      const userIdOld: number = row.UserID;

      if (!userIdOld) continue;

      // ΣΤΟΙΧΕΙΑ ΔΟΜΗΣ:
      // - migrate-users.ts: "κρατώντας ΤΟ ΙΔΙΟ id με το wp_users.ID"
      // => User.id == παλιό wp_users.ID
      // - Prisma User έχει επίσης wpId (παλαιό ID)
      //
      // Άρα το πιο ασφαλές είναι:
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ id: userIdOld }, { wpId: userIdOld }],
        },
        select: { id: true },
      });

      if (!user) {
        console.warn(
          `[Song] Δεν βρέθηκε User στο Postgres για UserID=${userIdOld} (Song_ID=${songIdOld}).`
        );
        songSkippedNoUser++;
        continue;
      }

      // ΣΤΟΙΧΕΙΑ ΔΟΜΗΣ:
      // - Prisma Song: legacySongId Int? // Song_ID_old αν το χρειαστούμε
      // => legacySongId = παλιό songs.Song_ID
      const song = await prisma.song.findFirst({
        where: { legacySongId: songIdOld },
        select: { id: true, createdByUserId: true },
      });

      if (!song) {
        console.warn(
          `[Song] Δεν βρέθηκε Song στο Postgres για Song_ID=${songIdOld}.`
        );
        songSkippedNoSong++;
        continue;
      }

      // Αν ήδη είναι σωστό, μην κάνεις update.
      if (song.createdByUserId === user.id) {
        continue;
      }

      await prisma.song.update({
        where: { id: song.id },
        data: { createdByUserId: user.id },
      });

      songUpdated++;
      if (songUpdated % 100 === 0) {
        console.log(`[Song] Ενημερώθηκαν ${songUpdated} songs μέχρι τώρα...`);
      }
    }

    console.log("=== Αποτελέσματα Song ===");
    console.log(`Ενημερώθηκαν: ${songUpdated}`);
    console.log(`Παραλείφθηκαν (δεν βρέθηκε User): ${songSkippedNoUser}`);
    console.log(`Παραλείφθηκαν (δεν βρέθηκε Song): ${songSkippedNoSong}`);

    // =============================
    // 2) SONG_VERSIONS: SongVersion.createdByUserId
    // =============================

    console.log("[*] Backfill createdByUserId για SongVersion...");

    const [versionRows] = await conn.query<any[]>(`
      SELECT Version_ID, New_ID, UserID
      FROM songs_versions
      WHERE UserID IS NOT NULL AND UserID <> 0
    `);

    console.log(
      `[SongVersion] Βρέθηκαν ${versionRows.length} rows με UserID.`
    );

    let versionUpdated = 0;
    let versionSkippedNoUser = 0;
    let versionSkippedNoVersion = 0;

    for (const row of versionRows) {
      const versionIdOld: number = row.Version_ID;
      const newIdOld: number | null = row.New_ID;
      const userIdOld: number = row.UserID;

      if (!userIdOld) continue;

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ id: userIdOld }, { wpId: userIdOld }],
        },
        select: { id: true },
      });

      if (!user) {
        console.warn(
          `[SongVersion] Δεν βρέθηκε User στο Postgres για UserID=${userIdOld} (Version_ID=${versionIdOld}).`
        );
        versionSkippedNoUser++;
        continue;
      }

      if (!newIdOld) {
        console.warn(
          `[SongVersion] Version_ID=${versionIdOld} έχει New_ID=null - δεν μπορεί να γίνει map σε SongVersion (legacyNewId).`
        );
        versionSkippedNoVersion++;
        continue;
      }

      // ΣΤΟΙΧΕΙΑ ΔΟΜΗΣ:
      // - Prisma SongVersion: legacyNewId Int?
      // => legacyNewId = παλιό songs_versions.New_ID
      const version = await prisma.songVersion.findFirst({
        where: { legacyNewId: newIdOld },
        select: { id: true, createdByUserId: true },
      });

      if (!version) {
        console.warn(
          `[SongVersion] Δεν βρέθηκε SongVersion στο Postgres για New_ID=${newIdOld} (Version_ID=${versionIdOld}).`
        );
        versionSkippedNoVersion++;
        continue;
      }

      if (version.createdByUserId === user.id) {
        continue;
      }

      await prisma.songVersion.update({
        where: { id: version.id },
        data: { createdByUserId: user.id },
      });

      versionUpdated++;
      if (versionUpdated % 100 === 0) {
        console.log(
          `[SongVersion] Ενημερώθηκαν ${versionUpdated} versions μέχρι τώρα...`
        );
      }
    }

    console.log("=== Αποτελέσματα SongVersion ===");
    console.log(`Ενημερώθηκαν: ${versionUpdated}`);
    console.log(`Παραλείφθηκαν (δεν βρέθηκε User): ${versionSkippedNoUser}`);
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε SongVersion / New_ID null): ${versionSkippedNoVersion}`
    );

    console.log("[✓] Backfill ολοκληρώθηκε.");
  } finally {
    await conn.end();
    await prisma.$disconnect();
  }
}

main()
  .catch((err) => {
    console.error("Σφάλμα στο backfill-song-users:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
