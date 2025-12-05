// scripts/backfill-created-by-from-mysql.ts
//
// ΣΚΟΠΟΣ:
// --------
// Να γεμίσουμε τα Song.createdByUserId και SongVersion.createdByUserId
// στη νέα Postgres βάση, χρησιμοποιώντας τα παλιά UserID από MySQL
// (songs.UserID, songs_versions.UserID), χαρτογραφώντας τα σε User.id
// μέσω του User.wpId.
//
// ΒΑΣΙΚΕΣ ΠΑΡΑΔΟΧΕΣ (ΡΗΤΑ ΓΡΑΜΜΕΝΕΣ):
// -----------------------------------
// 1. Στην MySQL:
//    - songs.Song_ID είναι το παλιό ID τραγουδιού.
//    - songs.UserID είναι το παλιό WordPress user ID (wp_users.ID).
//    - songs_versions.Version_ID είναι το παλιό ID έκδοσης.
//    - songs_versions.Song_ID είναι το παλιό ID τραγουδιού.
//    - songs_versions.UserID είναι το παλιό WordPress user ID.
//
// 2. Στην Postgres:
//    - User.wpId = παλιό WordPress user ID (wp_users.ID).
//    - User.id   = νέο primary key χρήστη.
//    - Song.legacySongId     = (ιδανικά) παλιό Song_ID, αλλά ξέρουμε ότι
//      σε πολλές εγγραφές ΔΕΝ έχει γεμίσει σωστά.
//    - Song.id μπορεί ή όχι να ταυτίζεται με το Song_ID – ΔΕΝ το θεωρούμε
//      δεδομένο, απλά το δοκιμάζουμε *δεύτερο*.
//    - SongVersion.legacyNewId, SongVersion.legacySongIdOld υπάρχουν,
//      αλλά τα δεδομένα μπορεί να μην είναι πλήρη.
//
// 3. ΣΤΟ SCRIPT:
//    - Για Song:
//      * 1η προσπάθεια: εντοπίζουμε τραγούδι με Song.legacySongId = Song_ID.
//      * 2η προσπάθεια (fallback): εντοπίζουμε τραγούδι με Song.id = Song_ID.
//      * Αν βρούμε ΠΑΝΩ από 1 candidate ή κανέναν, ΔΕΝ κάνουμε update, γράφουμε WARN.
//    - Για SongVersion:
//      * 1η προσπάθεια: SongVersion.legacyNewId = Version_ID (αν υπάρχει).
//      * 2η προσπάθεια: SongVersion.legacySongIdOld = Song_ID ΚΑΙ songId = Song.id
//        του αντίστοιχου τραγουδιού, αν μπορούμε να το βρούμε.
//      * Αν δεν βρεθεί ΜΟΝΑΔΙΚΗ εγγραφή, ΔΕΝ κάνουμε update.
//
// 4. Δεν αλλάζουμε καμία άλλη στήλη εκτός από createdByUserId.
//    Δεν πειράζουμε ids, foreign keys κ.λπ.
//
// ΤΡΟΠΟΣ ΧΡΗΣΗΣ:
// --------------
// cd /home/reperto/repertorio/apps/api
// pnpm --filter api exec ts-node --transpile-only scripts/backfill-created-by-from-mysql.ts
//

import "dotenv/config";
import mysql from "mysql2/promise";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Αν θες να κάνεις DRY RUN, βάλ' το true (δεν γίνονται UPDATEs, μόνο logs)
const DRY_RUN = false;

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

  console.log("============================================");
  console.log("[*] Εκκίνηση backfill-created-by-from-mysql.ts");
  console.log("============================================");
  console.log(
    DRY_RUN ? "[MODE] DRY_RUN = true (ΔΕΝ θα γίνουν UPDATEs)" : "[MODE] ΠΡΑΓΜΑΤΙΚΟ UPDATE"
  );

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
    // =====================================================
    // 1) BACKFILL Song.createdByUserId από songs.UserID
    // =====================================================
    console.log("\n[*] Διαβάζω Song_ID, UserID από παλιό songs…");

    const [songRows] = await conn.query<any[]>(`
      SELECT Song_ID, UserID
      FROM songs
      WHERE UserID IS NOT NULL AND UserID <> 0
    `);

    console.log(
      `[Song] Βρέθηκαν συνολικά ${songRows.length} rows με UserID στη MySQL (songs).`
    );
    console.log("[Song] Πρώτες μέχρι 10 γραμμές:");
    for (const row of songRows.slice(0, 10)) {
      console.log(
        `  - Song_ID=${row.Song_ID}, UserID=${row.UserID}`
      );
    }

    let songUpdated = 0;
    let songNoUserMatch = 0;
    let songNoSongMatch = 0;
    let songMultipleMatch = 0;
    let songAlreadyCorrect = 0;

    for (const row of songRows) {
      const legacySongId = Number(row.Song_ID);
      const legacyUserId =
        row.UserID !== null && row.UserID !== undefined
          ? Number(row.UserID)
          : null;

      if (!legacySongId || !legacyUserId) {
        continue;
      }

      // Βρίσκουμε User με βάση το παλιό WordPress ID (wpId)
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ wpId: legacyUserId }, { id: legacyUserId }],
        },
        select: { id: true, wpId: true },
      });

      if (!user) {
        songNoUserMatch++;
        if (songNoUserMatch <= 20) {
          console.warn(
            `[Song][WARN] Δεν βρέθηκε User στο Postgres για UserID=${legacyUserId} (Song_ID=${legacySongId}).`
          );
        }
        continue;
      }

      // Προσπαθούμε να βρούμε το Song στη Postgres
      // 1) legacySongId = Song_ID
      const byLegacy = await prisma.song.findMany({
        where: { legacySongId },
        select: { id: true, createdByUserId: true },
      });

      let candidates = byLegacy;

      // 2) Αν δεν βρέθηκε τίποτα με legacySongId, δοκιμάζουμε id = Song_ID
      if (candidates.length === 0) {
        const byId = await prisma.song.findMany({
          where: { id: legacySongId },
          select: { id: true, createdByUserId: true },
        });
        candidates = byId;
      }

      if (candidates.length === 0) {
        songNoSongMatch++;
        if (songNoSongMatch <= 20) {
          console.warn(
            `[Song][WARN] Δεν βρέθηκε Song στο Postgres για Song_ID=${legacySongId} ( ούτε με legacySongId ούτε με id ).`
          );
        }
        continue;
      }

      if (candidates.length > 1) {
        songMultipleMatch++;
        if (songMultipleMatch <= 20) {
          console.warn(
            `[Song][WARN] Βρέθηκαν ΠΟΛΛΑ Songs για Song_ID=${legacySongId} (μέσω legacySongId/id). Παραλείπεται για ασφάλεια.`
          );
        }
        continue;
      }

      const song = candidates[0];

      if (song.createdByUserId === user.id) {
        songAlreadyCorrect++;
        continue;
      }

      if (!DRY_RUN) {
        await prisma.song.update({
          where: { id: song.id },
          data: { createdByUserId: user.id },
        });
      }

      songUpdated++;
      if (songUpdated % 100 === 0) {
        console.log(
          `[Song] Ενημερώθηκαν ${songUpdated} εγγραφές Song.createdByUserId μέχρι τώρα…`
        );
      }
    }

    console.log("\n=== Αποτελέσματα Song ===");
    console.log(`Ενημερώθηκαν (createdByUserId): ${songUpdated}`);
    console.log(`Ήταν ήδη σωστά: ${songAlreadyCorrect}`);
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε User σε Postgres): ${songNoUserMatch}`
    );
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε Song με legacySongId ή id): ${songNoSongMatch}`
    );
    console.log(
      `Παραλείφθηκαν (βρέθηκαν ΠΟΛΛΑ candidate Songs για ίδιο Song_ID): ${songMultipleMatch}`
    );

    // ==========================================================
    // 2) BACKFILL SongVersion.createdByUserId από songs_versions
    // ==========================================================
    console.log("\n[*] Διαβάζω Version_ID, Song_ID, UserID από παλιό songs_versions…");

    const [versionRows] = await conn.query<any[]>(`
      SELECT Version_ID, Song_ID, UserID
      FROM songs_versions
      WHERE UserID IS NOT NULL AND UserID <> 0
    `);

    console.log(
      `[SongVersion] Βρέθηκαν συνολικά ${versionRows.length} rows με UserID στη MySQL (songs_versions).`
    );
    console.log("[SongVersion] Πρώτες μέχρι 10 γραμμές:");
    for (const row of versionRows.slice(0, 10)) {
      console.log(
        `  - Version_ID=${row.Version_ID}, Song_ID=${row.Song_ID}, UserID=${row.UserID}`
      );
    }

    let versionUpdated = 0;
    let versionNoUserMatch = 0;
    let versionNoVersionMatch = 0;
    let versionMultipleMatch = 0;
    let versionAlreadyCorrect = 0;

    for (const row of versionRows) {
      const legacyVersionId =
        row.Version_ID !== null && row.Version_ID !== undefined
          ? Number(row.Version_ID)
          : null;
      const legacySongId =
        row.Song_ID !== null && row.Song_ID !== undefined
          ? Number(row.Song_ID)
          : null;
      const legacyUserId =
        row.UserID !== null && row.UserID !== undefined
          ? Number(row.UserID)
          : null;

      if (!legacyVersionId || !legacyUserId) {
        continue;
      }

      // User από wpId / id
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ wpId: legacyUserId }, { id: legacyUserId }],
        },
        select: { id: true, wpId: true },
      });

      if (!user) {
        versionNoUserMatch++;
        if (versionNoUserMatch <= 20) {
          console.warn(
            `[SongVersion][WARN] Δεν βρέθηκε User στο Postgres για UserID=${legacyUserId} (Version_ID=${legacyVersionId}, Song_ID=${legacySongId}).`
          );
        }
        continue;
      }

      // Προσπαθούμε να βρούμε SongVersion:
      // 1) legacyNewId = Version_ID
      let candidates = await prisma.songVersion.findMany({
        where: { legacyNewId: legacyVersionId },
        select: { id: true, createdByUserId: true, songId: true },
      });

      // 2) Αν δεν βρούμε, δοκιμάζουμε με legacySongIdOld + (προαιρετικά) songId
      if (candidates.length === 0 && legacySongId) {
        const byLegacySong = await prisma.songVersion.findMany({
          where: { legacySongIdOld: legacySongId },
          select: { id: true, createdByUserId: true, songId: true },
        });
        candidates = byLegacySong;
      }

      if (candidates.length === 0) {
        versionNoVersionMatch++;
        if (versionNoVersionMatch <= 20) {
          console.warn(
            `[SongVersion][WARN] Δεν βρέθηκε SongVersion στο Postgres για Version_ID=${legacyVersionId}, Song_ID=${legacySongId}.`
          );
        }
        continue;
      }

      if (candidates.length > 1) {
        versionMultipleMatch++;
        if (versionMultipleMatch <= 20) {
          console.warn(
            `[SongVersion][WARN] Βρέθηκαν ΠΟΛΛΑ SongVersions για Version_ID=${legacyVersionId}, Song_ID=${legacySongId}. Παραλείπεται για ασφάλεια.`
          );
        }
        continue;
      }

      const version = candidates[0];

      if (version.createdByUserId === user.id) {
        versionAlreadyCorrect++;
        continue;
      }

      if (!DRY_RUN) {
        await prisma.songVersion.update({
          where: { id: version.id },
          data: { createdByUserId: user.id },
        });
      }

      versionUpdated++;
      if (versionUpdated % 100 === 0) {
        console.log(
          `[SongVersion] Ενημερώθηκαν ${versionUpdated} εγγραφές SongVersion.createdByUserId μέχρι τώρα…`
        );
      }
    }

    console.log("\n=== Αποτελέσματα SongVersion ===");
    console.log(
      `Ενημερώθηκαν (createdByUserId): ${versionUpdated}`
    );
    console.log(`Ήταν ήδη σωστά: ${versionAlreadyCorrect}`);
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε User σε Postgres): ${versionNoUserMatch}`
    );
    console.log(
      `Παραλείφθηκαν (δεν βρέθηκε SongVersion με legacyNewId ή legacySongIdOld): ${versionNoVersionMatch}`
    );
    console.log(
      `Παραλείφθηκαν (βρέθηκαν ΠΟΛΛΑ candidate SongVersions): ${versionMultipleMatch}`
    );

    console.log("\n[✓] Backfill createdByUserId από MySQL ολοκληρώθηκε.");
  } finally {
    await conn.end();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Σφάλμα στο backfill-created-by-from-mysql:", err);
  process.exit(1);
});

