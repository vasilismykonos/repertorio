// scripts/migrate-artists-full.ts
//
// Φέρνει ΟΛΟΥΣ τους καλλιτέχνες από το παλιό MySQL (πίνακας `artists`)
// και τους κάνει upsert στον πίνακα "Artist" του Postgres
// χρησιμοποιώντας το πεδίο `legacyArtistId` ως μοναδικό κλειδί.

import "dotenv/config";
import mysql from "mysql2/promise";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LegacyArtistRow = {
  Artist_ID: number;
  Title: string | null;
};

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
  console.log("[*] Εκκίνηση migrate-artists-full.ts");
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

  const [rowsRaw] = await mysqlConn.execute(
    `
    SELECT
      Artist_ID,
      Title
    FROM artists
    `
  );

  const rows = rowsRaw as LegacyArtistRow[];

  console.log(`[*] Βρέθηκαν ${rows.length} καλλιτέχνες στο MySQL.`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const legacyId = row.Artist_ID;
    const title = (row.Title || "").trim();

    if (!legacyId || legacyId <= 0) {
      skipped++;
      continue;
    }

    // Αν θέλουμε, μπορούμε να αγνοήσουμε εντελώς καλλιτέχνες χωρίς τίτλο
    if (!title) {
      skipped++;
      continue;
    }

    // Upsert με βάση το legacyArtistId
    const existing = await prisma.artist.findFirst({
      where: { legacyArtistId: legacyId },
      select: { id: true, title: true },
    });

    if (!existing) {
      await prisma.artist.create({
        data: {
          title,
          legacyArtistId: legacyId,
        },
      });
      created++;
    } else {
      // Αν θες, μπορείς να ενημερώνεις τον τίτλο αν έχει αλλάξει
      if (existing.title !== title) {
        await prisma.artist.update({
          where: { id: existing.id },
          data: {
            title,
          },
        });
        updated++;
      } else {
        skipped++;
      }
    }
  }

  await mysqlConn.end();
  await prisma.$disconnect();

  console.log("=============================================");
  console.log("[OK] migrate-artists-full ολοκληρώθηκε.");
  console.log(`[*] Δημιουργήθηκαν νέοι artists: ${created}`);
  console.log(`[*] Ενημερώθηκαν υπάρχοντες artists: ${updated}`);
  console.log(`[*] Παραλείφθηκαν (ίδιος τίτλος/κακό legacyId): ${skipped}`);
  console.log("=============================================");
}

main().catch((err) => {
  console.error("[FATAL] Σφάλμα στο migrate-artists-full:", err);
  process.exit(1);
});

