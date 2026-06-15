"use client";

import { useEffect, useState } from "react";
import {
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

const SONGS_SYNC_AGE_MS = 20 * 60 * 1000;
const LISTS_SYNC_AGE_MS = 10 * 60 * 1000;
const BACKGROUND_SYNC_DELAY_MS = 30 * 1000;
const BACKGROUND_IDLE_TIMEOUT_MS = 8 * 1000;
const BACKGROUND_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const SONG_DETAIL_CONCURRENCY = 2;
const SINGER_TUNE_CONCURRENCY = 1;
const SINGER_TUNE_BATCH_SIZE = 25;
const LIST_DETAIL_CONCURRENCY = 2;

export type OfflineRuntimeStatus = {
  online: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  songsSyncedAt: string | null;
  listsSyncedAt: string | null;
  songsCount: number;
  listsCount: number;
  exactSearchesCount: number;
  error: string | null;
};

type SyncOptions = {
  includeLists: boolean;
  userEmail?: string | null;
  force?: boolean;
  includeSingerTunes?: boolean;
};

let runningSync: Promise<OfflineRuntimeStatus> | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function browserOnline() {
  return !isBrowser() || typeof navigator.onLine === "undefined" ? true : navigator.onLine;
}

function baseStatus(): OfflineRuntimeStatus {
  return {
    online: true,
    syncing: false,
    lastSyncedAt: null,
    songsSyncedAt: null,
    listsSyncedAt: null,
    songsCount: 0,
    listsCount: 0,
    exactSearchesCount: 0,
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

function emitStatus(status: OfflineRuntimeStatus) {
  if (!isBrowser()) return status;
  window.dispatchEvent(new CustomEvent<OfflineRuntimeStatus>(OFFLINE_STATUS_EVENT, { detail: status }));
  return status;
}

async function buildStatus(syncing = false, error: string | null = null): Promise<OfflineRuntimeStatus> {
  const summary = await readOfflineSummary().catch(() => null);
  const meta = summary?.meta || null;
  return {
    online: browserOnline(),
    syncing,
    lastSyncedAt: summary?.lastSyncedAt || null,
    songsSyncedAt: summary?.songsSyncedAt || null,
    listsSyncedAt: summary?.listsSyncedAt || null,
    songsCount: summary?.songsCount || 0,
    listsCount: summary?.listsCount || 0,
    exactSearchesCount: summary?.exactSearchesCount || 0,
    error: error || meta?.lastError || null,
  };
}

export async function refreshOfflineStatus(): Promise<OfflineRuntimeStatus> {
  return emitStatus(await buildStatus(false));
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

async function fetchSongDetailsForOffline(songs: any[], previous: Record<string, any>, force: boolean): Promise<Record<string, any>> {
  const ids = Array.from(new Set(songs.map(songIdFromSearchItem).filter((id): id is number => id !== null)));
  const pending = force ? ids : ids.filter((id) => !isFullSongDetail(previous[String(id)]));
  const detailsById: Record<string, any> = {};
  let nextIndex = 0;

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
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SONG_DETAIL_CONCURRENCY, pending.length) }, () => worker()));
  return detailsById;
}

async function syncSongsAndFilters(force = false) {
  const pageSize = 200;
  const [firstPage, categories, rythms, tags] = await Promise.all([
    fetchJson<any>(`/api/v1/songs-es/search?take=${pageSize}&skip=0`),
    fetchJson<any[]>("/api/categories"),
    fetchJson<any[]>("/api/rythms"),
    fetchJson<any>("/api/songs/tags?take=1000"),
  ]);

  const total = Number(firstPage?.total || 0) || (Array.isArray(firstPage?.items) ? firstPage.items.length : 0);
  const items = Array.isArray(firstPage?.items) ? firstPage.items.slice() : [];

  for (let skip = items.length; skip < total; skip += pageSize) {
    const page = await fetchJson<any>(`/api/v1/songs-es/search?take=${pageSize}&skip=${skip}`);
    const pageItems = Array.isArray(page?.items) ? page.items : [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
  }

  const normalizedTags = Array.isArray(tags) ? tags : Array.isArray(tags?.items) ? tags.items : [];
  const previous = await readOfflineSongs().catch(() => null);
  const freshDetailsById = await fetchSongDetailsForOffline(items, previous?.detailsById || {}, force);
  const detailsById = mergeSongDetails(items, previous?.detailsById || {}, freshDetailsById);

  await writeOfflineSongs({
    total,
    items,
    aggs: firstPage?.aggs,
    detailsById,
    singerTunesBySongId: previous?.singerTunesBySongId || {},
    searchesByKey: previous?.searchesByKey || {},
  });
  await writeOfflineStaticFilters({ categories, rythms, tags: normalizedTags });
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

  await writeOfflineSongs({
    total: typeof snapshot?.total === "number" ? snapshot.total : items.length,
    items,
    aggs: snapshot?.aggs || null,
    detailsById: snapshot?.detailsById || {},
    singerTunesBySongId: { ...previous, ...fresh },
    searchesByKey: snapshot?.searchesByKey || {},
  });
}

function listIdFromSummary(list: any): number | null {
  const id = Math.trunc(Number(list?.id));
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function fetchListDetailsForOffline(userId: number, lists: any[]): Promise<Record<string, any>> {
  const ids = Array.from(new Set(lists.map(listIdFromSummary).filter((id): id is number => id !== null)));
  const detailsById: Record<string, any> = {};
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const id = ids[nextIndex];
      nextIndex += 1;
      if (!id) return;

      try {
        detailsById[String(id)] = await fetchJson<any>(
          `/api/v1/lists/${id}?userId=${encodeURIComponent(String(userId))}`,
        );
      } catch {
        // A single list detail must not cancel the whole offline sync.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(LIST_DETAIL_CONCURRENCY, ids.length) }, () => worker()));
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

async function syncLists(userEmail?: string | null) {
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
  const previous = await readOfflineListsForEmail(email).catch(() => null);
  const freshDetailsById = await fetchListDetailsForOffline(userId, lists);
  const detailsById = mergeListDetails(lists, previous?.detailsById || {}, freshDetailsById);

  await writeOfflineListsForUser({ userId, userEmail: email, data, facets, groupsIndex, detailsById });
}

async function doSync(options: SyncOptions): Promise<OfflineRuntimeStatus> {
  if (!browserOnline()) return emitStatus(await buildStatus(false));

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
  const cachedLists = options.includeLists ? await readOfflineListsForEmail(options.userEmail).catch(() => null) : null;
  const hasListDetailSnapshot = !cachedLists || Object.prototype.hasOwnProperty.call(cachedLists, "detailsById");
  const needsSongDetails = cachedSongCount > 0 && cachedSongDetailsCount < cachedSongCount;
  const needsSongs = options.force || cachedSongCount < 250 || needsSongDetails || ageMs(meta?.songsSyncedAt) > SONGS_SYNC_AGE_MS;
  const canSyncUserData = options.includeLists && Boolean(currentUser?.id || normalizedEmail || cachedEmail);
  const needsLists =
    options.includeLists &&
    (options.force ||
      ageMs(meta?.listsSyncedAt) > LISTS_SYNC_AGE_MS ||
      (!!normalizedEmail && normalizedEmail !== cachedEmail) ||
      !hasListDetailSnapshot);
  const needsSingerTunes =
    canSyncUserData &&
    (options.force || Boolean(options.includeSingerTunes)) &&
    cachedSongCount > 0 &&
    cachedSingerTunesCount < cachedSongCount;

  if (!needsSongs && !needsLists && !needsSingerTunes) return emitStatus(await buildStatus(false));

  emitStatus(await buildStatus(true));

  try {
    if (needsSongs) await syncSongsAndFilters(Boolean(options.force));
    if (needsLists) await syncLists(options.userEmail);
    if (needsSingerTunes) await syncSingerTunesForOffline(Boolean(options.force));
    warmOfflineShells(options.includeLists);
    return emitStatus(await buildStatus(false));
  } catch (error) {
    await recordOfflineSyncError(error).catch(() => null);
    const message = error instanceof Error ? error.message : String(error || "Offline sync failed");
    return emitStatus(await buildStatus(false, message));
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

function scheduleBackgroundSync(callback: () => void): () => void {
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
  }, BACKGROUND_SYNC_DELAY_MS);

  return () => {
    window.clearTimeout(timeoutId);
    const cancelIdle = (window as any).cancelIdleCallback;
    if (idleId !== null && typeof cancelIdle === "function") cancelIdle(idleId);
  };
}

export function useOfflineRuntime(includeLists: boolean, userEmail?: string | null) {
  const [status, setStatus] = useState<OfflineRuntimeStatus>(() => baseStatus());

  useEffect(() => {
    if (!isBrowser()) return;

    let cancelled = false;
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
        void runOfflineSync({ includeLists, userEmail });
      }
    };

    window.addEventListener(OFFLINE_STATUS_EVENT, onStatus as EventListener);
    window.addEventListener("online", onNetworkChange);
    window.addEventListener("offline", onNetworkChange);

    void refreshOfflineStatus().then(apply).catch(() => null);

    const cancelInitialSync = scheduleBackgroundSync(() => {
      void runOfflineSync({ includeLists, userEmail });
    });

    const interval = window.setInterval(() => {
      void runOfflineSync({ includeLists, userEmail, includeSingerTunes: true });
    }, BACKGROUND_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      cancelInitialSync();
      window.clearInterval(interval);
      window.removeEventListener(OFFLINE_STATUS_EVENT, onStatus as EventListener);
      window.removeEventListener("online", onNetworkChange);
      window.removeEventListener("offline", onNetworkChange);
    };
  }, [includeLists, userEmail]);

  return status;
}
