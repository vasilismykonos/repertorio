"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type RoomsContextType = {
  wsConnected: boolean;
  currentRoom: string | null;
  switchRoom: (room: string | null, password?: string) => void;
  lastSyncId: number;
  ignoreSyncUntil: number;
};

const RoomsContext = createContext<RoomsContextType | null>(null);

export function useRoomsWS() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error("useRoomsWS must be used inside RoomsProvider");
  return ctx;
}

/**
 * Υπολογίζει το WebSocket URL.
 *
 * ΔΕΝ χρησιμοποιούμε localhost από browser.
 * Πάμε πάντα μέσω Nginx:
 *   wss://app.repertorio.net/rooms-api/ws
 *   ή wss://dev.repertorio.net/rooms-api/ws
 */
function getWsUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host; // app.repertorio.net ή dev.repertorio.net

  // Nginx proxy: /rooms-api/ws -> 127.0.0.1:4455/ws
  return `${protocol}://${host}/rooms-api/ws`;
}

export function RoomsProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const [wsConnected, setWsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [lastSyncId, setLastSyncId] = useState(0);
  const [ignoreSyncUntil, setIgnoreSyncUntil] = useState(0);

  // --------------------------------------------------------------------
  // Φόρτωση room από localStorage στην εκκίνηση
  // --------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("rep_current_room");
    if (stored && stored.trim() !== "") {
      setCurrentRoom(stored.trim());
    }
  }, []);

  // --------------------------------------------------------------------
  // Save σε localStorage + fire event
  // --------------------------------------------------------------------
  const saveRoom = (room: string | null) => {
    if (typeof window === "undefined") return;

    if (room && room.trim() !== "") {
      window.localStorage.setItem("rep_current_room", room.trim());
    } else {
      window.localStorage.removeItem("rep_current_room");
    }

    const evt = new CustomEvent("rep_current_room_changed", {
      detail: { room: room || null },
    });
    window.dispatchEvent(evt);
  };

  // --------------------------------------------------------------------
  // SWITCH ROOM (join/leave) → στέλνει WS μήνυμα
  // --------------------------------------------------------------------
  const switchRoom = (room: string | null, password = "") => {
    setCurrentRoom(room);
    saveRoom(room);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "join_room",
        room: room,
        password: password,
      })
    );
  };

  // --------------------------------------------------------------------
  // HEARTBEAT
  // --------------------------------------------------------------------
  const startHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    heartbeatRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "ping", ts: Date.now() }));
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  // --------------------------------------------------------------------
  // RECONNECT
  // --------------------------------------------------------------------
  const scheduleReconnect = () => {
    if (reconnectRef.current) return;
    reconnectRef.current = setTimeout(() => {
      reconnectRef.current = null;
      connectWS();
    }, 3000);
  };

  // --------------------------------------------------------------------
  // CONNECT WebSocket
  // --------------------------------------------------------------------
  const connectWS = () => {
    if (typeof window === "undefined") return;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
    }

    const wsUrl = getWsUrl();
    if (!wsUrl) return;

    console.log("[RoomsProvider] connecting to", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[RoomsProvider] WebSocket open");
      setWsConnected(true);

      if (currentRoom) {
        ws.send(
          JSON.stringify({
            type: "join_room",
            room: currentRoom,
          })
        );
      }

      startHeartbeat();
    };

    ws.onclose = () => {
      console.log("[RoomsProvider] WebSocket closed");
      setWsConnected(false);
      stopHeartbeat();
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error("[RoomsProvider] WebSocket error:", err);
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (typeof window !== "undefined") {
          if (data.type === "update_count") {
            const evt = new CustomEvent("rep_update_count", { detail: data });
            window.dispatchEvent(evt);
          }

          if (data.type === "song_sync") {
            if (data.sync_id) {
              setLastSyncId((prev) =>
                data.sync_id > prev ? data.sync_id : prev
              );
            }

            if (data.ignoreUntil) {
              setIgnoreSyncUntil(data.ignoreUntil);
            }

            const evt = new CustomEvent("rep_song_sync", { detail: data });
            window.dispatchEvent(evt);
          }
        }
      } catch (err) {
        console.error("WS parse error", err);
      }
    };
  };

  // --------------------------------------------------------------------
  // MOUNT → start websocket
  // --------------------------------------------------------------------
  useEffect(() => {
    connectWS();
    return () => {
      stopHeartbeat();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------------------
  // GLOBAL EXPOSE (WordPress compatibility)
  // --------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).RepRoomsSwitchRoom = (room: string | null, pwd = "") => {
      switchRoom(room, pwd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RoomsContext.Provider
      value={{
        wsConnected,
        currentRoom,
        switchRoom,
        lastSyncId,
        ignoreSyncUntil,
      }}
    >
      {children}
    </RoomsContext.Provider>
  );
}
