#!/usr/bin/env node
"use strict";

require("dotenv/config");
const mysql = require("mysql2/promise");
const { Client } = require("pg");

function norm(v) {
  return v === undefined ? null : v;
}

async function mysqlTableExists(mysqlConn, tableName) {
  const [rows] = await mysqlConn.query(`SHOW TABLES LIKE ?`, [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

async function recreateTables(pg, createGroups) {
  await pg.query(`CREATE SCHEMA IF NOT EXISTS legacy;`);

  // Drop μόνο αυτά που εισάγουμε εδώ
  if (createGroups) {
    await pg.query(`DROP TABLE IF EXISTS legacy."legacy_lists_groups";`);
  }
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_lists_items";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_lists";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_users";`);

  // ---- legacy_lists ----
  // json_data: MySQL longtext + json_valid -> Postgres jsonb (ασφαλές)
  // FullTitle: VIRTUAL -> Postgres GENERATED STORED
  await pg.query(`
    CREATE TABLE legacy."legacy_lists" (
      "List_ID"          integer PRIMARY KEY,
      "Emoji"            varchar(10) NULL DEFAULT '',
      "Title"            varchar(81) NULL DEFAULT '',
      "Date_Created"     varchar(20) NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      "Useremail1"       varchar(100) NULL DEFAULT '',
      "Group_List_ID"    varchar(255) NULL,
      "View1"            varchar(500) NULL DEFAULT '',
      "Edit1"            varchar(500) NULL DEFAULT '',
      "Count_ListItems"  integer NULL DEFAULT 0,
      "json_data"        jsonb NULL,
      "FullTitle"        text GENERATED ALWAYS AS (
        coalesce("Emoji",'') || coalesce("Title",'') || ' (' || coalesce("Count_ListItems",0)::text || ')'
      ) STORED,
      "Marked"           boolean NOT NULL DEFAULT false,
      "UserID"           integer NULL,
      "View"             varchar(200) NULL,
      "Edit"             varchar(200) NULL
    );
  `);

  await pg.query(`CREATE INDEX legacy_lists_title_idx ON legacy."legacy_lists" ("Title");`);
  await pg.query(`CREATE INDEX legacy_lists_group_list_id_idx ON legacy."legacy_lists" ("Group_List_ID");`);

  // ---- legacy_lists_items ----
  await pg.query(`
    CREATE TABLE legacy."legacy_lists_items" (
      "ListItem_ID"      integer PRIMARY KEY,
      "List_ID"          integer NULL,
      "Sort_ID"          integer NULL DEFAULT 1,
      "Date_Created"     varchar(20) NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      "Default_Tune"     varchar(8) NULL,
      "Transport"        varchar(4) NULL,
      "EditTimestamp"    varchar(19) NULL,
      "Tune_Scale_ID"    varchar(7) NULL,
      "SongTitle"        varchar(59) NULL,
      "Color"            varchar(6) NULL,
      "Notes"            varchar(500) NOT NULL,
      "Tune"             varchar(5) NULL,
      "Song_ID"          integer NULL,
      "Title"            varchar(30) NOT NULL,
      "Chords"           varchar(500) NOT NULL,
      "Rythm_ID"         integer NOT NULL,
      "Lyrics"           varchar(1000) NOT NULL,
      "UserID"           integer NULL
    );
  `);

  await pg.query(`CREATE INDEX legacy_lists_items_song_id_idx ON legacy."legacy_lists_items" ("Song_ID");`);
  await pg.query(`CREATE INDEX legacy_lists_items_list_id_idx ON legacy."legacy_lists_items" ("List_ID");`);
  await pg.query(`CREATE INDEX legacy_lists_items_songtitle_idx ON legacy."legacy_lists_items" ("SongTitle");`);

  // ---- legacy_users ---- (από wp_users)
  // user_registered: MySQL DATETIME με default 0000-00-00... -> αποθήκευση ως varchar για πιστό snapshot
  await pg.query(`
    CREATE TABLE legacy."legacy_users" (
      "ID"                    bigint PRIMARY KEY,
      "user_login"            varchar(60)  NOT NULL DEFAULT '',
      "user_pass"             varchar(255) NOT NULL DEFAULT '',
      "user_nicename"         varchar(50)  NOT NULL DEFAULT '',
      "user_email"            varchar(100) NOT NULL DEFAULT '',
      "user_url"              varchar(100) NOT NULL DEFAULT '',
      "user_registered"       varchar(19)  NOT NULL DEFAULT '0000-00-00 00:00:00',
      "user_activation_key"   varchar(255) NOT NULL DEFAULT '',
      "user_status"           integer      NOT NULL DEFAULT 0,
      "display_name"          varchar(250) NOT NULL DEFAULT '',
      "User_Room"             varchar(15)  NULL,
      "Rooms"                 varchar(300) NOT NULL DEFAULT '',
      "Redirect_Field"        varchar(255) NOT NULL DEFAULT 'lyrics',
      "Hide_Chords"           boolean      NULL,
      "current_url"           varchar(256) NULL,
      "Dark_Mode"             integer      NULL DEFAULT 1,
      "Devices"               varchar(1000) NULL,
      "FontSize"              integer      NULL,
      "View_Other_User_Chords" varchar(100) NULL,
      "Hide_Info"             boolean      NULL
    );
  `);

  await pg.query(`CREATE INDEX legacy_users_login_idx ON legacy."legacy_users" ("user_login");`);
  await pg.query(`CREATE INDEX legacy_users_nicename_idx ON legacy."legacy_users" ("user_nicename");`);
  await pg.query(`CREATE INDEX legacy_users_email_idx ON legacy."legacy_users" ("user_email");`);

  // ---- legacy_lists_groups (μόνο αν υπάρχει στη MySQL) ----
  if (createGroups) {
    // Δεν ξέρουμε δομή (γιατί δεν υπάρχει στον server σου), άρα εδώ ΜΟΝΟ placeholder αν τελικά υπάρχει.
    // Αν ποτέ εμφανιστεί, θα χρειαστούμε SHOW CREATE TABLE για να το κάνουμε 1:1.
    await pg.query(`
      CREATE TABLE legacy."legacy_lists_groups" (
        "id" integer PRIMARY KEY
      );
    `);
    console.log(`NOTE: legacy_lists_groups created as placeholder επειδή βρέθηκε table στην MySQL. Θέλει SHOW CREATE TABLE για σωστό 1:1.`);
  }

  console.log(`OK: legacy tables recreated (lists, lists_items, users${createGroups ? ", lists_groups" : ""})`);
}

async function importLists(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT
      List_ID,
      Emoji,
      Title,
      Date_Created,
      Useremail1,
      Group_List_ID,
      View1,
      Edit1,
      Count_ListItems,
      json_data,
      Marked,
      UserID,
      View,
      Edit
    FROM lists
    ORDER BY List_ID ASC
  `);

  const count = rows?.length || 0;
  if (!count) return 0;

  const cols = [
    "List_ID","Emoji","Title","Date_Created","Useremail1","Group_List_ID","View1","Edit1",
    "Count_ListItems","json_data","Marked","UserID","View","Edit",
  ];

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(`(${new Array(cols.length).fill(0).map(() => `$${p++}`).join(",")})`);
    values.push(
      norm(r.List_ID),
      norm(r.Emoji),
      norm(r.Title),
      norm(r.Date_Created),
      norm(r.Useremail1),
      norm(r.Group_List_ID),
      norm(r.View1),
      norm(r.Edit1),
      norm(r.Count_ListItems),
      r.json_data ? JSON.parse(r.json_data) : null, // jsonb
      r.Marked === null || r.Marked === undefined ? null : Boolean(r.Marked),
      norm(r.UserID),
      norm(r.View),
      norm(r.Edit),
    );
  }

  const sql = `
    INSERT INTO legacy."legacy_lists"
      ("List_ID","Emoji","Title","Date_Created","Useremail1","Group_List_ID","View1","Edit1",
       "Count_ListItems","json_data","Marked","UserID","View","Edit")
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("List_ID") DO UPDATE SET
      "Emoji"=EXCLUDED."Emoji",
      "Title"=EXCLUDED."Title",
      "Date_Created"=EXCLUDED."Date_Created",
      "Useremail1"=EXCLUDED."Useremail1",
      "Group_List_ID"=EXCLUDED."Group_List_ID",
      "View1"=EXCLUDED."View1",
      "Edit1"=EXCLUDED."Edit1",
      "Count_ListItems"=EXCLUDED."Count_ListItems",
      "json_data"=EXCLUDED."json_data",
      "Marked"=EXCLUDED."Marked",
      "UserID"=EXCLUDED."UserID",
      "View"=EXCLUDED."View",
      "Edit"=EXCLUDED."Edit"
  `;

  await pg.query("BEGIN");
  try {
    await pg.query(sql, values);
    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  console.log(`Imported legacy_lists: ${count}`);
  return count;
}

async function importListItems(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT
      ListItem_ID,
      List_ID,
      Sort_ID,
      Date_Created,
      Default_Tune,
      Transport,
      EditTimestamp,
      Tune_Scale_ID,
      SongTitle,
      Color,
      Notes,
      Tune,
      Song_ID,
      Title,
      Chords,
      Rythm_ID,
      Lyrics,
      UserID
    FROM lists_items
    ORDER BY ListItem_ID ASC
  `);

  const count = rows?.length || 0;
  if (!count) return 0;

  const cols = [
    "ListItem_ID","List_ID","Sort_ID","Date_Created","Default_Tune","Transport","EditTimestamp",
    "Tune_Scale_ID","SongTitle","Color","Notes","Tune","Song_ID","Title","Chords","Rythm_ID","Lyrics","UserID",
  ];

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(`(${new Array(cols.length).fill(0).map(() => `$${p++}`).join(",")})`);
    values.push(
      norm(r.ListItem_ID),
      norm(r.List_ID),
      norm(r.Sort_ID),
      norm(r.Date_Created),
      norm(r.Default_Tune),
      norm(r.Transport),
      norm(r.EditTimestamp),
      norm(r.Tune_Scale_ID),
      norm(r.SongTitle),
      norm(r.Color),
      norm(r.Notes),
      norm(r.Tune),
      norm(r.Song_ID),
      norm(r.Title),
      norm(r.Chords),
      norm(r.Rythm_ID),
      norm(r.Lyrics),
      norm(r.UserID),
    );
  }

  const sql = `
    INSERT INTO legacy."legacy_lists_items"
      ("ListItem_ID","List_ID","Sort_ID","Date_Created","Default_Tune","Transport","EditTimestamp",
       "Tune_Scale_ID","SongTitle","Color","Notes","Tune","Song_ID","Title","Chords","Rythm_ID","Lyrics","UserID")
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("ListItem_ID") DO UPDATE SET
      "List_ID"=EXCLUDED."List_ID",
      "Sort_ID"=EXCLUDED."Sort_ID",
      "Date_Created"=EXCLUDED."Date_Created",
      "Default_Tune"=EXCLUDED."Default_Tune",
      "Transport"=EXCLUDED."Transport",
      "EditTimestamp"=EXCLUDED."EditTimestamp",
      "Tune_Scale_ID"=EXCLUDED."Tune_Scale_ID",
      "SongTitle"=EXCLUDED."SongTitle",
      "Color"=EXCLUDED."Color",
      "Notes"=EXCLUDED."Notes",
      "Tune"=EXCLUDED."Tune",
      "Song_ID"=EXCLUDED."Song_ID",
      "Title"=EXCLUDED."Title",
      "Chords"=EXCLUDED."Chords",
      "Rythm_ID"=EXCLUDED."Rythm_ID",
      "Lyrics"=EXCLUDED."Lyrics",
      "UserID"=EXCLUDED."UserID"
  `;

  await pg.query("BEGIN");
  try {
    await pg.query(sql, values);
    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  console.log(`Imported legacy_lists_items: ${count}`);
  return count;
}

async function importUsers(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT
      ID,
      user_login,
      user_pass,
      user_nicename,
      user_email,
      user_url,
      DATE_FORMAT(user_registered, '%Y-%m-%d %H:%i:%s') AS user_registered,
      user_activation_key,
      user_status,
      display_name,
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
  `);

  const count = rows?.length || 0;
  if (!count) return 0;

  const cols = [
    "ID","user_login","user_pass","user_nicename","user_email","user_url","user_registered",
    "user_activation_key","user_status","display_name","User_Room","Rooms","Redirect_Field",
    "Hide_Chords","current_url","Dark_Mode","Devices","FontSize","View_Other_User_Chords","Hide_Info",
  ];

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(`(${new Array(cols.length).fill(0).map(() => `$${p++}`).join(",")})`);
    values.push(
      norm(r.ID),
      norm(r.user_login),
      norm(r.user_pass),
      norm(r.user_nicename),
      norm(r.user_email),
      norm(r.user_url),
      norm(r.user_registered),
      norm(r.user_activation_key),
      norm(r.user_status),
      norm(r.display_name),
      norm(r.User_Room),
      norm(r.Rooms),
      norm(r.Redirect_Field),
      r.Hide_Chords === null || r.Hide_Chords === undefined ? null : Boolean(r.Hide_Chords),
      norm(r.current_url),
      norm(r.Dark_Mode),
      norm(r.Devices),
      norm(r.FontSize),
      norm(r.View_Other_User_Chords),
      r.Hide_Info === null || r.Hide_Info === undefined ? null : Boolean(r.Hide_Info),
    );
  }

  const sql = `
    INSERT INTO legacy."legacy_users"
      ("ID","user_login","user_pass","user_nicename","user_email","user_url","user_registered",
       "user_activation_key","user_status","display_name","User_Room","Rooms","Redirect_Field",
       "Hide_Chords","current_url","Dark_Mode","Devices","FontSize","View_Other_User_Chords","Hide_Info")
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("ID") DO UPDATE SET
      "user_login"=EXCLUDED."user_login",
      "user_pass"=EXCLUDED."user_pass",
      "user_nicename"=EXCLUDED."user_nicename",
      "user_email"=EXCLUDED."user_email",
      "user_url"=EXCLUDED."user_url",
      "user_registered"=EXCLUDED."user_registered",
      "user_activation_key"=EXCLUDED."user_activation_key",
      "user_status"=EXCLUDED."user_status",
      "display_name"=EXCLUDED."display_name",
      "User_Room"=EXCLUDED."User_Room",
      "Rooms"=EXCLUDED."Rooms",
      "Redirect_Field"=EXCLUDED."Redirect_Field",
      "Hide_Chords"=EXCLUDED."Hide_Chords",
      "current_url"=EXCLUDED."current_url",
      "Dark_Mode"=EXCLUDED."Dark_Mode",
      "Devices"=EXCLUDED."Devices",
      "FontSize"=EXCLUDED."FontSize",
      "View_Other_User_Chords"=EXCLUDED."View_Other_User_Chords",
      "Hide_Info"=EXCLUDED."Hide_Info"
  `;

  await pg.query("BEGIN");
  try {
    await pg.query(sql, values);
    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  console.log(`Imported legacy_users: ${count}`);
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
    const hasGroups = await mysqlTableExists(mysqlConn, "lists_groups");
    if (!hasGroups) {
      console.log(`NOTE: MySQL table lists_groups ΔΕΝ υπάρχει. Θα γίνει skip.`);
    }

    await recreateTables(pg, hasGroups);

    await mysqlConn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await mysqlConn.beginTransaction();

    await importLists(mysqlConn, pg);
    await importListItems(mysqlConn, pg);
    await importUsers(mysqlConn, pg);

    await mysqlConn.commit();

    const c1 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_lists"`);
    const c2 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_lists_items"`);
    const c3 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_users"`);

    console.log(`Counts: lists=${c1.rows[0].cnt}, list_items=${c2.rows[0].cnt}, users=${c3.rows[0].cnt}`);
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
