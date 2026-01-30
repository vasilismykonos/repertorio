#!/usr/bin/env node
"use strict";

/**
 * Import MySQL table `users_tunes` -> Postgres schema `legacy`, table `"users_tunes"`
 *
 * - Creates legacy schema if missing
 * - Recreates legacy."users_tunes" (drop+create)
 * - Reads MySQL in batches with consistent snapshot
 * - Upserts by "User_Tune_ID"
 */

require("dotenv/config");
const mysql = require("mysql2/promise");
const { Client } = require("pg");

function norm(v) {
  return v === undefined ? null : v;
}

async function ensureLegacyUsersTunesTable(pg) {
  await pg.query(`CREATE SCHEMA IF NOT EXISTS legacy;`);

  await pg.query(`DROP TABLE IF EXISTS legacy."users_tunes";`);

  await pg.query(`
    CREATE TABLE legacy."users_tunes" (
      "User_Tune_ID" integer PRIMARY KEY,
      "Useremail1"   varchar(255) NULL,
      "Singer"       varchar(255) NULL,
      "New_Singer"   varchar(255) NULL,
      "TuneNumber"   integer NULL,
      "LastUpdate"   varchar(255) NULL,
      "Tune"         varchar(255) NULL,
      "Song_ID"      bigint NULL,
      "User_ID"      bigint NULL,
      "Song_ID_old"  integer NULL,
      "UserID"       integer NULL
    );
  `);

  // indexes που βοηθούν για mapping/queries
  await pg.query(`CREATE INDEX users_tunes_song_id_idx     ON legacy."users_tunes" ("Song_ID");`);
  await pg.query(`CREATE INDEX users_tunes_song_id_old_idx ON legacy."users_tunes" ("Song_ID_old");`);
  await pg.query(`CREATE INDEX users_tunes_user_id_idx     ON legacy."users_tunes" ("User_ID");`);
  await pg.query(`CREATE INDEX users_tunes_userid_idx      ON legacy."users_tunes" ("UserID");`);

  console.log(`OK: legacy."users_tunes" recreated`);
}

async f
