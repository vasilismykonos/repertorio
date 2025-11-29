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
   * - Αν υπάρχει q -> Elasticsearch (index: songs_next)
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
        },
      });

      const items: SearchResultItem[] = songs.map((s) => {
        let chordsValue = 0;
        if (s.chords) {
          const parsed = parseInt(s.chords as any, 10);
          if (!isNaN(parsed)) chordsValue = parsed;
        }

        return {
          song_id: s.id,
          title: s.title ?? "",
          firstLyrics: s.firstLyrics ?? "",
          lyrics: s.lyrics ?? "",
          characteristics: s.characteristics ?? "",
          originalKey: (s as any).originalKey ?? "",
          chords: chordsValue,
          partiture: 0, // προς το παρόν 0 – στο μέλλον μπορείς να το γεμίσεις από DB
          status: s.status ? String(s.status) : "",
          score: 0,
        };
      });

      return {
        total: items.length,
        items,
      };
    }

    // 2) Με q → Elasticsearch (songs_next)
    try {
      // Χρησιμοποιούμε any στο boundary για να παρακάμψουμε τα TS overload errors
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

      const total =
        typeof esResp.hits?.total === "number"
          ? esResp.hits.total
          : esResp.hits?.total?.value ?? 0;

      const hits = (esResp.hits?.hits ?? []) as any[];

      const items: SearchResultItem[] = hits.map((hit) => {
        const src = (hit._source || {}) as EsSongSource;

        return {
          song_id: src.song_id,
          title: src.Title ?? "",
          firstLyrics: src.FirstLyrics ?? "",
          lyrics: src.Lyrics ?? "",
          characteristics: src.Characteristics ?? "",
          originalKey: src.OriginalKey ?? "",
          chords: src.Chords ?? 0,
          partiture: src.Partiture ?? 0,
          status: src.Status ?? "",
          score: hit._score ?? 0,
        };
      });

      return { total, items };
    } catch (err: any) {
      console.error("Elasticsearch search error:", err?.meta ?? err);
      throw new InternalServerErrorException("Search backend error");
    }
  }
}
