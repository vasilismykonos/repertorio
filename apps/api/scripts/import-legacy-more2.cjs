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

  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_songs_versions";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_artists";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_songs_categories";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_rythms";`);

  // songs_categories
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

  // rythms
  await pg.query(`
    CREATE TABLE legacy."legacy_rythms" (
      "Rythm_ID"  integer PRIMARY KEY,
      "Title"     varchar(23) NULL,
      "Useremail" varchar(26) NULL,
      "UserID"    integer NULL
    );
  `);
  await pg.query(`
    CREATE INDEX legacy_rythms_rythm_id_idx
      ON legacy."legacy_rythms" ("Rythm_ID");
  `);

  // artists
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
  await pg.query(`CREATE INDEX legacy_artists_firstname_idx ON legacy."legacy_artists" ("FirstName");`);
  await pg.query(`CREATE INDEX legacy_artists_lastname_idx ON legacy."legacy_artists" ("LastName");`);

  // songs_versions
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
  await pg.query(`CREATE INDEX legacy_songs_versions_song_id_idx ON legacy."legacy_songs_versions" ("Song_ID");`);

  console.log(`OK: legacy tables recreated (+rythms)`);
}

async function importSimple(mysqlConn, pg, opts) {
  const { table, sqlSelect, pgTable, pkCol, cols, updateCols } = opts;

  const [rows] = await mysqlConn.query(sqlSelect);
  const count = rows?.length || 0;
  if (!count) {
    console.log(`MySQL ${table}: 0 rows`);
    return 0;
  }

  const pgCols = cols.map((c) => `"${c}"`).join(",");
  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(
      `(${new Array(cols.length).fill(0).map(() => `$${p++}`).join(",")})`,
    );
    for (const c of cols) values.push(norm(r[c]));
  }

  const setList = updateCols
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(",");

  const sql = `
    INSERT INTO legacy."${pgTable}" (${pgCols})
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("${pkCol}") DO UPDATE SET
      ${setList}
  `;

  await pg.query("BEGIN");
  try {
    await pg.query(sql, values);
    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  console.log(`Imported ${pgTable}: ${count}`);
  return count;
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
  if (!DATABASE_URL) throw new Error("Λείπει DATABASE_URL");

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

    await mysqlConn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await mysqlConn.beginTransaction();

    await importSimple(mysqlConn, pg, {
      table: "songs_categories",
      sqlSelect: `SELECT Category_ID, Title FROM songs_categories ORDER BY Category_ID ASC`,
      pgTable: "legacy_songs_categories",
      pkCol: "Category_ID",
      cols: ["Category_ID", "Title"],
      updateCols: ["Title"],
    });

    await importSimple(mysqlConn, pg, {
      table: "rythms",
      sqlSelect: `SELECT Rythm_ID, Title, Useremail, UserID FROM rythms ORDER BY Rythm_ID ASC`,
      pgTable: "legacy_rythms",
      pkCol: "Rythm_ID",
      cols: ["Rythm_ID", "Title", "Useremail", "UserID"],
      updateCols: ["Title", "Useremail", "UserID"],
    });

    await importSimple(mysqlConn, pg, {
      table: "artists",
      sqlSelect: `
        SELECT
          Artist_ID, Old_Artist_ID, Title, FirstName, LastName, Sex,
          BornYear, DieYear, Image, Biography, WiKi, Useremail,
          CountComposers, CountLyricists, CountSingersFront, CountSingersBack,
          Count_Composers, Count_Lyricists, Count_Singers_Front, Count_Singers_Back,
          UserID
        FROM artists
        ORDER BY Artist_ID ASC
      `,
      pgTable: "legacy_artists",
      pkCol: "Artist_ID",
      cols: [
        "Artist_ID","Old_Artist_ID","Title","FirstName","LastName","Sex",
        "BornYear","DieYear","Image","Biography","WiKi","Useremail",
        "CountComposers","CountLyricists","CountSingersFront","CountSingersBack",
        "Count_Composers","Count_Lyricists","Count_Singers_Front","Count_Singers_Back",
        "UserID",
      ],
      updateCols: [
        "Old_Artist_ID","Title","FirstName","LastName","Sex","BornYear","DieYear","Image",
        "Biography","WiKi","Useremail","CountComposers","CountLyricists","CountSingersFront",
        "CountSingersBack","Count_Composers","Count_Lyricists","Count_Singers_Front",
        "Count_Singers_Back","UserID",
      ],
    });

    await importSimple(mysqlConn, pg, {
      table: "songs_versions",
      sqlSelect: `
        SELECT
          Version_ID, Song_ID,
          Singer_Front, Singer_Front_Titles, Singer_Back,
          Solist, Musicians, Player, Year, Useremail1,
          Composer_Old, Composer, SongTitle, Youtube, Youtube_Search,
          New_ID, Song_ID_old, UserID
        FROM songs_versions
        ORDER BY Version_ID ASC
      `,
      pgTable: "legacy_songs_versions",
      pkCol: "Version_ID",
      cols: [
        "Version_ID","Song_ID","Singer_Front","Singer_Front_Titles","Singer_Back",
        "Solist","Musicians","Player","Year","Useremail1","Composer_Old","Composer",
        "SongTitle","Youtube","Youtube_Search","New_ID","Song_ID_old","UserID",
      ],
      updateCols: [
        "Song_ID","Singer_Front","Singer_Front_Titles","Singer_Back","Solist","Musicians",
        "Player","Year","Useremail1","Composer_Old","Composer","SongTitle","Youtube",
        "Youtube_Search","New_ID","Song_ID_old","UserID",
      ],
    });

    await mysqlConn.commit();

    const cCat = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_songs_categories"`);
    const cR = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_rythms"`);
    const cA = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_artists"`);
    const cV = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_songs_versions"`);

    console.log(
      `Counts: categories=${cCat.rows[0].cnt}, rythms=${cR.rows[0].cnt}, artists=${cA.rows[0].cnt}, songs_versions=${cV.rows[0].cnt}`,
    );
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
