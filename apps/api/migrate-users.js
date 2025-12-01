/* migrate-users.js
 *
 * Πλήρες migration χρηστών από το παλιό WordPress (MySQL: wp_users + wp_usermeta)
 * στον νέο πίνακα User του Postgres (Prisma).
 */

require("dotenv").config();
const mysql = require("mysql2/promise");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/**
 * Χαρτογράφηση από wp_usermeta meta_value (_capabilities) σε UserRole (enum Prisma).
 */
function mapRoleFromCapabilities(metaValue) {
  if (!metaValue || typeof metaValue !== "string") {
    return "USER";
  }

  const v = metaValue.toLowerCase();

  if (v.includes("administrator")) return "ADMIN";
  if (v.includes("editor")) return "EDITOR";
  if (v.includes("author")) return "AUTHOR";
  if (v.includes("contributor")) return "CONTRIBUTOR";
  if (v.includes("subscriber")) return "SUBSCRIBER";

  return "USER";
}

/**
 * Μετατροπή tinyint(1) → boolean/null
 */
function tinyIntToBool(value) {
  if (value === null || value === undefined) return null;
  if (value === 0 || value === "0") return false;
  if (value === 1 || value === "1") return true;
  return null;
}

async function main() {
  console.log("[migrate-users] Ξεκινάει migration χρηστών...");

  const dbName =
    process.env.MYSQL_DATABASE ||
    process.env.MYSQL_DB ||
    process.env.WP_DB_NAME;

  if (!dbName) {
    console.error(
      "[migrate-users] ΔΕΝ βρέθηκε MYSQL_DATABASE / MYSQL_DB / WP_DB_NAME στο .env"
    );
    process.exit(1);
  }

  console.log("[migrate-users] Χρησιμοποιώ MySQL database =", dbName);

  const mysqlPool = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
  });

  try {
    // 1. Φέρνουμε όλους τους χρήστες από wp_users με ΟΛΑ τα extra πεδία
    const [rows] = await mysqlPool.query(
      `
      SELECT
        ID,
        user_login,
        user_email,
        display_name,
        user_registered,
        user_nicename,
        user_url,
        user_activation_key,
        user_status,
        User_Room,
        Rooms,
        Redirect_Field,
        Hide_Chords,
        current_url,
        Dark_Mode,
        Devices,
        FontSize,
        View_Other_User_Chords,
        Hide_Info
      FROM wp_users
      ORDER BY ID ASC
    `
    );

    console.log(`[migrate-users] Συνολικοί wp_users: ${rows.length}`);

    if (!rows.length) {
      console.log("[migrate-users] Δεν βρέθηκαν χρήστες στο wp_users.");
      return;
    }

    // 2. Capabilities από wp_usermeta (για ρόλους)
    const [metaRows] = await mysqlPool.query(
      `
      SELECT user_id, meta_key, meta_value
      FROM wp_usermeta
      WHERE meta_key LIKE '%_capabilities'
    `
    );

    console.log(
      `[migrate-users] Βρέθηκαν ${metaRows.length} εγγραφές capabilities.`
    );

    const capabilitiesMap = new Map();
    for (const meta of metaRows) {
      capabilitiesMap.set(meta.user_id, meta.meta_value);
    }

    let migrated = 0;

    for (const row of rows) {
      const wpId = Number(row.ID);

      const userLogin = row.user_login || null;
      const rawEmail =
        row.user_email && row.user_email.trim() !== ""
          ? row.user_email.trim()
          : null;
      const displayName = row.display_name || null;
      const userRegistered = row.user_registered
        ? new Date(row.user_registered)
        : null;

      const userNicename = row.user_nicename || null;
      const userUrl = row.user_url || null;
      const userActivationKey = row.user_activation_key || null;
      const userStatus =
        typeof row.user_status === "number" ? row.user_status : null;

      const userRoom = row.User_Room || null;
      const rooms = row.Rooms || null;
      const redirectField = row.Redirect_Field || null;
      const hideChords = tinyIntToBool(row.Hide_Chords);
      const currentUrl = row.current_url || null;
      const darkMode = tinyIntToBool(row.Dark_Mode);
      const devices = row.Devices || null;
      const fontSize =
        typeof row.FontSize === "number" ? row.FontSize : null;
      const viewOtherUserChords = row.View_Other_User_Chords || null;
      const hideInfo = tinyIntToBool(row.Hide_Info);

      const capabilities = capabilitiesMap.get(wpId) || "";
      const role = mapRoleFromCapabilities(capabilities);

      // Αν δεν υπάρχει email, φτιάχνουμε ένα placeholder unique
      const safeEmail = rawEmail || `wp-user-${wpId}@placeholder.local`;

      try {
        if (rawEmail) {
          // Προσπάθεια upsert με βάση email (πιάνει και ήδη υπάρχοντες NextAuth users)
          await prisma.user.upsert({
            where: { email: rawEmail },
            update: {
              email: rawEmail,
              username: userLogin,
              displayName,
              wpId,
              userLogin,
              userNicename,
              userUrl,
              userActivationKey,
              userStatus,
              userRoom,
              rooms,
              redirectField,
              hideChords,
              currentUrl,
              darkMode,
              devices,
              fontSize,
              viewOtherUserChords,
              hideInfo,
              role,
            },
            create: {
              email: rawEmail,
              username: userLogin,
              displayName,
              createdAt: userRegistered || undefined,

              wpId,
              userLogin,
              userNicename,
              userUrl,
              userActivationKey,
              userStatus,
              userRoom,
              rooms,
              redirectField,
              hideChords,
              currentUrl,
              darkMode,
              devices,
              fontSize,
              viewOtherUserChords,
              hideInfo,
              role,
            },
          });
        } else {
          // Χρήστες χωρίς email → upsert με βάση wpId (unique)
          await prisma.user.upsert({
            where: { wpId },
            update: {
              email: safeEmail,
              username: userLogin,
              displayName,
              userLogin,
              userNicename,
              userUrl,
              userActivationKey,
              userStatus,
              userRoom,
              rooms,
              redirectField,
              hideChords,
              currentUrl,
              darkMode,
              devices,
              fontSize,
              viewOtherUserChords,
              hideInfo,
              role,
            },
            create: {
              email: safeEmail,
              username: userLogin,
              displayName,
              createdAt: userRegistered || undefined,

              wpId,
              userLogin,
              userNicename,
              userUrl,
              userActivationKey,
              userStatus,
              userRoom,
              rooms,
              redirectField,
              hideChords,
              currentUrl,
              darkMode,
              devices,
              fontSize,
              viewOtherUserChords,
              hideInfo,
              role,
            },
          });
        }

        migrated++;
        if (migrated % 50 === 0) {
          console.log(
            `[migrate-users] Μέχρι τώρα έχουν μεταφερθεί/ενημερωθεί ${migrated} χρήστες...`
          );
        }
      } catch (err) {
        console.error(
          `[migrate-users] Σφάλμα σε χρήστη ID=${wpId}, user_login=${userLogin}:`,
          err.message
        );
      }
    }

    console.log(
      `[migrate-users] ΟΛΟΚΛΗΡΩΘΗΚΕ. Συνολικά μεταφέρθηκαν / ενημερώθηκαν ${migrated} χρήστες.`
    );
  } finally {
    await prisma.$disconnect();
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error("[migrate-users] Fatal error:", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
