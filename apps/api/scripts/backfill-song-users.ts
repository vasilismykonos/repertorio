// apps/api/scripts/backfill-song-users.ts
//
// Backfill των createdByUserId σε Song & SongVersion
// χρησιμοποιώντας τα παλιά UserID από MySQL (songs, songs_versions).
//
// Βασίζεται στα εξής που έχουμε ήδη στο schema/migrations:
//
// - MySQL:
//   * songs.Song_ID (PK), songs.UserID
//   * songs_versions.New_ID, songs_versions.UserID
//
// - PostgreSQL (Prisma):
//   * Song.legacySongId = παλιό songs.Song_ID
//   * SongVersion.legacyNewId = παλιό songs_versions.New_ID
//   * User.id = παλιό wp_users.ID (από migrate-users.ts)
//   * User.wpId = επίσης παλιό wp_users.ID
//
// ΤΡΟΠΟΣ ΧΡΗΣΗΣ (από /apps/api):
//   pnpm --filter api exec ts-node --transpile-only scripts/backfill-song-users.ts

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

  console.log("[*] Σύνδεση στην παλιά MySQL…");
  const conn = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: mysqlPort,
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: "utf8mb4_unicode_ci",
  });

  try {
    // ------------------------------------------------------------
    // 1) SONGS – γέμισμα Song.createdByUserId από songs.UserID
    // ------------------------------------------------------------
    console.log("[*] Διαβάζω Song_ID, UserID από παλιό songs…");

    const [songRows] = await conn.query<any[]>(`
      SELECT Song_ID, UserID
      FROM songs
      WHERE UserID IS NOT NULL AND UserID <> 0
    `);

    console.log(
      `[Song] Βρέθηκαν συνολικά ${songRows.length} rows με UserID στη MySQL (songs).`
    );

    let songUpdated = 0;
    let songNoUserMatch = 0;
    let songNoSongMatch = 0;

    // Δείγμα για debug (να δούμε τι περίπου δεδομένα έχουμε)
    console.log("[Song] Πρώτες μέχρι 10 γραμμές από MySQL (Song_ID, UserID):");
    for (const row of songRows.slice(0, 10)) {
      console.log(
        `  - Song_ID=${row.Song_ID}, UserID=${row.UserID}`
      );
    }

    for (const row of songRows) {
      const legacySongId = Number(row.Song_ID);
      const userIdOld =
        row.UserID !== null && row.UserID !== undefined
          ? Number(row.UserID)
          : null;

      if (!legacySongId || !userIdOld) {
        continue;
      }

      // Βρίσκουμε User στο Postgres είτε με id είτε με wpId
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ id: userIdOld }, { wpId: userIdOld }],
        },
        select: { id: true },
      });

      if (!user) {
        songNoUserMatch++;
        // Για τα πρώτα 20 που δεν βρίσκουν user, γράφε αναλυτικό debug
        if (songNoUserMatch <= 20) {
          console.warn(
            `[Song][WARN] Δεν βρέθηκε User στο Postgres για UserID=${userIdOld} (Song_ID=${legacySongId}).`
          );
        }
        continue;
      }

      // Βρίσκουμε Song στο Postgres με βάση legacySongId
      const song = await prisma.song.findFirst({
        where: { legacySongId },
        select: { id: true, createdByUserId: true },
      });

      if (!song) {
        songNoSongMatch++;
        if (songNoSongMatch <= 20) {
          console.warn(
            `[Song][WARN] Δεν βρέθηκε Song στο Postgres για Song_ID=${legacySongId}.`
          );
        }
        continue;
      }

      // Αν ήδη είναι σωστό, μην κάνεις update
      if (song.createdByUserId === user.id) {
        continue;
      }

      await prisma.song.update({
        where: { id: song.id },
        data: { createdByUserId: user.id },
      });

      songUpdated++;
      if (songUpdated % 100 === 0) {
        console.log(
          `[Song] Ενημερώθηκαν ${songUpdated} εγγραφές Song μέχρι τώρα…`
        );
      }
    }

    console.log("=== Αποτελέσματα Song ===");
    console.log(`Ενημερώθηκαν (createdByUserId): ${songUpdated}`);
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε User σε Postgres): ${songNoUserMatch}`
    );
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε Song με legacySongId): ${songNoSongMatch}`
    );

    // ------------------------------------------------------------
    // 2) SONG_VERSIONS – γέμισμα SongVersion.createdByUserId
    // ------------------------------------------------------------
    console.log("[*] Διαβάζω New_ID, UserID από παλιό songs_versions…");

    const [versionRows] = await conn.query<any[]>(`
      SELECT Version_ID, New_ID, UserID
      FROM songs_versions
      WHERE UserID IS NOT NULL AND UserID <> 0
    `);

    console.log(
      `[SongVersion] Βρέθηκαν συνολικά ${versionRows.length} rows με UserID στη MySQL (songs_versions).`
    );

    let versionUpdated = 0;
    let versionNoUserMatch = 0;
    let versionNoVersionMatch = 0;
    let versionNoNewId = 0;

    console.log(
      "[SongVersion] Πρώτες μέχρι 10 γραμμές από MySQL (Version_ID, New_ID, UserID):"
    );
    for (const row of versionRows.slice(0, 10)) {
      console.log(
        `  - Version_ID=${row.Version_ID}, New_ID=${row.New_ID}, UserID=${row.UserID}`
      );
    }

    for (const row of versionRows) {
      const versionIdOld = Number(row.Version_ID);
      const newIdOld =
        row.New_ID !== null && row.New_ID !== undefined
          ? Number(row.New_ID)
          : null;
      const userIdOld =
        row.UserID !== null && row.UserID !== undefined
          ? Number(row.UserID)
          : null;

      if (!userIdOld) {
        continue;
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ id: userIdOld }, { wpId: userIdOld }],
        },
        select: { id: true },
      });

      if (!user) {
        versionNoUserMatch++;
        if (versionNoUserMatch <= 20) {
          console.warn(
            `[SongVersion][WARN] Δεν βρέθηκε User στο Postgres για UserID=${userIdOld} (Version_ID=${versionIdOld}).`
          );
        }
        continue;
      }

      if (!newIdOld) {
        versionNoNewId++;
        if (versionNoNewId <= 20) {
          console.warn(
            `[SongVersion][WARN] Version_ID=${versionIdOld} έχει New_ID=null - δεν μπορεί να γίνει map σε SongVersion (legacyNewId).`
          );
        }
        continue;
      }

      const version = await prisma.songVersion.findFirst({
        where: { legacyNewId: newIdOld },
        select: { id: true, createdByUserId: true },
      });

      if (!version) {
        versionNoVersionMatch++;
        if (versionNoVersionMatch <= 20) {
          console.warn(
            `[SongVersion][WARN] Δεν βρέθηκε SongVersion στο Postgres για New_ID=${newIdOld} (Version_ID=${versionIdOld}).`
          );
        }
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
          `[SongVersion] Ενημερώθηκαν ${versionUpdated} εγγραφές SongVersion μέχρι τώρα…`
        );
      }
    }

    console.log("=== Αποτελέσματα SongVersion ===");
    console.log(`Ενημερώθηκαν (createdByUserId): ${versionUpdated}`);
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε User σε Postgres): ${versionNoUserMatch}`
    );
    console.log(
      `Παραλείφθηκαν (New_ID = null ή 0): ${versionNoNewId}`
    );
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε SongVersion με legacyNewId): ${versionNoVersionMatch}`
    );

    console.log("[✓] Backfill ολοκληρώθηκε.");
  } finally {
    await conn.end();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Σφάλμα στο backfill-song-users:", err);
  process.exit(1);
});
