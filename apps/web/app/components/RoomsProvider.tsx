// apps/web/app/components/RoomsProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";

type SongSyncPayload = {
  /**
   * Προαιρετικό – ID τραγουδιού, αν το ξέρουμε (στο νέο Next.js song page).
   * Για παλιές σελίδες (μόνο URL) μπορεί να μείνει null/undefined.
   */
  songId?: number | null;

  /**
   * Προαιρετικός τίτλος. Αν δεν υπάρχει, μπορεί να είναι null.
   */
  title?: string | null;

  /**
   * ΥΠΟΧΡΕΩΤΙΚΟ – το πλήρες URL της σελίδας του τραγουδιού
   * (αντίστοιχο του window.location.href στο παλιό sync.js).
   */
  url: string;

  /**
   * Προαιρετική τονικότητα (selected_tonicity από το παλιό σύστημα).
   * Αν δεν την χρησιμοποιείς ακόμα στο νέο site, άφησέ την undefined/null.
   */
  selectedTonicity?: string | null;
};

type RoomsContextType = {
  currentRoom: string | null;
  switchRoom: (room: string | null, password?: string) => void;
  sendSongToRoom: (payload: SongSyncPayload) => void;
};

const RoomsContext = createContext<RoomsContextType | null>(null);

const DEVICE_ID_KEY = "repertorio_device_id";

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

function getSenderUrl(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.href;
}

// WebSocket URL (Nginx: /rooms-api/ws → rooms server)
function getWsUrl(): string | null {
  if (typeof window === "undefined") return null;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;

  // Αν θέλεις, μπορείς να χρησιμοποιήσεις και:
  // const envUrl = process.env.NEXT_PUBLIC_ROOMS_WS_URL;
  // if (envUrl) return envUrl;

  return `${protocol}://${host}/rooms-api/ws`;
}

export function RoomsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  const getUserMeta = () => {
    const anySession: any = session as any;
    const user = anySession?.user || null;
    return {
      userId: user?.id ?? null,
      username: user?.displayName || user?.name || user?.email || null,
    };
  };

  const wsRef = useRef<WebSocket | null>(null);
  // Χρησιμοποιούμε καθαρά numbers για timers (browser)
  const reconnectRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  const [wsConnected, setWsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [lastSyncId, setLastSyncId] = useState<number>(0);
  const [ignoreSyncUntil, setIgnoreSyncUntil] = useState<number>(0);

  // Restore previously selected room from localStorage on first mount,
  // so that the user stays connected to the same room across all pages
  // (όπως στο παλιό WordPress sync.js).
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Αν έχουμε ήδη room στη μνήμη, δεν κάνουμε override
    if (currentRoom && currentRoom.trim() !== "") {
      return;
    }

    try {
      const stored = window.localStorage.getItem("rep_current_room");
      if (stored && stored.trim() !== "") {
        setCurrentRoom(stored.trim());
      }
    } catch {
      // ignore
    }
  }, [currentRoom]);

  // Αποθήκευση room σε localStorage + event
  const saveRoom = (room: string | null) => {
    if (typeof window === "undefined") return;

    if (room && room.trim() !== "") {
      window.localStorage.setItem("rep_current_room", room.trim());
    } else {
      window.localStorage.removeItem("rep_current_room");
    }

    // Custom event για όποιο script θέλει να ενημερωθεί ότι άλλαξε το room
    const evt = new CustomEvent("rep_rooms_room_changed", {
      detail: { room },
    });
    window.dispatchEvent(evt);
  };

  // Αποστολή join στον WebSocket (με device_id / user_id / username)
  const sendJoin = (room: string, password: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const deviceId = getOrCreateDeviceId();
    const meta = getUserMeta();

    const msg = {
      type: "join_room",
      room,
      password,
      deviceId,
      userId: meta.userId,
      username: meta.username,
      senderUrl: getSenderUrl(),
    };

    wsRef.current.send(JSON.stringify(msg));
  };

  const sendLeave = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "leave_room" }));
  };

  // Heartbeat προς server
  const startHeartbeat = () => {
    if (typeof window === "undefined") return;
    if (heartbeatRef.current !== null) return;

    const id = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      try {
        ws.send(JSON.stringify({ type: "ping" }));
      } catch {
        // ignore
      }
    }, 15000);

    heartbeatRef.current = id;
  };

  const stopHeartbeat = () => {
    if (typeof window === "undefined") return;
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const scheduleReconnect = () => {
    if (typeof window === "undefined") return;
    if (reconnectRef.current !== null) return;

    const id = window.setTimeout(() => {
      reconnectRef.current = null;
      connectWs();
    }, 5000);

    reconnectRef.current = id;
  };

  // Βασική σύνδεση WebSocket
  const connectWs = () => {
    if (typeof window === "undefined") return;

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

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[RoomsProvider] WebSocket open");
      setWsConnected(true);
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || typeof data !== "object") return;

        const t = (data as any).type || (data as any).action;

        if (t === "welcome") {
          return;
        }

        if (t === "join_accepted") {
          console.log(
            "[RoomsProvider] join_accepted:",
            (data as any).room,
            "users:",
            (data as any).userCount
          );
          return;
        }

        if (t === "join_denied") {
          console.warn(
            "[RoomsProvider] join_denied:",
            (data as any).reason || "unknown reason"
          );
          return;
        }

        if (t === "update_count") {
          // Ενημέρωση DOM / custom event για UI (όπως στο παλιό sync.js)
          if (typeof window !== "undefined") {
            const evt = new CustomEvent("rep_rooms_update_count", {
              detail: {
                room: (data as any).room,
                userCount: (data as any).userCount,
              },
            });
            window.dispatchEvent(evt);
          }
          return;
        }

        if (t === "song_sync") {
          const syncId = Number((data as any).syncId ?? 0);
          setLastSyncId(syncId);

          // Αν πρέπει να αγνοήσουμε sync μέχρι κάποιο timestamp
          const now = Date.now();
          if (ignoreSyncUntil && now < ignoreSyncUntil) {
            return;
          }

          // Dispatch custom event στο window, ώστε ο score-player / JS να το πιάσει
          if (typeof window !== "undefined") {
            const evt = new CustomEvent("rep_song_sync", {
              detail: {
                room: (data as any).room,
                syncId,
                payload: (data as any).payload,
              },
            });
            window.dispatchEvent(evt);
          }
          return;
        }

        if (t === "pong") {
          return;
        }
      } catch (err) {
        console.error("[RoomsProvider] onmessage error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[RoomsProvider] WebSocket closed");
      setWsConnected(false);
      stopHeartbeat();
      scheduleReconnect();
    };

    ws.onerror = (event) => {
      console.error("[RoomsProvider] WebSocket error:", event);
    };
  };

  useEffect(() => {
    connectWs();

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      stopHeartbeat();
      if (typeof window !== "undefined" && reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Όταν αλλάξει wsConnected ή currentRoom → κάνε join
  useEffect(() => {
    if (!wsConnected || !currentRoom) return;
    sendJoin(currentRoom, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, currentRoom]);

  // Public API: switchRoom
  const switchRoom = (room: string | null, password: string = "") => {
    if (!room || room.trim() === "") {
      sendLeave();
      setCurrentRoom(null);
      saveRoom(null);
      return;
    }

    const clean = room.trim();
    setCurrentRoom(clean);
    saveRoom(clean);

    // Αν το WebSocket είναι ήδη συνδεδεμένο, στείλε αμέσως join
    if (wsConnected) {
      sendJoin(clean, password);
    }
  };

  // Public API: sendSongToRoom – χρησιμοποιεί το πρωτόκολλο song_sync
  const sendSongToRoom = (payload: SongSyncPayload) => {
    const ws = wsRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(
        "[RoomsProvider] Cannot send song_sync – WebSocket not open",
        { readyState: ws?.readyState }
      );
      return;
    }

    if (!currentRoom || !currentRoom.trim()) {
      console.warn(
        "[RoomsProvider] Cannot send song_sync – no active room selected"
      );
      alert("Δεν είσαι συνδεδεμένος σε κανένα room.");
      return;
    }

    const room = currentRoom.trim();

    // Χρησιμοποιούμε Date.now() σαν syncId (όπως ο νέος ws-handler)
    const syncId = Date.now();

    const msg = {
      type: "song_sync",
      room, // συμβατό με ws-handler.js (type === "song_sync")
      syncId, // θα αποθηκευτεί από τον RoomManager ως τελευταίο sync
      payload: {
        kind: "song",
        songId: payload.songId ?? null,
        title: payload.title ?? null,
        url: payload.url,
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
  };

  // GLOBAL EXPOSE – για RoomsClient / WordPress / άλλα scripts
  useEffect(() => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;

    // Επιλογή/αλλαγή room από εξωτερικό JS
    anyWindow.RepRoomsSwitchRoom = (room: string | null, password = "") =>
      switchRoom(room, password);

    /**
     * Αποστολή τρέχοντος τραγουδιού στο room.
     *
     * Παράδειγμα χρήσης:
     *   window.RepRoomsSendSong(window.location.href);
     *   window.RepRoomsSendSong(window.location.href, "Τα ματόκλαδά σου λάμπουν", 294, "Ρε-");
     */
    anyWindow.RepRoomsSendSong = (
      url: string,
      title?: string | null,
      songId?: number | null,
      selectedTonicity?: string | null
    ) => {
      if (!url) {
        console.warn("[RoomsProvider] RepRoomsSendSong called without url");
        return;
      }

      sendSongToRoom({
        url,
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

  const value: RoomsContextType = {
    currentRoom,
    switchRoom,
    sendSongToRoom,
  };

  return (
    <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>
  );
}

export function useRooms(): RoomsContextType {
  const ctx = useContext(RoomsContext);
  if (!ctx) {
    throw new Error("useRooms must be used within a RoomsProvider");
  }
  return ctx;
}
