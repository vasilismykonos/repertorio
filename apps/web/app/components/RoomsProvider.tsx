// apps/web/app/components/RoomsProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useSession } from "next-auth/react";

type SongSyncPayload = {
  songId?: number | null;
  title?: string | null;
  url: string;
  selectedTonicity?: string | null;
};

type PresenceCounts = {
  uniqueUsers: number;
  sessions: number;
};

type RoomsContextType = {
  currentRoom: string | null;
  switchRoom: (room: string | null, password?: string) => void;
  sendSongToRoom: (payload: SongSyncPayload) => void;

  // ✅ NEW: presence from WS (push)
  presence: PresenceCounts | null;
};

const RoomsContext = createContext<RoomsContextType | null>(null);

const DEVICE_ID_KEY = "repertorio_device_id";
const TAB_ID_KEY = "repertorio_tab_id";

// ✅ MUST MATCH SideMenu.tsx listener
export const PRESENCE_COUNTS_EVENT = "rep_presence_counts";

// ✅ keep existing semantics
const ROOM_STORAGE_KEY = "rep_current_room";
const ROOM_CHANGED_EVENT = "rep_rooms_room_changed";

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-device";
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim() !== "") return existing;

  const generated = `dev_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, generated);
  } catch {
    // ignore
  }
  return generated;
}

/**
 * ✅ Tab-scoped id (so multiple tabs don't collapse into one session)
 * sessionStorage survives reloads in same tab, resets for new tab.
 */
function getOrCreateTabId(): string {
  if (typeof window === "undefined") return "server-tab";

  try {
    const existing = window.sessionStorage.getItem(TAB_ID_KEY);
    if (existing && existing.trim() !== "") return existing;

    const gen = `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    window.sessionStorage.setItem(TAB_ID_KEY, gen);
    return gen;
  } catch {
    // fallback: stable-ish per load
    return `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

function getSenderUrl(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.href;
}

// WebSocket URL (Nginx: /rooms-api/ws → rooms server)
function getWsUrl(): string | null {
  if (typeof window === "undefined") return null;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;

  return `${protocol}://${host}/rooms-api/ws`;
}

/**
 * Θέλουμε να εμφανίζεται/στέλνεται σαν "/songs/2305" αντί για
 * "https://dev.repertorio.net/songs/2305"
 */
function toRelativeSongUrl(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return s;

  // ήδη relative
  if (s.startsWith("/")) return s;

  // αν είναι absolute, πάρε pathname+query+hash
  try {
    const u = new URL(s);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    // fallback: κόψε "http(s)://host"
    return s.replace(/^https?:\/\/[^/]+/i, "");
  }
}

function normalizePresenceCounts(input: any): PresenceCounts {
  const uniqueUsers = Number(input?.uniqueUsers ?? input?.onlineUsers ?? 0);
  const sessions = Number(input?.sessions ?? input?.connections ?? 0);

  return {
    uniqueUsers: Number.isFinite(uniqueUsers) && uniqueUsers >= 0 ? uniqueUsers : 0,
    sessions: Number.isFinite(sessions) && sessions >= 0 ? sessions : 0,
  };
}

export function RoomsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  const getUserMeta = useCallback(() => {
    const anySession: any = session as any;
    const user = anySession?.user || null;
    return {
      userId: user?.id ?? null,
      username: user?.displayName || user?.name || user?.email || null,
    };
  }, [session]);

  const wsRef = useRef<WebSocket | null>(null);

  // timers
  const reconnectRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  // lifecycle flags
  const mountedRef = useRef<boolean>(false);
  const intentionalCloseRef = useRef<boolean>(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  const [lastSyncId, setLastSyncId] = useState<number>(0);
  const [ignoreSyncUntil, setIgnoreSyncUntil] = useState<number>(0);

  // ✅ NEW: presence state (push from WS)
  const [presence, setPresence] = useState<PresenceCounts | null>(null);

  // Restore room from localStorage on first mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentRoom && currentRoom.trim() !== "") return;

    try {
      const stored = window.localStorage.getItem(ROOM_STORAGE_KEY);
      if (stored && stored.trim() !== "") setCurrentRoom(stored.trim());
    } catch {
      // ignore
    }
  }, [currentRoom]);

  const saveRoom = useCallback((room: string | null) => {
    if (typeof window === "undefined") return;

    if (room && room.trim() !== "") {
      window.localStorage.setItem(ROOM_STORAGE_KEY, room.trim());
    } else {
      window.localStorage.removeItem(ROOM_STORAGE_KEY);
    }

    const evt = new CustomEvent(ROOM_CHANGED_EVENT, { detail: { room } });
    window.dispatchEvent(evt);
  }, []);

  const sendHello = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const deviceId = getOrCreateDeviceId();
    const tabId = getOrCreateTabId();
    const meta = getUserMeta();

    try {
      ws.send(
        JSON.stringify({
          type: "hello",
          deviceId,
          tabId,
          userId: meta.userId,
          username: meta.username,
          senderUrl: getSenderUrl(),
        }),
      );
    } catch {
      // ignore
    }
  }, [getUserMeta]);

  const sendJoin = useCallback(
    (room: string, password: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const deviceId = getOrCreateDeviceId();
      const tabId = getOrCreateTabId();
      const meta = getUserMeta();

      ws.send(
        JSON.stringify({
          type: "join_room",
          room,
          password,
          deviceId,
          tabId,
          userId: meta.userId,
          username: meta.username,
          senderUrl: getSenderUrl(),
        }),
      );
    },
    [getUserMeta],
  );

  const sendLeave = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "leave_room" }));
  }, []);

  const startHeartbeat = useCallback(() => {
    if (typeof window === "undefined") return;
    if (heartbeatRef.current !== null) return;

    heartbeatRef.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: "ping" }));
      } catch {
        // ignore
      }
    }, 15000);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (typeof window === "undefined") return;
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const clearReconnect = useCallback(() => {
    if (typeof window === "undefined") return;
    if (reconnectRef.current !== null) {
      window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!mountedRef.current) return;
    if (intentionalCloseRef.current) return;
    if (reconnectRef.current !== null) return;

    reconnectRef.current = window.setTimeout(() => {
      reconnectRef.current = null;
      if (!mountedRef.current) return;
      if (intentionalCloseRef.current) return;

      // ✅ αν στο μεταξύ άνοιξε socket, μην ξανανοίξεις
      const cur = wsRef.current;
      if (cur && (cur.readyState === WebSocket.OPEN || cur.readyState === WebSocket.CONNECTING)) {
        return;
      }

      connectWs();
    }, 5000);
  }, []);

  const connectWs = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!mountedRef.current) return;

    // ✅ single socket guard
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const wsUrl = getWsUrl();
    if (!wsUrl) return;

    console.log("[RoomsProvider] connecting to", wsUrl);

    // νέο connect attempt => δεν είναι “intentional close”
    intentionalCloseRef.current = false;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;

      console.log("[RoomsProvider] WebSocket open");
      setWsConnected(true);
      startHeartbeat();

      // ✅ NEW: identify presence immediately
      sendHello();

      // ✅ if we already have a room stored, join without needing another render
      const room = (currentRoom ?? "").trim();
      if (room) {
        sendJoin(room, "");
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || typeof data !== "object") return;

        const t = (data as any).type || (data as any).action;

        if (t === "welcome") return;

        // ✅ NEW: presence counts pushed by server
        if (t === "presence_counts" || t === "presence") {
          const counts = normalizePresenceCounts(data);
          setPresence(counts);

          const evt = new CustomEvent(PRESENCE_COUNTS_EVENT, { detail: counts });
          window.dispatchEvent(evt);
          return;
        }

        if (t === "join_accepted") {
          console.log(
            "[RoomsProvider] join_accepted:",
            (data as any).room,
            "users:",
            (data as any).userCount,
          );
          return;
        }

        if (t === "join_denied") {
          console.warn("[RoomsProvider] join_denied:", (data as any).reason || "unknown reason");
          return;
        }

        if (t === "update_count") {
          const evt = new CustomEvent("rep_rooms_update_count", {
            detail: {
              room: (data as any).room,
              userCount: (data as any).userCount,
            },
          });
          window.dispatchEvent(evt);
          return;
        }

        if (t === "song_sync") {
          const syncId = Number((data as any).syncId ?? 0);
          setLastSyncId(syncId);

          const now = Date.now();
          if (ignoreSyncUntil && now < ignoreSyncUntil) return;

          const rawPayload = (data as any).payload || {};
          const normalizedPayload = {
            ...rawPayload,
            url:
              rawPayload?.url != null
                ? toRelativeSongUrl(String(rawPayload.url))
                : rawPayload?.url,
          };

          const evt = new CustomEvent("rep_song_sync", {
            detail: {
              room: (data as any).room,
              syncId,
              payload: normalizedPayload,
            },
          });
          window.dispatchEvent(evt);
          return;
        }

        if (t === "pong") return;
      } catch (err) {
        console.error("[RoomsProvider] onmessage error:", err);
      }
    };

    ws.onclose = (e) => {
      console.log("[RoomsProvider] WebSocket closed", {
        code: e.code,
        reason: e.reason,
        wasClean: e.wasClean,
      });

      // ✅ clear ref if this is the active socket
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      if (mountedRef.current) {
        setWsConnected(false);
        // presence becomes unknown until reconnect
        setPresence(null);
      }

      stopHeartbeat();
      scheduleReconnect();
    };

    ws.onerror = (event) => {
      if (!mountedRef.current) return;
      if (intentionalCloseRef.current) return;
      console.error("[RoomsProvider] WebSocket error:", event);
    };
  }, [
    currentRoom,
    ignoreSyncUntil,
    scheduleReconnect,
    sendHello,
    sendJoin,
    startHeartbeat,
    stopHeartbeat,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    connectWs();

    return () => {
      mountedRef.current = false;

      clearReconnect();
      intentionalCloseRef.current = true;

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }

      stopHeartbeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ✅ If auth session changes while socket is open, re-send hello so the server can
   * upgrade anonymous -> authenticated (no reconnect needed).
   */
  useEffect(() => {
    if (!wsConnected) return;
    sendHello();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, session]);

  /**
   * ✅ If currentRoom changes while connected, join (or leave via switchRoom)
   * Note: we also try joining immediately in onopen to avoid waiting render.
   */
  useEffect(() => {
    if (!wsConnected) return;
    const room = (currentRoom ?? "").trim();
    if (!room) return;
    sendJoin(room, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, currentRoom]);

  const switchRoom = useCallback(
    (room: string | null, password: string = "") => {
      if (!room || room.trim() === "") {
        sendLeave();
        setCurrentRoom(null);
        saveRoom(null);
        return;
      }

      const clean = room.trim();
      setCurrentRoom(clean);
      saveRoom(clean);

      if (wsConnected) sendJoin(clean, password);
    },
    [saveRoom, sendJoin, sendLeave, wsConnected],
  );

  const sendSongToRoom = useCallback(
    (payload: SongSyncPayload) => {
      const ws = wsRef.current;

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("[RoomsProvider] Cannot send song_sync – WebSocket not open", {
          readyState: ws?.readyState,
        });
        return;
      }

      if (!currentRoom || !currentRoom.trim()) {
        console.warn("[RoomsProvider] Cannot send song_sync – no active room selected");
        alert("Δεν είσαι συνδεδεμένος σε κανένα room.");
        return;
      }

      const room = currentRoom.trim();
      const syncId = Date.now();

      const msg = {
        type: "song_sync",
        room,
        syncId,
        payload: {
          kind: "song",
          songId: payload.songId ?? null,
          title: payload.title ?? null,
          url: toRelativeSongUrl(payload.url),
          selectedTonicity: payload.selectedTonicity ?? null,
          sentAt: Date.now(),
        },
      };

      try {
        ws.send(JSON.stringify(msg));
        console.log("[RoomsProvider] song_sync sent:", msg);
      } catch (err) {
        console.error("[RoomsProvider] song_sync send error:", err);
      }
    },
    [currentRoom],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;

    anyWindow.RepRoomsSwitchRoom = (room: string | null, password = "") =>
      switchRoom(room, password);

    anyWindow.RepRoomsSendSong = (
      url: string,
      title?: string | null,
      songId?: number | null,
      selectedTonicity?: string | null,
    ) => {
      const cleanUrl = toRelativeSongUrl(url);
      if (!cleanUrl) {
        console.warn("[RoomsProvider] RepRoomsSendSong called without url");
        return;
      }

      sendSongToRoom({
        url: cleanUrl,
        title: title ?? null,
        songId: songId ?? null,
        selectedTonicity: selectedTonicity ?? null,
      });
    };

    return () => {
      delete anyWindow.RepRoomsSwitchRoom;
      delete anyWindow.RepRoomsSendSong;
    };
  }, [switchRoom, sendSongToRoom]);

  const value: RoomsContextType = useMemo(
    () => ({
      currentRoom,
      switchRoom,
      sendSongToRoom,
      presence,
    }),
    [currentRoom, switchRoom, sendSongToRoom, presence],
  );

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
}

export function useRooms(): RoomsContextType {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error("useRooms must be used within a RoomsProvider");
  return ctx;
}