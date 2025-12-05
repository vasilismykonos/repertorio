// apps/api/src/songs/songs-search.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@prisma/client";
import { SongStatus } from "@prisma/client";
import { Client as ESClient } from "@elastic/elasticsearch";

type SearchParams = {
  q?: string;
  skip?: number;
  take?: number;
  createdByUserId?: number;
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
  private readonly logger = new Logger(SongsSearchService.name);
  private readonly es: ESClient;
  private readonly esIndex: string;

  constructor(private readonly prisma: PrismaService) {
    this.es = new ESClient({
      node: process.env.ES_NODE || "http://localhost:9200",
    });
    // Χρησιμοποιούμε τον ίδιο index που χρησιμοποιεί και το παλιό WordPress plugin
    this.esIndex = process.env.ES_SONGS_INDEX || "songs";
  }

  // ----------------- Postgres helpers (όπως πριν) -----------------

  // Μετατροπή ενός Song (Prisma) σε SearchResultItem με score=0
  private mapSongWithoutScore(s: any): SearchResultItem {
    let chordsValue = 0;
    if (s.chords) {
      const parsed = parseInt(s.chords as any, 10);
      if (!Number.isNaN(parsed)) {
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
  }

  // Αναζήτηση σε Postgres με q (μόνο PUBLISHED για global search)
  private async searchPostgresWithQuery(
    q: string,
    skip: number,
    take: number,
  ): Promise<SearchResult> {
    const where: Prisma.SongWhereInput = {
      status: SongStatus.PUBLISHED,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { firstLyrics: { contains: q, mode: "insensitive" } },
        { lyrics: { contains: q, mode: "insensitive" } },
      ],
    };

    const [songs, total] = await Promise.all([
      this.prisma.song.findMany({
        where,
        skip,
        take,
        orderBy: { title: "asc" },
      }),
      this.prisma.song.count({ where }),
    ]);

    return {
      total,
      items: songs.map((s) => this.mapSongWithoutScore(s)),
    };
  }

  // ----------------- Elasticsearch helpers (νέα λογική) -----------------

  /**
   * Χτίζει το bool query του Elasticsearch για το search term,
   * ακολουθώντας όσο το δυνατόν πιο πιστά τη λογική του παλιού songs.php
   * (multiword vs monoword, Title / FirstLyrics / Lyrics, plus Composer / Lyricist / Singers).
   */
  private buildElasticBoolQueryForQ(q: string): any {
    const searchTerm = (q || "").trim();
    const bool: any = {};

    if (!searchTerm) {
      // Δεν το καλούμε ποτέ έτσι από κάτω, αλλά για ασφάλεια
      bool.must = [{ match_all: {} }];
      return bool;
    }

    const terms = searchTerm.split(/\s+/).filter(Boolean);
    const isMultiword = terms.length > 1;

    const should: any[] = [];

    if (isMultiword) {
      // -----------------------------
      // ΠΟΛΥΛΕΞΗ ΑΝΑΖΗΤΗΣΗ
      // -----------------------------

      // 1) Ακριβής φράση με τέλεια συνοχή στο Title
      should.push({
        match_phrase: {
          Title: {
            query: searchTerm,
            slop: 0,
            boost: 1200,
          },
        },
      });

      // 2) match_phrase_prefix στο Title
      should.push({
        match_phrase_prefix: {
          Title: {
            query: searchTerm,
            slop: 0,
            max_expansions: 50,
            boost: 900,
          },
        },
      });

      // 3) match_phrase_prefix στους πρώτους στίχους
      should.push({
        match_phrase_prefix: {
          FirstLyrics: {
            query: searchTerm,
            slop: 0,
            max_expansions: 30,
            boost: 200,
          },
        },
      });

      // 4) match_phrase_prefix σε όλους τους στίχους
      should.push({
        match_phrase_prefix: {
          Lyrics: {
            query: searchTerm,
            slop: 0,
            max_expansions: 30,
            boost: 10,
          },
        },
      });

      // 5) Επιπλέον fuzzy για μικρο-ορθογραφικά / greeklish στο Title
      should.push({
        match: {
          Title: {
            query: searchTerm,
            operator: "and",
            fuzziness: "AUTO",
            boost: 300,
          },
        },
      });
    } else {
      // -----------------------------
      // ΜΟΝΟΛΕΞΗ ΑΝΑΖΗΤΗΣΗ
      // -----------------------------

      // 1) "ισχυρό" match σε Title / FirstLyrics / Lyrics
      should.push({
        multi_match: {
          query: searchTerm,
          fields: ["Title^10", "FirstLyrics^5", "Lyrics^2"],
          type: "best_fields",
          fuzziness: "AUTO",
          boost: 700,
        },
      });

      // 2) Fuzzy μόνο στο Title
      should.push({
        match: {
          Title: {
            query: searchTerm,
            fuzziness: "AUTO",
            boost: 600,
          },
        },
      });

      // 3) Fuzzy στους πρώτους στίχους
      should.push({
        match: {
          FirstLyrics: {
            query: searchTerm,
            fuzziness: "AUTO",
            boost: 120,
          },
        },
      });

      // 4) Fuzzy σε όλους τους στίχους
      should.push({
        match: {
          Lyrics: {
            query: searchTerm,
            fuzziness: "AUTO",
            boost: 20,
          },
        },
      });
    }

    // 5) Συνθέτης / στιχουργός / ερμηνευτές (ίδιο και στις δύο περιπτώσεις)
    should.push({
      multi_match: {
        query: searchTerm,
        fields: ["Composer^5", "Lyricist^5", "SingerFront^3", "SingerBack^2"],
        fuzziness: "AUTO",
      },
    });

    bool.should = should;
    bool.minimum_should_match = 1;

    return bool;
  }

  /**
   * Εκτέλεση του search στο Elasticsearch index "songs" (ή ES_SONGS_INDEX),
   * με πλήρη αντιστοίχιση των πεδίων του παλιού index.
   */
  private async searchElasticWithQuery(
    q: string,
    skip: number,
    take: number,
  ): Promise<SearchResult> {
    const boolQuery = this.buildElasticBoolQueryForQ(q);

    const body: any = {
      from: skip,
      size: take,
      track_total_hits: true,
      query: {
        bool: boolQuery,
      },
      sort: [
        {
          _score: { order: "desc" },
        },
      ],
    };

    const resp = await this.es.search<any>({
      index: this.esIndex,
      body,
    });

    const hits = (resp as any).hits?.hits ?? [];
    const totalHits = (resp as any).hits?.total?.value ?? hits.length;

    const items: SearchResultItem[] = hits.map((hit: any) => {
      const src = hit._source || {};

      let chordsValue = 0;
      if (typeof src.Chords === "number") {
        chordsValue = src.Chords;
      } else if (typeof src.Chords === "string") {
        const parsed = parseInt(src.Chords, 10);
        if (!Number.isNaN(parsed)) {
          chordsValue = parsed;
        }
      }

      let partitureValue = 0;
      if (typeof src.Partiture === "number") {
        partitureValue = src.Partiture > 0 ? 1 : 0;
      } else if (typeof src.Partiture === "string") {
        const parsed = parseInt(src.Partiture, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          partitureValue = 1;
        }
      }

      return {
        song_id: src.Song_ID ?? 0,
        title: src.Title ?? "",
        firstLyrics: src.FirstLyrics ?? "",
        lyrics: src.Lyrics ?? "",
        characteristics: src.Characteristics ?? "",
        originalKey: "", // Δεν υπάρχει στο παλιό index
        chords: chordsValue,
        partiture: partitureValue,
        status: "", // Το παλιό index δεν είχε Status – κρατάμε κενό
        score: typeof hit._score === "number" ? hit._score : 0,
      };
    });

    return {
      total: totalHits,
      items,
    };
  }

  // ----------------- Δημόσιο API -----------------

  async search(params: SearchParams): Promise<SearchResult> {
    const q = (params.q || "").trim();
    const skip = params.skip ?? 0;
    const take = params.take ?? 20;
    const createdByUserId = params.createdByUserId;

    // 0) Αν έχουμε createdByUserId -> ΠΑΝΤΑ Postgres (όπως πριν)
    //    Εδώ αφήνουμε ΟΛΑ τα status, γιατί είναι προσωπική λίστα χρήστη.
    if (typeof createdByUserId === "number") {
      const where: Prisma.SongWhereInput = {
        createdByUserId,
      };

      if (q) {
        where.OR = [
          { title: { contains: q, mode: "insensitive" } },
          { firstLyrics: { contains: q, mode: "insensitive" } },
          { lyrics: { contains: q, mode: "insensitive" } },
        ];
      }

      const [songs, total] = await Promise.all([
        this.prisma.song.findMany({
          where,
          skip,
          take,
          orderBy: [{ title: "asc" }],
        }),
        this.prisma.song.count({ where }),
      ]);

      return {
        total,
        items: songs.map((s) => this.mapSongWithoutScore(s)),
      };
    }

    // 1) Global search με q -> Elasticsearch (ίδια λογική με παλιό site)
    if (q) {
      try {
        return await this.searchElasticWithQuery(q, skip, take);
      } catch (err) {
        this.logger.error(
          `Elasticsearch search failed, falling back to Postgres. Error: ${
            (err as Error).message
          }`,
        );
        // Fallback σε Postgres για να μην "σπάσει" ποτέ η σελίδα
        return this.searchPostgresWithQuery(q, skip, take);
      }
    }

    // 2) Χωρίς q -> απλό Postgres (όπως πριν, π.χ. λίστα με αλφαβητική σειρά)
    return this.searchPostgresWithQuery("", skip, take);
  }
}
