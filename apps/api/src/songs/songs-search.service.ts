import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, SongStatus } from "@prisma/client";

export type SearchParams = {
  q?: string;
  skip: number;
  take: number;

  createdByUserId?: number;

  chords?: string; // "1" | "0" | "null"
  partiture?: string; // "1" | "0" | "null"
  categoryIds?: number[];
  rythmIds?: number[];
  characteristics?: string;
  lyricsFlag?: string; // "null" => μόνο χωρίς στίχους
  status?: string; // SongStatus
  popular?: string; // "1" => sort by views desc
};

export type SearchResultItem = {
  song_id: number;
  title: string;
  firstLyrics: string;
  lyrics: string;
  characteristics: string;
  originalKey: string;
  chords: number | string | boolean | null;
  partiture: number | string | boolean | null;
  status: string;
  score: number;
  views: number | null;

  category_id: number | null;
  categoryId: number | null;
  rythm_id: number | null;
  rythmId: number | null;
};

export type SongsSearchResponse = {
  total: number;
  items: SearchResultItem[];
};

@Injectable()
export class SongsSearchService {
  constructor(private readonly prisma: PrismaService) {}

  private mapSongToResult(s: any): SearchResultItem {
    const chordsHas =
      typeof s.chords === "string" && s.chords.trim() !== "" ? 1 : 0;

    const partitureHas = s.scoreFile ? 1 : 0;

    const categoryId = typeof s.categoryId === "number" ? s.categoryId : null;
    const rythmId = typeof s.rythmId === "number" ? s.rythmId : null;

    return {
      song_id: s.id,
      title: s.title ?? "",
      firstLyrics: s.firstLyrics ?? "",
      lyrics: s.lyrics ?? "",
      characteristics: s.characteristics ?? "",
      originalKey: s.originalKey ?? "",
      chords: chordsHas,
      partiture: partitureHas,
      status: s.status ? String(s.status) : "",
      score: 0,
      views: typeof s.views === "number" ? s.views : null,

      category_id: categoryId,
      categoryId,
      rythm_id: rythmId,
      rythmId,
    };
  }

  async searchSongs(params: SearchParams): Promise<SongsSearchResponse> {
    const {
      q,
      skip,
      take,
      createdByUserId,
      chords,
      partiture,
      categoryIds,
      rythmIds,
      characteristics,
      lyricsFlag,
      status,
      popular,
    } = params;

    const where: Prisma.SongWhereInput = {};

    if (typeof createdByUserId === "number") {
      where.createdByUserId = createdByUserId;
    }

    if (chords === "1") where.chords = { not: null };
    else if (chords === "0") where.chords = null;

    if (partiture === "1") where.scoreFile = { not: null };
    else if (partiture === "0") where.scoreFile = null;

    if (status && status.trim() !== "") {
      const s = status.trim();
      if ((Object.values(SongStatus) as string[]).includes(s)) {
        where.status = s as SongStatus;
      }
    }

    if (categoryIds?.length) where.categoryId = { in: categoryIds };
    if (rythmIds?.length) where.rythmId = { in: rythmIds };

    if (characteristics === "null") {
      where.characteristics = null;
    } else if (characteristics && characteristics.trim() !== "") {
      where.characteristics = {
        contains: characteristics.trim(),
        mode: "insensitive",
      };
    }

    if (lyricsFlag === "null") {
      where.lyrics = null;
    }

    // q
    if (q && q.trim() !== "") {
      const term = q.trim();
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { firstLyrics: { contains: term, mode: "insensitive" } },
        { lyrics: { contains: term, mode: "insensitive" } },
        { characteristics: { contains: term, mode: "insensitive" } },
      ];
    }

    const safeTake = (() => {
      if (!Number.isFinite(take)) return 50;
      if (take <= 0) return 50;
      if (take > 200) return 200;
      return take;
    })();

    const safeSkip = (() => {
      if (!Number.isFinite(skip)) return 0;
      if (skip < 0) return 0;
      return skip;
    })();

    const sortByPopular = popular === "1";

    // ✅ FIX: SortOrder literals (as const)
    const orderBy: Prisma.SongOrderByWithRelationInput[] = sortByPopular
      ? [{ views: "desc" as const }, { title: "asc" as const }, { id: "asc" as const }]
      : [{ title: "asc" as const }, { id: "asc" as const }];

    const [songs, total] = await this.prisma.$transaction([
      this.prisma.song.findMany({
        where,
        skip: safeSkip,
        take: safeTake,
        orderBy,
      }),
      this.prisma.song.count({ where }),
    ]);

    return { total, items: songs.map((s) => this.mapSongToResult(s)) };
  }
}
