require("dotenv/config");
const { PrismaClient, SongStatus, SongCreditRole } = require("@prisma/client");

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
  const s = toNullTrim(v);
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function mapStatus(oldStatus) {
  const s = (oldStatus ?? "").toString().trim().toLowerCase();
  if (!s) return SongStatus.PENDING_APPROVAL;
  if (s === "pending") return SongStatus.PENDING_APPROVAL;
  if (s === "draft") return SongStatus.DRAFT;
  if (s === "εγκρίθηκε") return SongStatus.PUBLISHED;
  return SongStatus.PENDING_APPROVAL;
}

// slugify με υποστήριξη ελληνικών + αφαίρεση τόνων
function slugify(input) {
  const s = (input ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove diacritics

  // κρατάμε γράμματα/αριθμούς (unicode) και κάνουμε τα υπόλοιπα '-'
  const out = s
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return out || "song";
}

function parseLegacyIdList(v) {
  const s = toNullTrim(v);
  if (!s) return [];
  if (s.toLowerCase() === "null") return [];

  // "571,448" -> [571,448]
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  const ids = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) ids.push(Number(p));
  }
  // unique
  return Array.from(new Set(ids));
}

async function main() {
  console.log("ETL 04: songs + credits legacy -> app");

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "Song_ID"::int         AS "Song_ID",
      "Title"::text          AS "Title",
      "FirstLyrics"::text    AS "FirstLyrics",
      "Lyrics"::text         AS "Lyrics",
      "Chords"::text         AS "Chords",
      "Characteristics"::text AS "Characteristics",
      "Tune_Writed"::text    AS "Tune_Writed",
      "Default_Tune"::text   AS "Default_Tune",
      "Highest_Vocal_Note"::text AS "Highest_Vocal_Note",
      "Partiture"::text      AS "Partiture",
      "Count_Views"          AS "Count_Views",
      "Status"::text         AS "Status",
      "Category_ID"::text    AS "Category_ID",
      "Rythm_ID"::text       AS "Rythm_ID",
      "BasedOn"::text        AS "BasedOn",
      "Composer"::text       AS "Composer",
      "Lyricist"::text       AS "Lyricist"
    FROM legacy."legacy_songs"
    ORDER BY "Song_ID" ASC
  `);

  console.log("legacy songs:", rows.length);

  let processed = 0;
  let basedOnNumeric = 0;
  let basedOnNonNumeric = 0;
  let missingArtists = 0;
  let totalCredits = 0;

  for (const r of rows) {
    const legacySongId = Number(r.Song_ID);
    const title = toNullTrim(r.Title);

    if (!legacySongId || !title) continue;

    const slug = `${legacySongId}-${slugify(title)}`;

    const categoryId = toIntOrNull(r.Category_ID);
    const rythmId = toIntOrNull(r.Rythm_ID);

    const scoreFile = toNullTrim(r.Partiture);
    const hasScore = !!scoreFile;

    const basedOnRaw = toNullTrim(r.BasedOn);
    let basedOnLegacySongId = null;
    if (basedOnRaw && /^\d+$/.test(basedOnRaw)) {
      basedOnLegacySongId = Number(basedOnRaw);
      basedOnNumeric++;
    } else if (basedOnRaw) {
      basedOnNonNumeric++;
    }

    // 1) Upsert Song (χωρίς basedOnSongId ακόμα)
    const song = await prisma.song.upsert({
      where: { legacySongId },
      update: {
        slug,
        title,
        firstLyrics: toNullTrim(r.FirstLyrics),
        lyrics: toNullTrim(r.Lyrics),
        chords: toNullTrim(r.Chords),
        characteristics: toNullTrim(r.Characteristics),
        originalKey: toNullTrim(r.Tune_Writed),
        highestVocalNote: toNullTrim(r.Highest_Vocal_Note),
        scoreFile,
        hasScore,
        views: toIntOrZero(r.Count_Views),
        status: mapStatus(r.Status),
        categoryId,
        rythmId,
        // basedOnSongId: θα μπει σε 2ο πέρασμα
      },
      create: {
        legacySongId,
        slug,
        title,
        firstLyrics: toNullTrim(r.FirstLyrics),
        lyrics: toNullTrim(r.Lyrics),
        chords: toNullTrim(r.Chords),
        characteristics: toNullTrim(r.Characteristics),
        originalKey: toNullTrim(r.Tune_Writed),
        highestVocalNote: toNullTrim(r.Highest_Vocal_Note),
        scoreFile,
        hasScore,
        views: toIntOrZero(r.Count_Views),
        status: mapStatus(r.Status),
        categoryId,
        rythmId,
        createdByUserId: null,
        basedOnSongId: null,
      },
      select: { id: true, legacySongId: true },
    });

    // 2) Credits: Composer/Lyricist (καθαρίζουμε και ξαναγράφουμε)
    const composerLegacyIds = parseLegacyIdList(r.Composer);
    const lyricistLegacyIds = parseLegacyIdList(r.Lyricist);

    await prisma.songCredit.deleteMany({ where: { songId: song.id } });

    const creditRows = [];

    for (const aid of composerLegacyIds) {
      const artist = await prisma.artist.findUnique({
        where: { legacyArtistId: aid },
        select: { id: true },
      });
      if (!artist) {
        missingArtists++;
        continue;
      }
      creditRows.push({ songId: song.id, artistId: artist.id, role: SongCreditRole.COMPOSER });
    }

    for (const aid of lyricistLegacyIds) {
      const artist = await prisma.artist.findUnique({
        where: { legacyArtistId: aid },
        select: { id: true },
      });
      if (!artist) {
        missingArtists++;
        continue;
      }
      creditRows.push({ songId: song.id, artistId: artist.id, role: SongCreditRole.LYRICIST });
    }

    if (creditRows.length) {
      await prisma.songCredit.createMany({
        data: creditRows,
        skipDuplicates: true,
      });
      totalCredits += creditRows.length;
    }

    // 3) basedOn: αν είναι numeric, προσπάθησε να βρεις Song με legacySongId = basedOnLegacySongId
    if (basedOnLegacySongId) {
      const basedOnSong = await prisma.song.findUnique({
        where: { legacySongId: basedOnLegacySongId },
        select: { id: true },
      });
      if (basedOnSong) {
        await prisma.song.update({
          where: { id: song.id },
          data: { basedOnSongId: basedOnSong.id },
        });
      }
    }

    processed++;
    if (processed % 200 === 0) {
      console.log(`...processed ${processed}/${rows.length}`);
    }
  }

  console.log("DONE songs:", processed);
  console.log("Credits inserted:", totalCredits);
  console.log("Missing artists referenced in credits:", missingArtists);
  console.log("BasedOn numeric:", basedOnNumeric, "BasedOn non-numeric:", basedOnNonNumeric);
}

main()
  .catch((e) => {
    console.error("ETL 04 failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
