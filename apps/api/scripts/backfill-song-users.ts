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
      "Λείπουν OLD_DB_HOST / OLD_DB_USER / OLD_DB_NAME από το .env για το παλιό MySQL.",
    );
  }

  console.log("[*] Σύνδεση στην παλιά MySQL…");
  const conn = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: Number(OLD_DB_PORT || 3306),
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: "utf8mb4_general_ci",
  });

  // =========================================================
  // 1) Backfill Song.createdByUserId από πίνακα songs (MySQL)
  //    Χρησιμοποιούμε το Song.legacySongId (παλιό Song_ID)
  // =========================================================
  console.log("[*] Διαβάζω Song_ID, UserID από παλιό songs…");
  const [songRowsRaw] = await conn.query(
    `
      SELECT Song_ID, UserID
      FROM songs
    `,
  );

  type SongRow = {
    Song_ID: number;
    UserID: number | null;
  };

  const songRows = songRowsRaw as SongRow[];

  let updatedSongs = 0;

  for (const row of songRows) {
    const legacySongId = Number(row.Song_ID);
    const userId =
      row.UserID !== null && row.UserID !== undefined
        ? Number(row.UserID)
        : null;

    if (!legacySongId || !userId) {
      continue;
    }

    const result = await prisma.song.updateMany({
      where: {
        legacySongId,
        createdByUserId: null,
      },
      data: {
        createdByUserId: userId,
      },
    });

    if (result.count > 0) {
      updatedSongs += result.count;
    }
  }

  console.log(`[+] Ενημερώθηκαν createdByUserId σε ${updatedSongs} Song rows.`);

  // =========================================================
  // 2) Backfill SongVersion.createdByUserId από songs_versions
  //    ΥΠΟΘΕΣΗ: Το New_ID της MySQL αντιστοιχεί στο id του SongVersion.
  // =========================================================
  console.log("[*] Διαβάζω New_ID, UserID από παλιό songs_versions…");
  const [versionRowsRaw] = await conn.query(
    `
      SELECT New_ID, UserID
      FROM songs_versions
    `,
  );

  type VersionRow = {
    New_ID: number | null;
    UserID: number | null;
  };

  const versionRows = versionRowsRaw as VersionRow[];

  let updatedVersions = 0;

  for (const row of versionRows) {
    const legacyNewId =
      row.New_ID !== null && row.New_ID !== undefined
        ? Number(row.New_ID)
        : null;
    const userId =
      row.UserID !== null && row.UserID !== undefined
        ? Number(row.UserID)
        : null;

    if (!legacyNewId || !userId) {
      continue;
    }

    const result = await prisma.songVersion.updateMany({
      where: {
        id: legacyNewId,
        createdByUserId: null,
      },
      data: {
        createdByUserId: userId,
      },
    });

    if (result.count > 0) {
      updatedVersions += result.count;
    }
  }

  console.log(
    `[+] Ενημερώθηκαν createdByUserId σε ${updatedVersions} SongVersion rows.`,
  );

  await conn.end();
  console.log("[✓] Backfill ολοκληρώθηκε.");
}

main()
  .catch((err) => {
    console.error("Σφάλμα στο backfill-song-users:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
