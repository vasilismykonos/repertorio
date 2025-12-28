// apps/api/src/songs/songs-search.controller.ts
import { Controller, Get, HttpException, HttpStatus, Query } from "@nestjs/common";

@Controller("songs")
export class SongsSearchController {
  private readonly ES_URL =
    process.env.ES_SONGS_URL ?? "http://localhost:9200/app_songs/_search";

  private parseNumber(
    value: string | undefined,
    fallback: number,
    min?: number,
    max?: number,
  ) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (typeof min === "number" && n < min) return min;
    if (typeof max === "number" && n > max) return max;
    return n;
  }

  private parseBoolLike(v?: string): boolean | undefined {
    if (v == null) return undefined;
    const s = String(v).toLowerCase().trim();
    if (["1", "true", "yes", "y"].includes(s)) return true;
    if (["0", "false", "no", "n"].includes(s)) return false;
    return undefined;
  }

  private parseIdList(value?: string): number[] | undefined {
    if (!value) return undefined;
    const ids = value
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length ? ids : undefined;
  }

  private pickFirstNonEmpty(...vals: Array<string | undefined>) {
    for (const v of vals) {
      const t = (v ?? "").trim();
      if (t) return t;
    }
    return "";
  }

  private coerceFinitePositiveInt(v: any): number | null {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return i > 0 ? i : null;
  }

  @Get("search")
  async search(
    // canonical + aliases (ώστε να μην σπάσει τίποτα όσο καθαρίζουμε το frontend)
    @Query("q") q?: string,
    @Query("search_term") searchTerm1?: string,
    @Query("searchTerm") searchTerm2?: string,
    @Query("term") searchTerm3?: string,

    @Query("skip") skipStr = "0",
    @Query("take") takeStr = "50",

    @Query("chords") chordsStr?: string,
    @Query("partiture") partitureStr?: string,
    @Query("category_id") categoryIdStr?: string,
    @Query("rythm_id") rythmIdStr?: string,
    @Query("characteristics") characteristics?: string,
    @Query("lyrics") lyricsStr?: string,
    @Query("status") status?: string,
    @Query("popular") popular?: string,
  ) {
    const skip = this.parseNumber(skipStr, 0, 0, 10_000);
    const take = this.parseNumber(takeStr, 50, 1, 200);

    const chords = this.parseBoolLike(chordsStr);
    const partiture = this.parseBoolLike(partitureStr);
    const categoryIds = this.parseIdList(categoryIdStr);
    const rythmIds = this.parseIdList(rythmIdStr);

    const lyricsNullOnly = lyricsStr != null && String(lyricsStr) === "null";
    const sortByPopular = popular === "1";

    const must: any[] = [];
    const filter: any[] = [];

    const qTerm = this.pickFirstNonEmpty(q, searchTerm1, searchTerm2, searchTerm3);

    if (qTerm) {
      must.push({
        multi_match: {
          query: qTerm,
          fields: ["title^3", "firstLyrics^2", "lyrics"],
          type: "best_fields",
          operator: "and",
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    if (typeof chords === "boolean") {
      if (chords) filter.push({ exists: { field: "chords" } });
      else filter.push({ bool: { must_not: [{ exists: { field: "chords" } }] } });
    }

    if (typeof partiture === "boolean") {
      if (partiture) filter.push({ exists: { field: "scoreFile" } });
      else filter.push({ bool: { must_not: [{ exists: { field: "scoreFile" } }] } });
    }

    if (categoryIds?.length) filter.push({ terms: { categoryId: categoryIds } });
    if (rythmIds?.length) filter.push({ terms: { rythmId: rythmIds } });

    if (characteristics && characteristics.trim() !== "") {
      filter.push({ match_phrase: { characteristics: characteristics.trim() } });
    }

    if (lyricsNullOnly) {
      filter.push({ bool: { must_not: [{ exists: { field: "lyrics" } }] } });
    }

    if (status && status.trim() !== "") {
      filter.push({ term: { status: status.trim() } });
    }

    const body: any = {
      from: skip,
      size: take,
      query: { bool: { must, filter } },
    };

    if (sortByPopular) {
      body.sort = [{ views: { order: "desc" } }];
    }

    try {
      const res = await fetch(this.ES_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new HttpException(
          `Elasticsearch error: ${res.status} ${text}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const json = await res.json();
      const hits = json?.hits?.hits ?? [];
      const total = json?.hits?.total?.value ?? 0;

      const items = hits.map((h: any) => {
        const src = h?._source ?? {};
        const srcId = this.coerceFinitePositiveInt(src?.id);
        const esId = this.coerceFinitePositiveInt(h?._id);
        const id = srcId ?? esId ?? undefined;
        return { ...src, id };
      });

      return { total, items };
    } catch (e: any) {
      throw new HttpException(
        e?.message ?? "Elasticsearch request failed",
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
