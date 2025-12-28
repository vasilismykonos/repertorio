require("dotenv/config");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function toNullTrim(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toIntOrNull(v) {
  const s = toNullTrim(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIntOrZero(v) {
  const n = Number(String(v ?? "0").trim());
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  console.log("ETL 08: list items legacy -> app");

  // maps
  const lists = await prisma.list.findMany({ select: { id: true, legacyId: true } });
  const listIdByLegacy = new Map(lists.map((l) => [l.legacyId, l.id]));

  const songs = await prisma.song.findMany({ select: { id: true, legacySongId: true } });
  const songIdByLegacySong = new Map(songs.map((s) => [s.legacySongId, s.id]));

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "ListItem_ID"::int AS "legacyId",
      "List_ID"::int     AS "listLegacyId",
      "Sort_ID"          AS "sortId",
      "Notes"::text      AS "notes",
      "Transport"::text  AS "transport",
      "Title"::text      AS "title",
      "SongTitle"::text  AS "songTitle",
      "Chords"::text     AS "chords",
      "Lyrics"::text     AS "lyrics",
      "Song_ID"          AS "songLegacyId"
    FROM legacy."legacy_lists_items"
    ORDER BY "ListItem_ID" ASC
  `);

  console.log("legacy list items:", rows.length);

  let processed = 0;
  let skippedNoList = 0;
  let songResolved = 0;
  let songMissing = 0;
  let usedSongTitleFallback = 0;
  let usedUntitledFallback = 0;

  for (const r of rows) {
    const legacyId = Number(r.legacyId);
    const listLegacyId = Number(r.listLegacyId);

    if (!legacyId || !listLegacyId) continue;

    const listId = listIdByLegacy.get(listLegacyId);
    if (!listId) {
      skippedNoList++;
      continue;
    }

    // ✅ Τίτλος: αν λείπει, πάρε SongTitle, αλλιώς βάλε placeholder
    const t1 = toNullTrim(r.title);
    const t2 = toNullTrim(r.songTitle);
    let title = t1 ?? t2 ?? "(χωρίς τίτλο)";
    if (!t1 && t2) usedSongTitleFallback++;
    if (!t1 && !t2) usedUntitledFallback++;

    const songLegacyId = toIntOrNull(r.songLegacyId);
    const songId = songLegacyId ? (songIdByLegacySong.get(songLegacyId) ?? null) : null;
    if (songId) songResolved++;
    else if (songLegacyId) songMissing++;

    await prisma.listItem.upsert({
      where: { legacyId },
      update: {
        listId,
        sortId: toIntOrZero(r.sortId),
        notes: toNullTrim(r.notes),
        transport: toIntOrZero(r.transport),
        title,
        chords: toNullTrim(r.chords),
        lyrics: toNullTrim(r.lyrics),
        songId,
      },
      create: {
        legacyId,
        listId,
        sortId: toIntOrZero(r.sortId),
        notes: toNullTrim(r.notes),
        transport: toIntOrZero(r.transport),
        title,
        chords: toNullTrim(r.chords),
        lyrics: toNullTrim(r.lyrics),
        songId,
      },
    });

    processed++;
    if (processed % 500 === 0) {
      console.log(`...processed ${processed}/${rows.length}`);
    }
  }

  console.log("DONE list items:", processed);
  console.log("Skipped (no list):", skippedNoList);
  console.log("Song resolved:", songResolved);
  console.log("Song missing (non-null legacy Song_ID but not found):", songMissing);
  console.log("Title fallback from SongTitle:", usedSongTitleFallback);
  console.log("Title fallback to '(χωρίς τίτλο)':", usedUntitledFallback);
}

main()
  .catch((e) => {
    console.error("ETL 08 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
