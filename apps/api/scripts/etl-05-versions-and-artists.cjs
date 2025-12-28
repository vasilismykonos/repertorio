require("dotenv/config");
const { PrismaClient, VersionArtistRole } = require("@prisma/client");

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

function parseLegacyIdList(v) {
  const s = toNullTrim(v);
  if (!s) return [];
  if (s.toLowerCase() === "null") return [];
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  const ids = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) ids.push(Number(p));
  }
  return Array.from(new Set(ids));
}

async function main() {
  console.log("ETL 05: song_versions + version_artists legacy -> app");

  // Κάνουμε map legacySongId -> app Song.id για γρήγορη σύνδεση
  const songs = await prisma.song.findMany({
    select: { id: true, legacySongId: true },
  });
  const songIdByLegacy = new Map(songs.map((s) => [s.legacySongId, s.id]));
  console.log("Loaded app songs:", songs.length);

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "Version_ID"::int     AS "Version_ID",
      "Song_ID"::int        AS "Song_ID",
      "SongTitle"::text     AS "SongTitle",
      "Year"::text          AS "Year",
      "Youtube"::text       AS "Youtube",
      "Youtube_Search"::text AS "Youtube_Search",
      "Player"::text        AS "Player",
      "Singer_Front"::text  AS "Singer_Front",
      "Singer_Back"::text   AS "Singer_Back",
      "Solist"::text        AS "Solist",
      "Musicians"::text     AS "Musicians"
    FROM legacy."legacy_songs_versions"
    ORDER BY "Version_ID" ASC
  `);

  console.log("legacy versions:", rows.length);

  let processed = 0;
  let skippedNoSong = 0;
  let totalArtistLinks = 0;
  let missingArtists = 0;

  for (const r of rows) {
    const legacyVersionId = Number(r.Version_ID);
    const legacySongId = Number(r.Song_ID);

    if (!legacyVersionId || !legacySongId) continue;

    const songId = songIdByLegacy.get(legacySongId);
    if (!songId) {
      skippedNoSong++;
      continue;
    }

    const year = toIntOrNull(r.Year);
    const youtubeUrl = toNullTrim(r.Youtube);
    const youtubeSearch = toNullTrim(r.Youtube_Search);
    const playerCode = toNullTrim(r.Player);
    const title = toNullTrim(r.SongTitle);

    // Upsert SongVersion
    const version = await prisma.songVersion.upsert({
      where: { legacyVersionId },
      update: {
        songId,
        title,
        year,
        youtubeUrl,
        youtubeSearch,
        playerCode,
      },
      create: {
        legacyVersionId,
        songId,
        title,
        year,
        youtubeUrl,
        youtubeSearch,
        playerCode,
        createdByUserId: null,
      },
      select: { id: true },
    });

    // Καθαρίζουμε links και ξαναγράφουμε (idempotent re-run)
    await prisma.songVersionArtist.deleteMany({
      where: { versionId: version.id },
    });

    const roleSets = [
      { role: VersionArtistRole.SINGER_FRONT, ids: parseLegacyIdList(r.Singer_Front) },
      { role: VersionArtistRole.SINGER_BACK, ids: parseLegacyIdList(r.Singer_Back) },
      { role: VersionArtistRole.SOLOIST, ids: parseLegacyIdList(r.Solist) },
      { role: VersionArtistRole.MUSICIAN, ids: parseLegacyIdList(r.Musicians) },
    ];

    const links = [];

    for (const rs of roleSets) {
      for (const legacyArtistId of rs.ids) {
        const artist = await prisma.artist.findUnique({
          where: { legacyArtistId },
          select: { id: true },
        });
        if (!artist) {
          missingArtists++;
          continue;
        }
        links.push({
          versionId: version.id,
          artistId: artist.id,
          role: rs.role,
        });
      }
    }

    if (links.length) {
      await prisma.songVersionArtist.createMany({
        data: links,
        skipDuplicates: true,
      });
      totalArtistLinks += links.length;
    }

    processed++;
    if (processed % 300 === 0) {
      console.log(`...processed ${processed}/${rows.length}`);
    }
  }

  console.log("DONE versions:", processed);
  console.log("Skipped (no matching app song):", skippedNoSong);
  console.log("Inserted version-artist links:", totalArtistLinks);
  console.log("Missing artists referenced:", missingArtists);
}

main()
  .catch((e) => {
    console.error("ETL 05 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
