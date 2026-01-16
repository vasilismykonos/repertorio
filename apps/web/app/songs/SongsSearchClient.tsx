"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FiltersModal from "./FiltersModal";
import type { Option } from "./FilterSelectWithSearch";

// ✅ NEW ARCH RULE:
// Browser calls must ALWAYS stay same-origin to avoid CORS / wrong domain.
// Nginx is responsible for proxying /api/v1 -> API server.
const API_BASE_URL = "/api/v1";

type SongSearchItem = {
  id?: number;
  legacySongId?: number | null;
  song_id?: number;

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

  tagIds?: number[] | null;
  tagTitles?: string[] | null;
  tagSlugs?: string[] | null;

  category_id?: number | null;
  categoryId?: number | null;
  categoryTitle?: string | null;
  category?: string | null;
  category_title?: string | null;

  rythm_id?: number | null;
  rythmId?: number | null;
  rythmTitle?: string | null;
  rythm?: string | null;
  rhythm_id?: number | null;
  rhythmId?: number | null;
  rhythmTitle?: string | null;

  composerId?: number | null;
  composerName?: string | null;
  lyricistId?: number | null;
  lyricistName?: string | null;

  years?: number[] | null;
  minYear?: number | null;
  maxYear?: number | null;
  yearText?: string | null;

  singerFrontNames?: string[] | null;
  singerBackNames?: string[] | null;
  versionSingerPairs?: {
    frontId?: number | null;
    backId?: number | null;
    frontName?: string | null;
    backName?: string | null;
  }[] | null;
};

type EsTermsAggBucket = { key: string | number; doc_count: number; [k: string]: any };
type EsTermsAgg = { buckets?: EsTermsAggBucket[] };

type EsAggs = {
  categoryId?: EsTermsAgg;
  rythmId?: EsTermsAgg;
  tagIds?: EsTermsAgg;

  composerId?: EsTermsAgg;
  lyricistId?: EsTermsAgg;

  singerFrontId?: any;
  singerBackId?: any;

  years?: EsTermsAgg;

  composerName?: EsTermsAgg;
  lyricistName?: EsTermsAgg;

  hasChords?: EsTermsAgg;
  hasLyrics?: EsTermsAgg;
  hasScore?: EsTermsAgg;
  organikoHasLyrics?: any;

  status?: EsTermsAgg;

  [k: string]: any;
};

type SongsSearchResponse = {
  total: number;
  items: SongSearchItem[];
  aggs?: EsAggs;
};

type CategoryDto = {
  id: number;
  title: string;
  _count?: { songs?: number };
  songCount?: number;
  songsCount?: number;
  [key: string]: any;
};

type RythmDto = {
  id: number;
  title: string;
  _count?: { songs?: number };
  songCount?: number;
  songsCount?: number;
  [key: string]: any;
};

type TagDto = {
  id: number;
  title: string;
  slug?: string | null;
  [key: string]: any;
};

function findOrganikoTagId(tags: TagDto[]): string | null {
  for (const t of tags || []) {
    const title = String(t?.title ?? "").trim();
    const slug = String(t?.slug ?? "").trim();

    if (title === "Οργανικό") return String(t.id);

    const titleLc = title ? title.toLocaleLowerCase("el-GR") : "";
    const slugLc = slug ? slug.toLocaleLowerCase("el-GR") : "";

    if (titleLc === "οργανικό") return String(t.id);
    if (slugLc === "οργανικό") return String(t.id);
  }
  return null;
}

type SongsPageSearchParams = {
  take?: string | string[];
  skip?: string | string[];

  q?: string | string[];
  search_term?: string | string[];

  chords?: string | string[];
  partiture?: string | string[];
  category_id?: string | string[];
  rythm_id?: string | string[];

  tagIds?: string | string[];

  composerIds?: string | string[];
  lyricistIds?: string | string[];

  singerFrontIds?: string | string[];
  singerBackIds?: string | string[];

  yearFrom?: string | string[];
  yearTo?: string | string[];

  composer?: string | string[];
  lyricist?: string | string[];

  lyrics?: string | string[];
  status?: string | string[];
  popular?: string | string[];
  createdByUserId?: string | string[];
};

type FiltersState = {
  take: number;
  skip: number;

  q: string;

  chords: string;
  partiture: string;
  category_id: string;
  rythm_id: string;

  tagIds: string;

  composerIds: string;
  lyricistIds: string;

  singerFrontIds: string;
  singerBackIds: string;

  yearFrom: string;
  yearTo: string;

  lyrics: string;
  status: string;
  popular: string;
  createdByUserId: string;
};

type CountsResult = {
  chordsCounts: Record<string, number>;
  partitureCounts: Record<string, number>;
  lyricsCounts: Record<string, number>;
  statusCounts: Record<string, number>;

  tagCountById: Record<string, number>;

  categoryCountById: Record<string, number>;
  categoryCountByTitle: Record<string, number>;
  categoryIdByTitle: Record<string, number | null>;

  rythmCountById: Record<string, number>;
  rythmCountByTitle: Record<string, number>;
  rythmIdByTitle: Record<string, number | null>;
};

type Props = {
  searchParams?: SongsPageSearchParams;
};

// -------------------- helpers --------------------

function normalizeParam(p: string | string[] | undefined): string {
  if (!p) return "";
  if (Array.isArray(p)) {
    return p
      .join(",")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .join(",");
  }
  return p;
}

function buildEsQueryFromFilters(filters: FiltersState, organikoTagId: string | null): URLSearchParams {
  const params = new URLSearchParams();

  params.set("take", String(filters.take));
  params.set("skip", String(filters.skip));

  const q = (filters.q || "").trim();
  if (q) params.set("search_term", q);

  if (filters.chords) params.set("chords", filters.chords);
  if (filters.partiture) params.set("partiture", filters.partiture);

  if (filters.category_id) params.set("categoryIds", filters.category_id);
  if (filters.rythm_id) params.set("rythmIds", filters.rythm_id);

  if (filters.tagIds) params.set("tagIds", filters.tagIds);

  if (filters.composerIds) params.set("composerIds", filters.composerIds);
  if (filters.lyricistIds) params.set("lyricistIds", filters.lyricistIds);

  if (filters.singerFrontIds) params.set("singerFrontIds", filters.singerFrontIds);
  if (filters.singerBackIds) params.set("singerBackIds", filters.singerBackIds);

  if (filters.yearFrom) params.set("yearFrom", filters.yearFrom);
  if (filters.yearTo) params.set("yearTo", filters.yearTo);

  if (filters.lyrics) params.set("lyrics", filters.lyrics);
  if (filters.status) params.set("status", filters.status);

  if (filters.popular === "1") params.set("popular", "1");

  if (filters.createdByUserId) params.set("createdByUserId", filters.createdByUserId);

  return params;
}

function buildUrlQueryFromFilters(filters: FiltersState): string {
  const params = new URLSearchParams();

  params.set("take", String(filters.take));
  params.set("skip", String(filters.skip));

  if (filters.q) params.set("search_term", filters.q);

  if (filters.chords) params.set("chords", filters.chords);
  if (filters.partiture) params.set("partiture", filters.partiture);
  if (filters.category_id) params.set("category_id", filters.category_id);
  if (filters.rythm_id) params.set("rythm_id", filters.rythm_id);

  if (filters.tagIds) params.set("tagIds", filters.tagIds);

  if (filters.composerIds) params.set("composerIds", filters.composerIds);
  if (filters.lyricistIds) params.set("lyricistIds", filters.lyricistIds);

  if (filters.singerFrontIds) params.set("singerFrontIds", filters.singerFrontIds);
  if (filters.singerBackIds) params.set("singerBackIds", filters.singerBackIds);

  if (filters.yearFrom) params.set("yearFrom", filters.yearFrom);
  if (filters.yearTo) params.set("yearTo", filters.yearTo);

  if (filters.lyrics) params.set("lyrics", filters.lyrics);
  if (filters.status) params.set("status", filters.status);
  if (filters.popular === "1") params.set("popular", "1");
  if (filters.createdByUserId) params.set("createdByUserId", filters.createdByUserId);

  return params.toString();
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!ct.includes("application/json")) {
    throw new Error(
      `Expected JSON but got content-type "${ct}". Body (trimmed): ${text.slice(0, 200)}`,
    );
  }
  return JSON.parse(text) as T;
}

function getCanonicalSongId(song: SongSearchItem): number | null {
  const id = song.id;
  if (typeof id === "number" && Number.isFinite(id) && id > 0) return id;

  const legacy = song.legacySongId;
  if (typeof legacy === "number" && Number.isFinite(legacy) && legacy > 0) return legacy;

  const fallback = song.song_id;
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) return fallback;

  return null;
}

function parseCsvToIdSet(csv: string): Set<string> {
  const set = new Set<string>();
  for (const raw of (csv || "").split(",")) {
    const v = raw.trim();
    if (!v) continue;
    if (/^\d+$/.test(v)) set.add(v);
  }
  return set;
}

function computeCountsFromSongs(songs: SongSearchItem[]): CountsResult {
  const chordsCounts: Record<string, number> = { "1": 0, "0": 0, null: 0 } as any;
  const partitureCounts: Record<string, number> = { "1": 0, "0": 0, null: 0 } as any;
  const lyricsCounts: Record<string, number> = { null: 0 } as any;
  const statusCounts: Record<string, number> = {};

  const tagCountById: Record<string, number> = {};

  const categoryCountById: Record<string, number> = {};
  const categoryCountByTitle: Record<string, number> = {};
  const categoryIdByTitle: Record<string, number | null> = {};

  const rythmCountById: Record<string, number> = {};
  const rythmCountByTitle: Record<string, number> = {};
  const rythmIdByTitle: Record<string, number | null> = {};

  for (const song of songs) {
    const chordsVal = song.chords;
    if (chordsVal === 1 || chordsVal === "1" || chordsVal === true) chordsCounts["1"]++;
    else if (chordsVal === 0 || chordsVal === "0" || chordsVal === false) chordsCounts["0"]++;
    else chordsCounts["null"] = (chordsCounts["null"] || 0) + 1;

    const partVal = song.partiture;
    if (partVal === 1 || partVal === "1" || partVal === true) partitureCounts["1"]++;
    else if (partVal === 0 || partVal === "0" || partVal === false) partitureCounts["0"]++;
    else partitureCounts["null"] = (partitureCounts["null"] || 0) + 1;

    const hasLyrics = !!(song.lyrics && song.lyrics.trim().length > 0);
    if (!hasLyrics) lyricsCounts["null"] = (lyricsCounts["null"] || 0) + 1;

    const st = song.status || "";
    if (st) statusCounts[st] = (statusCounts[st] || 0) + 1;

    const rawCategoryId =
      song.category_id ??
      song.categoryId ??
      (song as any).category_id ??
      (song as any).categoryId ??
      null;

    const rawCategoryTitleField =
      song.categoryTitle ??
      song.category ??
      song.category_title ??
      (song as any).categoryTitle ??
      (song as any).category ??
      (song as any).category_title ??
      "";

    let catTitleFromId: string | null = null;
    let numericCategoryId: number | null = null;

    if (rawCategoryId !== null && rawCategoryId !== undefined) {
      const cidStr = String(rawCategoryId).trim();
      if (/^\d+$/.test(cidStr)) {
        numericCategoryId = Number(cidStr);
        categoryCountById[cidStr] = (categoryCountById[cidStr] || 0) + 1;
      } else if (cidStr) {
        catTitleFromId = cidStr;
      }
    }

    const finalCategoryTitle = (catTitleFromId || rawCategoryTitleField || "").trim();

    if (finalCategoryTitle) {
      categoryCountByTitle[finalCategoryTitle] =
        (categoryCountByTitle[finalCategoryTitle] || 0) + 1;
      if (numericCategoryId !== null) categoryIdByTitle[finalCategoryTitle] = numericCategoryId;
      else if (!(finalCategoryTitle in categoryIdByTitle))
        categoryIdByTitle[finalCategoryTitle] = null;
    }

    const rawRythmId =
      song.rythm_id ??
      song.rythmId ??
      song.rhythm_id ??
      song.rhythmId ??
      (song as any).rythm_id ??
      (song as any).rythmId ??
      (song as any).rhythm_id ??
      (song as any).rhythmId ??
      null;

    const rawRythmTitleField =
      song.rythmTitle ??
      song.rythm ??
      song.rhythmTitle ??
      (song as any).rhythm ??
      (song as any).rythmTitle ??
      (song as any).rythm ??
      (song as any).rhythmTitle ??
      (song as any).rhythm ??
      "";

    let rTitleFromId: string | null = null;
    let numericRythmId: number | null = null;

    if (rawRythmId !== null && rawRythmId !== undefined) {
      const ridStr = String(rawRythmId).trim();
      if (/^\d+$/.test(ridStr)) {
        numericRythmId = Number(ridStr);
        rythmCountById[ridStr] = (rythmCountById[ridStr] || 0) + 1;
      } else if (ridStr) {
        rTitleFromId = ridStr;
      }
    }

    const finalRythmTitle = (rTitleFromId || rawRythmTitleField || "").trim();

    if (finalRythmTitle) {
      rythmCountByTitle[finalRythmTitle] = (rythmCountByTitle[finalRythmTitle] || 0) + 1;
      if (numericRythmId !== null) rythmIdByTitle[finalRythmTitle] = numericRythmId;
      else if (!(finalRythmTitle in rythmIdByTitle)) rythmIdByTitle[finalRythmTitle] = null;
    }
  }

  return {
    chordsCounts,
    partitureCounts,
    lyricsCounts,
    statusCounts,
    tagCountById,
    categoryCountById,
    categoryCountByTitle,
    categoryIdByTitle,
    rythmCountById,
    rythmCountByTitle,
    rythmIdByTitle,
  };
}

function buildLyricsPreview(song: SongSearchItem): string {
  const tagTitles = Array.isArray(song.tagTitles) ? song.tagTitles : [];
  const tagSlugs = Array.isArray(song.tagSlugs) ? song.tagSlugs : [];
  const isOrganikoByTags =
    tagTitles.some((t) => String(t || "").trim() === "Οργανικό") ||
    tagSlugs.some((s) => String(s || "").trim() === "οργανικό");

  const legacyCharacteristics = song.characteristics || "";
  const isOrganikoLegacy = legacyCharacteristics.includes("Οργανικό");

  if (isOrganikoByTags || isOrganikoLegacy) return "(Οργανικό)";

  const lyrics = (song.lyrics || "").trim();
  if (!lyrics) return "(Χωρίς διαθέσιμους στίχους)";

  const base = (song.firstLyrics || "").trim() || lyrics;
  const words = base.split(/\s+/).filter(Boolean);
  const short = words.slice(0, 5).join(" ");
  return words.length > 5 ? `${short}...` : short;
}

function buildYoutubeUrl(song: SongSearchItem): string {
  const base = "https://www.youtube.com/results";
  const q = `${song.title || ""} ${song.firstLyrics || ""}`.trim();
  const params = new URLSearchParams({
    search_query: q || song.title || "",
    app: "revanced",
  });
  return `${base}?${params.toString()}`;
}

function buildCountByIdFromAgg(agg?: EsTermsAgg): Record<string, number> {
  const out: Record<string, number> = {};
  const buckets = Array.isArray(agg?.buckets) ? agg!.buckets! : [];
  for (const b of buckets) {
    const key = String(b.key);
    const n = Number(b.doc_count);
    out[key] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

function buildOptionsFromTermsAgg(agg?: EsTermsAgg): Option[] {
  const buckets = Array.isArray(agg?.buckets) ? agg!.buckets! : [];
  const opts: Option[] = buckets
    .map((b) => {
      const key = String(b.key ?? "").trim();
      if (!key) return null;

      const count = Number(b.doc_count);
      const safeCount = Number.isFinite(count) ? count : 0;

      return { value: key, label: key, count: safeCount } as Option;
    })
    .filter(Boolean) as Option[];

  opts.sort((a, b) => {
    const na = Number(a.value);
    const nb = Number(b.value);

    const aNumOk = Number.isFinite(na);
    const bNumOk = Number.isFinite(nb);

    if (aNumOk && bNumOk && na !== nb) return na - nb;

    return a.label.localeCompare(b.label, "el");
  });

  return opts;
}

function buildOptionsFromIdAggWithTopName(agg: EsTermsAgg | undefined, nameField: string): Option[] {
  const buckets = Array.isArray(agg?.buckets) ? agg!.buckets! : [];

  const opts: Option[] = buckets
    .map((b) => {
      const idKey = String(b.key ?? "").trim();
      if (!idKey) return null;

      const count = Number(b.doc_count);
      const safeCount = Number.isFinite(count) ? count : 0;

      const topHits = (b as any)?.topName?.hits?.hits;
      const top = Array.isArray(topHits) && topHits.length ? topHits[0] : null;

      const name = String(top?._source?.[nameField] ?? "").trim();

      return {
        value: idKey,
        label: name || idKey,
        count: safeCount,
      } as Option;
    })
    .filter(Boolean) as Option[];

  opts.sort((a, b) => {
    const ca = typeof a.count === "number" ? a.count : 0;
    const cb = typeof b.count === "number" ? b.count : 0;
    if (cb !== ca) return cb - ca;
    return a.label.localeCompare(b.label, "el");
  });

  return opts;
}

function unwrapTermsAgg(agg: any): EsTermsAgg | undefined {
  if (!agg) return undefined;
  if (Array.isArray(agg?.buckets)) return agg as EsTermsAgg;
  if (Array.isArray(agg?.byId?.buckets)) return agg.byId as EsTermsAgg;
  return undefined;
}

const YOUTUBE_ICON_URL =
  "https://repertorio.net/wp-content/plugins/repertorio/images/youtube.png";
const GUITAR_ICON_URL =
  "https://repertorio.net/wp-content/plugins/repertorio/images/guitar.png";
const SOL_ICON_URL =
  "https://repertorio.net/wp-content/plugins/repertorio/images/sol.png";

// -------------------- MAIN --------------------

export default function SongsSearchClient({ searchParams }: Props) {
  const [filters, setFilters] = useState<FiltersState>(() => {
    const sp = searchParams || {};
    const take = Number(normalizeParam(sp.take) || "50");
    const skip = Number(normalizeParam(sp.skip) || "0");

    const qRaw = normalizeParam(sp.q) || normalizeParam(sp.search_term) || "";
    const q = qRaw.toString().trim();

    return {
      take,
      skip,
      q,
      chords: normalizeParam(sp.chords),
      partiture: normalizeParam(sp.partiture),
      category_id: normalizeParam(sp.category_id),
      rythm_id: normalizeParam(sp.rythm_id),
      tagIds: normalizeParam(sp.tagIds),

      composerIds: normalizeParam(sp.composerIds),
      lyricistIds: normalizeParam(sp.lyricistIds),

      singerFrontIds: normalizeParam(sp.singerFrontIds),
      singerBackIds: normalizeParam(sp.singerBackIds),

      yearFrom: (() => {
        const yf = normalizeParam((sp as any).yearFrom);
        if (yf) return yf;

        const legacy = normalizeParam((sp as any).years);
        const nums = legacy
          ? legacy
              .split(",")
              .map((x) => Number(String(x).trim()))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];
        return nums.length ? String(Math.min(...nums)) : "";
      })(),

      yearTo: (() => {
        const yt = normalizeParam((sp as any).yearTo);
        if (yt) return yt;

        const legacy = normalizeParam((sp as any).years);
        const nums = legacy
          ? legacy
              .split(",")
              .map((x) => Number(String(x).trim()))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];
        return nums.length ? String(Math.max(...nums)) : "";
      })(),

      lyrics: normalizeParam(sp.lyrics),
      status: normalizeParam(sp.status),
      popular: normalizeParam(sp.popular),
      createdByUserId: normalizeParam(sp.createdByUserId),
    };
  });

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [rythms, setRythms] = useState<RythmDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);

  const [songs, setSongs] = useState<SongSearchItem[]>([]);
  const [total, setTotal] = useState<number>(0);

  const [categoryOptions, setCategoryOptions] = useState<Option[]>([]);
  const [rythmOptions, setRythmOptions] = useState<Option[]>([]);
  const [tagOptions, setTagOptions] = useState<Option[]>([]);

  const [composerOptions, setComposerOptions] = useState<Option[]>([]);
  const [lyricistOptions, setLyricistOptions] = useState<Option[]>([]);

  const [singerFrontOptions, setSingerFrontOptions] = useState<Option[]>([]);
  const [singerBackOptions, setSingerBackOptions] = useState<Option[]>([]);
  const [yearOptions, setYearOptions] = useState<Option[]>([]);
  const [yearMin, setYearMin] = useState<number | null>(null);
  const [yearMax, setYearMax] = useState<number | null>(null);

  const [chordsCounts, setChordsCounts] = useState<Record<string, number>>({
    "1": 0,
    "0": 0,
    null: 0,
  } as any);

  const [partitureCounts, setPartitureCounts] = useState<Record<string, number>>({
    "1": 0,
    "0": 0,
    null: 0,
  } as any);

  const [lyricsCounts, setLyricsCounts] = useState<Record<string, number>>({
    "1": 0,
    "0": 0,
  } as any);

  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [organikoTagId, setOrganikoTagId] = useState<string | null>(null);

  // static filters
  useEffect(() => {
    let cancelled = false;

    async function loadStaticFilters() {
      try {
        const [catsRes, rythmsRes, tagsRes] = await Promise.all([
          // Use Next.js API proxy routes rather than hitting the backend directly.  This
          // avoids needing the public API base URL in client components.
          fetch("/api/categories", { headers: { Accept: "application/json" } }),
          fetch("/api/rythms", { headers: { Accept: "application/json" } }),
          fetch("/api/songs/tags?take=1000", { headers: { Accept: "application/json" } }),
        ]);

        const catsJson = catsRes.ok
          ? await parseJsonSafe<CategoryDto[]>(catsRes).catch(() => [])
          : [];
        const rythmsJson = rythmsRes.ok
          ? await parseJsonSafe<RythmDto[]>(rythmsRes).catch(() => [])
          : [];
        const tagsJson = tagsRes.ok ? await parseJsonSafe<any>(tagsRes).catch(() => []) : [];

        if (cancelled) return;

        setCategories(Array.isArray(catsJson) ? catsJson : []);
        setRythms(Array.isArray(rythmsJson) ? rythmsJson : []);

        const normalizedTags: TagDto[] = Array.isArray(tagsJson)
          ? tagsJson
          : Array.isArray(tagsJson?.items)
            ? tagsJson.items
            : [];

        setTags(normalizedTags);
        setOrganikoTagId(findOrganikoTagId(normalizedTags));
      } catch {
        if (cancelled) return;
        setCategories([]);
        setRythms([]);
        setTags([]);
      }
    }

    loadStaticFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  // ES search + counts
  useEffect(() => {
    let cancelled = false;

    async function loadSongs() {
      setLoading(true);
      setError(null);

      try {
        const params = buildEsQueryFromFilters(filters, organikoTagId);

        const esUrl = `${API_BASE_URL}/songs-es/search?${params.toString()}`;

        const resEs = await fetch(esUrl, { headers: { Accept: "application/json" } });

        if (!resEs.ok) {
          const bodyText = await resEs.text().catch(() => "");
          throw new Error(
            `ES /songs-es/search HTTP ${resEs.status} ${resEs.statusText} – url: ${esUrl} – body: ${bodyText.slice(
              0,
              500,
            )}`,
          );
        }

        const data = await parseJsonSafe<SongsSearchResponse>(resEs);

        let items = data.items ?? [];

        // enrichment views
        items = await Promise.all(
          items.map(async (song) => {
            const songId = getCanonicalSongId(song);
            if (!songId) return song;

            try {
              const detailUrl = `${API_BASE_URL}/songs/${songId}?noIncrement=1`;
              const resDetail = await fetch(detailUrl, { headers: { Accept: "application/json" } });
              if (!resDetail.ok) return song;

              const detail = await parseJsonSafe<any>(resDetail);
              const views = detail && typeof detail.views === "number" ? detail.views : song.views ?? null;

              return { ...song, views };
            } catch {
              return song;
            }
          }),
        );

        if (filters.popular === "1") {
          items.sort((a, b) => {
            const va = typeof a.views === "number" && !Number.isNaN(a.views) ? a.views : -1;
            const vb = typeof b.views === "number" && !Number.isNaN(b.views) ? b.views : -1;
            return vb - va;
          });
        }

        if (cancelled) return;

        setSongs(items);
        const totalAll = typeof data.total === "number" ? data.total : items.length;
        setTotal(totalAll);

        const counts = computeCountsFromSongs(items);
        const aggs = data.aggs || {};

        const toNum = (v: any): number => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };

        const pickBucketCount = (agg: EsTermsAgg | undefined, key: string): number => {
          const buckets = Array.isArray(agg?.buckets) ? agg!.buckets! : [];
          const b = buckets.find((x) => String(x.key) === key);
          return b ? toNum((b as any).doc_count) : 0;
        };

        const boolAggToTriCounts = (
          agg: EsTermsAgg | undefined,
          totalX: number,
        ): Record<string, number> => {
          const yes = pickBucketCount(agg, "1") + pickBucketCount(agg, "true");
          const no = pickBucketCount(agg, "0") + pickBucketCount(agg, "false");
          const missing = Math.max(0, totalX - yes - no);
          return { "1": yes, "0": no, null: missing } as any;
        };

        counts.tagCountById = buildCountByIdFromAgg(aggs.tagIds);
        counts.categoryCountById = buildCountByIdFromAgg(aggs.categoryId);
        counts.rythmCountById = buildCountByIdFromAgg(aggs.rythmId);

        setChordsCounts(boolAggToTriCounts(aggs.hasChords, totalAll));
        setPartitureCounts(boolAggToTriCounts(aggs.hasScore, totalAll));

        {
          const withLyrics =
            pickBucketCount(aggs.hasLyrics, "1") + pickBucketCount(aggs.hasLyrics, "true");

          // base: όλα όσα ΔΕΝ έχουν στίχους
          let withoutLyrics = Math.max(0, totalAll - withLyrics);

          // ✅ Μικρή βελτίωση: τα "Οργανικό" να ΜΗΝ μετράνε ως "Χωρίς στίχους"
          // Αυτό γίνεται με aggs.organikoHasLyrics που επιστρέφει το API όταν του δώσουμε organikoTagId.
          if (organikoTagId && aggs.organikoHasLyrics) {
            const organikoTotal =
              typeof (aggs.organikoHasLyrics as any)?.doc_count === "number"
                ? (aggs.organikoHasLyrics as any).doc_count
                : 0;

            const organikoWithLyrics =
              pickBucketCount((aggs.organikoHasLyrics as any)?.hasLyrics, "1") +
              pickBucketCount((aggs.organikoHasLyrics as any)?.hasLyrics, "true");

            const organikoWithoutLyrics = Math.max(0, organikoTotal - organikoWithLyrics);

            withoutLyrics = Math.max(0, withoutLyrics - organikoWithoutLyrics);
          }

          // ✅ Τα keys που περιμένει το FiltersModal
          setLyricsCounts({ "1": withLyrics, "0": withoutLyrics } as any);
        }

        if (aggs.status && Array.isArray(aggs.status.buckets)) {
          const st: Record<string, number> = {};
          for (const b of aggs.status.buckets || []) {
            const k = String((b as any).key ?? "").trim();
            if (!k) continue;
            st[k] = toNum((b as any).doc_count);
          }
          setStatusCounts(st);
        } else {
          setStatusCounts(counts.statusCounts);
        }

        // Categories
        let catOpts: Option[] = [];
        if (categories.length > 0) {
          catOpts = categories.map((c) => {
            const idKey = String(c.id);
            const fromId = counts.categoryCountById[idKey];
            const fromTitle = counts.categoryCountByTitle[c.title];
            const count = fromId !== undefined ? fromId : fromTitle !== undefined ? fromTitle : 0;
            return { value: idKey, label: c.title, count };
          });
        } else {
          catOpts = Object.keys(counts.categoryCountByTitle).map((title) => {
            const count = counts.categoryCountByTitle[title];
            const id = counts.categoryIdByTitle[title];
            const value = id != null ? String(id) : title;
            return { value, label: title, count };
          });
        }
        const finalCategoryOptions =
          catOpts.length > 10 ? catOpts.filter((o) => (o.count ?? 0) > 0) : catOpts;
        setCategoryOptions(finalCategoryOptions);

        // Rythms
        let rOpts: Option[] = [];
        if (rythms.length > 0) {
          rOpts = rythms.map((r) => {
            const idKey = String(r.id);
            const fromId = counts.rythmCountById[idKey];
            const fromTitle = counts.rythmCountByTitle[r.title];
            const count = fromId !== undefined ? fromId : fromTitle !== undefined ? fromTitle : 0;
            return { value: idKey, label: r.title, count };
          });
        } else {
          rOpts = Object.keys(counts.rythmCountByTitle).map((title) => {
            const count = counts.rythmCountByTitle[title];
            const id = counts.rythmIdByTitle[title];
            const value = id != null ? String(id) : title;
            return { value, label: title, count };
          });
        }
        const finalRythmOptions =
          rOpts.length > 10 ? rOpts.filter((o) => (o.count ?? 0) > 0) : rOpts;
        setRythmOptions(finalRythmOptions);

        // Tags
        const tagOpts: Option[] =
          tags.length > 0
            ? tags.map((t) => {
                const idKey = String(t.id);
                const count = counts.tagCountById[idKey] ?? 0;
                return { value: idKey, label: String(t.title ?? "").trim() || idKey, count };
              })
            : [];
        setTagOptions(tagOpts);

        setComposerOptions(buildOptionsFromIdAggWithTopName(aggs.composerId, "composerName"));
        setLyricistOptions(buildOptionsFromIdAggWithTopName(aggs.lyricistId, "lyricistName"));

        setSingerFrontOptions(
          buildOptionsFromIdAggWithTopName(unwrapTermsAgg(aggs.singerFrontId), "frontName"),
        );
        setSingerBackOptions(
          buildOptionsFromIdAggWithTopName(unwrapTermsAgg(aggs.singerBackId), "backName"),
        );

        const yOpts = buildOptionsFromTermsAgg(aggs.years);
        setYearOptions(yOpts);
        {
          const nums = yOpts
            .map((o) => Number(o.value))
            .filter((n) => Number.isFinite(n) && n > 0);
          setYearMin(nums.length ? Math.min(...nums) : null);
          setYearMax(nums.length ? Math.max(...nums) : null);
        }

        const urlQs = buildUrlQueryFromFilters(filters);
        const url = urlQs ? `/songs?${urlQs}` : "/songs";
        if (typeof window !== "undefined") window.history.replaceState(null, "", url);
      } catch (err) {
        if (cancelled) return;

        setError(
          "Προέκυψε σφάλμα κατά την φόρτωση τραγουδιών από Elasticsearch. Δες το console log για λεπτομέρειες.",
        );

        setSongs([]);
        setTotal(0);

        setComposerOptions([]);
        setLyricistOptions([]);
        setSingerFrontOptions([]);
        setSingerBackOptions([]);
        setYearOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSongs();
    return () => {
      cancelled = true;
    };
  }, [filters, categories, rythms, tags, organikoTagId]);

  const patchFilters = (patch: Partial<FiltersState>) => {
    setFilters((prev) => ({
      ...prev,
      ...patch,
      skip: patch.skip !== undefined ? patch.skip : 0,
    }));
  };

  const handleQuickFilter = (patch: Partial<FiltersState>) => patchFilters(patch);

  const hasPrev = filters.skip > 0;
  const hasNext = filters.skip + filters.take < total;

  const goToPage = (newSkip: number) => patchFilters({ skip: newSkip });

  const maxScore = useMemo(() => {
    if (songs.length === 0) return 0;
    return songs.reduce((max, s) => {
      const val = typeof s.score === "number" && !Number.isNaN(s.score) ? s.score : 0;
      return val > max ? val : max;
    }, 0);
  }, [songs]);

  const selectedTagIdSet = useMemo(() => parseCsvToIdSet(filters.tagIds), [filters.tagIds]);

  // ✅ Selected Filters Bar (chips)
  const renderSelectedFiltersBar = () => {
    const parseCsv = (csv: string): string[] =>
      (csv || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

    const toCsv = (arr: string[]): string =>
      arr
        .map((v) => v.trim())
        .filter(Boolean)
        .join(",");

    const removeFromCsv = (csv: string, value: string): string => {
      const arr = parseCsv(csv).filter((v) => v !== value);
      return toCsv(arr);
    };

    const optionLabelByValue = (opts: Option[], value: string): string => {
      const o = (Array.isArray(opts) ? opts : []).find((x) => String(x.value) === String(value));
      return String(o?.label ?? value ?? "").trim() || String(value ?? "").trim();
    };

    type Chip = { key: string; text: string; onRemove: () => void };
    const chips: Chip[] = [];

    if ((filters.q || "").trim()) {
      chips.push({
        key: "q",
        text: `Αναζήτηση: ${filters.q.trim()}`,
        onRemove: () => patchFilters({ q: "" }),
      });
    }

    if (filters.popular === "1") {
      chips.push({
        key: "popular",
        text: "Ταξινόμηση: Δημοφιλή",
        onRemove: () => patchFilters({ popular: "" }),
      });
    }

    for (const v of parseCsv(filters.chords)) {
      if (v === "1") {
        chips.push({
          key: "chords-1",
          text: "Συγχορδίες: Έχει",
          onRemove: () => patchFilters({ chords: removeFromCsv(filters.chords, "1") }),
        });
      } else if (v === "0") {
        chips.push({
          key: "chords-0",
          text: "Συγχορδίες: Δεν έχει",
          onRemove: () => patchFilters({ chords: removeFromCsv(filters.chords, "0") }),
        });
      } else if (v) {
        chips.push({
          key: `chords-${v}`,
          text: `Συγχορδίες: ${v}`,
          onRemove: () => patchFilters({ chords: removeFromCsv(filters.chords, v) }),
        });
      }
    }

    for (const v of parseCsv(filters.partiture)) {
      if (v === "1") {
        chips.push({
          key: "partiture-1",
          text: "Παρτιτούρα: Έχει",
          onRemove: () => patchFilters({ partiture: removeFromCsv(filters.partiture, "1") }),
        });
      } else if (v === "0") {
        chips.push({
          key: "partiture-0",
          text: "Παρτιτούρα: Δεν έχει",
          onRemove: () => patchFilters({ partiture: removeFromCsv(filters.partiture, "0") }),
        });
      } else if (v) {
        chips.push({
          key: `partiture-${v}`,
          text: `Παρτιτούρα: ${v}`,
          onRemove: () => patchFilters({ partiture: removeFromCsv(filters.partiture, v) }),
        });
      }
    }

    for (const v of parseCsv(filters.lyrics)) {
      if (v === "null" || v === "0") {
        chips.push({
          key: `lyrics-${v}`,
          text: "Στίχοι: Χωρίς",
          onRemove: () => patchFilters({ lyrics: removeFromCsv(filters.lyrics, v) }),
        });
      } else if (v === "1") {
        chips.push({
          key: `lyrics-${v}`,
          text: "Στίχοι: Έχει",
          onRemove: () => patchFilters({ lyrics: removeFromCsv(filters.lyrics, v) }),
        });
      } else if (v) {
        chips.push({
          key: `lyrics-${v}`,
          text: `Στίχοι: ${v}`,
          onRemove: () => patchFilters({ lyrics: removeFromCsv(filters.lyrics, v) }),
        });
      }
    }

    for (const v of parseCsv(filters.status)) {
      const label = v === "PUBLISHED" ? "Δημοσιευμένο" : v === "DRAFT" ? "Πρόχειρο" : v;
      chips.push({
        key: `status-${v}`,
        text: `Κατάσταση: ${label}`,
        onRemove: () => patchFilters({ status: removeFromCsv(filters.status, v) }),
      });
    }

    for (const id of parseCsv(filters.category_id)) {
      const label = optionLabelByValue(categoryOptions, id);
      chips.push({
        key: `category-${id}`,
        text: `Κατηγορία: ${label}`,
        onRemove: () => patchFilters({ category_id: removeFromCsv(filters.category_id, id) }),
      });
    }

    for (const id of parseCsv(filters.rythm_id)) {
      const label = optionLabelByValue(rythmOptions, id);
      chips.push({
        key: `rythm-${id}`,
        text: `Ρυθμός: ${label}`,
        onRemove: () => patchFilters({ rythm_id: removeFromCsv(filters.rythm_id, id) }),
      });
    }

    for (const id of parseCsv(filters.tagIds)) {
      const label = optionLabelByValue(tagOptions, id);
      chips.push({
        key: `tag-${id}`,
        text: `Tag: ${label}`,
        onRemove: () => patchFilters({ tagIds: removeFromCsv(filters.tagIds, id) }),
      });
    }

    for (const id of parseCsv(filters.composerIds)) {
      const label = optionLabelByValue(composerOptions, id);
      chips.push({
        key: `composer-${id}`,
        text: `Συνθέτης: ${label}`,
        onRemove: () => patchFilters({ composerIds: removeFromCsv(filters.composerIds, id) }),
      });
    }

    for (const id of parseCsv(filters.lyricistIds)) {
      const label = optionLabelByValue(lyricistOptions, id);
      chips.push({
        key: `lyricist-${id}`,
        text: `Στιχουργός: ${label}`,
        onRemove: () => patchFilters({ lyricistIds: removeFromCsv(filters.lyricistIds, id) }),
      });
    }

    for (const id of parseCsv(filters.singerFrontIds)) {
      const label = optionLabelByValue(singerFrontOptions, id);
      chips.push({
        key: `singerFront-${id}`,
        text: `Ερμηνευτής (Front): ${label}`,
        onRemove: () => patchFilters({ singerFrontIds: removeFromCsv(filters.singerFrontIds, id) }),
      });
    }

    for (const id of parseCsv(filters.singerBackIds)) {
      const label = optionLabelByValue(singerBackOptions, id);
      chips.push({
        key: `singerBack-${id}`,
        text: `Ερμηνευτής (Back): ${label}`,
        onRemove: () => patchFilters({ singerBackIds: removeFromCsv(filters.singerBackIds, id) }),
      });
    }

    const yf = String(filters.yearFrom || "").trim();
    const yt = String(filters.yearTo || "").trim();
    if (yf || yt) {
      const txt = yf && yt ? `Έτος: ${yf}–${yt}` : yf ? `Έτος: από ${yf}` : `Έτος: έως ${yt}`;
      chips.push({
        key: "yearRange",
        text: txt,
        onRemove: () => patchFilters({ yearFrom: "", yearTo: "" }),
      });
    }

    if ((filters.createdByUserId || "").trim()) {
      chips.push({
        key: "createdByUserId",
        text: `Δημιουργός (User ID): ${String(filters.createdByUserId).trim()}`,
        onRemove: () => patchFilters({ createdByUserId: "" }),
      });
    }

    if (chips.length === 0) return null;

    const chipStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid #333",
      background: "#0f0f0f",
      color: "#fff",
      fontSize: 12,
      whiteSpace: "nowrap",
      maxWidth: 740,
    };

    const xStyle: React.CSSProperties = {
      border: "none",
      background: "#1a1a1a",
      color: "#fff",
      cursor: "pointer",
      borderRadius: 999,
      padding: "2px 8px",
      lineHeight: "16px",
      fontSize: 12,
      flex: "0 0 auto",
    };

    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {chips.map((c) => (
            <span key={c.key} style={chipStyle} title={c.text}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.text}
              </span>
              <button
                type="button"
                onClick={c.onRemove}
                style={xStyle}
                aria-label={`Αφαίρεση: ${c.text}`}
              >
                ×
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={() =>
              patchFilters({
                q: "",
                chords: "",
                partiture: "",
                category_id: "",
                rythm_id: "",
                tagIds: "",
                composerIds: "",
                lyricistIds: "",
                singerFrontIds: "",
                singerBackIds: "",
                yearFrom: "",
                yearTo: "",
                lyrics: "",
                status: "",
                popular: "",
                createdByUserId: "",
              })
            }
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#151515",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            Καθαρισμός όλων
          </button>
        </div>
      </div>
    );
  };

  // ✅ ΝΕΟ: UI “Ταξινόμηση” δίπλα στο “Φίλτρα”, πάνω από τη λίστα
  const sortSelectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #444",
    background: "#151515",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    boxSizing: "border-box",
    height: 38,
  };

  return (
    <section style={{ padding: "16px 24px" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: 12 }}>Αναζήτηση τραγουδιών</h1>

      <header style={{ marginBottom: 12 }}>
        <p style={{ marginTop: 4 }}>
          Βρέθηκαν <strong>{total}</strong> τραγούδια.
        </p>

        {renderSelectedFiltersBar()}
      </header>

      {/* Quick chips + (δεξιά) Ταξινόμηση + Φίλτρα */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => handleQuickFilter({ chords: filters.chords === "1" ? "" : "1" })}
          style={{
            padding: "4px 10px",
            borderRadius: 16,
            border: filters.chords === "1" ? "2px solid #fff" : "1px solid #666",
            backgroundColor: "#111",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          🎸 Με συγχορδίες
        </button>

        <button
          type="button"
          onClick={() => handleQuickFilter({ partiture: filters.partiture === "1" ? "" : "1" })}
          style={{
            padding: "4px 10px",
            borderRadius: 16,
            border: filters.partiture === "1" ? "2px solid #fff" : "1px solid #666",
            backgroundColor: "#111",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          🎼 Με παρτιτούρα
        </button>

        <button
          type="button"
          onClick={() => handleQuickFilter({ lyrics: filters.lyrics === "null" ? "" : "null" })}
          style={{
            padding: "4px 10px",
            borderRadius: 16,
            border: filters.lyrics === "null" ? "2px solid #fff" : "1px solid #666",
            backgroundColor: "#111",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          📜 Χωρίς στίχους
        </button>

        {/* ✅ Right actions: Ταξινόμηση + Φίλτρα (πάνω από λίστα) */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            aria-label="Ταξινόμηση"
            value={filters.popular === "1" ? "popular" : "relevance"}
            onChange={(e) => {
              const v = e.target.value;
              patchFilters({ popular: v === "popular" ? "1" : "" });
            }}
            style={sortSelectStyle}
          >
            <option value="relevance">Ταξινόμηση: Σχετικότητα</option>
            <option value="popular">Ταξινόμηση: Δημοφιλή (views)</option>
          </select>

          <FiltersModal
            q={filters.q}
            take={filters.take}
            skip={filters.skip}
            chords={filters.chords}
            partiture={filters.partiture}
            category_id={filters.category_id}
            rythm_id={filters.rythm_id}
            tagIds={filters.tagIds}
            composerIds={filters.composerIds}
            lyricistIds={filters.lyricistIds}
            singerFrontIds={filters.singerFrontIds}
            singerBackIds={filters.singerBackIds}
            yearFrom={filters.yearFrom}
            yearTo={filters.yearTo}
            lyrics={filters.lyrics}
            status={filters.status}
            popular={filters.popular}
            createdByUserId={filters.createdByUserId}
            categoryOptions={categoryOptions}
            rythmOptions={rythmOptions}
            tagOptions={tagOptions}
            composerOptions={composerOptions}
            lyricistOptions={lyricistOptions}
            singerFrontOptions={singerFrontOptions}
            singerBackOptions={singerBackOptions}
            yearMin={yearMin}
            yearMax={yearMax}
            chordsCounts={chordsCounts}
            partitureCounts={partitureCounts}
            lyricsCounts={lyricsCounts}
            statusCounts={statusCounts}
            onChangeFilters={(patch) => patchFilters(patch as Partial<FiltersState>)}
          />
        </div>
      </div>

      {loading && <p>Φόρτωση…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && songs.length === 0 ? (
        <p>Δεν βρέθηκαν τραγούδια.</p>
      ) : (
        <div id="songs-list">
          <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
            {songs.map((song) => {
              const songId = getCanonicalSongId(song) ?? 0;
              const youtubeUrl = buildYoutubeUrl(song);
              const lyricsPreview = buildLyricsPreview(song);

              const hasViews =
                song.views !== null && song.views !== undefined && !Number.isNaN(song.views);

              const rawScore =
                typeof song.score === "number" && !Number.isNaN(song.score) ? song.score : null;

              const displayScore =
                rawScore !== null && maxScore > 0 ? (rawScore / maxScore) * 100 : rawScore;

              const hasScore = displayScore !== null && typeof displayScore === "number";

              return (
                <li
                  key={songId || `${song.title}-${song.firstLyrics}`}
                  className="song-item"
                  style={{ padding: "3px 0" }}
                >
                  <div
                    className="icons-and-title"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      marginBottom: 2,
                    }}
                  >
                    <a
                      href={youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        marginRight: 5,
                        verticalAlign: "middle",
                      }}
                      title="YouTube"
                    >
                      <img
                        src={YOUTUBE_ICON_URL}
                        alt="YouTube"
                        style={{ width: 25, verticalAlign: "middle", display: "block" }}
                      />
                    </a>

                    <Link
                      className="song-title"
                      href={songId ? `/songs/${songId}` : "/songs"}
                      style={{
                        color: "#fff",
                        fontWeight: 700,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        maxWidth: "650px",
                      }}
                    >
                      {song.chords ? (
                        <img
                          src={GUITAR_ICON_URL}
                          alt="Chords"
                          style={{
                            width: 25,
                            marginRight: 5,
                            verticalAlign: "middle",
                            display: "inline-block",
                          }}
                        />
                      ) : null}
                      {song.partiture ? (
                        <img
                          src={SOL_ICON_URL}
                          alt="Partiture"
                          style={{
                            width: 25,
                            marginRight: 5,
                            verticalAlign: "middle",
                            display: "inline-block",
                          }}
                        />
                      ) : null}
                      {song.title || "(χωρίς τίτλο)"}
                    </Link>
                  </div>

                  {hasViews && (
                    <span
                      className="song-views"
                      style={{
                        display: "inline-block",
                        marginLeft: 8,
                        fontSize: "0.8rem",
                        color: "#ccc",
                        whiteSpace: "nowrap",
                        verticalAlign: "baseline",
                      }}
                      title={`${song.views} προβολές`}
                    >
                      👁 {song.views}
                    </span>
                  )}

                  {hasScore && displayScore !== null && (
                    <span
                      className="song-score"
                      style={{
                        display: "inline-block",
                        marginLeft: 8,
                        fontSize: "0.8rem",
                        color: "#ffd700",
                        whiteSpace: "nowrap",
                        verticalAlign: "baseline",
                      }}
                      title={`Βαθμολογία: ${displayScore.toFixed(1)} / 100`}
                    >
                      ⭐ {displayScore.toFixed(1)}
                    </span>
                  )}

                  <span
                    className="song-lyrics"
                    style={{
                      display: "inline-block",
                      marginLeft: 5,
                      fontStyle: "italic",
                      color: "darkgray",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      maxWidth: "700px",
                      verticalAlign: "baseline",
                    }}
                    title={lyricsPreview}
                  >
                    {" "}
                    {lyricsPreview}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.9rem",
        }}
      >
        <div>
          Εμφάνιση από <strong>{filters.skip + 1}</strong> έως{" "}
          <strong>{Math.min(filters.skip + filters.take, total)}</strong> από{" "}
          <strong>{total}</strong> τραγούδια.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {hasPrev && (
            <button
              type="button"
              onClick={() => goToPage(Math.max(filters.skip - filters.take, 0))}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #555",
                backgroundColor: "#000",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ◀ Προηγούμενα
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => goToPage(filters.skip + filters.take)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #555",
                backgroundColor: "#000",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Επόμενα ▶
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
