// apps/web/app/components/RoomsProvider.tsx
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  sendSongToRoom: (payload: SongSyncPayload) => boolean;
  presence: PresenceCounts | null;
};

const RoomsContext = createContext<RoomsContextType | null>(null);

const DEVICE_ID_KEY = "repertorio_device_id";
const TAB_ID_KEY = "repertorio_tab_id";
const ROOM_STORAGE_KEY = "repertorio_current_room";
const ROOM_PASSWORD_STORAGE_KEY = "repertorio_current_room_pwd";
const LEGACY_ROOM_STORAGE_KEY = "rep_current_room";
const ROOM_CHANGED_EVENT = "repertorio_current_room_changed";
const LEGACY_ROOM_CHANGED_EVENT = "rep_rooms_room_changed";
const LAST_SYNC_STORAGE_PREFIX = "rep_last_song_sync::";
const LAST_SYNC_REQUEST_STORAGE_PREFIX = "rep_last_song_sync_request::";

export const PRESENCE_COUNTS_EVENT = "rep_presence_counts";

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-device";
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim() !== "") return existing;

  const generated = `dev_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, generated);
  } catch {
    // best effort
  }
  return generated;
}

function getOrCreateTabId(): string {
  if (typeof window === "undefined") return "server-tab";

  try {
    const existing = window.sessionStorage.getItem(TAB_ID_KEY);
    if (existing && existing.trim() !== "") return existing;

    const generated = `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    window.sessionStorage.setItem(TAB_ID_KEY, generated);
    return generated;
  } catch {
    return `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

function getClientIds() {
  const deviceId = getOrCreateDeviceId();
  const tabId = getOrCreateTabId();
  return {
    deviceId,
    tabId,
    clientId: `${deviceId}:${tabId}`,
  };
}

function getSenderUrl(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.href;
}

function getWsUrl(): string | null {
  if (typeof window === "undefined") return null;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/rooms-api/ws`;
}

function toRelativeSongUrl(input: string): string {
  const value = (input ?? "").trim();
  if (!value) return value;
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.replace(/^https?:\/\/[^/]+/i, "");
  }
}

function readStoredRoom(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const canonical = window.localStorage.getItem(ROOM_STORAGE_KEY);
    if (canonical && canonical.trim() !== "") return canonical.trim();

    const legacy = window.localStorage.getItem(LEGACY_ROOM_STORAGE_KEY);
    if (legacy && legacy.trim() !== "") return legacy.trim();
  } catch {
    // ignore
  }

  return null;
}

function readStoredRoomPassword(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ROOM_PASSWORD_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveStoredRoom(room: string | null) {
  if (typeof window === "undefined") return;

  const clean = room && room.trim() !== "" ? room.trim() : null;
  try {
    if (clean) {
      window.localStorage.setItem(ROOM_STORAGE_KEY, clean);
      window.localStorage.setItem(LEGACY_ROOM_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(ROOM_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_ROOM_STORAGE_KEY);
      window.localStorage.removeItem(ROOM_PASSWORD_STORAGE_KEY);
    }
  } catch {
    // ignore
  }

  for (const eventName of [ROOM_CHANGED_EVENT, LEGACY_ROOM_CHANGED_EVENT]) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: { room: clean } }));
  }
}

function normalizePresenceCounts(input: any): PresenceCounts {
  const uniqueUsers = Number(input?.uniqueUsers ?? input?.onlineUsers ?? 0);
  const sessions = Number(input?.sessions ?? input?.connections ?? input?.userCount ?? 0);

  return {
    uniqueUsers: Number.isFinite(uniqueUsers) && uniqueUsers >= 0 ? uniqueUsers : 0,
    sessions: Number.isFinite(sessions) && sessions >= 0 ? sessions : 0,
  };
}

function readLastHandledSyncId(room: string): number {
  if (typeof window === "undefined") return 0;
  let max = 0;
  try {
    const raw = window.sessionStorage.getItem(`${LAST_SYNC_STORAGE_PREFIX}${room}`);
    const value = Number(raw || 0);
    if (Number.isFinite(value) && value > 0) max = Math.max(max, value);
  } catch {
    // ignore
  }
  try {
    const raw = window.localStorage.getItem(`${LAST_SYNC_STORAGE_PREFIX}${room}`);
    const value = Number(raw || 0);
    if (Number.isFinite(value) && value > 0) max = Math.max(max, value);
  } catch {
    // ignore
  }
  return max;
}

function readLastHandledRequestId(room: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(`${LAST_SYNC_REQUEST_STORAGE_PREFIX}${room}`);
    if (value && value.trim() !== "") return value;
  } catch {
    // ignore
  }
  try {
    const value = window.localStorage.getItem(`${LAST_SYNC_REQUEST_STORAGE_PREFIX}${room}`);
    return value && value.trim() !== "" ? value : null;
  } catch {
    return null;
  }
}

function markHandledSync(room: string, syncId: number, requestId: string | null) {
  if (typeof window === "undefined") return;
  if (!room) return;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      if (syncId > 0) storage.setItem(`${LAST_SYNC_STORAGE_PREFIX}${room}`, String(syncId));
      if (requestId) storage.setItem(`${LAST_SYNC_REQUEST_STORAGE_PREFIX}${room}`, requestId);
    } catch {
      // best effort
    }
  }
}

export function RoomsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const clientIdRef = useRef<string | null>(null);
  const pendingJoinKeyRef = useRef<string | null>(null);
  const joinedRoomRef = useRef<string | null>(null);
  const seenIncomingSyncRef = useRef<Set<string>>(new Set());
  const syncSequenceRef = useRef(0);

  const [wsConnected, setWsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceCounts | null>(null);

  const getUserMeta = useCallback(() => {
    const anySession: any = session as any;
    const user = anySession?.user || null;
    return {
      userId: user?.id ?? null,
      username: user?.displayName || user?.name || user?.email || null,
    };
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentRoom && currentRoom.trim() !== "") return;

    const stored = readStoredRoom();
    if (stored) setCurrentRoom(stored);
  }, [currentRoom]);

  const sendHello = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const ids = getClientIds();
    const meta = getUserMeta();
    clientIdRef.current = ids.clientId;

    try {
      ws.send(JSON.stringify({
        type: "hello",
        clientId: ids.clientId,
        deviceId: ids.deviceId,
        tabId: ids.tabId,
        userId: meta.userId,
        username: meta.username,
        senderUrl: getSenderUrl(),
      }));
    } catch {
      // ignore
    }
  }, [getUserMeta]);

  const sendJoin = useCallback(
    (room: string, password: string) => {
      const ws = wsRef.current;
      const cleanRoom = room.trim();
      if (!cleanRoom || !ws || ws.readyState !== WebSocket.OPEN) return;

      const joinKey = `${cleanRoom}\n${password || ""}`;
      if (pendingJoinKeyRef.current === joinKey) return;
      if (joinedRoomRef.current === cleanRoom && pendingJoinKeyRef.current === null) return;

      const ids = getClientIds();
      const meta = getUserMeta();
      const lastSeenSyncId = readLastHandledSyncId(cleanRoom);
      const lastSeenRequestId = readLastHandledRequestId(cleanRoom);
      clientIdRef.current = ids.clientId;
      pendingJoinKeyRef.current = joinKey;
      if (lastSeenSyncId > 0 || lastSeenRequestId) {
        markHandledSync(cleanRoom, lastSeenSyncId, lastSeenRequestId);
      }

      try {
        ws.send(JSON.stringify({
          type: "join_room",
          room: cleanRoom,
          password,
          clientId: ids.clientId,
          deviceId: ids.deviceId,
          tabId: ids.tabId,
          userId: meta.userId,
          username: meta.username,
          senderUrl: getSenderUrl(),
          lastSeenSyncId,
          lastSeenRequestId,
        }));
      } catch {
        pendingJoinKeyRef.current = null;
      }
    },
    [getUserMeta],
  );

  const sendLeave = useCallback(() => {
    const ws = wsRef.current;
    const room = joinedRoomRef.current || currentRoom;

    pendingJoinKeyRef.current = null;
    joinedRoomRef.current = null;
    setPresence(null);

    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: "leave_room", room }));
    } catch {
      // ignore
    }
  }, [currentRoom]);

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
    if (!mountedRef.current || intentionalCloseRef.current) return;
    if (reconnectRef.current !== null) return;

    reconnectRef.current = window.setTimeout(() => {
      reconnectRef.current = null;
      if (!mountedRef.current || intentionalCloseRef.current) return;

      const current = wsRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      connectWs();
    }, 5000);
  }, []);

  const connectWs = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!mountedRef.current) return;

    const current = wsRef.current;
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWsUrl();
    if (!wsUrl) return;

    intentionalCloseRef.current = false;
    pendingJoinKeyRef.current = null;
    joinedRoomRef.current = null;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;

      setWsConnected(true);
      startHeartbeat();
      sendHello();

      const room = (currentRoom || readStoredRoom() || "").trim();
      if (room) sendJoin(room, readStoredRoomPassword());
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || typeof data !== "object") return;

        const type = (data as any).type || (data as any).action;

        if (type === "welcome" || type === "hello_ack" || type === "pong") {
          if (type === "hello_ack" && typeof (data as any).clientId === "string") {
            clientIdRef.current = (data as any).clientId;
          }
          return;
        }

        if (type === "presence_counts" || type === "presence") {
          const counts = normalizePresenceCounts(data);
          setPresence(counts);
          window.dispatchEvent(new CustomEvent(PRESENCE_COUNTS_EVENT, { detail: counts }));
          return;
        }

        if (type === "join_accepted") {
          const room = String((data as any).room || "").trim();
          if (room) {
            joinedRoomRef.current = room;
            pendingJoinKeyRef.current = null;
          }
          if (typeof (data as any).clientId === "string") clientIdRef.current = (data as any).clientId;
          setPresence(normalizePresenceCounts(data));
          return;
        }

        if (type === "join_denied") {
          pendingJoinKeyRef.current = null;
          joinedRoomRef.current = null;
          console.warn("[RoomsProvider] join_denied:", (data as any).reason || "unknown reason");
          return;
        }

        if (type === "leave_accepted") {
          pendingJoinKeyRef.current = null;
          joinedRoomRef.current = null;
          setPresence(null);
          return;
        }

        if (type === "update_count") {
          const detail = {
            room: (data as any).room,
            userCount: (data as any).userCount,
            uniqueUsers: (data as any).uniqueUsers,
            sessions: (data as any).sessions,
          };
          window.dispatchEvent(new CustomEvent("rep_rooms_update_count", { detail }));
          return;
        }
        if (type === "song_sync_received_ack") {
          return;
        }

        if (type === "song_sync_ack") {
          window.dispatchEvent(new CustomEvent("rep_song_sync_ack", { detail: data }));
          return;
        }

        if (type === "song_sync") {
          const senderClientId = String((data as any).senderClientId || "");
          if (senderClientId && clientIdRef.current && senderClientId === clientIdRef.current) return;

          const room = String((data as any).room || currentRoom || "").trim();
          const syncId = Number((data as any).syncId || 0);
          const requestId = String((data as any).requestId || "");
          const memoryKey = requestId || `${room}:${syncId}`;
          if (memoryKey && seenIncomingSyncRef.current.has(memoryKey)) return;
          if (memoryKey) seenIncomingSyncRef.current.add(memoryKey);

          const rawPayload = (data as any).payload || {};
          const normalizedPayload = {
            ...rawPayload,
            url: rawPayload?.url != null ? toRelativeSongUrl(String(rawPayload.url)) : rawPayload?.url,
          };

          window.dispatchEvent(new CustomEvent("rep_song_sync", {
            detail: {
              room,
              syncId,
              requestId: requestId || null,
              senderClientId: senderClientId || null,
              senderName: (data as any).senderName || null,
              payload: normalizedPayload,
            },
          }));
        }
      } catch (err) {
        console.error("[RoomsProvider] onmessage error:", err);
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) wsRef.current = null;

      pendingJoinKeyRef.current = null;
      joinedRoomRef.current = null;

      if (mountedRef.current) {
        setWsConnected(false);
        setPresence(null);
      }

      stopHeartbeat();
      if (!event.wasClean) scheduleReconnect();
      else scheduleReconnect();
    };

    ws.onerror = (event) => {
      if (!mountedRef.current || intentionalCloseRef.current) return;
      console.error("[RoomsProvider] WebSocket error:", event);
    };
  }, [currentRoom, scheduleReconnect, sendHello, sendJoin, startHeartbeat, stopHeartbeat]);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onReceived = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const room = String(detail.room || joinedRoomRef.current || currentRoom || "").trim();
      if (!room) return;

      const syncId = Number(detail.syncId || 0);
      const requestId = detail.requestId ? String(detail.requestId) : null;
      markHandledSync(room, syncId, requestId);

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const ids = getClientIds();
      const meta = getUserMeta();
      try {
        ws.send(JSON.stringify({
          type: "song_sync_received",
          room,
          syncId,
          requestId,
          clientId: ids.clientId,
          deviceId: ids.deviceId,
          tabId: ids.tabId,
          userId: meta.userId,
          username: meta.username,
        }));
      } catch {
        // best effort
      }
    };

    window.addEventListener("rep_song_sync_received", onReceived as EventListener);
    return () => window.removeEventListener("rep_song_sync_received", onReceived as EventListener);
  }, [currentRoom, getUserMeta]);



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

  useEffect(() => {
    if (!wsConnected) return;
    sendHello();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, session]);

  useEffect(() => {
    if (!wsConnected) return;
    const room = (currentRoom || "").trim();
    if (room) sendJoin(room, readStoredRoomPassword());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, currentRoom]);

  const switchRoom = useCallback(
    (room: string | null, password: string = "") => {
      if (!room || room.trim() === "") {
        sendLeave();
        setCurrentRoom(null);
        saveStoredRoom(null);
        return;
      }

      const clean = room.trim();
      setCurrentRoom(clean);
      saveStoredRoom(clean);
      if (wsConnected) sendJoin(clean, password);
    },
    [sendJoin, sendLeave, wsConnected],
  );

  const sendSongToRoom = useCallback(
    (payload: SongSyncPayload) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert("Το room δεν είναι συνδεδεμένο ακόμη. Δοκίμασε ξανά σε λίγο.");
        return false;
      }

      const room = (currentRoom || "").trim();
      if (!room) {
        alert("Δεν είσαι συνδεδεμένος σε κανένα room.");
        return false;
      }

      const ids = getClientIds();
      clientIdRef.current = ids.clientId;
      syncSequenceRef.current = (syncSequenceRef.current + 1) % 1000;
      const syncId = Date.now() * 1000 + syncSequenceRef.current;
      const requestId = `${ids.clientId}:${syncId}`;

      const msg = {
        type: "song_sync",
        room,
        syncId,
        requestId,
        senderClientId: ids.clientId,
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
        markHandledSync(room, syncId, requestId);
        return true;
      } catch (err) {
        console.error("[RoomsProvider] song_sync send error:", err);
        alert("Προέκυψε σφάλμα κατά την αποστολή στο room.");
        return false;
      }
    },
    [currentRoom],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const anyWindow = window as any;

    anyWindow.RepRoomsSwitchRoom = (room: string | null, password = "") => {
      switchRoom(room, password);
    };

    anyWindow.RepRoomsSendSong = (
      url: string,
      title?: string | null,
      songId?: number | null,
      selectedTonicity?: string | null,
    ) => {
      const cleanUrl = toRelativeSongUrl(url);
      if (!cleanUrl) return false;

      return sendSongToRoom({
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
