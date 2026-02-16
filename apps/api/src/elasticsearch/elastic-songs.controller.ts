// apps/api/src/elasticsearch/elastic-songs.controller.ts

import { Controller, Get, HttpException, HttpStatus, Query } from "@nestjs/common";

type EsHit<T> = {
  _id: string;
  _source: T;
  _score?: number;
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
   * ΠΡΟΣΟΧΗ:
   * - Αν το mapping είναι keyword: use "status"
   * - Αν είναι text με subfield keyword: use "status.keyword"
   *
   * Δεν μπορώ να μαντέψω το mapping από εδώ. Βάζω default "status.keyword"
   * όπως είχες, αλλά αν δεις περίεργα counts στο aggs.status, άλλαξέ το σε "status".
   */
  private readonly STATUS_FIELD = process.env.ES_STATUS_FIELD ?? "status.keyword";

  /**
   * Normalization συμβατή με ελληνικό analyzer:
   * - αφαιρεί τόνους/διακριτικά
   * - lower
   * - κάνει punctuation -> spaces
   */
  private normalizeForEs(input: string): string {
    const s = String(input ?? "");
    const noMarks = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const cleaned = noMarks
      .replace(/[’'`´]/g, "")
      .replace(/[\u2010-\u2015\u2212\-_/]+/g, " ")
      .replace(/[^0-9A-Za-z\u0370-\u03FF\u1F00-\u1FFF]+/g, " ");

    return cleaned.toLowerCase().replace(/\s+/g, " ").trim();
  }

  private tokenizeForPhrase(input: string): string[] {
    const norm = this.normalizeForEs(input);
    return norm ? norm.split(" ").map((t) => t.trim()).filter(Boolean) : [];
  }

  /**
   * Stopwords / πολύ μικρά tokens (π.χ. "η", "α", "κι") σε phrase-search
   * κάνουν θόρυβο και μπορούν να βαραίνουν πολύ.
   *
   * Κρατάμε:
   * - head tokens: >= 2 chars
   * - last token: >= 1 (για να δουλεύει incomplete prefix) αλλά προστατεύουμε τα βαριά πεδία (lyrics)
   */
  private sanitizePhraseTokens(tokens: string[]): { head: string[]; last: string | null } {
    const toks = (tokens ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
    if (!toks.length) return { head: [], last: null };
    if (toks.length === 1) return { head: [], last: toks[0] };

    const last = toks[toks.length - 1];
    const head = toks.slice(0, -1).filter((t) => t.length >= 2);
    return { head, last: last || null };
  }

  /**
   * Φτιάχνει "συνεχόμενη φράση" (in_order + slop=0).
   * - head tokens: span_term (όχι fuzzy) για να μένει ελαφρύ και deterministic
   * - last token: prefix (για incomplete)
   *
   * Για typo tolerance, ΔΕΝ κάνουμε brute-force prefix variants (risk: maxClauseCount).
   * Αν θες typos, το κάνουμε στο fallback multi_match, όχι στο phrase layer.
   */
  private buildStrictSpanPhrase(field: string, tokens: string[], boost: number, opts?: { minLastPrefixLen?: number }) {
    const { head, last } = this.sanitizePhraseTokens(tokens);
    const minLastPrefixLen = opts?.minLastPrefixLen ?? 1;

    if (!last) return null;
    if (last.length < minLastPrefixLen) return null;

    // single token => prefix query
    if (!head.length) {
      // Μην κάνεις prefix για 1 γράμμα σε "βαριά" πεδία (θα το ελέγξουμε από caller)
      return { prefix: { [field]: { value: last, boost } } };
    }

    const clauses: any[] = [];

    // head: span_term (αναλυμένο field -> term-level spans)
    for (const t of head) {
      clauses.push({ span_term: { [field]: t } });
    }

    // last: prefix
    clauses.push({
      span_multi: {
        match: {
          prefix: {
            [field]: { value: last },
          },
        },
      },
    });

    return {
      span_near: {
        in_order: true,
        slop: 0,
        clauses,
        boost,
      },
    };
  }

  private async esSearch<T>(body: any): Promise<EsSearchResponse<T>> {
    const url = `${this.ES_BASE}/${this.INDEX}/_search`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`ES _search failed HTTP ${res.status} ${res.statusText} – body: ${text.slice(0, 1200)}`);
    }

    try {
      return JSON.parse(text) as EsSearchResponse<T>;
    } catch {
      throw new Error(`ES _search returned non-JSON: ${text.slice(0, 800)}`);
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

    if (opts?.nullMeansFalse && s === "null") return false;

    if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
    if (s === "0" || s === "false" || s === "no" || s === "off") return false;

    return undefined;
  }

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

    // flags (CSV)
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

    // IDs (CSV) for composer/lyricist
    @Query("composerIds") composerIdsStr?: string,
    @Query("lyricistIds") lyricistIdsStr?: string,
    @Query("composerId") composerIdAlt?: string,
    @Query("lyricistId") lyricistIdAlt?: string,

    // sorting toggle
    @Query("popular") popular?: string,

    // legacy single singer filters
    @Query("singerFrontId") singerFrontIdStr?: string,
    @Query("singerBackId") singerBackIdStr?: string,

    // multi-select singers
    @Query("singerFrontIds") singerFrontIdsStr?: string,
    @Query("singerBackIds") singerBackIdsStr?: string,

    // years
    @Query("years") yearsStr?: string,

    // year range
    @Query("yearFrom") yearFromStr?: string,
    @Query("yearTo") yearToStr?: string,

    // creator multi-select
    @Query("createdByUserId") createdByUserIdStr?: string,

    // optional: tagId "Οργανικό"
    @Query("organikoTagId") organikoTagIdStr?: string,
  ) {
    try {
      const take = this.parseNumber(takeStr, 20, 1, 200);
      const skip = this.parseNumber(skipStr, 0, 0, 1_000_000);

      const term = this.pickFirstNonEmpty(searchTerm, q);
      const trimmedTerm = term ? String(term).trim() : "";
      const normTokens = trimmedTerm ? this.tokenizeForPhrase(trimmedTerm) : [];
      const hasQuery = normTokens.length > 0;

      const categoryIds = this.parseIdsFromAliases(categoryIdsStr, categoryIdLegacy, categoryIdAlt);
      const rythmIds = this.parseIdsFromAliases(rythmIdsStr, rythmIdLegacy, rythmIdAlt);

      const chordsWanted = this.parseBoolCsv(chordsStr);
      const lyricsWanted = this.parseBoolCsv(lyricsStr, { nullMeansFalse: true });
      const scoreWanted = this.parseBoolCsv(partitureStr);

      const organikoTagId = this.parseNumber(organikoTagIdStr, 0, 0, 10_000_000) || null;

      const tagsIds = this.parseIdsFromAliases(tagsStr, tagIdsStr);

      const composerIds = this.parseIdsFromAliases(composerIdsStr, composerIdAlt);
      const lyricistIds = this.parseIdsFromAliases(lyricistIdsStr, lyricistIdAlt);

      const createdByIds = this.parseIdList(createdByUserIdStr);

      const composerList = this.parseStringCsv(composerStr);
      const lyricistList = this.parseStringCsv(lyricistStr);

      const singerFrontId = this.parseNumber(singerFrontIdStr, 0, 0, 2_000_000) || null;
      const singerBackId = this.parseNumber(singerBackIdStr, 0, 0, 2_000_000) || null;

      const singerFrontIds = Array.from(
        new Set<number>([...(this.parseIdList(singerFrontIdsStr) ?? []), ...(singerFrontId ? [singerFrontId] : [])]),
      );

      const singerBackIds = Array.from(
        new Set<number>([...(this.parseIdList(singerBackIdsStr) ?? []), ...(singerBackId ? [singerBackId] : [])]),
      );

      const years = Array.from(new Set<number>(this.parseIdList(yearsStr) ?? []));
      const yearFrom = this.parsePositiveIntOrNull(yearFromStr, 1, 3000);
      const yearTo = this.parsePositiveIntOrNull(yearToStr, 1, 3000);

      const filters: any[] = [];

      if (categoryIds?.length) filters.push({ terms: { categoryId: categoryIds } });
      if (rythmIds?.length) filters.push({ terms: { rythmId: rythmIds } });

      if (createdByIds?.length) filters.push({ terms: { createdById: createdByIds } });

      const statusList = this.parseStringCsv(status);
      if (statusList?.length) {
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

        // "Χωρίς στίχους" να μην περιλαμβάνει "Οργανικό"
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

      if (!lyricistIds?.length && lyricistList?.length) {
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

      // singers nested filter (AND logic)
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

      /**
       * SEARCH STRATEGY
       *
       * Στόχος που ζήτησες:
       * - ΜΟΝΟ συνεχόμενες λέξεις (phrase, adjacency, order)
       * - last token incomplete => prefix
       * - πολύ μεγάλη βαρύτητα σε title, μετά firstLyrics
       * - προστασία από maxClauseCount σε lyrics
       *
       * ΠΡΑΚΤΙΚΟ:
       * - κύρια signal: strict span phrase σε title & firstLyrics
       * - δευτερεύον: strict span phrase σε lyrics ΜΟΝΟ όταν το last token έχει >= 3 chars
       * - fallback: multi_match (για typos), αλλά με χαμηλότερη βαρύτητα και operator=and
       */
      let query: any;

      if (hasQuery) {
        const should: any[] = [];

        // Title: strongest, επιτρέπει last prefix από 1 char (π.χ. "ξεκ")
        const qTitle = this.buildStrictSpanPhrase("title", normTokens, 30, { minLastPrefixLen: 1 });
        if (qTitle) should.push(qTitle);

        // First lyrics: strong
        const qFirst = this.buildStrictSpanPhrase("firstLyrics", normTokens, 15, { minLastPrefixLen: 1 });
        if (qFirst) should.push(qFirst);

        // Lyrics: guard against explosions -> require last prefix len >= 3
        const qLyrics = this.buildStrictSpanPhrase("lyrics", normTokens, 3, { minLastPrefixLen: 3 });
        if (qLyrics) should.push(qLyrics);

        // Fallback (typos): χαμηλότερο boost, αλλά βοηθά όταν analyzer/spacing κάνει περίεργα
        should.push({
          multi_match: {
            query: trimmedTerm,
            fields: ["title^4", "firstLyrics^2", "lyrics", "composerName^1.5", "lyricistName^1.5", "tagTitles"],
            type: "best_fields",
            operator: "and",
            fuzziness: "AUTO",
          },
        });

        query = {
          bool: {
            filter: filters,
            should,
            minimum_should_match: 1,
          },
        };
      } else {
        query = { bool: { filter: filters } };
      }

      /**
       * SORT (ΚΡΙΣΙΜΟ)
       * - popular=1: views desc
       * - αλλιώς:
       *   - αν υπάρχει query: _score desc (relevance), tie-break id desc
       *   - αν δεν υπάρχει query: id desc
       */
      const sort =
        popular === "1"
          ? [{ views: { order: "desc" as const } }, { id: { order: "desc" as const } }]
          : hasQuery
            ? [{ _score: { order: "desc" as const } }, { id: { order: "desc" as const } }]
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
          "createdById",
          "createdByName",
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

          createdById: {
            terms: { field: "createdById", size: 500 },
            aggs: { topName: { top_hits: { size: 1, _source: { includes: ["createdByName"] } } } },
          },

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
                  topName: {
                    top_hits: { size: 1, _source: { includes: ["versionSingerPairs.frontName"] } },
                  },
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
                  topName: {
                    top_hits: { size: 1, _source: { includes: ["versionSingerPairs.backName"] } },
                  },
                },
              },
            },
          },

          years: { terms: { field: "years", size: 300 } },

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

  @Get("artist-role-counts")
  async artistRoleCounts(@Query("artistId") artistIdStr?: string) {
    try {
      const artistId = this.parseNumber(artistIdStr, 0, 1, 2_000_000);
      if (!artistId) throw new Error("artistId is required");

      const body = {
        size: 0,
        track_total_hits: false,
        query: { match_all: {} },
        aggs: {
          roleCounts: {
            filters: {
              filters: {
                composer: { term: { composerId: artistId } },
                lyricist: { term: { lyricistId: artistId } },
                singerFront: {
                  nested: {
                    path: "versionSingerPairs",
                    query: { term: { "versionSingerPairs.frontId": artistId } },
                  },
                },
                singerBack: {
                  nested: {
                    path: "versionSingerPairs",
                    query: { term: { "versionSingerPairs.backId": artistId } },
                  },
                },
              },
            },
          },
        },
      };

      const json = await this.esSearch<any>(body);
      const buckets = json?.aggregations?.roleCounts?.buckets ?? {};

      return {
        artistId,
        composer: buckets?.composer?.doc_count ?? 0,
        lyricist: buckets?.lyricist?.doc_count ?? 0,
        singerFront: buckets?.singerFront?.doc_count ?? 0,
        singerBack: buckets?.singerBack?.doc_count ?? 0,
      };
    } catch (e: any) {
      throw new HttpException(e?.message ?? "Elasticsearch request failed", HttpStatus.BAD_GATEWAY);
    }
  }
}
