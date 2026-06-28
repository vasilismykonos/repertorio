"use client";

export type UserHistoryEvent =
  | {
      type: "SONG_VIEW";
      songId: number;
      path?: string | null;
      metadata?: Record<string, unknown> | null;
      occurredAt?: string;
    }
  | {
      type: "SONG_SEARCH";
      searchTerm: string;
      path?: string | null;
      metadata?: Record<string, unknown> | null;
      occurredAt?: string;
    };

export type RecentSongHistoryItem = {
  id: number;
  title: string;
  path: string;
  firstLyrics?: string | null;
  originalKey?: string | null;
  originalKeySign?: string | null;
  occurredAt: string;
};

export type RecentSearchHistoryItem = {
  term: string;
  path: string;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
};

const QUEUE_KEY = "repertorio:userHistory:queue:v1";
const SONGS_KEY = "repertorio:userHistory:recentSongs:v1";
const SEARCHES_KEY = "repertorio:userHistory:recentSearches:v1";
const LAST_EVENT_KEY = "repertorio:userHistory:lastEvent:v1";
const MAX_QUEUE = 150;
const MAX_RECENT_SONGS = 80;
const MAX_RECENT_SEARCHES = 50;
const EVENT_DEDUPE_MS = 3 * 60 * 1000;
const FLUSH_DELAY_MS = 30_000;

let flushTimer: number | null = null;
let flushing = false;

function nowIso() {
  return new Date().toISOString();
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local history is an enhancement; storage failures must not affect navigation.
  }
}

function currentPath() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

function scheduleFlush() {
  if (typeof window === "undefined") return;
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushUserHistory();
  }, FLUSH_DELAY_MS);
}

function shouldRecord(key: string) {
  if (!canUseStorage()) return true;
  const last = readJson<Record<string, number>>(LAST_EVENT_KEY, {});
  const t = Date.now();
  if (last[key] && t - last[key] < EVENT_DEDUPE_MS) return false;
  last[key] = t;
  writeJson(LAST_EVENT_KEY, last);
  return true;
}

function queueEvent(event: UserHistoryEvent) {
  const queue = readJson<UserHistoryEvent[]>(QUEUE_KEY, []);
  queue.unshift({ ...event, occurredAt: event.occurredAt || nowIso() } as UserHistoryEvent);
  writeJson(QUEUE_KEY, queue.slice(0, MAX_QUEUE));
  scheduleFlush();
}

export function recordSongView(input: { songId: number; title?: string | null; path?: string | null }) {
  if (!Number.isFinite(input.songId) || input.songId <= 0) return;
  const path = input.path || currentPath() || `/songs/${input.songId}`;
  const title = String(input.title || "").trim() || `#${input.songId}`;
  const occurredAt = nowIso();
  const dedupeKey = `song:${input.songId}`;
  if (!shouldRecord(dedupeKey)) return;

  const songs = readJson<RecentSongHistoryItem[]>(SONGS_KEY, []);
  const next = [
    { id: input.songId, title, path, occurredAt },
    ...songs.filter((item) => item.id !== input.songId),
  ].slice(0, MAX_RECENT_SONGS);
  writeJson(SONGS_KEY, next);

  queueEvent({
    type: "SONG_VIEW",
    songId: input.songId,
    path,
    metadata: { title },
    occurredAt,
  });
}

export function recordSongSearch(input: {
  searchTerm: string;
  path?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const term = String(input.searchTerm || "").trim();
  if (term.length < 2) return;
  const path = input.path || currentPath() || `/songs?search_term=${encodeURIComponent(term)}`;
  const occurredAt = nowIso();
  const normalized = term.toLocaleLowerCase("el-GR");
  const dedupeKey = `search:${normalized}:${JSON.stringify(input.metadata || {})}`;
  if (!shouldRecord(dedupeKey)) return;

  const searches = readJson<RecentSearchHistoryItem[]>(SEARCHES_KEY, []);
  const next = [
    { term, path, metadata: input.metadata || null, occurredAt },
    ...searches.filter((item) => item.term.toLocaleLowerCase("el-GR") !== normalized),
  ].slice(0, MAX_RECENT_SEARCHES);
  writeJson(SEARCHES_KEY, next);

  queueEvent({
    type: "SONG_SEARCH",
    searchTerm: term,
    path,
    metadata: input.metadata || null,
    occurredAt,
  });
}

export function readLocalUserHistory() {
  return {
    recentSongs: readJson<RecentSongHistoryItem[]>(SONGS_KEY, []),
    recentSearches: readJson<RecentSearchHistoryItem[]>(SEARCHES_KEY, []),
  };
}

export async function flushUserHistory() {
  if (flushing || typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const queue = readJson<UserHistoryEvent[]>(QUEUE_KEY, []);
  if (!queue.length) return;

  flushing = true;
  const batch = queue.slice(0, 50);
  try {
    const res = await fetch("/api/user-history", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ events: batch.reverse() }),
      cache: "no-store",
    });

    if (res.status === 401) {
      writeJson(QUEUE_KEY, []);
      return;
    }

    if (!res.ok) return;
    writeJson(QUEUE_KEY, queue.slice(batch.length));
  } catch {
    // Keep the queue for the next online/idle opportunity.
  } finally {
    flushing = false;
  }
}

export function setupUserHistoryFlush() {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => {
    void flushUserHistory();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") void flushUserHistory();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  scheduleFlush();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    if (flushTimer != null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
  };
}
