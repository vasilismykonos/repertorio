"use client";

import { useEffect, useState } from "react";
import {
  applyOfflineSongChanges,
  clearOfflineSyncData as clearOfflineSyncDataStore,
  readOfflineListsForEmail,
  readOfflineMeta,
  readOfflineSummary,
  readOfflineSongs,
  recordOfflineSyncError,
  writeOfflineCurrentUser,
  writeOfflineListsForUser,
  writeOfflineSongs,
  writeOfflineStaticFilters,
} from "./offlineStore";

export const OFFLINE_STATUS_EVENT = "repertorio:offline-status";
const OFFLINE_SYNC_ENABLED_KEY = "repertorio_offline_sync_enabled";
const CACHE_PREFIXES = ["repertorio-static-", "repertorio-pages-"];

const SONGS_DELTA_SYNC_AGE_MS = 20 * 60 * 1000;
const SONGS_FULL_SYNC_AGE_MS = 24 * 60 * 60 * 1000;
const LISTS_SYNC_AGE_MS = 10 * 60 * 1000;
const BACKGROUND_SYNC_DELAY_MS = 90 * 1000;
const BACKGROUND_IDLE_TIMEOUT_MS = 15 * 1000;
const BACKGROUND_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const BACKGROUND_RETRY_DELAY_MS = 20 * 1000;
const USER_IDLE_GRACE_MS = 20 * 1000;
const LOW_PRIORITY_WORK_DELAY_MS = 45 * 1000;
const SONG_DETAIL_CONCURRENCY = 1;
const SONG_DETAIL_BATCH_SIZE = 30;
const SONG_CHANGE_BATCH_SIZE = 200;
const SONG_CHANGE_MAX_PAGES = 5;
const SINGER_TUNE_CONCURRENCY = 1;
const SINGER_TUNE_BATCH_SIZE = 10;
const LIST_DETAIL_CONCURRENCY = 1;
const LIST_DETAIL_BATCH_SIZE = 15;

export type OfflineRuntimeStatus = {
  online: boolean;
  syncing: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  songsSyncedAt: string | null;
  listsSyncedAt: string | null;
  songsCount: number;
  listsCount: number;
  exactSearchesCount: number;
  progress: OfflineSyncProgress | null;
  error: string | null;
};

export type OfflineSyncProgress = {
  phase: "idle" | "preparing" | "songs" | "song-details" | "lists" | "list-details" | "singer-tunes" | "shells" | "clearing" | "done";
  label: string;
  songsDone: number;
  songsTotal: number;
  listsDone: number;
  listsTotal: number;
};

type SyncOptions = {
  includeLists: boolean;
  userEmail?: string | null;
  force?: boolean;
  forceRefresh?: boolean;
  manual?: boolean;
  includeSingerTunes?: boolean;
  detailBudget?: number;
  listDetailBudget?: number;
  warmShells?: boolean;
};

type SongChangesResponse = {
  serverTime?: string | null;
  items?: any[];
  removedIds?: Array<number | string>;
  hasMore?: boolean;
  nextSince?: string | null;
};

let runningSync: Promise<OfflineRuntimeStatus> | null = null;
let lastUserActivityAt = Date.now();
let currentProgress: OfflineSyncProgress | null = null;
let lastProgressEmitAt = 0;

function isBrowser() {
  return typeof window !== "undefined";
}

function browserOnline() {
  return !isBrowser() || typeof navigator.onLine === "undefined" ? true : navigator.onLine;
}

function readSyncEnabled() {
  if (!isBrowser()) return true;
  try {
    return window.localStorage.getItem(OFFLINE_SYNC_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeSyncEnabled(enabled: boolean) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(OFFLINE_SYNC_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Best-effort preference only.
  }
}

function markUserActivity() {
  lastUserActivityAt = Date.now();
}

function userIsIdle() {
  if (!isBrowser()) return false;
  if (document.visibilityState === "hidden") return false;
  return Date.now() - lastUserActivityAt >= USER_IDLE_GRACE_MS;
}

function installActivityTracking(): () => void {
  if (!isBrowser()) return () => {};
  markUserActivity();
  const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
  events.forEach((eventName) => window.addEventListener(eventName, markUserActivity, { passive: true }));
  return () => {
    events.forEach((eventName) => window.removeEventListener(eventName, markUserActivity));
  };
}

function baseStatus(): OfflineRuntimeStatus {
  return {
    online: true,
    syncing: false,
    syncEnabled: true,
    lastSyncedAt: null,
    songsSyncedAt: null,
    listsSyncedAt: null,
    songsCount: 0,
    listsCount: 0,
    exactSearchesCount: 0,
    progress: null,
    error: null,
  };
}

function ageMs(iso: string | null | undefined) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? Date.now() - ts : Number.POSITIVE_INFINITY;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${url} HTTP ${res.status}: ${body.slice(0, 180)}`);
  }

  return (await res.json()) as T;
}

function serverIsoOrNull(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function songChangeCursorOrNull(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const [dateText, idText] = raw.split("|");
  const ts = Date.parse(dateText);
  if (!Number.isFinite(ts)) return null;

  const id = Math.trunc(Number(idText ?? 0));
  const normalizedId = Number.isFinite(id) && id > 0 ? id : 0;
  return `${new Date(ts).toISOString()}|${normalizedId}`;
}

async function fetchSongChangesSince(since: string, take = SONG_CHANGE_BATCH_SIZE): Promise<SongChangesResponse> {
  const params = new URLSearchParams();
  params.set("since", since);
  params.set("take", String(take));
  return fetchJson<SongChangesResponse>(`/api/offline/changes?${params.toString()}`);
}

async function fetchSongChangeCursor(): Promise<string | null> {
  const res = await fetchSongChangesSince("9999-12-31T23:59:59.999Z", 1);
  const serverTime = serverIsoOrNull(res.serverTime);
  return songChangeCursorOrNull(res.nextSince) || (serverTime ? `${serverTime}|0` : null);
}

function emitStatus(status: OfflineRuntimeStatus) {
  if (!isBrowser()) return status;
  window.dispatchEvent(new CustomEvent<OfflineRuntimeStatus>(OFFLINE_STATUS_EVENT, { detail: status }));
  return status;
}

async function buildStatus(
  syncing = false,
  error: string | null = null,
  progress: OfflineSyncProgress | null = syncing ? currentProgress : null,
): Promise<OfflineRuntimeStatus> {
  const summary = await readOfflineSummary().catch(() => null);
  const meta = summary?.meta || null;
  return {
    online: browserOnline(),
    syncing,
    syncEnabled: readSyncEnabled(),
    lastSyncedAt: summary?.lastSyncedAt || null,
    songsSyncedAt: summary?.songsSyncedAt || null,
    listsSyncedAt: summary?.listsSyncedAt || null,
    songsCount: summary?.songsCount || 0,
    listsCount: summary?.listsCount || 0,
    exactSearchesCount: summary?.exactSearchesCount || 0,
    progress,
    error: error || meta?.lastError || null,
  };
}

export async function refreshOfflineStatus(): Promise<OfflineRuntimeStatus> {
  return emitStatus(await buildStatus(false));
}

async function updateSyncProgress(
  patch: Partial<OfflineSyncProgress>,
  forceEmit = false,
): Promise<void> {
  const previous = currentProgress || {
    phase: "preparing",
    label: "Προετοιμασία συγχρονισμού",
    songsDone: 0,
    songsTotal: 0,
    listsDone: 0,
    listsTotal: 0,
  };
  currentProgress = { ...previous, ...patch };

  const now = Date.now();
  if (!forceEmit && now - lastProgressEmitAt < 600) return;
  lastProgressEmitAt = now;
  emitStatus(await buildStatus(true, null, currentProgress));
}

function collectCurrentStaticAssetUrls(): string[] {
  if (!isBrowser()) return [];
  const urls = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.startsWith("/_next/static/") && !url.pathname.startsWith("/icons/") && !url.pathname.startsWith("/images/")) return;
      urls.add(url.toString());
    } catch {
      // ignore invalid asset urls
    }
  };

  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((node) => add(node.src));
  document.querySelectorAll<HTMLLinkElement>('link[href][rel="stylesheet"], link[href][rel="preload"]').forEach((node) => add(node.href));
  document.querySelectorAll<HTMLImageElement>("img[src]").forEach((node) => add(node.src));
  return Array.from(urls);
}

function warmCurrentStaticAssets() {
  if (!isBrowser()) return;

  const run = () => {
    if (!navigator.serviceWorker?.controller) return;
    for (const url of collectCurrentStaticAssetUrls()) {
      void fetch(url, {
        method: "GET",
        credentials: "same-origin",
        cache: "reload",
      }).catch(() => null);
    }
  };

  if (navigator.serviceWorker?.controller) {
    run();
    return;
  }

  void navigator.serviceWorker?.ready.then(() => {
    window.setTimeout(run, 500);
  }).catch(() => null);
}

function fetchPageShellsWithoutWorker(urls: string[]) {
  for (const url of urls) {
    void fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "text/html" },
    }).catch(() => null);
  }
}

function warmOfflineShells(includeLists: boolean) {
  if (!isBrowser()) return;
  const urls = includeLists
    ? ["/", "/songs", "/lists", "/songs/offline-shell?offlineShell=1", "/lists/offline-shell?offlineShell=1"]
    : ["/", "/songs", "/songs/offline-shell?offlineShell=1"];

  warmCurrentStaticAssets();

  const post = (worker?: ServiceWorker | null) => {
    worker?.postMessage({ type: "CACHE_PAGES", urls });
  };

  const controller = navigator.serviceWorker?.controller;
  if (controller) {
    post(controller);
    return;
  }

  const ready = navigator.serviceWorker?.ready;
  if (ready) {
    void ready
      .then((registration) => {
        const worker = navigator.serviceWorker.controller || registration.active;
        if (worker) post(worker);
        else fetchPageShellsWithoutWorker(urls);
      })
      .catch(() => fetchPageShellsWithoutWorker(urls));
    return;
  }

  fetchPageShellsWithoutWorker(urls);
}

function songIdFromSearchItem(song: any): number | null {
  const id = Math.trunc(Number(song?.id ?? song?.legacySongId ?? song?.song_id));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function hasOwn(value: any, key: string): boolean {
  return value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
}

function isFullSongDetail(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  if (!hasOwn(value, "assets") || !hasOwn(value, "versions") || !hasOwn(value, "tags")) return false;
  const chords = value.chords;
  return chords == null || typeof chords === "string";
}

function countFullSongDetails(detailsById: Record<string, any> | undefined): number {
  return Object.values(detailsById || {}).filter(isFullSongDetail).length;
}

function mergeSongDetails(songs: any[], previous: Record<string, any>, fresh: Record<string, any>) {
  const merged: Record<string, any> = {};
  for (const song of songs) {
    const id = songIdFromSearchItem(song);
    if (!id) continue;
    const key = String(id);
    if (fresh[key]) merged[key] = fresh[key];
    else if (previous[key]) merged[key] = previous[key];
  }
  return merged;
}

async function fetchSongDetailsForOffline(
  songs: any[],
  previous: Record<string, any>,
  force: boolean,
  limit = SONG_DETAIL_BATCH_SIZE,
  progressStart = 0,
  progressTotal = songs.length,
): Promise<Record<string, any>> {
  const ids = Array.from(new Set(songs.map(songIdFromSearchItem).filter((id): id is number => id !== null)));
  const pendingAll = force ? ids : ids.filter((id) => !isFullSongDetail(previous[String(id)]));
  const pending = pendingAll.slice(0, Math.max(0, limit));
  const detailsById: Record<string, any> = {};
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    for (;;) {
      const id = pending[nextIndex];
      nextIndex += 1;
      if (!id) return;

      try {
        detailsById[String(id)] = await fetchJson<any>(
          `/api/v1/songs/${id}?noIncrement=1`,
        );
      } catch {
        // A missing song detail should not make search/list offline data unusable.
      } finally {
        completed += 1;
        if (completed % 5 === 0 || completed === pending.length) {
          await updateSyncProgress({
            phase: "song-details",
            label: "Συγχρονισμός λεπτομερειών τραγουδιών",
            songsDone: Math.min(progressTotal, progressStart + completed),
            songsTotal: progressTotal,
          });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SONG_DETAIL_CONCURRENCY, pending.length) }, () => worker()));
  return detailsById;
}

async function syncSongsAndFilters(force = false, detailBudget = SONG_DETAIL_BATCH_SIZE) {
  const pageSize = 200;
  await updateSyncProgress({
    phase: "songs",
    label: "Συγχρονισμός ευρετηρίου τραγουδιών",
    songsDone: 0,
    songsTotal: 0,
  }, true);

  const [firstPage, categories, rythms, tags] = await Promise.all([
    fetchJson<any>(`/api/v1/songs-es/search?take=${pageSize}&skip=0`),
    fetchJson<any[]>("/api/categories"),
    fetchJson<any[]>("/api/rythms"),
    fetchJson<any>("/api/songs/tags?take=1000"),
  ]);

  const total = Number(firstPage?.total || 0) || (Array.isArray(firstPage?.items) ? firstPage.items.length : 0);
  const items = Array.isArray(firstPage?.items) ? firstPage.items.slice() : [];
  await updateSyncProgress({
    phase: "songs",
    label: "Συγχρονισμός ευρετηρίου τραγουδιών",
    songsDone: items.length,
    songsTotal: total,
  }, true);

  for (let skip = items.length; skip < total; skip += pageSize) {
    const page = await fetchJson<any>(`/api/v1/songs-es/search?take=${pageSize}&skip=${skip}`);
    const pageItems = Array.isArray(page?.items) ? page.items : [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    await updateSyncProgress({
      phase: "songs",
      label: "Συγχρονισμός ευρετηρίου τραγουδιών",
      songsDone: items.length,
      songsTotal: total,
    });
  }

  const normalizedTags = Array.isArray(tags) ? tags : Array.isArray(tags?.items) ? tags.items : [];
  const previous = await readOfflineSongs().catch(() => null);
  const previousDetailCount = countFullSongDetails(previous?.detailsById);
  const freshDetailsById = await fetchSongDetailsForOffline(
    items,
    previous?.detailsById || {},
    force,
    force ? Number.POSITIVE_INFINITY : detailBudget,
    previousDetailCount,
    items.length,
  );
  const detailsById = mergeSongDetails(items, previous?.detailsById || {}, freshDetailsById);
  const songsChangeCursor = await fetchSongChangeCursor().catch(() => null);

  await writeOfflineSongs(
    {
      total,
      items,
      aggs: firstPage?.aggs,
      detailsById,
      singerTunesBySongId: previous?.singerTunesBySongId || {},
      searchesByKey: previous?.searchesByKey || {},
    },
    { songsChangeCursor },
  );
  await writeOfflineStaticFilters({ categories, rythms, tags: normalizedTags });
}

async function syncSongChanges(cursor: string): Promise<boolean> {
  let since = songChangeCursorOrNull(cursor);
  if (!since) return false;

  let totalChanged = 0;
  let hasMore = false;
  let lastProcessedCursor: string | null = null;

  await updateSyncProgress({
    phase: "songs",
    label: "Έλεγχος αλλαγών τραγουδιών",
    songsDone: 0,
    songsTotal: 0,
  }, true);

  for (let page = 0; page < SONG_CHANGE_MAX_PAGES; page += 1) {
    const changes = await fetchSongChangesSince(since, SONG_CHANGE_BATCH_SIZE);
    const items = Array.isArray(changes.items) ? changes.items : [];
    const removedIds = Array.isArray(changes.removedIds) ? changes.removedIds : [];
    const nextSince = songChangeCursorOrNull(changes.nextSince);
    const serverTime = serverIsoOrNull(changes.serverTime);
    const serverCursor = serverTime ? `${serverTime}|0` : null;
    const cursorAfterPage = nextSince || serverCursor || since;
    lastProcessedCursor = nextSince || lastProcessedCursor;
    hasMore = Boolean(changes.hasMore);

    if (items.length > 0 || removedIds.length > 0) {
      await applyOfflineSongChanges({
        items,
        removedIds,
        songsChangeCursor: hasMore && nextSince ? nextSince : cursorAfterPage,
      });
    }

    totalChanged += items.length + removedIds.length;
    await updateSyncProgress({
      phase: "songs",
      label: "Συγχρονισμός αλλαγών τραγουδιών",
      songsDone: totalChanged,
      songsTotal: hasMore ? totalChanged + SONG_CHANGE_BATCH_SIZE : totalChanged,
    });

    if (!hasMore) {
      if (cursorAfterPage) {
        await applyOfflineSongChanges({
          items: [],
          removedIds: [],
          songsChangeCursor: cursorAfterPage,
        });
      }
      return true;
    }

    if (!nextSince || nextSince === since) break;
    lastProcessedCursor = nextSince;
    since = nextSince;
  }

  if (lastProcessedCursor) {
    await applyOfflineSongChanges({
      items: [],
      removedIds: [],
      songsChangeCursor: lastProcessedCursor,
    });
  }

  return true;
}

async function syncSongDetailsChunk(limit = SONG_DETAIL_BATCH_SIZE) {
  const snapshot = await readOfflineSongs().catch(() => null);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  if (items.length === 0) return;

  const previous = snapshot?.detailsById || {};
  const previousDetailCount = countFullSongDetails(previous);
  const freshDetailsById = await fetchSongDetailsForOffline(items, previous, false, limit, previousDetailCount, items.length);
  if (Object.keys(freshDetailsById).length === 0) return;

  await writeOfflineSongs(
    {
      total: typeof snapshot?.total === "number" ? snapshot.total : items.length,
      items,
      aggs: snapshot?.aggs || null,
      detailsById: mergeSongDetails(items, previous, freshDetailsById),
      singerTunesBySongId: snapshot?.singerTunesBySongId || {},
      searchesByKey: snapshot?.searchesByKey || {},
    },
    { markSynced: false },
  );
}

async function syncSingerTunesForOffline(force = false) {
  const me = await fetchJson<any>("/api/current-user").catch(() => null);
  const userId = Number(me?.user?.id);
  if (!Number.isFinite(userId) || userId <= 0) return;

  const snapshot = await readOfflineSongs().catch(() => null);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  if (items.length === 0) return;

  const previous = snapshot?.singerTunesBySongId || {};
  const ids = Array.from(new Set(items.map(songIdFromSearchItem).filter((id): id is number => id !== null)));
  const pendingAll = force ? ids : ids.filter((id) => !Object.prototype.hasOwnProperty.call(previous, String(id)));
  const pending = force ? pendingAll : pendingAll.slice(0, SINGER_TUNE_BATCH_SIZE);
  const fresh: Record<string, any[]> = {};
  let nextIndex = 0;
  let completed = 0;

  await updateSyncProgress({
    phase: "singer-tunes",
    label: "Συγχρονισμός προσωπικών τονικοτήτων",
    songsDone: Math.min(ids.length, Object.keys(previous).length),
    songsTotal: ids.length,
  }, true);

  async function worker() {
    for (;;) {
      const id = pending[nextIndex];
      nextIndex += 1;
      if (!id) return;

      try {
        const rows = await fetchJson<any[]>(`/api/songs/${id}/singer-tunes`);
        fresh[String(id)] = Array.isArray(rows) ? rows : [];
      } catch {
        // Singer tunes are user-scoped; one failed song must not cancel offline sync.
      } finally {
        completed += 1;
        if (completed % 5 === 0 || completed === pending.length) {
          await updateSyncProgress({
            phase: "singer-tunes",
            label: "Συγχρονισμός προσωπικών τονικοτήτων",
            songsDone: Math.min(ids.length, Object.keys(previous).length + completed),
            songsTotal: ids.length,
          });
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(SINGER_TUNE_CONCURRENCY, pending.length) },
      () => worker(),
    ),
  );

  if (Object.keys(fresh).length === 0) return;

  await writeOfflineSongs(
    {
      total: typeof snapshot?.total === "number" ? snapshot.total : items.length,
      items,
      aggs: snapshot?.aggs || null,
      detailsById: snapshot?.detailsById || {},
      singerTunesBySongId: { ...previous, ...fresh },
      searchesByKey: snapshot?.searchesByKey || {},
    },
    { markSynced: false },
  );
}

function listIdFromSummary(list: any): number | null {
  const id = Math.trunc(Number(list?.id));
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function fetchListDetailsForOffline(
  userId: number,
  lists: any[],
  previous: Record<string, any> = {},
  limit = LIST_DETAIL_BATCH_SIZE,
  force = false,
  progressStart = 0,
  progressTotal = lists.length,
): Promise<Record<string, any>> {
  const ids = Array.from(new Set(lists.map(listIdFromSummary).filter((id): id is number => id !== null)));
  const pending = (force ? ids : ids.filter((id) => !previous[String(id)])).slice(0, Math.max(0, limit));
  const detailsById: Record<string, any> = {};
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    for (;;) {
      const id = pending[nextIndex];
      nextIndex += 1;
      if (!id) return;

      try {
        detailsById[String(id)] = await fetchJson<any>(
          `/api/v1/lists/${id}?userId=${encodeURIComponent(String(userId))}`,
        );
      } catch {
        // A single list detail must not cancel the whole offline sync.
      } finally {
        completed += 1;
        if (completed % 5 === 0 || completed === pending.length) {
          await updateSyncProgress({
            phase: "list-details",
            label: "Συγχρονισμός λεπτομερειών λιστών",
            listsDone: Math.min(progressTotal, progressStart + completed),
            listsTotal: progressTotal,
          });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(LIST_DETAIL_CONCURRENCY, pending.length) }, () => worker()));
  return detailsById;
}

function mergeListDetails(lists: any[], previous: Record<string, any>, fresh: Record<string, any>) {
  const merged: Record<string, any> = {};
  for (const list of lists) {
    const id = listIdFromSummary(list);
    if (!id) continue;
    const key = String(id);
    if (fresh[key]) merged[key] = fresh[key];
    else if (previous[key]) merged[key] = previous[key];
  }
  return merged;
}

function countListDetails(detailsById: Record<string, any> | undefined): number {
  return Object.keys(detailsById || {}).length;
}

async function syncLists(userEmail?: string | null, detailBudget = LIST_DETAIL_BATCH_SIZE, force = false) {
  await updateSyncProgress({
    phase: "lists",
    label: "Συγχρονισμός λιστών",
    listsDone: 0,
    listsTotal: 0,
  }, true);

  const me = await fetchJson<any>("/api/current-user");
  const user = me?.user || null;
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) return;

  const email = user?.email || userEmail || null;
  const [data, facets, groupsIndex] = await Promise.all([
    fetchJson<any>("/api/lists?page=1&pageSize=5000"),
    fetchJson<any>("/api/lists?page=1&pageSize=1"),
    fetchJson<any>("/api/lists/groups").catch(() => null),
  ]);
  const lists = Array.isArray(data?.items) ? data.items : [];
  await updateSyncProgress({
    phase: "lists",
    label: "Συγχρονισμός λιστών",
    listsDone: lists.length,
    listsTotal: Number(data?.total || lists.length) || lists.length,
  }, true);

  const previous = await readOfflineListsForEmail(email).catch(() => null);
  const previousDetailCount = countListDetails(previous?.detailsById);
  const freshDetailsById = await fetchListDetailsForOffline(
    userId,
    lists,
    previous?.detailsById || {},
    force ? Number.POSITIVE_INFINITY : detailBudget,
    force,
    previousDetailCount,
    lists.length,
  );
  const detailsById = mergeListDetails(lists, previous?.detailsById || {}, freshDetailsById);

  await writeOfflineListsForUser({ userId, userEmail: email, data, facets, groupsIndex, detailsById });
}

async function syncListDetailsChunk(userEmail?: string | null, limit = LIST_DETAIL_BATCH_SIZE) {
  const me = await fetchJson<any>("/api/current-user").catch(() => null);
  const user = me?.user || null;
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) return;

  const email = user?.email || userEmail || null;
  const snapshot = await readOfflineListsForEmail(email).catch(() => null);
  const lists = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  if (lists.length === 0) return;

  const previous = snapshot?.detailsById || {};
  const previousDetailCount = countListDetails(previous);
  const freshDetailsById = await fetchListDetailsForOffline(userId, lists, previous, limit, false, previousDetailCount, lists.length);
  if (Object.keys(freshDetailsById).length === 0) return;

  await writeOfflineListsForUser(
    {
      userId,
      userEmail: email,
      data: snapshot?.data,
      facets: snapshot?.facets,
      groupsIndex: snapshot?.groupsIndex,
      detailsById: mergeListDetails(lists, previous, freshDetailsById),
    },
    { markSynced: false },
  );
}

async function doSync(options: SyncOptions): Promise<OfflineRuntimeStatus> {
  if (!browserOnline()) return emitStatus(await buildStatus(false));
  if (!options.manual && !readSyncEnabled()) return emitStatus(await buildStatus(false));

  currentProgress = {
    phase: "preparing",
    label: "Προετοιμασία συγχρονισμού",
    songsDone: 0,
    songsTotal: 0,
    listsDone: 0,
    listsTotal: 0,
  };
  lastProgressEmitAt = 0;
  const detailBudget = options.force ? Number.POSITIVE_INFINITY : (options.detailBudget ?? SONG_DETAIL_BATCH_SIZE);
  const listDetailBudget = options.force ? Number.POSITIVE_INFINITY : (options.listDetailBudget ?? LIST_DETAIL_BATCH_SIZE);
  const currentUser =
    options.includeLists
      ? ((await fetchJson<any>("/api/current-user").catch(() => null))?.user || null)
      : null;
  if (currentUser) await writeOfflineCurrentUser(currentUser).catch(() => null);

  const meta = await readOfflineMeta().catch(() => null);
  const cachedSongs = await readOfflineSongs().catch(() => null);
  const normalizedEmail = String(currentUser?.email || options.userEmail || "").trim().toLowerCase();
  const cachedEmail = String(meta?.userEmail || "").trim().toLowerCase();
  const cachedSongCount = Number(meta?.songsCount || 0);
  const cachedSongDetailsCount = countFullSongDetails(cachedSongs?.detailsById);
  const cachedSingerTunesCount = Object.keys(cachedSongs?.singerTunesBySongId || {}).length;
  const cachedLists = options.includeLists ? await readOfflineListsForEmail(normalizedEmail || options.userEmail).catch(() => null) : null;
  const cachedListItems = Array.isArray(cachedLists?.data?.items) ? cachedLists.data.items : [];
  const cachedListDetailsCount = countListDetails(cachedLists?.detailsById);
  const hasListDetailSnapshot = !cachedLists || Object.prototype.hasOwnProperty.call(cachedLists, "detailsById");
  const needsSongDetails = cachedSongCount > 0 && cachedSongDetailsCount < cachedSongCount;
  const songsChangeCursor = songChangeCursorOrNull(meta?.songsChangeCursor);
  const needsFullSongs =
    options.force ||
    options.forceRefresh ||
    !cachedSongs ||
    cachedSongCount < 250 ||
    !songsChangeCursor ||
    ageMs(meta?.songsFullSyncedAt || meta?.songsSyncedAt) > SONGS_FULL_SYNC_AGE_MS;
  const needsSongChanges =
    !needsFullSongs &&
    Boolean(songsChangeCursor) &&
    ageMs(meta?.songsSyncedAt) > SONGS_DELTA_SYNC_AGE_MS;
  const canSyncUserData = options.includeLists && Boolean(currentUser?.id || normalizedEmail || cachedEmail);
  const needsLists =
    options.includeLists &&
    (options.force ||
      options.forceRefresh ||
      !cachedLists ||
      ageMs(meta?.listsSyncedAt) > LISTS_SYNC_AGE_MS ||
      (!!normalizedEmail && normalizedEmail !== cachedEmail) ||
      !hasListDetailSnapshot);
  const needsListDetails =
    canSyncUserData &&
    !needsLists &&
    cachedListItems.length > 0 &&
    cachedListDetailsCount < cachedListItems.length;
  const needsSingerTunes =
    canSyncUserData &&
    (options.force || Boolean(options.includeSingerTunes)) &&
    cachedSongCount > 0 &&
    cachedSingerTunesCount < cachedSongCount;

  if (!needsFullSongs && !needsSongChanges && !needsSongDetails && !needsLists && !needsListDetails && !needsSingerTunes) {
    currentProgress = null;
    return emitStatus(await buildStatus(false));
  }

  emitStatus(await buildStatus(true, null, currentProgress));

  try {
    if (needsFullSongs) await syncSongsAndFilters(Boolean(options.force), detailBudget);
    else if (needsSongChanges && songsChangeCursor) await syncSongChanges(songsChangeCursor);
    else if (needsSongDetails) await syncSongDetailsChunk(detailBudget);

    if (needsLists) await syncLists(options.userEmail, listDetailBudget, Boolean(options.force));
    else if (needsListDetails) await syncListDetailsChunk(options.userEmail, listDetailBudget);

    if (needsSingerTunes) await syncSingerTunesForOffline(Boolean(options.force));
    if (options.warmShells) {
      await updateSyncProgress({
        phase: "shells",
        label: "Προετοιμασία offline σελίδων",
      }, true);
      scheduleLowPriorityWork(() => warmOfflineShells(options.includeLists));
    }
    currentProgress = {
      ...(currentProgress || {
        songsDone: 0,
        songsTotal: 0,
        listsDone: 0,
        listsTotal: 0,
      }),
      phase: "done",
      label: "Ο συγχρονισμός ολοκληρώθηκε",
    };
    const finalStatus = emitStatus(await buildStatus(false, null, null));
    currentProgress = null;
    return finalStatus;
  } catch (error) {
    await recordOfflineSyncError(error).catch(() => null);
    const message = error instanceof Error ? error.message : String(error || "Offline sync failed");
    currentProgress = null;
    return emitStatus(await buildStatus(false, message, null));
  }
}

export function runOfflineSync(options: SyncOptions): Promise<OfflineRuntimeStatus> {
  if (!isBrowser()) return Promise.resolve(baseStatus());
  if (runningSync) return runningSync;
  runningSync = doSync(options).finally(() => {
    runningSync = null;
  });
  return runningSync;
}

async function clearOfflineCaches() {
  if (!isBrowser() || !("caches" in window)) return;
  const names = await window.caches.keys();
  await Promise.all(
    names
      .filter((name) => CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
      .map((name) => window.caches.delete(name)),
  );
}

export async function setOfflineSyncEnabled(enabled: boolean): Promise<OfflineRuntimeStatus> {
  writeSyncEnabled(enabled);
  return refreshOfflineStatus();
}

export function forceOfflineSync(includeLists: boolean, userEmail?: string | null): Promise<OfflineRuntimeStatus> {
  return runOfflineSync({
    includeLists,
    userEmail,
    manual: true,
    forceRefresh: true,
    includeSingerTunes: true,
    warmShells: true,
  });
}

export async function clearOfflineSyncedData(): Promise<OfflineRuntimeStatus> {
  if (!isBrowser()) return baseStatus();
  currentProgress = {
    phase: "clearing",
    label: "Διαγραφή δεδομένων συγχρονισμού",
    songsDone: 0,
    songsTotal: 0,
    listsDone: 0,
    listsTotal: 0,
  };
  emitStatus(await buildStatus(true, null, currentProgress));

  try {
    await clearOfflineSyncDataStore();
    await clearOfflineCaches();
    currentProgress = null;
    return emitStatus(await buildStatus(false, null, null));
  } catch (error) {
    currentProgress = null;
    const message = error instanceof Error ? error.message : String(error || "Αποτυχία διαγραφής offline δεδομένων");
    return emitStatus(await buildStatus(false, message, null));
  }
}

function scheduleLowPriorityWork(callback: () => void, delayMs = LOW_PRIORITY_WORK_DELAY_MS): () => void {
  if (!isBrowser()) return () => {};

  let idleId: number | null = null;
  const timeoutId = window.setTimeout(() => {
    const run = () => {
      if (document.visibilityState === "hidden") return;
      callback();
    };

    const requestIdle = (window as any).requestIdleCallback;
    if (typeof requestIdle === "function") {
      idleId = requestIdle(run, { timeout: BACKGROUND_IDLE_TIMEOUT_MS });
      return;
    }

    run();
  }, delayMs);

  return () => {
    window.clearTimeout(timeoutId);
    const cancelIdle = (window as any).cancelIdleCallback;
    if (idleId !== null && typeof cancelIdle === "function") cancelIdle(idleId);
  };
}

function scheduleBackgroundSync(callback: () => void, delayMs = BACKGROUND_SYNC_DELAY_MS): () => void {
  if (!isBrowser()) return () => {};

  let cancelled = false;
  let cancelPending = () => {};

  const schedule = (nextDelay: number) => {
    cancelPending();
    cancelPending = scheduleLowPriorityWork(() => {
      if (cancelled) return;
      if (!userIsIdle()) {
        schedule(BACKGROUND_RETRY_DELAY_MS);
        return;
      }
      callback();
    }, nextDelay);
  };

  schedule(delayMs);

  return () => {
    cancelled = true;
    cancelPending();
  };
}

export function useOfflineRuntime(includeLists: boolean, userEmail?: string | null) {
  const [status, setStatus] = useState<OfflineRuntimeStatus>(() => baseStatus());

  useEffect(() => {
    if (!isBrowser()) return;

    let cancelled = false;
    let cancelNetworkSync = () => {};
    let cancelIntervalSync = () => {};
    const removeActivityTracking = installActivityTracking();
    const apply = (next: OfflineRuntimeStatus) => {
      if (!cancelled) setStatus(next);
    };

    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<OfflineRuntimeStatus>).detail;
      if (detail) apply(detail);
    };

    const onNetworkChange = () => {
      void refreshOfflineStatus();
      if (browserOnline()) {
        cancelNetworkSync();
        cancelNetworkSync = scheduleBackgroundSync(() => {
          void runOfflineSync({ includeLists, userEmail });
        }, BACKGROUND_SYNC_DELAY_MS);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === OFFLINE_SYNC_ENABLED_KEY) {
        void refreshOfflineStatus();
      }
    };

    window.addEventListener(OFFLINE_STATUS_EVENT, onStatus as EventListener);
    window.addEventListener("online", onNetworkChange);
    window.addEventListener("offline", onNetworkChange);
    window.addEventListener("storage", onStorage);

    void refreshOfflineStatus().then(apply).catch(() => null);

    const cancelInitialSync = scheduleBackgroundSync(() => {
      void runOfflineSync({ includeLists, userEmail });
    });

    const interval = window.setInterval(() => {
      cancelIntervalSync();
      cancelIntervalSync = scheduleBackgroundSync(() => {
        void runOfflineSync({ includeLists, userEmail, includeSingerTunes: true });
      }, 0);
    }, BACKGROUND_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      removeActivityTracking();
      cancelNetworkSync();
      cancelIntervalSync();
      cancelInitialSync();
      window.clearInterval(interval);
      window.removeEventListener(OFFLINE_STATUS_EVENT, onStatus as EventListener);
      window.removeEventListener("online", onNetworkChange);
      window.removeEventListener("offline", onNetworkChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [includeLists, userEmail]);

  return status;
}
