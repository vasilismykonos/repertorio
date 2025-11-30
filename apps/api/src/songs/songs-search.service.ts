// src/songs/songs-search.service.ts
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { Client as ESClient } from "@elastic/elasticsearch";
import { PrismaService } from "../prisma/prisma.service";

type SearchParams = {
  q?: string;
  skip?: number;
  take?: number;
};

type EsSongSource = {
  song_id: number;
  Title?: string;
  FirstLyrics?: string;
  Lyrics?: string;
  Characteristics?: string;
  OriginalKey?: string;
  Chords?: number;
  Partiture?: number;
  Status?: string;
};

type SearchResultItem = {
  song_id: number;
  title: string;
  firstLyrics: string;
  lyrics: string;
  characteristics: string;
  originalKey: string;
  chords: number;
  partiture: number;
  status: string;
  score: number;
};

type SearchResult = {
  total: number;
  items: SearchResultItem[];
};

@Injectable()
export class SongsSearchService {
  private es: ESClient;

  constructor(private readonly prisma: PrismaService) {
    this.es = new ESClient({
      node: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
    });
  }

  /**
   * Αναζήτηση τραγουδιών:
   * - Αν δεν υπάρχει q -> απλό read από PostgreSQL (Prisma)
   * - Αν υπάρχει q -> Elasticsearch για ranking, αλλά τα δεδομένα
   *   (τίτλος, στίχοι, κ.λπ.) έρχονται από PostgreSQL ώστε τα IDs
   *   να ταιριάζουν 100% με τη σελίδα τραγουδιού.
   */
  async search(params: SearchParams): Promise<SearchResult> {
    const q = (params.q || "").trim();
    const skip = params.skip ?? 0;
    const take = params.take ?? 20;

    // 1) Χωρίς q → επιστρέφουμε απλά τραγούδια από PostgreSQL
    if (!q) {
      const songs = await this.prisma.song.findMany({
        skip,
        take,
        orderBy: { id: "asc" },
        select: {
          id: true,
          title: true,
          firstLyrics: true,
          lyrics: true,
          characteristics: true,
          originalKey: true,
          chords: true,
          status: true,
          scoreFile: true,
        },
      });

      const items: SearchResultItem[] = songs.map((s) => {
        let chordsValue = 0;
        if (s.chords) {
          const parsed = parseInt(s.chords as any, 10);
          if (!isNaN(parsed)) {
            chordsValue = parsed;
          }
        }

        return {
          song_id: s.id,
          title: s.title ?? "",
          firstLyrics: s.firstLyrics ?? "",
          lyrics: s.lyrics ?? "",
          characteristics: s.characteristics ?? "",
          originalKey: s.originalKey ?? "",
          chords: chordsValue,
          partiture: s.scoreFile ? 1 : 0,
          status: s.status ? String(s.status) : "",
          score: 0,
        };
      });

      return {
        total: items.length,
        items,
      };
    }

    // 2) Με q → Elasticsearch (songs_next) αλλά δεδομένα από PostgreSQL
    try {
      const esResp: any = await (this.es.search as any)({
        index: "songs_next",
        from: skip,
        size: take,
        body: {
          query: {
            multi_match: {
              query: q,
              fields: ["Title^3", "FirstLyrics^2", "Lyrics"],
              fuzziness: "AUTO",
            },
          },
        },
      });

      const hits: any[] = esResp.hits?.hits ?? [];

      const total =
        typeof esResp.hits?.total === "number"
          ? esResp.hits.total
          : esResp.hits?.total?.value ?? hits.length;

      // Μαζεύουμε όλα τα song_id από το ES (είναι τα παλιά Song_ID)
      const esIds = Array.from(
        new Set(
          hits
            .map((hit) => {
              const src = (hit._source || {}) as EsSongSource;
              return src.song_id;
            })
            .filter((id) => typeof id === "number" && !Number.isNaN(id))
        )
      ) as number[];

      // Τραβάμε από PostgreSQL τα αντίστοιχα τραγούδια με id IN (esIds)
      const dbSongs = await this.prisma.song.findMany({
        where: { id: { in: esIds } },
        select: {
          id: true,
          title: true,
          firstLyrics: true,
          lyrics: true,
          characteristics: true,
          originalKey: true,
          chords: true,
          status: true,
          scoreFile: true,
        },
      });

      const dbMap = new Map<number, (typeof dbSongs)[number]>();
      for (const s of dbSongs) {
        dbMap.set(s.id, s);
      }

      const items: SearchResultItem[] = [];

      for (const hit of hits) {
        const src = (hit._source || {}) as EsSongSource;
        const esId = src.song_id;

        if (typeof esId !== "number" || Number.isNaN(esId)) {
          continue;
        }

        const dbSong = dbMap.get(esId);
        if (!dbSong) {
          // Αν για κάποιο λόγο δεν υπάρχει στο PostgreSQL, το παραλείπουμε
          continue;
        }

        let chordsValue = 0;
        if (dbSong.chords) {
          const parsed = parseInt(dbSong.chords as any, 10);
          if (!isNaN(parsed)) {
            chordsValue = parsed;
          }
        }

        items.push({
          song_id: dbSong.id, // ΠΑΝΤΑ το ID της PostgreSQL
          title: dbSong.title ?? src.Title ?? "",
          firstLyrics: dbSong.firstLyrics ?? src.FirstLyrics ?? "",
          lyrics: dbSong.lyrics ?? src.Lyrics ?? "",
          characteristics:
            dbSong.characteristics ?? src.Characteristics ?? "",
          originalKey: dbSong.originalKey ?? src.OriginalKey ?? "",
          chords: chordsValue,
          partiture: dbSong.scoreFile ? 1 : src.Partiture ?? 0,
          status: dbSong.status ? String(dbSong.status) : src.Status ?? "",
          score: hit._score ?? 0,
        });
      }

      return { total, items };
    } catch (err: any) {
      console.error("Elasticsearch search error:", err?.meta ?? err);
      throw new InternalServerErrorException("Search backend error");
    }
  }
}
