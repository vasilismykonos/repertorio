// apps/web/app/components/RoomsSongSyncHandler.tsx
"use client";

import { useEffect } from "react";

const LAST_SYNC_STORAGE_PREFIX = "rep_last_song_sync::";
const LAST_SYNC_REQUEST_STORAGE_PREFIX = "rep_last_song_sync_request::";
const PENDING_TONICITY_STORAGE_PREFIX = "rep_room_pending_tonicity::";

type SongPayload = {
  kind?: string;
  url?: string;
  title?: string | null;
  songId?: number | null;
  selectedTonicity?: string | null;
  sentAt?: number | null;
};

type SongSyncDetail = {
  room?: string | null;
  syncId?: number | null;
  requestId?: string | null;
  payload?: SongPayload | null;
};

function toPositiveSongId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function relativeUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return raw;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function songIdFromUrl(input: string): number | null {
  try {
    const url = new URL(input, window.location.origin);
    const match = url.pathname.match(/^\/songs\/(\d+)/);
    return match ? toPositiveSongId(match[1]) : null;
  } catch {
    return null;
  }
}

function currentSongId(): number | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/songs\/(\d+)/);
  return match ? toPositiveSongId(match[1]) : null;
}

function hasHandledSync(room: string, syncId: number, requestId: string | null): boolean {
  if (!room) return false;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      if (requestId) {
        const prevRequest = storage.getItem(`${LAST_SYNC_REQUEST_STORAGE_PREFIX}${room}`);
        if (prevRequest === requestId) return true;
      }

      if (syncId > 0) {
        const prevRaw = storage.getItem(`${LAST_SYNC_STORAGE_PREFIX}${room}`);
        const prev = prevRaw ? Number(prevRaw) : 0;
        if (Number.isFinite(prev) && prev >= syncId) return true;
      }
    } catch {
      // ignore this storage
    }
  }
  return false;
}

function markHandledSync(room: string, syncId: number, requestId: string | null) {
  if (!room) return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      if (syncId > 0) storage.setItem(`${LAST_SYNC_STORAGE_PREFIX}${room}`, String(syncId));
      if (requestId) storage.setItem(`${LAST_SYNC_REQUEST_STORAGE_PREFIX}${room}`, requestId);
    } catch {
      // ignore this storage
    }
  }
}

function notifySyncReceived(room: string, syncId: number, requestId: string | null) {
  if (!room) return;
  window.dispatchEvent(new CustomEvent("rep_song_sync_received", {
    detail: { room, syncId, requestId },
  }));
}

function rememberPendingTonicity(payload: SongPayload, syncId: number, room: string, requestId: string | null) {
  const tonicity = typeof payload.selectedTonicity === "string" ? payload.selectedTonicity.trim() : "";
  if (!tonicity) return;

  const songId = toPositiveSongId(payload.songId) || songIdFromUrl(payload.url || "");
  if (!songId) return;

  try {
    window.sessionStorage.setItem(
      `${PENDING_TONICITY_STORAGE_PREFIX}${songId}`,
      JSON.stringify({
        tonicity,
        syncId,
        room,
        requestId,
        receivedAt: Date.now(),
      }),
    );
  } catch {
    // ignore
  }
}

function applyTonicityNow(tonicity: string | null | undefined) {
  const value = typeof tonicity === "string" ? tonicity.trim() : "";
  if (!value) return;

  const anyWindow = window as any;
  anyWindow.__repSelectedTonicity = value;
  if (typeof anyWindow.__repSetSelectedTonicity === "function") {
    anyWindow.__repSetSelectedTonicity(value);
    return;
  }

  window.dispatchEvent(new CustomEvent("rep:roomsApplyTonicity", { detail: { tonicity: value } }));
}

export { PENDING_TONICITY_STORAGE_PREFIX };

export default function RoomsSongSyncHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SongSyncDetail>).detail;
      const payload = detail?.payload;
      if (!payload || payload.kind !== "song" || !payload.url) return;

      const room = String(detail.room || "").trim();
      const syncId = typeof detail.syncId === "number" ? detail.syncId : Number(detail.syncId || 0);
      const requestId = detail.requestId ? String(detail.requestId) : null;
      if (hasHandledSync(room, syncId, requestId)) return;

      const targetUrl = relativeUrl(payload.url);
      const targetSongId = toPositiveSongId(payload.songId) || songIdFromUrl(targetUrl);
      const activeSongId = currentSongId();

      rememberPendingTonicity(payload, syncId, room, requestId);
      markHandledSync(room, syncId, requestId);
      notifySyncReceived(room, syncId, requestId);

      if (targetSongId && activeSongId && targetSongId === activeSongId) {
        applyTonicityNow(payload.selectedTonicity);
        return;
      }

      window.location.assign(targetUrl);
    };

    window.addEventListener("rep_song_sync", handler as EventListener);
    return () => window.removeEventListener("rep_song_sync", handler as EventListener);
  }, []);

  return null;
}
