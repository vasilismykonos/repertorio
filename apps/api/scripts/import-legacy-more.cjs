#!/usr/bin/env node
"use strict";

require("dotenv/config");
const mysql = require("mysql2/promise");
const { Client } = require("pg");

function norm(v) {
  return v === undefined ? null : v;
}

async function recreateTables(pg) {
  await pg.query(`CREATE SCHEMA IF NOT EXISTS legacy;`);

  // Drop (με σειρά για ασφάλεια)
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_songs_versions";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_artists";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_songs_categories";`);

  // ---- legacy_songs_categories ----
  await pg.query(`
    CREATE TABLE legacy."legacy_songs_categories" (
      "Category_ID" integer PRIMARY KEY,
      "Title" varchar(22) NOT NULL
    );
  `);

  await pg.query(`
    CREATE UNIQUE INDEX legacy_songs_categories_title_uq
      ON legacy."legacy_songs_categories" ("Title");
  `);
  await pg.query(`
    CREATE INDEX legacy_songs_categories_title_idx
      ON legacy."legacy_songs_categories" ("Title");
  `);

  // ---- legacy_artists ----
  await pg.query(`
    CREATE TABLE legacy."legacy_artists" (
      "Artist_ID" int PRIMARY KEY,
      "Old_Artist_ID" varchar(15) NULL,
      "Title" varchar(255) NULL,
      "FirstName" varchar(20) NULL,
      "LastName" varchar(29) NULL,
      "Sex" varchar(7) NULL,
      "BornYear" varchar(4) NULL,
      "DieYear" varchar(4) NULL,
      "Image" bytea NULL DEFAULT ''::bytea,
      "Biography" varchar(4483) NULL,
      "WiKi" varchar(194) NULL,
      "Useremail" varchar(26) NULL,
      "CountComposers" int NOT NULL DEFAULT 0,
      "CountLyricists" int NOT NULL DEFAULT 0,
      "CountSingersFront" int NOT NULL DEFAULT 0,
      "CountSingersBack" int NOT NULL DEFAULT 0,
      "Count_Composers" int NULL DEFAULT 0,
      "Count_Lyricists" varchar(3) NULL,
      "Count_Singers_Front" varchar(3) NULL,
      "Count_Singers_Back" varchar(3) NULL,
      "UserID" int NULL
    );
  `);

  await pg.query(`
    CREATE INDEX legacy_artists_firstname_idx
      ON legacy."legacy_artists" ("FirstName");
  `);
  await pg.query(`
    CREATE INDEX legacy_artists_lastname_idx
      ON legacy."legacy_artists" ("LastName");
  `);

  // ---- legacy_songs_versions ----
  await pg.query(`
    CREATE TABLE legacy."legacy_songs_versions" (
      "Version_ID" int PRIMARY KEY,
      "Song_ID" int NULL,
      "Singer_Front" varchar(255) NULL DEFAULT '',
      "Singer_Front_Titles" varchar(200) NULL,
      "Singer_Back" varchar(255) NULL DEFAULT '',
      "Solist" varchar(17) NULL,
      "Musicians" varchar(8) NULL,
      "Player" varchar(2) NULL,
      "Year" varchar(4) NULL,
      "Useremail1" varchar(26) NULL,
      "Composer_Old" varchar(30) NULL,
      "Composer" int NULL,
      "SongTitle" varchar(74) NULL,
      "Youtube" varchar(100) NULL,
      "Youtube_Search" varchar(200) NULL,
      "New_ID" int NULL,
      "Song_ID_old" int NULL,
      "UserID" int NULL
    );
  `);

  await pg.query(`
    CREATE INDEX legacy_songs_versions_song_id_idx
      ON legacy."legacy_songs_versions" ("Song_ID");
  `);

  console.log(`OK: legacy tables recreated (artists, songs_versions, songs_categories)`);
}

async function importCategories(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT Category_ID, Title
    FROM songs_categories
    ORDER BY Category_ID ASC
  `);

  if (!rows || rows.length === 0) {
    console.log("MySQL songs_categories: 0 rows");
    return;
  }

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(`($${p++}, $${p++})`);
    values.push(norm(r.Category_ID), norm(r.Title));
  }

  const sql = `
    INSERT INTO legacy."legacy_songs_categories" ("Category_ID","Title")
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("Category_ID") DO UPDATE SET
      "Title" = EXCLUDED."Title"
  `;

  await pg.query("BEGIN");
  try {
    await pg.query(sql, values);
    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  console.log(`Imported legacy_songs_categories: ${rows.length}`);
}

async function importArtists(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT
      Artist_ID, Old_Artist_ID, Title, FirstName, LastName, Sex,
      BornYear, DieYear, Image, Biography, WiKi, Useremail,
      CountComposers, CountLyricists, CountSingersFront, CountSingersBack,
      Count_Composers, Count_Lyricists, Count_Singers_Front, Count_Singers_Back,
      UserID
    FROM artists
    ORDER BY Artist_ID ASC
  `);

  if (!rows || rows.length === 0) {
    console.log("MySQL artists: 0 rows");
    return;
  }

  const cols = [
    `"Artist_ID"`,
    `"Old_Artist_ID"`,
    `"Title"`,
    `"FirstName"`,
    `"LastName"`,
    `"Sex"`,
    `"BornYear"`,
    `"DieYear"`,
    `"Image"`,
    `"Biography"`,
    `"WiKi"`,
    `"Useremail"`,
    `"CountComposers"`,
    `"CountLyricists"`,
    `"CountSingersFront"`,
    `"CountSingersBack"`,
    `"Count_Composers"`,
    `"Count_Lyricists"`,
    `"Count_Singers_Front"`,
    `"Count_Singers_Back"`,
    `"UserID"`,
  ].join(",");

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(`(${new Array(21).fill(0).map(() => `$${p++}`).join(",")})`);
    values.push(
      norm(r.Artist_ID),
      norm(r.Old_Artist_ID),
      norm(r.Title),
      norm(r.FirstName),
      norm(r.LastName),
      norm(r.Sex),
      norm(r.BornYear),
      norm(r.DieYear),
      norm(r.Image), // mysql2 επιστρέφει Buffer για blob -> pg bytea ok
      norm(r.Biography),
      norm(r.WiKi),
      norm(r.Useremail),
      norm(r.CountComposers),
      norm(r.CountLyricists),
      norm(r.CountSingersFront),
      norm(r.CountSingersBack),
      norm(r.Count_Composers),
      norm(r.Count_Lyricists),
      norm(r.Count_Singers_Front),
      norm(r.Count_Singers_Back),
      norm(r.UserID),
    );
  }

  const sql = `
    INSERT INTO legacy."legacy_artists" (${cols})
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("Artist_ID") DO UPDATE SET
      "Old_Artist_ID" = EXCLUDED."Old_Artist_ID",
      "Title" = EXCLUDED."Title",
      "FirstName" = EXCLUDED."FirstName",
      "LastName" = EXCLUDED."LastName",
      "Sex" = EXCLUDED."Sex",
      "BornYear" = EXCLUDED."BornYear",
      "DieYear" = EXCLUDED."DieYear",
      "Image" = EXCLUDED."Image",
      "Biography" = EXCLUDED."Biography",
      "WiKi" = EXCLUDED."WiKi",
      "Useremail" = EXCLUDED."Useremail",
      "CountComposers" = EXCLUDED."CountComposers",
      "CountLyricists" = EXCLUDED."CountLyricists",
      "CountSingersFront" = EXCLUDED."CountSingersFront",
      "CountSingersBack" = EXCLUDED."CountSingersBack",
      "Count_Composers" = EXCLUDED."Count_Composers",
      "Count_Lyricists" = EXCLUDED."Count_Lyricists",
      "Count_Singers_Front" = EXCLUDED."Count_Singers_Front",
      "Count_Singers_Back" = EXCLUDED."Count_Singers_Back",
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

  console.log(`Imported legacy_artists: ${rows.length}`);
}

async function importSongsVersions(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT
      Version_ID, Song_ID,
      Singer_Front, Singer_Front_Titles, Singer_Back,
      Solist, Musicians, Player, Year, Useremail1,
      Composer_Old, Composer, SongTitle, Youtube, Youtube_Search,
      New_ID, Song_ID_old, UserID
    FROM songs_versions
    ORDER BY Version_ID ASC
  `);

  if (!rows || rows.length === 0) {
    console.log("MySQL songs_versions: 0 rows");
    return;
  }

  const cols = [
    `"Version_ID"`,
    `"Song_ID"`,
    `"Singer_Front"`,
    `"Singer_Front_Titles"`,
    `"Singer_Back"`,
    `"Solist"`,
    `"Musicians"`,
    `"Player"`,
    `"Year"`,
    `"Useremail1"`,
    `"Composer_Old"`,
    `"Composer"`,
    `"SongTitle"`,
    `"Youtube"`,
    `"Youtube_Search"`,
    `"New_ID"`,
    `"Song_ID_old"`,
    `"UserID"`,
  ].join(",");

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(`(${new Array(18).fill(0).map(() => `$${p++}`).join(",")})`);
    values.push(
      norm(r.Version_ID),
      norm(r.Song_ID),
      norm(r.Singer_Front),
      norm(r.Singer_Front_Titles),
      norm(r.Singer_Back),
      norm(r.Solist),
      norm(r.Musicians),
      norm(r.Player),
      norm(r.Year),
      norm(r.Useremail1),
      norm(r.Composer_Old),
      norm(r.Composer),
      norm(r.SongTitle),
      norm(r.Youtube),
      norm(r.Youtube_Search),
      norm(r.New_ID),
      norm(r.Song_ID_old),
      norm(r.UserID),
    );
  }

  const sql = `
    INSERT INTO legacy."legacy_songs_versions" (${cols})
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("Version_ID") DO UPDATE SET
      "Song_ID" = EXCLUDED."Song_ID",
      "Singer_Front" = EXCLUDED."Singer_Front",
      "Singer_Front_Titles" = EXCLUDED."Singer_Front_Titles",
      "Singer_Back" = EXCLUDED."Singer_Back",
      "Solist" = EXCLUDED."Solist",
      "Musicians" = EXCLUDED."Musicians",
      "Player" = EXCLUDED."Player",
      "Year" = EXCLUDED."Year",
      "Useremail1" = EXCLUDED."Useremail1",
      "Composer_Old" = EXCLUDED."Composer_Old",
      "Composer" = EXCLUDED."Composer",
      "SongTitle" = EXCLUDED."SongTitle",
      "Youtube" = EXCLUDED."Youtube",
      "Youtube_Search" = EXCLUDED."Youtube_Search",
      "New_ID" = EXCLUDED."New_ID",
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

  console.log(`Imported legacy_songs_versions: ${rows.length}`);
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

  try {
    await recreateTables(pg);

    // Consistent snapshot
    await mysqlConn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await mysqlConn.beginTransaction();

    await importCategories(mysqlConn, pg);
    await importArtists(mysqlConn, pg);
    await importSongsVersions(mysqlConn, pg);

    await mysqlConn.commit();

    const c1 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_songs_categories"`);
    const c2 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_artists"`);
    const c3 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_songs_versions"`);

    console.log(`Counts: categories=${c1.rows[0].cnt}, artists=${c2.rows[0].cnt}, songs_versions=${c3.rows[0].cnt}`);
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
