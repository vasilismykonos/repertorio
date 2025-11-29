// scripts/reindex-songs-next.ts
//
// Τρέχει από CLI: pnpm run reindex:songs_next
//
// Κάνει batch fetch από PostgreSQL (Prisma) και γράφει στο Elasticsearch index "songs_next".
// Δεν πειράζει ΚΑΘΟΛΟΥ τον παλιό index "songs" που χρησιμοποιεί το WordPress.
//
// ΠΡΟΣΟΧΗ: Σε αυτή την έκδοση χρησιμοποιούμε μόνο τα πεδία που σίγουρα υπάρχουν
// στο Prisma model σου: id, title, firstLyrics, lyrics, chords, characteristics, status, originalKey.

import { Client as ESClient } from "@elastic/elasticsearch";
import { PrismaClient } from "@prisma/client";

const es = new ESClient({
  node: "http://localhost:9200",
});

const prisma = new PrismaClient();

async function reindexSongsNext() {
  const batchSize = 500;
  let skip = 0;
  let totalIndexed = 0;

  console.log("Ξεκινάει το reindex των τραγουδιών στο Elasticsearch (index: songs_next)...");

  while (true) {
    const songs = await prisma.song.findMany({
      skip,
      take: batchSize,
      // ΜΟΝΟ πεδία που ξέρουμε ότι υπάρχουν από το error:
      // id, title, firstLyrics, lyrics, chords, characteristics, status, originalKey
      select: {
        id: true,
        title: true,
        firstLyrics: true,
        lyrics: true,
        chords: true,
        characteristics: true,
        status: true,
        originalKey: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (songs.length === 0) {
      break;
    }

    const body: any[] = [];

    for (const s of songs) {
      // chords είναι string | null (σύμφωνα με το error). Το κάνουμε integer.
      let chordsValue = 0;
      if (s.chords) {
        const parsed = parseInt(s.chords, 10);
        if (!isNaN(parsed)) {
          chordsValue = parsed;
        }
      }

      body.push({
        index: {
          _index: "songs_next", // ΝΕΟΣ index για το νέο site
          _id: String(s.id),
        },
      });

      body.push({
        song_id: s.id,
        Title: s.title ?? "",
        FirstLyrics: s.firstLyrics ?? "",
        Lyrics: s.lyrics ?? "",

        // Αυτά τα πεδία δεν τα είχαμε στο mapping, αλλά το ES θα τα προσθέσει δυναμικά.
        Characteristics: s.characteristics ?? "",
        OriginalKey: s.originalKey ?? "",

        // Από το mapping μας:
        Chords: chordsValue,
        // Δεν έχουμε πεδίο partiture στο Prisma, οπότε βάζουμε 0.
        Partiture: 0,

        // Status: enum στο Prisma -> το κάνουμε string
        Status: s.status ? String(s.status) : "",
      });
    }

    const resp = await es.bulk({ body });

    if (resp.errors) {
      console.error("Υπήρξαν errors στο bulk indexing για τον index songs_next.");
      // εδώ μπορείς να προσθέσεις αναλυτικό logging αν χρειαστεί
    }

    totalIndexed += songs.length;
    console.log(`Indexed batch: ${songs.length} (σύνολο μέχρι τώρα: ${totalIndexed})`);

    skip += batchSize;
  }

  console.log(`Ολοκληρώθηκε το reindex για songs_next. Σύνολο τραγουδιών: ${totalIndexed}`);
}

reindexSongsNext()
  .catch((err) => {
    console.error("Σφάλμα στο reindexSongsNext:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
