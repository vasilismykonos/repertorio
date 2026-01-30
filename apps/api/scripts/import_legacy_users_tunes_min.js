#!/usr/bin/env node
"use strict";

require("dotenv/config");
const mysql = require("mysql2/promise");
const { Client } = require("pg");

function norm(v) {
  return v === undefined ? null : v;
}

function toIntOrNull(v) {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toTuneOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 32) : null;
}

async function ensureLegacyUsersTunesTable(pg) {
  await pg.query(`CREATE SCHEMA IF NOT EXISTS legacy;`);
  await pg.query(`DROP TABLE IF EXISTS legacy.users_tunes;`);

  await pg.query(`
    CREATE TABLE legacy.users_tunes (
      legacy_user_tune_id          integer PRIMARY KEY,
      singer_legacy_user_id        integer NULL,
      legacy_song_id               integer NULL,
      tune                         varchar(32) NULL,
      created_by_legacy_user_id    integer NULL
    );
  `);

  await pg.query(`CREATE INDEX users_tunes_legacy_song_id_idx ON legacy.users_tunes (legacy_song_id);`);
  await pg.query(`CREATE INDEX users_tunes_singer_user_idx    ON legacy.users_tunes (singer_legacy_user_id);`);
  await pg.query(`CREATE INDEX users_tunes_created_by_idx     ON legacy.users_tunes (created_by_legacy_user_id);`);

  console.log(`OK: legacy.users_tunes recreated (minimal columns)`);
}

async function main() {
  const {
    OLD_DB_HOST,
    OLD_DB_PORT,
    OLD_DB_USER,
    OLD_DB_PASSWORD,
    OLD_DB_NAME,
    DATABASE_URL,
  } = process.env;

  if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
    throw new Error("Λείπουν OLD_DB_HOST / OLD_DB_USER / OLD_DB_NAME από το .env");
  }
  if (!DATABASE_URL) {
    throw new Error("Λείπει DATABASE_URL από το .env (Postgres)");
  }

  const mysqlConn = await mysql.createConnection({
    host: OLD_DB_HOST,
    port: Number(OLD_DB_PORT || 3306),
    user: OLD_DB_USER,
    password: OLD_DB_PASSWORD,
    database: OLD_DB_NAME,
    charset: "utf8mb4_general_ci",
  });

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const BATCH_SIZE = 2000;

  try {
    await ensureLegacyUsersTunesTable(pg);

    const [cntRows] = await mysqlConn.query(`SELECT COUNT(*) AS cnt FROM users_tunes`);
    const total = Number(cntRows?.[0]?.cnt || 0);
    console.log(`MySQL users_tunes total: ${total}`);

    // consistent snapshot
    await mysqlConn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await mysqlConn.beginTransaction();

    let offset = 0;
    let processed = 0;

    while (offset < total) {
      const [rows] = await mysqlConn.query(
        `
        SELECT
          User_Tune_ID,
          Singer,
          Song_ID,
          Tune,
          User_ID
        FROM users_tunes
        ORDER BY User_Tune_ID ASC
        LIMIT ? OFFSET ?
        `,
        [BATCH_SIZE, offset],
      );

      if (!rows || rows.length === 0) break;

      const values = [];
      const placeholders = [];
      let p = 1;

      for (const r of rows) {
        placeholders.push(`(${new Array(5).fill(0).map(() => `$${p++}`).join(",")})`);
        values.push(
          norm(toIntOrNull(r.User_Tune_ID)),
          norm(toIntOrNull(r.Singer)),     // Singer = legacy user id of singer (as you described)
          norm(toIntOrNull(r.Song_ID)),    // legacy song id
          norm(toTuneOrNull(r.Tune)),
          norm(toIntOrNull(r.User_ID)),    // created by legacy user id
        );
      }

      const sql = `
        INSERT INTO legacy.users_tunes (
          legacy_user_tune_id,
          singer_legacy_user_id,
          legacy_song_id,
          tune,
          created_by_legacy_user_id
        )
        VALUES ${placeholders.join(",")}
        ON CONFLICT (legacy_user_tune_id) DO UPDATE SET
          singer_legacy_user_id     = EXCLUDED.singer_legacy_user_id,
          legacy_song_id            = EXCLUDED.legacy_song_id,
          tune                      = EXCLUDED.tune,
          created_by_legacy_user_id = EXCLUDED.created_by_legacy_user_id
      `;

      await pg.query("BEGIN");
      try {
        await pg.query(sql, values);
        await pg.query("COMMIT");
      } catch (e) {
        await pg.query("ROLLBACK");
        throw e;
      }

      processed += rows.length;
      offset += rows.length;

      if (processed % 10000 === 0 || processed === total) {
        console.log(`Imported ${processed}/${total}`);
      }
    }

    await mysqlConn.commit();

    const res = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy.users_tunes`);
    console.log(`Postgres legacy.users_tunes count: ${res.rows[0].cnt}`);

    // βοηθητικό: πόσα Singer δεν έγιναν int (άρα μπήκαν NULL)
    const bad = await pg.query(`
      SELECT COUNT(*)::int AS cnt
      FROM legacy.users_tunes
      WHERE singer_legacy_user_id IS NULL
    `);
    console.log(`Singer cast failures (NULL singer_legacy_user_id): ${bad.rows[0].cnt}`);

    console.log("DONE");
  } finally {
    await mysqlConn.end();
    await pg.end();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
