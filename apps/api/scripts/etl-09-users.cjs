#!/usr/bin/env node
"use strict";

require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { Client } = require("pg");

function toIntOrNull(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function main() {
  console.log("ETL 09: Song ↔ Category (many-to-many)");

  const prisma = new PrismaClient();
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await pg.connect();

  /**
   * Φέρνουμε:
   * - Song_ID από legacy_songs
   * - Category_ID από legacy_songs (ΟΧΙ από legacy_songs_categories,
   *   γιατί εκεί έχει μόνο master categories, όχι mapping)
   */
  const res = await pg.query(`
    SELECT
      ls."Song_ID"     AS legacy_song_id,
      ls."Category_ID" AS legacy_category_id
    FROM legacy."legacy_songs" ls
    WHERE ls."Category_ID" IS NOT NULL
    ORDER BY ls."Song_ID" ASC
  `);

  console.log("legacy song-category rows:", res.rowCount);

  let inserted = 0;
  let skippedNoSong = 0;
  let skippedNoCategory = 0;
  let skippedDuplicate = 0;

  for (const r of res.rows) {
    const legacySongId = toIntOrNull(r.legacy_song_id);
    const legacyCategoryId = toIntOrNull(r.legacy_category_id);

    if (!legacySongId || !legacyCategoryId) {
      continue;
    }

    const song = await prisma.song.findUnique({
      where: { legacySongId },
      select: { id: true },
    });

    if (!song) {
      skippedNoSong++;
      continue;
    }

    const category = await prisma.category.findUnique({
      where: { id: legacyCategoryId },
      select: { id: true },
    });

    if (!category) {
      skippedNoCategory++;
      continue;
    }

    try {
      await prisma.songCategory.create({
        data: {
          songId: song.id,
          categoryId: category.id,
        },
      });
      inserted++;
    } catch (err) {
      // @@unique(songId, categoryId)
      skippedDuplicate++;
    }

    if ((inserted + skippedDuplicate) % 500 === 0) {
      console.log(
        `...processed ${inserted + skippedDuplicate}/${res.rowCount}`,
      );
    }
  }

  await prisma.$disconnect();
  await pg.end();

  console.log("DONE SongCategory");
  console.log({
    inserted,
    skippedNoSong,
    skippedNoCategory,
    skippedDuplicate,
  });
}

main().catch((err) => {
  console.error("ETL 09 failed:", err);
  process.exitCode = 1;
});
