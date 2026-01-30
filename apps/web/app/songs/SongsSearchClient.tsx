"use client";
import "@/app/styles/songs.css";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FiltersModal, { FiltersPanel } from "./FiltersModal";

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
  createdById?: number | null;
  createdByName?: string | null;
  versionSingerPairs?: {
    frontId?: number | null;
    backId?: number | null;
    frontName?: string | null;
    backName?: string | null;
  }[] | null;
};

type EsTermsAggBucket = {
  key: string | number;
  doc_count: number;
  [k: string]: any;
};
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
  createdById?: EsTermsAgg;
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
  title: number | string;
  _count?: { songs?: number };
  songCount?: number;
  songsCount?: number;
  [key: string]: any;
};

type RythmDto = {
  id: number;
  title: number | string;
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

  lyrics?: string | string[];
  status?: string | string[];
  popular?: string | string[];
  createdByUserId?: string | string[];

  // ✅ picker mode support
  mode?: string | string[];
  return_to?: string | string[];
  listId?: string | string[];
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

function getSingleParam(p: string | string[] | undefined): string {
  if (!p) return "";
  return Array.isArray(p) ? String(p[0] ?? "") : String(p ?? "");
}

function filtersFromSearchParams(
  sp: SongsPageSearchParams | undefined,
  fallback: FiltersState,
): FiltersState {
  const take = Number(normalizeParam(sp?.take) || String(fallback.take || 50));
  const skip = Number(normalizeParam(sp?.skip) || "0");

  const qRaw = normalizeParam(sp?.q) || normalizeParam(sp?.search_term) || "";
  const q = qRaw.toString().trim();

  return {
    take: Number.isFinite(take) && take > 0 ? take : 50,
    skip: Number.isFinite(skip) && skip >= 0 ? skip : 0,

    q,

    chords: normalizeParam(sp?.chords),
    partiture: normalizeParam(sp?.partiture),
    category_id: normalizeParam(sp?.category_id),
    rythm_id: normalizeParam(sp?.rythm_id),

    tagIds: normalizeParam(sp?.tagIds),

    composerIds: normalizeParam(sp?.composerIds),
    lyricistIds: normalizeParam(sp?.lyricistIds),

    singerFrontIds: normalizeParam(sp?.singerFrontIds),
    singerBackIds: normalizeParam(sp?.singerBackIds),

    yearFrom: normalizeParam((sp as any)?.yearFrom),
    yearTo: normalizeParam((sp as any)?.yearTo),

    lyrics: normalizeParam(sp?.lyrics),
    status: normalizeParam(sp?.status),
    popular: normalizeParam(sp?.popular),
    createdByUserId: normalizeParam(sp?.createdByUserId),
  };
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

function buildUrlQueryFromFilters(filters: FiltersState, base?: URLSearchParams): string {
  // ✅ start from existing URL (preserve mode/return_to/listId if present)
  const params =
    base
      ? new URLSearchParams(base.toString())
      : typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();

  const setOrDelete = (key: string, val: string | undefined | null) => {
    const v = String(val ?? "").trim();
    if (v) params.set(key, v);
    else params.delete(key);
  };

  params.set("take", String(filters.take));
  params.set("skip", String(filters.skip));

  setOrDelete("search_term", filters.q);

  setOrDelete("chords", filters.chords);
  setOrDelete("partiture", filters.partiture);
  setOrDelete("category_id", filters.category_id);
  setOrDelete("rythm_id", filters.rythm_id);

  setOrDelete("tagIds", filters.tagIds);

  setOrDelete("composerIds", filters.composerIds);
  setOrDelete("lyricistIds", filters.lyricistIds);

  setOrDelete("singerFrontIds", filters.singerFrontIds);
  setOrDelete("singerBackIds", filters.singerBackIds);

  setOrDelete("yearFrom", filters.yearFrom);
  setOrDelete("yearTo", filters.yearTo);

  setOrDelete("lyrics", filters.lyrics);
  setOrDelete("status", filters.status);

  if (filters.popular === "1") params.set("popular", "1");
  else params.delete("popular");

  setOrDelete("createdByUserId", filters.createdByUserId);

  return params.toString();
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON but got content-type "${ct}". Body (trimmed): ${text.slice(0, 200)}`);
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

function toggleIdInCsv(csv: string, id: string): string {
  const cleanId = String(id || "").trim();
  if (!/^\d+$/.test(cleanId)) return csv || "";

  const parts = (csv || "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v));

  const set = new Set(parts);
  if (set.has(cleanId)) set.delete(cleanId);
  else set.add(cleanId);

  return Array.from(set).join(",");
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
      categoryCountByTitle[finalCategoryTitle] = (categoryCountByTitle[finalCategoryTitle] || 0) + 1;
      if (numericCategoryId !== null) categoryIdByTitle[finalCategoryTitle] = numericCategoryId;
      else if (!(finalCategoryTitle in categoryIdByTitle)) categoryIdByTitle[finalCategoryTitle] = null;
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

      return { value: idKey, label: name || idKey, count: safeCount } as Option;
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

const YOUTUBE_ICON_URL = "https://repertorio.net/wp-content/plugins/repertorio/images/youtube.png";
const GUITAR_ICON_URL = "https://repertorio.net/wp-content/plugins/repertorio/images/guitar.png";
const SOL_ICON_URL = "https://repertorio.net/wp-content/plugins/repertorio/images/sol.png";

// ✅ return_to safety (deterministic server+client)
// allow ONLY relative paths (/lists/54/edit)
function safeReturnTo(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  return null;
}

function appendPickedSongId(returnTo: string, pickedSongId: number): string {
  const base = safeReturnTo(returnTo) || "/songs";
  // note: called only on click, so window exists in practice
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(base, origin);

  url.searchParams.set("pickedSongId", String(pickedSongId));
  return url.pathname + (url.search || "") + (url.hash || "");
}

// -------------------- MAIN --------------------

export default function SongsSearchClient({ searchParams }: Props) {
  const mode = getSingleParam(searchParams?.mode);
  const pickerMode = String(mode || "").trim() === "pick";

  const returnToRaw = getSingleParam(searchParams?.return_to);
  const returnTo = safeReturnTo(returnToRaw || "") || ""; // deterministic (SSR=CSR)
  const listId = getSingleParam(searchParams?.listId);

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

  useEffect(() => {
    setFilters((prev) => {
      const next = filtersFromSearchParams(searchParams, prev);

      const same =
        prev.take === next.take &&
        prev.skip === next.skip &&
        prev.q === next.q &&
        prev.chords === next.chords &&
        prev.partiture === next.partiture &&
        prev.category_id === next.category_id &&
        prev.rythm_id === next.rythm_id &&
        prev.tagIds === next.tagIds &&
        prev.composerIds === next.composerIds &&
        prev.lyricistIds === next.lyricistIds &&
        prev.singerFrontIds === next.singerFrontIds &&
        prev.singerBackIds === next.singerBackIds &&
        prev.yearFrom === next.yearFrom &&
        prev.yearTo === next.yearTo &&
        prev.lyrics === next.lyrics &&
        prev.status === next.status &&
        prev.popular === next.popular &&
        prev.createdByUserId === next.createdByUserId;

      return same ? prev : next;
    });
  }, [searchParams]);

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
  const [createdByOptions, setCreatedByOptions] = useState<Option[]>([]);
  const [createdByCounts, setCreatedByCounts] = useState<Record<string, number>>({});

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
          fetch("/api/categories", { headers: { Accept: "application/json" } }),
          fetch("/api/rythms", { headers: { Accept: "application/json" } }),
          fetch("/api/songs/tags?take=1000", { headers: { Accept: "application/json" } }),
        ]);

        const catsJson = catsRes.ok ? await parseJsonSafe<CategoryDto[]>(catsRes).catch(() => []) : [];
        const rythmsJson = rythmsRes.ok ? await parseJsonSafe<RythmDto[]>(rythmsRes).catch(() => []) : [];
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

        if (filters.popular === "1") {
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
        }

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

        const boolAggToTriCounts = (agg: EsTermsAgg | undefined, totalX: number): Record<string, number> => {
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
          const withLyrics = pickBucketCount(aggs.hasLyrics, "1") + pickBucketCount(aggs.hasLyrics, "true");
          let withoutLyrics = Math.max(0, totalAll - withLyrics);

          if (organikoTagId && aggs.organikoHasLyrics) {
            const organikoTotal =
              typeof (aggs.organikoHasLyrics as any)?.doc_count === "number" ? (aggs.organikoHasLyrics as any).doc_count : 0;

            const organikoWithLyrics =
              pickBucketCount((aggs.organikoHasLyrics as any)?.hasLyrics, "1") +
              pickBucketCount((aggs.organikoHasLyrics as any)?.hasLyrics, "true");

            const organikoWithoutLyrics = Math.max(0, organikoTotal - organikoWithLyrics);
            withoutLyrics = Math.max(0, withoutLyrics - organikoWithoutLyrics);
          }

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
            const fromTitle = counts.categoryCountByTitle[String(c.title)];
            const count = fromId !== undefined ? fromId : fromTitle !== undefined ? fromTitle : 0;
            return { value: idKey, label: String(c.title), count };
          });
        } else {
          catOpts = Object.keys(counts.categoryCountByTitle).map((title) => {
            const count = counts.categoryCountByTitle[title];
            const id = counts.categoryIdByTitle[title];
            const value = id != null ? String(id) : title;
            return { value, label: title, count };
          });
        }
        setCategoryOptions(catOpts);

        // Rythms
        let rOpts: Option[] = [];
        if (rythms.length > 0) {
          rOpts = rythms.map((r) => {
            const idKey = String(r.id);
            const fromId = counts.rythmCountById[idKey];
            const fromTitle = counts.rythmCountByTitle[String(r.title)];
            const count = fromId !== undefined ? fromId : fromTitle !== undefined ? fromTitle : 0;
            return { value: idKey, label: String(r.title), count };
          });
        } else {
          rOpts = Object.keys(counts.rythmCountByTitle).map((title) => {
            const count = counts.rythmCountByTitle[title];
            const id = counts.rythmIdByTitle[title];
            const value = id != null ? String(id) : title;
            return { value, label: title, count };
          });
        }
        setRythmOptions(rOpts);

        // Tags (counts from aggs)
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
        setCreatedByOptions(buildOptionsFromIdAggWithTopName(aggs.createdById, "createdByName"));
        setCreatedByCounts(buildCountByIdFromAgg(aggs.createdById));

        setSingerFrontOptions(buildOptionsFromIdAggWithTopName(unwrapTermsAgg(aggs.singerFrontId), "frontName"));
        setSingerBackOptions(buildOptionsFromIdAggWithTopName(unwrapTermsAgg(aggs.singerBackId), "backName"));

        const yOpts = buildOptionsFromTermsAgg(aggs.years);
        setYearOptions(yOpts);
        {
          const nums = yOpts.map((o) => Number(o.value)).filter((n) => Number.isFinite(n) && n > 0);
          setYearMin(nums.length ? Math.min(...nums) : null);
          setYearMax(nums.length ? Math.max(...nums) : null);
        }

        // ✅ Preserve mode=pick + return_to + listId in URL (because base is current window.search)
        const base = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : undefined;
        const urlQs = buildUrlQueryFromFilters(filters, base);
        const url = urlQs ? `/songs?${urlQs}` : "/songs";
        if (typeof window !== "undefined") window.history.replaceState(null, "", url);
      } catch (err) {
        if (cancelled) return;

        setError("Προέκυψε σφάλμα κατά την φόρτωση τραγουδιών από Elasticsearch. Δες το console log για λεπτομέρειες.");

        setSongs([]);
        setTotal(0);

        setComposerOptions([]);
        setLyricistOptions([]);
        setSingerFrontOptions([]);
        setSingerBackOptions([]);
        setYearOptions([]);
        setCreatedByOptions([]);
        setCreatedByCounts({});
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

  const sharedFiltersProps = {
    q: filters.q,
    take: filters.take,
    skip: filters.skip,
    chords: filters.chords,
    partiture: filters.partiture,
    category_id: filters.category_id,
    rythm_id: filters.rythm_id,
    tagIds: filters.tagIds,
    composerIds: filters.composerIds,
    lyricistIds: filters.lyricistIds,
    singerFrontIds: filters.singerFrontIds,
    singerBackIds: filters.singerBackIds,
    yearFrom: filters.yearFrom,
    yearTo: filters.yearTo,
    lyrics: filters.lyrics,
    status: filters.status,
    popular: filters.popular,
    createdByUserId: filters.createdByUserId,

    categoryOptions,
    rythmOptions,
    tagOptions,
    composerOptions,
    lyricistOptions,
    singerFrontOptions,
    singerBackOptions,

    yearMin,
    yearMax,

    chordsCounts,
    partitureCounts,
    lyricsCounts,
    statusCounts,

    createdByOptions,
    createdByCounts,

    onChangeFilters: (patch: any) => patchFilters(patch as Partial<FiltersState>),
  };

  // ✅ deterministic hint (no window usage)
  const pickerHint =
    pickerMode && returnTo
      ? `Επιλογή τραγουδιού για επιστροφή στη λίστα${listId ? ` (listId=${listId})` : ""}.`
      : pickerMode
        ? "Picker mode ενεργό, αλλά λείπει/δεν επιτρέπεται το return_to."
        : "";

  return (
    <section style={{ padding: "16px 24px" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: 8 }}>
        {pickerMode ? "Επιλογή τραγουδιού" : "Αναζήτηση τραγουδιών"}
      </h1>

      {pickerMode ? (
        <div style={{ marginBottom: 10, color: "#fff", opacity: 0.85, fontSize: 13 }}>
          {pickerHint}
        </div>
      ) : null}

      <header style={{ marginBottom: 12 }}>
        <p style={{ marginTop: 4 }}>
          Βρέθηκαν <strong>{total}</strong> τραγούδια.
        </p>
      </header>

      <div className="songs-layout">
        <aside className="filters-sidebar" aria-label="Φίλτρα">
          <div
            style={{
              background: "#050505",
              border: "1px solid #3a3a3a",
              borderRadius: 14,
              padding: 12,
              boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Φίλτρα</div>
            </div>

            <FiltersPanel variant="sidebar" {...(sharedFiltersProps as any)} />
          </div>
        </aside>

        <div className="songs-main">
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
              onClick={() => handleQuickFilter({ tagIds: toggleIdInCsv(filters.tagIds, "3") })}
              style={{
                padding: "4px 10px",
                borderRadius: 16,
                border: selectedTagIdSet.has("3") ? "2px solid #fff" : "1px solid #666",
                backgroundColor: "#111",
                fontSize: "0.9rem",
                whiteSpace: "nowrap",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              🎻 Οργανικό
            </button>

            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
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

              <div className="filters-modal-trigger">
                <FiltersModal {...(sharedFiltersProps as any)} />
              </div>
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

                  const onPick = () => {
                    if (!songId) return;
                    const dest = returnTo
                      ? appendPickedSongId(returnTo, songId)
                      : `/songs?pickedSongId=${songId}`;
                    window.location.href = dest;
                  };

                  return (
                    <li
                      key={songId || `${song.title}-${song.firstLyrics}`}
                      className="song-item"
                      style={{
                        padding: "3px 0",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                        <div className="icons-and-title">
                          <a
                            href={youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-block",
                              marginRight: 5,
                              verticalAlign: "middle",
                              flex: "0 0 auto",
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
                            title={song.title || "(χωρίς τίτλο)"}
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
                                  flex: "0 0 auto",
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
                                  flex: "0 0 auto",
                                }}
                              />
                            ) : null}

                            <span className="song-title-text">{song.title || "(χωρίς τίτλο)"}</span>
                          </Link>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          {hasViews && (
                            <span className="song-views" title={`${song.views} προβολές`}>
                              👁 {song.views}
                            </span>
                          )}

                          {hasScore && displayScore !== null && (
                            <span className="song-score" title={`Βαθμολογία: ${displayScore.toFixed(1)} / 100`}>
                              ⭐ {displayScore.toFixed(1)}
                            </span>
                          )}

                          <span className="song-lyrics" title={lyricsPreview}>
                            {lyricsPreview}
                          </span>
                        </div>
                      </div>

                      {pickerMode ? (
                        <button
                          type="button"
                          onClick={onPick}
                          disabled={!songId}
                          style={{
                            flex: "0 0 auto",
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #fff",
                            background: "#111",
                            color: "#fff",
                            cursor: songId ? "pointer" : "not-allowed",
                            opacity: songId ? 1 : 0.6,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                          title={songId ? "Επιλογή αυτού του τραγουδιού" : "Μη έγκυρο ID"}
                        >
                          Επιλογή
                        </button>
                      ) : null}
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
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              Εμφάνιση από <strong>{filters.skip + 1}</strong> έως{" "}
              <strong>{Math.min(filters.skip + filters.take, total)}</strong> από{" "}
              <strong>{total}</strong> τραγούδια.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                    whiteSpace: "nowrap",
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
                    whiteSpace: "nowrap",
                  }}
                >
                  Επόμενα ▶
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
