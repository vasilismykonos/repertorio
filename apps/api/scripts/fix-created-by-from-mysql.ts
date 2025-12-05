// scripts/fix-created-by-from-mysql.ts
//
// Σκοπός:
//  - Να ευθυγραμμίσει το Song.createdByUserId στην Postgres
//    με βάση τον παλιό πίνακα songs στη MySQL.
//  - Χρησιμοποιεί mapping: MySQL songs.UserID -> Postgres User.wpId -> Postgres User.id
//
// Προϋποθέσεις:
//  - .env με OLD_DB_HOST, OLD_DB_PORT, OLD_DB_USER, OLD_DB_PASSWORD, OLD_DB_NAME
//  - Prisma schema με User { id, wpId }, Song { id, legacySongId, createdByUserId }

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import mysql, { RowDataPacket } from "mysql2/promise";

const prisma = new PrismaClient();

async function main() {
  console.log("=============================================");
  console.log("[*] Εκκίνηση fix-created-by-from-mysql.ts");
  console.log("=============================================");

  const {
    OLD_DB_HOST,
    OLD_DB_PORT,
    OLD_DB_USER,
    OLD_DB_PASSWORD,
    OLD_DB_NAME,
  } = process.env;

  if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
    console.error(
      "[FATAL] Πρέπει να είναι ορισμένα τα OLD_DB_HOST, OLD_DB_USER, OLD_DB_NAME στο .env",
    );
    process.exit(1);
  }

  const mysqlPort = Number(OLD_DB_PORT || "3306");

  console.log(
    `[INFO] Σύνδεση στη MySQL: host=${OLD_DB_HOST}, port=${mysqlPort}, db=${OLD_DB_NAME}`,
  );

  const mysqlPool = await mysql.createPool({
    host: OLD_DB_HOST,
    port: mysqlPort,
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });

  console.log("[INFO] Φόρτωση User.wpId -> User.id από Postgres...");

  const users = await prisma.user.findMany({
    select: { id: true, wpId: true },
  });

  const wpIdToUserId = new Map<number, number>();
  for (const u of users) {
    if (u.wpId !== null && u.wpId !== undefined) {
      wpIdToUserId.set(u.wpId, u.id);
    }
  }

  console.log(
    `[INFO] Βρέθηκαν ${users.length} χρήστες στην Postgres, με ${wpIdToUserId.size} wpId mappings.`,
  );

  console.log("[INFO] Φόρτωση όλων των τραγουδιών από Postgres...");

  const songs = await prisma.song.findMany({
    select: {
      id: true,
      legacySongId: true,
      createdByUserId: true,
    },
    orderBy: { id: "asc" },
  });

  console.log(`[INFO] Σύνολο τραγουδιών στην Postgres: ${songs.length}`);

  let updated = 0;
  let skippedNoMysqlRow = 0;
  let skippedNoUserMapping = 0;
  let skippedSameUser = 0;

  for (const song of songs) {
    // Προσπαθούμε να βρούμε το αντίστοιχο Song_ID στη MySQL.
    // Προτεραιότητα στο legacySongId. Αν είναι null, υποθέτουμε ότι Song.id == Song_ID.
    const mysqlSongId = song.legacySongId ?? song.id;

    // Παίρνουμε τον UserID από τη MySQL
    const [rows] = await mysqlPool.query<RowDataPacket[]>(
      "SELECT UserID FROM songs WHERE Song_ID = ?",
      [mysqlSongId],
    );

    if (!rows || rows.length === 0) {
      // Δεν βρέθηκε τραγούδι στη MySQL για αυτό το Song
      skippedNoMysqlRow++;
      continue;
    }

    const mysqlUserId = rows[0].UserID as number | null;

    if (!mysqlUserId) {
      skippedNoMysqlRow++;
      continue;
    }

    // Βρίσκουμε στην Postgres τον νέο χρήστη με wpId = mysqlUserId
    const newUserId = wpIdToUserId.get(mysqlUserId);

    if (!newUserId) {
      // Δεν υπάρχει mapping χρήστη για αυτόν τον παλιό UserID
      skippedNoUserMapping++;
      continue;
    }

    // Αν ήδη δείχνει στον σωστό χρήστη, δεν κάνουμε update
    if (song.createdByUserId === newUserId) {
      skippedSameUser++;
      continue;
    }

    // Κάνουμε update το createdByUserId
    await prisma.song.update({
      where: { id: song.id },
      data: {
        createdByUserId: newUserId,
      },
    });

    updated++;

    if (updated % 50 === 0) {
      console.log(`[Song] Updated ${updated} τραγούδια μέχρι τώρα...`);
    }
  }

  console.log("=============================================");
  console.log("[Song] ΤΕΛΟΣ ενημέρωσης createdByUserId");
  console.log(
    `[Song] Updated=${updated}, skippedNoMysqlRow=${skippedNoMysqlRow}, skippedNoUserMapping=${skippedNoUserMapping}, skippedSameUser=${skippedSameUser}`,
  );
  console.log("=============================================");

  await mysqlPool.end();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[FATAL] Σφάλμα κατά την εκτέλεση του script:", err);
  prisma
    .$disconnect()
    .catch(() => {
      /* ignore */
    })
    .finally(() => process.exit(1));
});

