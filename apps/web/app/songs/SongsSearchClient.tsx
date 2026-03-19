"use client";
import "@/app/styles/songs.css";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FiltersModal, { FiltersPanel } from "./FiltersModal";

import type { Option } from "./FilterSelectWithSearch";

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
  listIds?: EsTermsAgg;

  composerId?: EsTermsAgg;
  lyricistId?: EsTermsAgg;

  singerFrontId?: any;
  singerBackId?: any;

  years?: EsTermsAgg;

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

type ListDto = {
  id: number;
  title: string;
  groupId?: number | null;
  marked?: boolean;
  role?: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
  itemsCount?: number;
  name?: string;
  listTitle?: string;
  list_title?: string;
  [key: string]: any;
};

type ListsIndexResponse = {
  items: ListDto[];
  total: number;
  page: number;
  pageSize: number;
  groups?: Array<{
    id: number;
    title: string;
    fullTitle: string | null;
    listsCount: number;
  }>;
};

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
  listIds?: string | string[];

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
  listIds: string;

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

type Props = {
  searchParams?: SongsPageSearchParams;
};

type Chip = {
  key: string;
  label: string;
  onRemove: () => void;
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
  fallback?: Partial<FiltersState>,
): FiltersState {
  const take = Number(normalizeParam(sp?.take) || String(fallback?.take || 50));
  const skip = Number(normalizeParam(sp?.skip) || String(fallback?.skip || 0));
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
    listIds: normalizeParam(sp?.listIds),

    composerIds: normalizeParam(sp?.composerIds),
    lyricistIds: normalizeParam(sp?.lyricistIds),

    singerFrontIds: normalizeParam(sp?.singerFrontIds),
    singerBackIds: normalizeParam(sp?.singerBackIds),

    yearFrom: normalizeParam(sp?.yearFrom),
    yearTo: normalizeParam(sp?.yearTo),

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
  if (filters.listIds) params.set("listIds", filters.listIds);

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

  void organikoTagId;

  return params;
}

function buildUrlQueryFromFilters(filters: FiltersState, base?: URLSearchParams): string {
  const params = base ? new URLSearchParams(base.toString()) : new URLSearchParams();

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
  setOrDelete("listIds", filters.listIds);

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

function parseCsv(csv: string): string[] {
  return (csv || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqCsv(csv: string): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of parseCsv(csv)) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out.join(",");
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

function removeIdFromCsv(csv: string, id: string): string {
  return uniqCsv(
    parseCsv(csv)
      .filter((x) => x !== id)
      .join(","),
  );
}

function normalizeIdCsv(csv: string): string {
  return uniqCsv(
    parseCsv(csv)
      .filter((v) => /^\d+$/.test(v))
      .join(","),
  );
}

function isExactCsvSet(csv: string, ids: string[]): boolean {
  const current = parseCsv(csv).filter((v) => /^\d+$/.test(v));
  const a = [...new Set(current)].sort();
  const b = [...new Set(ids.map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x)))].sort();

  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function toggleExactCsvPreset(csv: string, ids: string[]): string {
  return isExactCsvSet(csv, ids) ? "" : normalizeIdCsv(ids.join(","));
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
  const buckets = Array.isArray(agg?.buckets) ? agg.buckets : [];
  for (const b of buckets) {
    const key = String(b.key);
    const n = Number(b.doc_count);
    out[key] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

function buildOptionsFromTermsAgg(agg?: EsTermsAgg): Option[] {
  const buckets = Array.isArray(agg?.buckets) ? agg.buckets : [];
  const opts: Option[] = buckets
    .map((b) => {
      const key = String(b.key ?? "").trim();
      if (!key) return null;
      const count = Number(b.doc_count);
      return {
        value: key,
        label: key,
        count: Number.isFinite(count) ? count : 0,
      } as Option;
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
  const buckets = Array.isArray(agg?.buckets) ? agg.buckets : [];

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

const YOUTUBE_ICON_URL = "/icons/youtube.png";
const GUITAR_ICON_URL = "/icons/guitar.png";
const SOL_ICON_URL = "/icons/sol.png";

function safeReturnTo(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  return null;
}

function appendPickedSongId(returnTo: string, pickedSongId: number, pickedSongTitle?: string): string {
  const base = safeReturnTo(returnTo) || "/songs";
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(base, origin);

  url.searchParams.set("pickedSongId", String(pickedSongId));
  if (pickedSongTitle) url.searchParams.set("pickedSongTitle", pickedSongTitle);

  return url.pathname + (url.search || "") + (url.hash || "");
}

function firstLabelByValue(opts: Option[], value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const o = (Array.isArray(opts) ? opts : []).find((x) => String(x.value) === v);
  return String(o?.label ?? v).trim();
}

function triYesNoSummary(csv: string, yesLabel: string, noLabel: string): string {
  const set = new Set(parseCsv(csv));
  const hasYes = set.has("1") || set.has("true");
  const hasNo = set.has("0") || set.has("false");
  if (hasYes && hasNo) return `${yesLabel}, ${noLabel}`;
  if (hasYes) return yesLabel;
  if (hasNo) return noLabel;
  return "";
}

function blurActiveElementSoon() {
  if (typeof window === "undefined") return;
  const el = document.activeElement as HTMLElement | null;
  if (!el || typeof (el as any).blur !== "function") return;
  requestAnimationFrame(() => {
    try {
      el.blur();
    } catch {}
  });
}

export default function SongsSearchClient({ searchParams }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const liveSearchParams = useSearchParams();

  const liveParamsObject = useMemo<SongsPageSearchParams>(() => {
    const p = liveSearchParams;
    return {
      take: p.get("take") ?? undefined,
      skip: p.get("skip") ?? undefined,
      q: p.get("q") ?? undefined,
      search_term: p.get("search_term") ?? undefined,
      chords: p.get("chords") ?? undefined,
      partiture: p.get("partiture") ?? undefined,
      category_id: p.get("category_id") ?? undefined,
      rythm_id: p.get("rythm_id") ?? undefined,
      tagIds: p.get("tagIds") ?? undefined,
      listIds: p.get("listIds") ?? undefined,
      composerIds: p.get("composerIds") ?? undefined,
      lyricistIds: p.get("lyricistIds") ?? undefined,
      singerFrontIds: p.get("singerFrontIds") ?? undefined,
      singerBackIds: p.get("singerBackIds") ?? undefined,
      yearFrom: p.get("yearFrom") ?? undefined,
      yearTo: p.get("yearTo") ?? undefined,
      lyrics: p.get("lyrics") ?? undefined,
      status: p.get("status") ?? undefined,
      popular: p.get("popular") ?? undefined,
      createdByUserId: p.get("createdByUserId") ?? undefined,
      mode: p.get("mode") ?? undefined,
      return_to: p.get("return_to") ?? undefined,
      listId: p.get("listId") ?? undefined,
    };
  }, [liveSearchParams]);

  const effectiveSearchParams = useMemo(
    () =>
      liveSearchParams && Array.from(liveSearchParams.keys()).length > 0
        ? liveParamsObject
        : (searchParams || {}),
    [liveParamsObject, liveSearchParams, searchParams],
  );

  const mode = getSingleParam(effectiveSearchParams?.mode);
  const pickerMode = String(mode || "").trim() === "pick";

  const returnToRaw = getSingleParam(effectiveSearchParams?.return_to);
  const returnTo = safeReturnTo(returnToRaw || "") || "";
  const listId = getSingleParam(effectiveSearchParams?.listId);

  const filters = useMemo(
    () => filtersFromSearchParams(effectiveSearchParams, { take: 50, skip: 0 }),
    [effectiveSearchParams],
  );

  const [selectedSongIdSet, setSelectedSongIdSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (pickerMode && listId && typeof window !== "undefined") {
      try {
        const key = `repertorio:listEdit:${listId}:items`;
        const raw = window.sessionStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed?.items) ? parsed.items : [];
          const ids = new Set<number>();
          for (const it of items) {
            const sid = Number((it as any)?.songId);
            if (Number.isFinite(sid) && sid > 0) ids.add(sid);
          }
          setSelectedSongIdSet(ids);
        } else {
          setSelectedSongIdSet(new Set());
        }
      } catch {
        setSelectedSongIdSet(new Set());
      }
    } else {
      setSelectedSongIdSet(new Set());
    }
  }, [pickerMode, listId]);

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [rythms, setRythms] = useState<RythmDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [lists, setLists] = useState<ListDto[]>([]);

  const [songs, setSongs] = useState<SongSearchItem[]>([]);
  const [total, setTotal] = useState<number>(0);

  const [categoryOptions, setCategoryOptions] = useState<Option[]>([]);
  const [rythmOptions, setRythmOptions] = useState<Option[]>([]);
  const [tagOptions, setTagOptions] = useState<Option[]>([]);
  const [listOptions, setListOptions] = useState<Option[]>([]);

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

  useEffect(() => {
    const onSubmit = () => blurActiveElementSoon();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const t = e.target as any;
      if (!t) return;
      const tag = String(t.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") blurActiveElementSoon();
    };

    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStaticFilters() {
      try {
        const [catsRes, rythmsRes, tagsRes, listsRes] = await Promise.all([
          fetch("/api/categories", { headers: { Accept: "application/json" } }),
          fetch("/api/rythms", { headers: { Accept: "application/json" } }),
          fetch("/api/songs/tags?take=1000", { headers: { Accept: "application/json" } }),
          fetch("/api/lists?page=1&pageSize=1000", { headers: { Accept: "application/json" } }),
        ]);

        const catsJson = catsRes.ok ? await parseJsonSafe<CategoryDto[]>(catsRes).catch(() => []) : [];
        const rythmsJson = rythmsRes.ok ? await parseJsonSafe<RythmDto[]>(rythmsRes).catch(() => []) : [];
        const tagsJson = tagsRes.ok ? await parseJsonSafe<any>(tagsRes).catch(() => []) : [];
        const listsJson = listsRes.ok ? await parseJsonSafe<ListsIndexResponse>(listsRes).catch(() => null) : null;

        if (cancelled) return;

        setCategories(Array.isArray(catsJson) ? catsJson : []);
        setRythms(Array.isArray(rythmsJson) ? rythmsJson : []);

        const normalizedTags: TagDto[] = Array.isArray(tagsJson)
          ? tagsJson
          : Array.isArray(tagsJson?.items)
            ? tagsJson.items
            : [];

        const normalizedLists: ListDto[] = Array.isArray(listsJson?.items) ? listsJson.items : [];

        setTags(normalizedTags);
        setLists(normalizedLists);
        setOrganikoTagId(findOrganikoTagId(normalizedTags));
      } catch {
        if (cancelled) return;
        setCategories([]);
        setRythms([]);
        setTags([]);
        setLists([]);
      }
    }

    loadStaticFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchFilters = (patch: Partial<FiltersState>) => {
    const next: FiltersState = { ...filters, ...patch };

    const keys = Object.keys(patch);
    const isPaginationOnly = keys.length > 0 && keys.every((k) => k === "skip" || k === "take");

    if (patch.skip !== undefined) next.skip = patch.skip;
    else if (!isPaginationOnly) next.skip = 0;
    else next.skip = filters.skip;

    if (!Number.isFinite(next.take) || next.take <= 0) next.take = 50;
    if (!Number.isFinite(next.skip) || next.skip < 0) next.skip = 0;

    const base = new URLSearchParams();
    if (pickerMode) base.set("mode", "pick");
    if (returnTo) base.set("return_to", returnTo);
    if (listId) base.set("listId", listId);

    const qs = buildUrlQueryFromFilters(next, base);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    blurActiveElementSoon();
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

  const isRebetikaPresetActive = useMemo(
    () => isExactCsvSet(filters.category_id, ["7", "6"]),
    [filters.category_id],
  );

  const isParadosiakaPresetActive = useMemo(
    () => isExactCsvSet(filters.category_id, ["5"]),
    [filters.category_id],
  );

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

  const selectedBlue = "#0d6efd";

  const quickFilterButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    borderRadius: 16,
    border: "2px solid #fff",
    backgroundColor: active ? selectedBlue : "#111",
    fontSize: "0.9rem",
    whiteSpace: "nowrap",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontWeight: active ? 700 : 500,
  });

  const sharedFiltersProps = {
    q: filters.q,
    take: filters.take,
    skip: filters.skip,
    chords: filters.chords,
    partiture: filters.partiture,
    category_id: filters.category_id,
    rythm_id: filters.rythm_id,
    tagIds: filters.tagIds,
    listIds: filters.listIds,
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
    listOptions,
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

  const pickerHintText =
    pickerMode && returnTo
      ? `Επιλογή τραγουδιού για επιστροφή στη λίστα${listId ? ` (listId=${listId})` : ""}.`
      : pickerMode
        ? "Picker mode ενεργό, αλλά λείπει/δεν επιτρέπεται το return_to."
        : "";

  const currentSongsQuery = useMemo(() => {
    const base = new URLSearchParams();
    if (pickerMode) base.set("mode", "pick");
    if (returnTo) base.set("return_to", returnTo);
    if (listId) base.set("listId", listId);
    return buildUrlQueryFromFilters(filters, base);
  }, [filters, pickerMode, returnTo, listId]);

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
            `ES /songs-es/search HTTP ${resEs.status} ${resEs.statusText} – url: ${esUrl} – body: ${bodyText.slice(0, 500)}`,
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

        const aggs = data.aggs || {};

        const toNum = (v: any): number => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };

        const pickBucketCount = (agg: EsTermsAgg | undefined, key: string): number => {
          const buckets = Array.isArray(agg?.buckets) ? agg.buckets : [];
          const b = buckets.find((x) => String(x.key) === key);
          return b ? toNum((b as any).doc_count) : 0;
        };

        const boolAggToTriCounts = (agg: EsTermsAgg | undefined, totalX: number): Record<string, number> => {
          const yes = pickBucketCount(agg, "1") + pickBucketCount(agg, "true");
          const no = pickBucketCount(agg, "0") + pickBucketCount(agg, "false");
          const missing = Math.max(0, totalX - yes - no);
          return { "1": yes, "0": no, null: missing } as any;
        };

        const tagCountById = buildCountByIdFromAgg(aggs.tagIds);
        const listCountById = buildCountByIdFromAgg(aggs.listIds);
        const categoryCountById = buildCountByIdFromAgg(aggs.categoryId);
        const rythmCountById = buildCountByIdFromAgg(aggs.rythmId);

        setChordsCounts(boolAggToTriCounts(aggs.hasChords, totalAll));
        setPartitureCounts(boolAggToTriCounts(aggs.hasScore, totalAll));

        {
          const withLyrics = pickBucketCount(aggs.hasLyrics, "1") + pickBucketCount(aggs.hasLyrics, "true");
          let withoutLyrics = Math.max(0, totalAll - withLyrics);

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
          const st: Record<string, number> = {};
          for (const s of items) {
            const k = String(s.status || "").trim();
            if (!k) continue;
            st[k] = (st[k] || 0) + 1;
          }
          setStatusCounts(st);
        }

        if (categories.length > 0) {
          setCategoryOptions(
            categories.map((c) => {
              const idKey = String(c.id);
              return { value: idKey, label: String(c.title), count: categoryCountById[idKey] ?? 0 };
            }),
          );
        } else {
          setCategoryOptions(
            Object.keys(categoryCountById).map((idKey) => ({
              value: idKey,
              label: idKey,
              count: categoryCountById[idKey] ?? 0,
            })),
          );
        }

        if (rythms.length > 0) {
          setRythmOptions(
            rythms.map((r) => {
              const idKey = String(r.id);
              return { value: idKey, label: String(r.title), count: rythmCountById[idKey] ?? 0 };
            }),
          );
        } else {
          setRythmOptions(
            Object.keys(rythmCountById).map((idKey) => ({
              value: idKey,
              label: idKey,
              count: rythmCountById[idKey] ?? 0,
            })),
          );
        }

        setTagOptions(
          tags.length > 0
            ? tags.map((t) => {
                const idKey = String(t.id);
                return {
                  value: idKey,
                  label: String(t.title ?? "").trim() || idKey,
                  count: tagCountById[idKey] ?? 0,
                };
              })
            : [],
        );

        setListOptions(
          lists.length > 0
            ? lists.map((l) => {
                const idKey = String(l.id);
                const label =
                  String(l.title ?? "").trim() ||
                  String(l.listTitle ?? "").trim() ||
                  String(l.name ?? "").trim() ||
                  String(l.list_title ?? "").trim() ||
                  idKey;
                return { value: idKey, label, count: listCountById[idKey] ?? 0 };
              })
            : [],
        );

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
      } catch (err) {
        if (cancelled) return;

        console.error(err);
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
        setListOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSongs();
    return () => {
      cancelled = true;
    };
  }, [filters, categories, rythms, tags, lists, organikoTagId]);

  const chipStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "2px solid #fff",
    background: "#0d6efd",
    color: "#fff",
    fontSize: 12,
    lineHeight: "14px",
    maxWidth: "100%",
    minWidth: 0,
    flex: "0 1 100%",
  };

  const chipXStyle: React.CSSProperties = {
    border: "none",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    padding: 0,
    marginLeft: 2,
    fontWeight: 800,
    opacity: 0.95,
    flex: "0 0 auto",
  };

  const selectedChips: Chip[] = useMemo(() => {
    const chips: Chip[] = [];

    const addCsvChips = (
      keyPrefix: string,
      title: string,
      csv: string,
      opts: Option[],
      onRemoveOne: (id: string) => void,
    ) => {
      for (const id of parseCsv(csv)) {
        chips.push({
          key: `${keyPrefix}:${id}`,
          label: `${title}: ${firstLabelByValue(opts, id)}`,
          onRemove: () => onRemoveOne(id),
        });
      }
    };

    if ((filters.q || "").trim()) {
      chips.push({
        key: "q",
        label: `Αναζήτηση: ${filters.q.trim()}`,
        onRemove: () => patchFilters({ q: "" }),
      });
    }

    if (filters.category_id) {
      addCsvChips("category", "Κατηγορία", filters.category_id, categoryOptions, (id) =>
        patchFilters({ category_id: removeIdFromCsv(filters.category_id, id) }),
      );
    }

    if (filters.rythm_id) {
      addCsvChips("rythm", "Ρυθμός", filters.rythm_id, rythmOptions, (id) =>
        patchFilters({ rythm_id: removeIdFromCsv(filters.rythm_id, id) }),
      );
    }

    if (filters.tagIds) {
      addCsvChips("tag", "Tag", filters.tagIds, tagOptions, (id) =>
        patchFilters({ tagIds: removeIdFromCsv(filters.tagIds, id) }),
      );
    }

    if (filters.listIds) {
      addCsvChips("list", "Λίστα", filters.listIds, listOptions, (id) =>
        patchFilters({ listIds: removeIdFromCsv(filters.listIds, id) }),
      );
    }

    if (filters.composerIds) {
      addCsvChips("composer", "Συνθέτης", filters.composerIds, composerOptions, (id) =>
        patchFilters({ composerIds: removeIdFromCsv(filters.composerIds, id) }),
      );
    }

    if (filters.lyricistIds) {
      addCsvChips("lyricist", "Στιχουργός", filters.lyricistIds, lyricistOptions, (id) =>
        patchFilters({ lyricistIds: removeIdFromCsv(filters.lyricistIds, id) }),
      );
    }

    if (filters.singerFrontIds) {
      addCsvChips("singerFront", "Ερμηνευτής (Front)", filters.singerFrontIds, singerFrontOptions, (id) =>
        patchFilters({ singerFrontIds: removeIdFromCsv(filters.singerFrontIds, id) }),
      );
    }

    if (filters.singerBackIds) {
      addCsvChips("singerBack", "Ερμηνευτής (Back)", filters.singerBackIds, singerBackOptions, (id) =>
        patchFilters({ singerBackIds: removeIdFromCsv(filters.singerBackIds, id) }),
      );
    }

    if ((filters.yearFrom || "").trim() || (filters.yearTo || "").trim()) {
      chips.push({
        key: "year",
        label: `Έτος: ${filters.yearFrom || "…"}–${filters.yearTo || "…"}`,
        onRemove: () => patchFilters({ yearFrom: "", yearTo: "" }),
      });
    }

    const lyricsSum = triYesNoSummary(filters.lyrics, "Έχει στίχους", "Χωρίς στίχους");
    if (lyricsSum) {
      chips.push({
        key: "lyrics",
        label: `Στίχοι: ${lyricsSum}`,
        onRemove: () => patchFilters({ lyrics: "" }),
      });
    }

    const chordsSum = triYesNoSummary(filters.chords, "Με συγχορδίες", "Χωρίς συγχορδίες");
    if (chordsSum) {
      chips.push({
        key: "chords",
        label: `Συγχορδίες: ${chordsSum}`,
        onRemove: () => patchFilters({ chords: "" }),
      });
    }

    const partSum = triYesNoSummary(filters.partiture, "Με παρτιτούρα", "Χωρίς παρτιτούρα");
    if (partSum) {
      chips.push({
        key: "partiture",
        label: `Παρτιτούρα: ${partSum}`,
        onRemove: () => patchFilters({ partiture: "" }),
      });
    }

    if (filters.status) {
      for (const st of parseCsv(filters.status)) {
        const label = st === "PUBLISHED" ? "Δημοσιευμένο" : st === "DRAFT" ? "Πρόχειρο" : st;
        chips.push({
          key: `status:${st}`,
          label: `Κατάσταση: ${label}`,
          onRemove: () => patchFilters({ status: removeIdFromCsv(filters.status, st) }),
        });
      }
    }

    if ((filters.createdByUserId || "").trim()) {
      chips.push({
        key: "createdBy",
        label: `Δημιουργός: ${firstLabelByValue(createdByOptions, filters.createdByUserId)}`,
        onRemove: () => patchFilters({ createdByUserId: "" }),
      });
    }

    if (filters.popular === "1") {
      chips.push({
        key: "popular",
        label: "Ταξινόμηση: Δημοφιλή (views)",
        onRemove: () => patchFilters({ popular: "" }),
      });
    }

    return chips;
  }, [
    filters,
    categoryOptions,
    rythmOptions,
    tagOptions,
    listOptions,
    composerOptions,
    lyricistOptions,
    singerFrontOptions,
    singerBackOptions,
    createdByOptions,
  ]);

  return (
    <section style={{ padding: "16px 24px" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: 8 }}>
        {pickerMode ? "Επιλογή τραγουδιού" : "Αναζήτηση τραγουδιών"}
      </h1>

      {pickerMode ? (
        <div style={{ marginBottom: 10, color: "#fff", opacity: 0.85, fontSize: 13 }}>{pickerHintText}</div>
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
              style={quickFilterButtonStyle(filters.chords === "1")}
            >
              <img
                src={GUITAR_ICON_URL}
                alt=""
                aria-hidden="true"
                style={{ width: 18, height: 18, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
              />
              <span>Με συγχορδίες</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFilter({ partiture: filters.partiture === "1" ? "" : "1" })}
              style={quickFilterButtonStyle(filters.partiture === "1")}
            >
              <img
                src={SOL_ICON_URL}
                alt=""
                aria-hidden="true"
                style={{ width: 18, height: 18, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
              />
              <span>Με παρτιτούρα</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFilter({ tagIds: toggleIdInCsv(filters.tagIds, "3") })}
              style={quickFilterButtonStyle(selectedTagIdSet.has("3"))}
            >
              Οργανικά
            </button>

            <button
              type="button"
              onClick={() =>
                handleQuickFilter({
                  category_id: toggleExactCsvPreset(filters.category_id, ["7", "6"]),
                })
              }
              style={quickFilterButtonStyle(isRebetikaPresetActive)}
            >
              Ρεμπέτικα
            </button>

            <button
              type="button"
              onClick={() =>
                handleQuickFilter({
                  category_id: toggleExactCsvPreset(filters.category_id, ["5"]),
                })
              }
              style={quickFilterButtonStyle(isParadosiakaPresetActive)}
            >
              Παραδοσιακά
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

          {selectedChips.length > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 12,
                border: "1px solid #555",
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "flex-start",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, marginRight: 6, width: "100%" }}>
                Επιλεγμένα φίλτρα:
              </div>

              {selectedChips.map((c) => (
                <span key={c.key} style={chipStyle} title={c.label}>
                  <span
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.label}
                  </span>
                  <button type="button" onClick={c.onRemove} aria-label="Αφαίρεση φίλτρου" style={chipXStyle}>
                    ×
                  </button>
                </span>
              ))}

              <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }} />
            </div>
          )}

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

                  const hasViews = song.views !== null && song.views !== undefined && !Number.isNaN(song.views);
                  const rawScore = typeof song.score === "number" && !Number.isNaN(song.score) ? song.score : null;
                  const displayScore = rawScore !== null && maxScore > 0 ? (rawScore / maxScore) * 100 : rawScore;
                  const hasScore = displayScore !== null && typeof displayScore === "number";

                  const songHref = songId ? `/songs/${songId}?${currentSongsQuery}` : "/songs";

                  const onPick = () => {
                    if (!songId) return;
                    const dest = appendPickedSongId(returnTo, songId, song.title || "");
                    window.location.href = dest;
                  };

                  const isAlreadySelected = selectedSongIdSet.has(songId);
                  const pickButtonDisabled = !songId || isAlreadySelected;

                  return (
                    <li
                      key={songId || `${song.title}-${song.firstLyrics}`}
                      className="song-item"
                      style={{ padding: "3px 0", display: "flex", gap: 10, alignItems: "center" }}
                    >
                      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                        <div className="icons-and-title">
                          <a
                            href={youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-block", marginRight: 5, verticalAlign: "middle", flex: "0 0 auto" }}
                            title="YouTube"
                          >
                            <img src={YOUTUBE_ICON_URL} alt="YouTube" style={{ width: 25, verticalAlign: "middle", display: "block" }} />
                          </a>

                          <Link className="song-title" href={songHref} title={song.title || "(χωρίς τίτλο)"}>
                            {song.chords ? (
                              <img
                                src={GUITAR_ICON_URL}
                                alt="Chords"
                                style={{ width: 25, marginRight: 5, verticalAlign: "middle", display: "inline-block", flex: "0 0 auto" }}
                              />
                            ) : null}
                            {song.partiture ? (
                              <img
                                src={SOL_ICON_URL}
                                alt="Partiture"
                                style={{ width: 25, marginRight: 5, verticalAlign: "middle", display: "inline-block", flex: "0 0 auto" }}
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
                          onClick={pickButtonDisabled ? undefined : onPick}
                          disabled={pickButtonDisabled}
                          style={{
                            flex: "0 0 auto",
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #555",
                            background: "#111",
                            color: "#fff",
                            cursor: pickButtonDisabled ? "not-allowed" : "pointer",
                            opacity: pickButtonDisabled ? 0.6 : 1,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                          title={
                            songId
                              ? isAlreadySelected
                                ? "Το τραγούδι είναι ήδη επιλεγμένο"
                                : "Επιλογή αυτού του τραγουδιού"
                              : "Μη έγκυρο ID"
                          }
                        >
                          {isAlreadySelected ? "Επιλεγμένο" : "Επιλογή"}
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
              <strong>{Math.min(filters.skip + filters.take, total)}</strong> από <strong>{total}</strong> τραγούδια.
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

      <style jsx global>{`
        .filters-modal-trigger button {
          background: #0d6efd !important;
          color: #fff !important;
          border: 2px solid #fff !important;
        }

        .filters-modal-trigger button:hover,
        .filters-modal-trigger button:focus {
          background: #0b5ed7 !important;
          color: #fff !important;
          border: 2px solid #fff !important;
        }
      `}</style>
    </section>
  );
}