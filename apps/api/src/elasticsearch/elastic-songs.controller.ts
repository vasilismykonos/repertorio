// apps/api/src/elasticsearch/elastic-songs.controller.ts

import { Controller, Get, HttpException, HttpStatus, Query } from "@nestjs/common";

type EsHit<T> = {
  _id: string;
  _source: T;
};

type EsSearchResponse<T> = {
  hits?: {
    total?: { value?: number };
    hits?: Array<EsHit<T>>;
  };
  aggregations?: any;
};

@Controller("songs-es")
export class ElasticSongsController {
  private readonly ES_BASE = (process.env.ES_BASE_URL ?? "http://127.0.0.1:9200").replace(/\/$/, "");
  private readonly INDEX = process.env.ES_SONGS_INDEX ?? "app_songs";

  /**
   * Αν στο mapping το status είναι keyword, άστο "status".
   * Αν είναι text, θα χρειαστεί να το κάνεις "status.keyword".
   */
  private readonly STATUS_FIELD = "status.keyword";


  private async esSearch<T>(body: any): Promise<EsSearchResponse<T>> {
    const url = `${this.ES_BASE}/${this.INDEX}/_search`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`ES _search failed HTTP ${res.status} ${res.statusText} – body: ${text.slice(0, 800)}`);
    }

    try {
      return JSON.parse(text) as EsSearchResponse<T>;
    } catch {
      throw new Error(`ES _search returned non-JSON: ${text.slice(0, 500)}`);
    }
  }

  private parseNumber(
    v?: string,
    defaultValue = 0,
    min = -Number.MAX_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
  ): number {
    const n = Number(String(v ?? "").trim());
    if (!Number.isFinite(n)) return defaultValue;
    if (n < min) return defaultValue;
    if (n > max) return defaultValue;
    return n;
  }

  private parsePositiveIntOrNull(v?: string, min = 1, max = 9999): number | null {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    if (i < min || i > max) return null;
    return i;
  }

  private parseBoolLike(value?: string, opts?: { nullMeansFalse?: boolean }): boolean | undefined {
    if (value === undefined) return undefined;

    const s = String(value).trim().toLowerCase();

    if (opts?.nullMeansFalse) {
      // lyrics=null => hasLyrics=false
      if (s === "null") return false;
    }

    if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
    if (s === "0" || s === "false" || s === "no" || s === "off") return false;

    return undefined;
  }

  // ✅ CSV flags (π.χ. lyrics=0,1) ώστε να δουλεύουν σωστά τα checkboxes.
  private parseBoolCsv(
    value?: string,
    opts?: { nullMeansFalse?: boolean },
  ): { wantTrue: boolean; wantFalse: boolean } | undefined {
    if (value == null) return undefined;

    const parts = String(value)
      .split(",")
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);

    if (!parts.length) return undefined;

    let wantTrue = false;
    let wantFalse = false;

    for (const p of parts) {
      const b = this.parseBoolLike(p, opts);
      if (b === true) wantTrue = true;
      else if (b === false) wantFalse = true;
    }

    if (!wantTrue && !wantFalse) return undefined;
    return { wantTrue, wantFalse };
  }

  private parseStringCsv(value?: string): string[] | undefined {
    if (value == null) return undefined;
    const parts = String(value)
      .split(",")
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);

    return parts.length ? parts : undefined;
  }

  private pickFirstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
    for (const v of values) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return undefined;
  }

  private parseIdList(value?: string): number[] | undefined {
    if (!value) return undefined;
    const nums = String(value)
      .split(",")
      .map((x) => Number(String(x ?? "").trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    return nums.length ? nums : undefined;
  }

  private parseIdsFromAliases(...values: Array<string | undefined | null>): number[] | undefined {
    for (const v of values) {
      const ids = this.parseIdList(v ?? undefined);
      if (ids?.length) return ids;
    }
    return undefined;
  }

  @Get("search")
  async search(
    // term aliases
    @Query("search_term") searchTerm?: string,
    @Query("q") q?: string,

    @Query("take") takeStr?: string,
    @Query("skip") skipStr?: string,

    // categories / rythms (new + legacy aliases)
    @Query("categoryIds") categoryIdsStr?: string,
    @Query("rythmIds") rythmIdsStr?: string,

    @Query("category_id") categoryIdLegacy?: string,
    @Query("rythm_id") rythmIdLegacy?: string,
    @Query("categoryId") categoryIdAlt?: string,
    @Query("rythmId") rythmIdAlt?: string,

    // flags (CSV from UI)
    @Query("chords") chordsStr?: string,
    @Query("lyrics") lyricsStr?: string,
    @Query("partiture") partitureStr?: string,

    // status
    @Query("status") status?: string,

    // tags aliases
    @Query("tags") tagsStr?: string,
    @Query("tagIds") tagIdsStr?: string,

    // legacy names
    @Query("composer") composerStr?: string,
    @Query("lyricist") lyricistStr?: string,

    // ✅ IDs (CSV) για composer/lyricist
    @Query("composerIds") composerIdsStr?: string,
    @Query("lyricistIds") lyricistIdsStr?: string,
    @Query("composerId") composerIdAlt?: string,
    @Query("lyricistId") lyricistIdAlt?: string,

    // sorting toggle
    @Query("popular") popular?: string,

    // legacy dependent filtering A↔B
    @Query("singerFrontId") singerFrontIdStr?: string,
    @Query("singerBackId") singerBackIdStr?: string,

    // ✅ ΝΕΟ: multi-select (CSV) για singers/year (modal)
    @Query("singerFrontIds") singerFrontIdsStr?: string,
    @Query("singerBackIds") singerBackIdsStr?: string,

    // ✅ legacy (multi-select) years (CSV)
    @Query("years") yearsStr?: string,

    // ✅ ΝΕΟ: year range
    @Query("yearFrom") yearFromStr?: string,
    @Query("yearTo") yearToStr?: string,

    // ✅ optional: tagId του "Οργανικό"
    @Query("organikoTagId") organikoTagIdStr?: string,
  ) {
    try {
      const take = this.parseNumber(takeStr, 20, 1, 200);
      const skip = this.parseNumber(skipStr, 0, 0, 1_000_000);

      const term = this.pickFirstNonEmpty(searchTerm, q);

      const categoryIds = this.parseIdsFromAliases(categoryIdsStr, categoryIdLegacy, categoryIdAlt);
      const rythmIds = this.parseIdsFromAliases(rythmIdsStr, rythmIdLegacy, rythmIdAlt);

      const chordsWanted = this.parseBoolCsv(chordsStr);
      const lyricsWanted = this.parseBoolCsv(lyricsStr, { nullMeansFalse: true });
      const scoreWanted = this.parseBoolCsv(partitureStr);

      const organikoTagId = this.parseNumber(organikoTagIdStr, 0, 0, 10_000_000) || null;

      const tagsIds = this.parseIdsFromAliases(tagsStr, tagIdsStr);

      // ✅ ids (CSV)
      const composerIds = this.parseIdsFromAliases(composerIdsStr, composerIdAlt);
      const lyricistIds = this.parseIdsFromAliases(lyricistIdsStr, lyricistIdAlt);

      // legacy: names (CSV)
      const composerList = this.parseStringCsv(composerStr);
      const lyricistList = this.parseStringCsv(lyricistStr);

      const singerFrontId = this.parseNumber(singerFrontIdStr, 0, 0, 2_000_000) || null;
      const singerBackId = this.parseNumber(singerBackIdStr, 0, 0, 2_000_000) || null;

      // ✅ multi-select singers (CSV) + legacy single
      const singerFrontIds = Array.from(
        new Set<number>([
          ...(this.parseIdList(singerFrontIdsStr) ?? []),
          ...(singerFrontId ? [singerFrontId] : []),
        ]),
      );

      const singerBackIds = Array.from(
        new Set<number>([
          ...(this.parseIdList(singerBackIdsStr) ?? []),
          ...(singerBackId ? [singerBackId] : []),
        ]),
      );

      // years (CSV) multi-select
      const years = Array.from(new Set<number>(this.parseIdList(yearsStr) ?? []));

      // year range
      const yearFrom = this.parsePositiveIntOrNull(yearFromStr, 1, 3000);
      const yearTo = this.parsePositiveIntOrNull(yearToStr, 1, 3000);

      const filters: any[] = [];

      if (categoryIds?.length) filters.push({ terms: { categoryId: categoryIds } });
      if (rythmIds?.length) filters.push({ terms: { rythmId: rythmIds } });

      // ✅ status CSV: PUBLISHED,DRAFT
      const statusList = this.parseStringCsv(status);
      if (statusList?.length) {
        // terms καλύπτει και length=1, αλλά κρατάω το term για σαφήνεια/debuggability.
        if (statusList.length === 1) filters.push({ term: { [this.STATUS_FIELD]: statusList[0] } });
        else filters.push({ terms: { [this.STATUS_FIELD]: statusList } });
      }

      if (chordsWanted && chordsWanted.wantTrue !== chordsWanted.wantFalse) {
        filters.push({ term: { hasChords: chordsWanted.wantTrue } });
      }

      if (scoreWanted && scoreWanted.wantTrue !== scoreWanted.wantFalse) {
        filters.push({ term: { hasScore: scoreWanted.wantTrue } });
      }

      if (lyricsWanted && lyricsWanted.wantTrue !== lyricsWanted.wantFalse) {
        const wantLyrics = lyricsWanted.wantTrue;
        filters.push({ term: { hasLyrics: wantLyrics } });

        // "Χωρίς στίχους" να ΜΗΝ περιλαμβάνει τα "Οργανικό"
        if (!wantLyrics && organikoTagId) {
          filters.push({ bool: { must_not: [{ term: { tagIds: organikoTagId } }] } });
        }
      }

      if (tagsIds?.length) filters.push({ terms: { tagIds: tagsIds } });

      if (years.length) filters.push({ terms: { years } });

      // overlap range: [minYear,maxYear] intersects [yearFrom,yearTo]
      if (yearFrom !== null || yearTo !== null) {
        const must: any[] = [];
        if (yearFrom !== null) must.push({ range: { maxYear: { gte: yearFrom } } });
        if (yearTo !== null) must.push({ range: { minYear: { lte: yearTo } } });
        filters.push({ bool: { must } });
      }

      if (composerIds?.length) filters.push({ terms: { composerId: composerIds } });
      if (lyricistIds?.length) filters.push({ terms: { lyricistId: lyricistIds } });

      // legacy fallback: names
      if (!composerIds?.length && composerList?.length) {
        if (composerList.length === 1) {
          filters.push({
            bool: {
              should: [
                { term: { "composerName.keyword": composerList[0] } },
                { match: { composerName: composerList[0] } },
              ],
              minimum_should_match: 1,
            },
          });
        } else {
          filters.push({
            bool: {
              should: composerList.map((c) => ({
                bool: {
                  should: [{ term: { "composerName.keyword": c } }, { match: { composerName: c } }],
                  minimum_should_match: 1,
                },
              })),
              minimum_should_match: 1,
            },
          });
        }
      }

      if (!lyricistIds?.length && lyricistList?.length) {
        if (lyricistList.length === 1) {
          filters.push({
            bool: {
              should: [
                { term: { "lyricistName.keyword": lyricistList[0] } },
                { match: { lyricistName: lyricistList[0] } },
              ],
              minimum_should_match: 1,
            },
          });
        } else {
          filters.push({
            bool: {
              should: lyricistList.map((c) => ({
                bool: {
                  should: [{ term: { "lyricistName.keyword": c } }, { match: { lyricistName: c } }],
                  minimum_should_match: 1,
                },
              })),
              minimum_should_match: 1,
            },
          });
        }
      }

      // singers filter (nested) AND λογική
      if (singerFrontIds.length || singerBackIds.length) {
        const nestedMust: any[] = [];

        if (singerFrontIds.length === 1) nestedMust.push({ term: { "versionSingerPairs.frontId": singerFrontIds[0] } });
        else if (singerFrontIds.length > 1) nestedMust.push({ terms: { "versionSingerPairs.frontId": singerFrontIds } });

        if (singerBackIds.length === 1) nestedMust.push({ term: { "versionSingerPairs.backId": singerBackIds[0] } });
        else if (singerBackIds.length > 1) nestedMust.push({ terms: { "versionSingerPairs.backId": singerBackIds } });

        filters.push({
          nested: {
            path: "versionSingerPairs",
            query: { bool: { must: nestedMust } },
          },
        });
      }

      const query =
        term && String(term).trim()
          ? {
              bool: {
                filter: filters,
                must: [
                  {
                    multi_match: {
                      query: term.trim(),
                      fields: ["title^3", "firstLyrics^2", "lyrics", "composerName^2", "lyricistName^2", "tagTitles"],
                      type: "best_fields",
                      operator: "and",
                    },
                  },
                ],
              },
            }
          : { bool: { filter: filters } };

      const sort =
        popular === "1"
          ? [{ views: { order: "desc" as const } }, { id: { order: "desc" as const } }]
          : [{ id: { order: "desc" as const } }];

      const body = {
        from: skip,
        size: take,
        _source: [
          "id",
          "legacySongId",
          "title",
          "firstLyrics",
          "lyrics",
          "characteristics",
          "originalKey",
          "categoryId",
          "categoryTitle",
          "rythmId",
          "rythmTitle",
          "composerId",
          "composerName",
          "lyricistId",
          "lyricistName",
          "singerFrontNames",
          "singerBackNames",
          "tagIds",
          "tagTitles",
          "tagSlugs",
          "years",
          "minYear",
          "maxYear",
          "yearText",
          "views",
          "status",
          "scoreFile",
          "hasChords",
          "hasLyrics",
          "hasScore",
        ],
        sort,
        aggs: {
          categoryId: { terms: { field: "categoryId", size: 200 } },
          rythmId: { terms: { field: "rythmId", size: 200 } },
          tagIds: { terms: { field: "tagIds", size: 500 } },

          // ✅ ΚΡΙΣΙΜΟ: Status aggregation (για σωστά counts στο modal)
          status: { terms: { field: this.STATUS_FIELD, size: 20 } },

          hasChords: { terms: { field: "hasChords", size: 2 } },
          hasLyrics: { terms: { field: "hasLyrics", size: 2 } },

          ...(organikoTagId
            ? {
                organikoHasLyrics: {
                  filter: { term: { tagIds: organikoTagId } },
                  aggs: { hasLyrics: { terms: { field: "hasLyrics", size: 2 } } },
                },
              }
            : {}),

          hasScore: { terms: { field: "hasScore", size: 2 } },

          composerId: {
            terms: { field: "composerId", size: 500 },
            aggs: { topName: { top_hits: { size: 1, _source: { includes: ["composerName"] } } } },
          },
          lyricistId: {
            terms: { field: "lyricistId", size: 500 },
            aggs: { topName: { top_hits: { size: 1, _source: { includes: ["lyricistName"] } } } },
          },

          singerFrontId: {
            nested: { path: "versionSingerPairs" },
            aggs: {
              byId: {
                terms: { field: "versionSingerPairs.frontId", size: 1000 },
                aggs: {
                  topName: { top_hits: { size: 1, _source: { includes: ["versionSingerPairs.frontName"] } } },
                },
              },
            },
          },
          singerBackId: {
            nested: { path: "versionSingerPairs" },
            aggs: {
              byId: {
                terms: { field: "versionSingerPairs.backId", size: 1000 },
                aggs: {
                  topName: { top_hits: { size: 1, _source: { includes: ["versionSingerPairs.backName"] } } },
                },
              },
            },
          },

          years: { terms: { field: "years", size: 300 } },

          // legacy (αν ζητηθούν ακόμα ως strings)
          composerName: { terms: { field: "composerName.keyword", size: 500 } },
          lyricistName: { terms: { field: "lyricistName.keyword", size: 500 } },
        },
        query,
      };

      const json = await this.esSearch<any>(body);

      const total = json?.hits?.total?.value ?? 0;
      const hits = json?.hits?.hits ?? [];

      const items = hits.map((h) => {
        const s = (h?._source ?? {}) as any;
        const hasChords = !!s?.hasChords;
        const hasLyrics = !!s?.hasLyrics;
        const hasScore = !!s?.hasScore;

        return {
          ...s,
          chords: hasChords ? 1 : 0,
          partiture: hasScore ? 1 : 0,
          lyrics: hasLyrics ? (String(s?.lyrics ?? "").trim() || null) : null,
        };
      });

      const aggs = json?.aggregations ?? {};
      return { total, items, aggs };
    } catch (e: any) {
      throw new HttpException(e?.message ?? "Elasticsearch request failed", HttpStatus.BAD_GATEWAY);
    }
  }
}
