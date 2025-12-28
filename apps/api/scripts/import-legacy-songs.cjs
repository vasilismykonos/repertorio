#!/usr/bin/env node
"use strict";

require("dotenv/config");
const mysql = require("mysql2/promise");
const { Client } = require("pg");

function norm(v) {
  return v === undefined ? null : v;
}

async function ensureLegacySongsTable(pg) {
  // 1) schema
  await pg.query(`CREATE SCHEMA IF NOT EXISTS legacy;`);

  // 2) drop table
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_songs";`);

  // 3) create table (snapshot 1:1)
  await pg.query(`
    CREATE TABLE legacy."legacy_songs" (
      "Song_ID"              integer PRIMARY KEY,
      "Title"                varchar(74) NOT NULL DEFAULT '',
      "Rythm_ID"             varchar(255) NULL,
      "Lyrics"               varchar(1293) NULL DEFAULT '',
      "FirstLyrics"          varchar(100) NULL,
      "Chords"               varchar(529) NULL DEFAULT '',
      "Composer"             varchar(255) NULL DEFAULT '',
      "ComposerTitle"        varchar(255) NULL,
      "Lyricist"             varchar(255) NULL DEFAULT '',
      "LyricistTitle"        varchar(255) NULL,
      "SingerFront"          varchar(30)  NULL DEFAULT '',
      "SingerBack"           varchar(30)  NULL DEFAULT '',
      "Category_ID"          varchar(50)  NULL,
      "Makam_ID"             varchar(8)   NULL,
      "Tune_Scale_ID"        varchar(13)  NULL,
      "Date_Created"         varchar(19)  NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      "Useremail1"           varchar(50)  NULL,
      "ChordBulder"          varchar(11)  NULL,
      "Version_ID"           varchar(71)  NULL,
      "Singer_Front"         varchar(71)  NULL,
      "Singer_Back"          varchar(62)  NULL,
      "Singer_Front_Sex"     varchar(36)  NULL,
      "First_Song_Version"   varchar(18)  NULL,
      "Song_NO"              varchar(7)   NULL,
      "Tune_Writed"          varchar(11)  NULL,
      "BasedOn"              varchar(255) NULL,
      "Partiture"            varchar(50)  NULL,
      "Highest_Vocal_Note"   varchar(18)  NULL,
      "Transport"            varchar(9)   NULL,
      "Default_Tune"         varchar(12)  NULL,
      "Song_Tune"            varchar(9)   NULL DEFAULT '',
      "UserAction"           varchar(10)  NULL DEFAULT '',
      "Characteristics"      varchar(100) NULL DEFAULT '',
      "Title_FirstLyrics"    text GENERATED ALWAYS AS (
        ("Title"::text) ||
        CASE
          WHEN "FirstLyrics" IS NULL OR "FirstLyrics" = '' THEN
            CASE
              WHEN "Characteristics" LIKE '%Οργανικό%' THEN ' (Οργανικό)'
              ELSE ' (Χωρίς στίχους)'
            END
          ELSE
            ' (' || "FirstLyrics"::text || ')'
        END
      ) STORED,
      "Count_Views"          integer NULL DEFAULT 0,
      "Status"               varchar(20) NULL DEFAULT 'pending',
      "Song_ID_old"          integer NULL,
      "UserID"               integer NULL
    );
  `);

  // 4) indexes (όπως MySQL, όσο έχει νόημα)
  await pg.query(`
    CREATE UNIQUE INDEX legacy_songs_unique_song_id_old
      ON legacy."legacy_songs" ("Song_ID_old");
  `);
  await pg.query(`
    CREATE INDEX legacy_songs_title_idx
      ON legacy."legacy_songs" ("Title");
  `);
  await pg.query(`
    CREATE INDEX legacy_songs_song_id_idx
      ON legacy."legacy_songs" ("Song_ID");
  `);
  await pg.query(`
    CREATE INDEX legacy_songs_rythm_id_idx
      ON legacy."legacy_songs" ("Rythm_ID");
  `);
  await pg.query(`
    CREATE INDEX legacy_songs_category_id_idx
      ON legacy."legacy_songs" ("Category_ID");
  `);

  console.log(`OK: legacy."legacy_songs" recreated`);
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

  const BATCH_SIZE = 500;

  try {
    // (A) Ensure table exists fresh
    await ensureLegacySongsTable(pg);

    // (B) Count MySQL rows
    const [cntRows] = await mysqlConn.query(`SELECT COUNT(*) AS cnt FROM songs`);
    const total = Number(cntRows?.[0]?.cnt || 0);
    console.log(`MySQL songs total: ${total}`);

    let offset = 0;
    let processed = 0;

    // Consistent snapshot (safe)
    await mysqlConn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await mysqlConn.beginTransaction();

    while (offset < total) {
      const [rows] = await mysqlConn.query(
        `
        SELECT
          Song_ID, Title, Rythm_ID, Lyrics, FirstLyrics, Chords,
          Composer, ComposerTitle, Lyricist, LyricistTitle,
          SingerFront, SingerBack,
          Category_ID, Makam_ID, Tune_Scale_ID, Date_Created,
          Useremail1, ChordBulder, Version_ID, Singer_Front, Singer_Back,
          Singer_Front_Sex, First_Song_Version, Song_NO, Tune_Writed,
          BasedOn, Partiture, Highest_Vocal_Note, Transport, Default_Tune,
          Song_Tune, UserAction, Characteristics, Count_Views, Status,
          Song_ID_old, UserID
        FROM songs
        ORDER BY Song_ID ASC
        LIMIT ? OFFSET ?
        `,
        [BATCH_SIZE, offset],
      );

      if (!rows || rows.length === 0) break;

      const values = [];
      const placeholders = [];
      let p = 1;

      for (const r of rows) {
        placeholders.push(`(${new Array(37).fill(0).map(() => `$${p++}`).join(",")})`);
        values.push(
          norm(r.Song_ID),
          norm(r.Title),
          norm(r.Rythm_ID),
          norm(r.Lyrics),
          norm(r.FirstLyrics),
          norm(r.Chords),
          norm(r.Composer),
          norm(r.ComposerTitle),
          norm(r.Lyricist),
          norm(r.LyricistTitle),
          norm(r.SingerFront),
          norm(r.SingerBack),
          norm(r.Category_ID),
          norm(r.Makam_ID),
          norm(r.Tune_Scale_ID),
          norm(r.Date_Created),
          norm(r.Useremail1),
          norm(r.ChordBulder),
          norm(r.Version_ID),
          norm(r.Singer_Front),
          norm(r.Singer_Back),
          norm(r.Singer_Front_Sex),
          norm(r.First_Song_Version),
          norm(r.Song_NO),
          norm(r.Tune_Writed),
          norm(r.BasedOn),
          norm(r.Partiture),
          norm(r.Highest_Vocal_Note),
          norm(r.Transport),
          norm(r.Default_Tune),
          norm(r.Song_Tune),
          norm(r.UserAction),
          norm(r.Characteristics),
          norm(r.Count_Views),
          norm(r.Status),
          norm(r.Song_ID_old),
          norm(r.UserID),
        );
      }

      const cols = [
        `"Song_ID"`,
        `"Title"`,
        `"Rythm_ID"`,
        `"Lyrics"`,
        `"FirstLyrics"`,
        `"Chords"`,
        `"Composer"`,
        `"ComposerTitle"`,
        `"Lyricist"`,
        `"LyricistTitle"`,
        `"SingerFront"`,
        `"SingerBack"`,
        `"Category_ID"`,
        `"Makam_ID"`,
        `"Tune_Scale_ID"`,
        `"Date_Created"`,
        `"Useremail1"`,
        `"ChordBulder"`,
        `"Version_ID"`,
        `"Singer_Front"`,
        `"Singer_Back"`,
        `"Singer_Front_Sex"`,
        `"First_Song_Version"`,
        `"Song_NO"`,
        `"Tune_Writed"`,
        `"BasedOn"`,
        `"Partiture"`,
        `"Highest_Vocal_Note"`,
        `"Transport"`,
        `"Default_Tune"`,
        `"Song_Tune"`,
        `"UserAction"`,
        `"Characteristics"`,
        `"Count_Views"`,
        `"Status"`,
        `"Song_ID_old"`,
        `"UserID"`,
      ].join(",");

      const sql = `
        INSERT INTO legacy."legacy_songs" (${cols})
        VALUES ${placeholders.join(",")}
        ON CONFLICT ("Song_ID") DO UPDATE SET
          "Title" = EXCLUDED."Title",
          "Rythm_ID" = EXCLUDED."Rythm_ID",
          "Lyrics" = EXCLUDED."Lyrics",
          "FirstLyrics" = EXCLUDED."FirstLyrics",
          "Chords" = EXCLUDED."Chords",
          "Composer" = EXCLUDED."Composer",
          "ComposerTitle" = EXCLUDED."ComposerTitle",
          "Lyricist" = EXCLUDED."Lyricist",
          "LyricistTitle" = EXCLUDED."LyricistTitle",
          "SingerFront" = EXCLUDED."SingerFront",
          "SingerBack" = EXCLUDED."SingerBack",
          "Category_ID" = EXCLUDED."Category_ID",
          "Makam_ID" = EXCLUDED."Makam_ID",
          "Tune_Scale_ID" = EXCLUDED."Tune_Scale_ID",
          "Date_Created" = EXCLUDED."Date_Created",
          "Useremail1" = EXCLUDED."Useremail1",
          "ChordBulder" = EXCLUDED."ChordBulder",
          "Version_ID" = EXCLUDED."Version_ID",
          "Singer_Front" = EXCLUDED."Singer_Front",
          "Singer_Back" = EXCLUDED."Singer_Back",
          "Singer_Front_Sex" = EXCLUDED."Singer_Front_Sex",
          "First_Song_Version" = EXCLUDED."First_Song_Version",
          "Song_NO" = EXCLUDED."Song_NO",
          "Tune_Writed" = EXCLUDED."Tune_Writed",
          "BasedOn" = EXCLUDED."BasedOn",
          "Partiture" = EXCLUDED."Partiture",
          "Highest_Vocal_Note" = EXCLUDED."Highest_Vocal_Note",
          "Transport" = EXCLUDED."Transport",
          "Default_Tune" = EXCLUDED."Default_Tune",
          "Song_Tune" = EXCLUDED."Song_Tune",
          "UserAction" = EXCLUDED."UserAction",
          "Characteristics" = EXCLUDED."Characteristics",
          "Count_Views" = EXCLUDED."Count_Views",
          "Status" = EXCLUDED."Status",
          "Song_ID_old" = EXCLUDED."Song_ID_old",
          "UserID" = EXCLUDED."UserID"
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

      if (processed % 2000 === 0 || processed === total) {
        console.log(`Imported ${processed}/${total}`);
      }
    }

    await mysqlConn.commit();

    const res = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_songs"`);
    console.log(`Postgres legacy_songs count: ${res.rows[0].cnt}`);
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
