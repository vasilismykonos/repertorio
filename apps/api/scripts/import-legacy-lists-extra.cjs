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

  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_lists_user_notes";`);
  await pg.query(`DROP TABLE IF EXISTS legacy."legacy_group_lists";`);

  // ---- legacy_group_lists ----
  // FullTitle: VIRTUAL -> GENERATED STORED
  await pg.query(`
    CREATE TABLE legacy."legacy_group_lists" (
      "Group_List_ID"        integer PRIMARY KEY,
      "Title"                varchar(30) NULL DEFAULT '',
      "Date_Created"         varchar(19) NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      "Useremail"            varchar(50) NULL DEFAULT '',
      "View"                 varchar(500) NULL DEFAULT '',
      "Edit"                 text NULL,
      "Count_Related_Lists"  integer NULL DEFAULT 0,
      "FullTitle"            text GENERATED ALWAYS AS (
        coalesce("Title",'') || ' (' || coalesce("Count_Related_Lists",0)::text || ')'
      ) STORED,
      "UserID"               integer NULL,
      "New_View"             varchar(20) NULL,
      "New_Edit"             varchar(20) NULL
    );
  `);

  await pg.query(`CREATE INDEX legacy_group_lists_title_idx ON legacy."legacy_group_lists" ("Title");`);

  // ---- legacy_lists_user_notes ----
  // Σημαντικό: Στη MySQL ΔΕΝ υπάρχει PRIMARY KEY. Το κρατάμε snapshot-like.
  await pg.query(`
    CREATE TABLE legacy."legacy_lists_user_notes" (
      "List_User_Note_ID" varchar(8) NULL,
      "ListItem_ID"       varchar(8) NULL,
      "Notes"             varchar(59) NULL,
      "Useremail1"        varchar(50) NULL,
      "Color"             varchar(6) NULL,
      "UserID"            integer NULL
    );
  `);

  // Χρήσιμα indexes (δεν αλλάζουν data, απλά βοηθάνε queries)
  await pg.query(`CREATE INDEX legacy_lun_listitem_idx ON legacy."legacy_lists_user_notes" ("ListItem_ID");`);
  await pg.query(`CREATE INDEX legacy_lun_userid_idx ON legacy."legacy_lists_user_notes" ("UserID");`);

  console.log(`OK: legacy tables recreated (group_lists, lists_user_notes)`);
}

async function importGroupLists(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT
      Group_List_ID,
      Title,
      Date_Created,
      Useremail,
      View,
      Edit,
      Count_Related_Lists,
      UserID,
      New_View,
      New_Edit
    FROM group_lists
    ORDER BY Group_List_ID ASC
  `);

  const count = rows?.length || 0;
  if (!count) {
    console.log("MySQL group_lists total: 0");
    return 0;
  }

  const cols = [
    "Group_List_ID",
    "Title",
    "Date_Created",
    "Useremail",
    "View",
    "Edit",
    "Count_Related_Lists",
    "UserID",
    "New_View",
    "New_Edit",
  ];

  const values = [];
  const placeholders = [];
  let p = 1;

  for (const r of rows) {
    placeholders.push(`(${new Array(cols.length).fill(0).map(() => `$${p++}`).join(",")})`);
    values.push(
      norm(r.Group_List_ID),
      norm(r.Title),
      norm(r.Date_Created),
      norm(r.Useremail),
      norm(r.View),
      norm(r.Edit),
      norm(r.Count_Related_Lists),
      norm(r.UserID),
      norm(r.New_View),
      norm(r.New_Edit),
    );
  }

  const sql = `
    INSERT INTO legacy."legacy_group_lists"
      ("Group_List_ID","Title","Date_Created","Useremail","View","Edit","Count_Related_Lists","UserID","New_View","New_Edit")
    VALUES ${placeholders.join(",")}
    ON CONFLICT ("Group_List_ID") DO UPDATE SET
      "Title" = EXCLUDED."Title",
      "Date_Created" = EXCLUDED."Date_Created",
      "Useremail" = EXCLUDED."Useremail",
      "View" = EXCLUDED."View",
      "Edit" = EXCLUDED."Edit",
      "Count_Related_Lists" = EXCLUDED."Count_Related_Lists",
      "UserID" = EXCLUDED."UserID",
      "New_View" = EXCLUDED."New_View",
      "New_Edit" = EXCLUDED."New_Edit"
  `;

  await pg.query("BEGIN");
  try {
    await pg.query(sql, values);
    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  console.log(`Imported legacy_group_lists: ${count}`);
  return count;
}

async function importListsUserNotes(mysqlConn, pg) {
  const [rows] = await mysqlConn.query(`
    SELECT
      List_User_Note_ID,
      ListItem_ID,
      Notes,
      Useremail1,
      Color,
      UserID
    FROM lists_user_notes
  `);

  const count = rows?.length || 0;
  if (!count) {
    console.log("MySQL lists_user_notes total: 0");
    return 0;
  }

  // Επειδή δεν υπάρχει PK, κάνουμε καθαρό INSERT μετά από drop+create.
  // Για να μην κάνουμε τεράστιο single query, κάνουμε batches.
  const BATCH = 1000;
  let inserted = 0;

  await pg.query("BEGIN");
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);

      const values = [];
      const placeholders = [];
      let p = 1;

      for (const r of chunk) {
        placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        values.push(
          norm(r.List_User_Note_ID),
          norm(r.ListItem_ID),
          norm(r.Notes),
          norm(r.Useremail1),
          norm(r.Color),
          norm(r.UserID),
        );
      }

      const sql = `
        INSERT INTO legacy."legacy_lists_user_notes"
          ("List_User_Note_ID","ListItem_ID","Notes","Useremail1","Color","UserID")
        VALUES ${placeholders.join(",")}
      `;

      await pg.query(sql, values);
      inserted += chunk.length;
    }

    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  console.log(`Imported legacy_lists_user_notes: ${inserted}`);
  return inserted;
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

    await importGroupLists(mysqlConn, pg);
    await importListsUserNotes(mysqlConn, pg);

    await mysqlConn.commit();

    const c1 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_group_lists"`);
    const c2 = await pg.query(`SELECT COUNT(*)::int AS cnt FROM legacy."legacy_lists_user_notes"`);

    console.log(`Counts: group_lists=${c1.rows[0].cnt}, lists_user_notes=${c2.rows[0].cnt}`);
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
