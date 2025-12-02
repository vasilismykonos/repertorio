// scripts/migrate-users.ts
//
// Μεταφορά χρηστών από την παλιά MySQL (wp_users) στο PostgreSQL ("User")
// κρατώντας ΤΟ ΙΔΙΟ id με το wp_users.ID.
//
// Προϋποθέτει ότι στο .env υπάρχουν:
// OLD_DB_HOST, OLD_DB_PORT, OLD_DB_USER, OLD_DB_PASSWORD, OLD_DB_NAME
//
// Προσοχή: Αν το Prisma User model έχει παραπάνω πεδία (isAdmin κ.λπ.),
// προσαρμόζεις το prisma.user.create() πιο κάτω.

import "dotenv/config";
import mysql from "mysql2/promise";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[*] Ξεκινά η μεταφορά χρηστών από MySQL σε PostgreSQL...");

  const {
    OLD_DB_HOST,
    OLD_DB_PORT,
    OLD_DB_USER,
    OLD_DB_PASSWORD,
    OLD_DB_NAME,
  } = process.env;

  if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
    throw new Error(
      "Λείπουν κάποια από τα OLD_DB_* στο .env (OLD_DB_HOST, OLD_DB_USER, OLD_DB_NAME)"
    );
  }

  // 1) Σύνδεση στην παλιά MySQL (WordPress)
  console.log("[*] Σύνδεση σε MySQL (παλιό WordPress)...");
  const mysqlConn = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: Number(OLD_DB_PORT ?? "3306"),
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: "utf8mb4_general_ci",
  });

  // 2) Διάβασμα χρηστών από wp_users
  console.log("[*] Φόρτωση χρηστών από wp_users...");
  const [rows] = await mysqlConn.query(
    `
    SELECT
      ID,
      user_login,
      user_email,
      display_name,
      user_registered,
      user_status
    FROM wp_users
    ORDER BY ID ASC
    `
  );

  const users = rows as any[];

  console.log(`[*] Βρέθηκαν ${users.length} χρήστες στο wp_users.`);

  // 3) Εισαγωγή στο PostgreSQL / Prisma.User με id = wp_users.ID
  let okCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const row of users) {
    const id = Number(row.ID);
    const user_login = String(row.user_login ?? "");
    const user_email = row.user_email ? String(row.user_email) : null;
    const display_name = row.display_name
      ? String(row.display_name)
      : user_login;
    const user_registered = row.user_registered
      ? new Date(row.user_registered)
      : new Date();

    if (!user_email) {
      console.warn(
        `[-] Παράλειψη χρήστη ID=${id} (δεν έχει user_email στο wp_users).`
      );
      skipCount++;
      continue;
    }

    try {
      // ΠΡΟΣΑΡΜΟΣΕ ΑΝ ΧΡΕΙΑΣΤΕΙ ΑΝΑΛΟΓΑ ΜΕ ΤΟ Prisma User model σου.
      //
      // Π.χ. ένα κλασικό μοντέλο:
      //
      // model User {
      //   id        Int      @id @default(autoincrement())
      //   email     String   @unique
      //   name      String?
      //   createdAt DateTime @default(now())
      //   updatedAt DateTime @updatedAt
      //   isAdmin   Boolean  @default(false)
      // }
      //
      // Έτσι, μπορούμε να κάνουμε:

      await prisma.user.create({
        data: {
          id, // ΚΡΑΤΑΜΕ ΤΟ ΙΔΙΟ ID ΜΕ MySQL
          email: user_email,
          name: display_name,
          // Αν έχεις createdAt πεδίο:
          // createdAt: user_registered,
          //
          // Αν έχεις isAdmin πεδίο και θέλεις κάποιους admin:
          // isAdmin: ["admin", "vasilis"].includes(user_login),
        } as any,
      });

      okCount++;
      if (okCount % 50 === 0) {
        console.log(`[+] Εισήχθησαν ${okCount} χρήστες μέχρι τώρα...`);
      }
    } catch (err: any) {
      errorCount++;
      console.error(
        `[*] Σφάλμα στην εισαγωγή χρήστη ID=${id}, email=${user_email}:`,
        err?.message ?? err
      );
    }
  }

  console.log(
    `[*] ΟΛΟΚΛΗΡΩΣΗ. Επιτυχείς: ${okCount}, Παραλείφθηκαν (χωρίς email): ${skipCount}, Σφάλματα: ${errorCount}`
  );

  await mysqlConn.end();
  await prisma.$disconnect();
}

main()
  .then(() => {
    console.log("[*] Τέλος script migrate-users.ts");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[FATAL] Σφάλμα στο migrate-users.ts:", err);
    prisma
      .$disconnect()
      .catch(() => {
        /* ignore */
      })
      .finally(() => process.exit(1));
  });

