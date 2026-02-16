"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

type RoomUser = {
  device_id?: string;
  user_id?: number;
  username?: string | null;
};

type RoomFromStatus = {
  room: string;
  userCount?: number;
  hasPassword: boolean;
  users?: RoomUser[];
  last_sync_url?: string | null;
  last_sync_timestamp?: number | null;
  last_sync_username?: string | null;
};

type StatusResponse = {
  ok: boolean;
  uptime_sec?: number;
  uptime?: number;
  roomCount?: number;
  totalClients?: number;
  rooms?: RoomFromStatus[];
};

/**
 * Βασικό URL για HTTP κλήσεις προς τον rooms server.
 * (ίδιο ακριβώς με RoomsClient.tsx)
 */
function getRoomsBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    process.env.ROOMS_HTTP_BASE_URL ||
    "/rooms-api";

  return base.replace(/\/+$/, "");
}

function formatMinutesFromSeconds(sec: number | undefined): string {
  if (!sec || !Number.isFinite(sec)) return "-";
  const minutes = sec / 60;
  return `${minutes.toFixed(1)} λεπτά`;
}

function formatTimeFromTimestamp(ts: number | undefined | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RoomsSettingsClient() {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [uptimeSec, setUptimeSec] = useState<number | undefined>(undefined);
  const [roomCount, setRoomCount] = useState<number | undefined>(undefined);
  const [totalClients, setTotalClients] = useState<number | undefined>(
    undefined
  );

  const [rooms, setRooms] = useState<RoomFromStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const base = getRoomsBaseUrl();
      const res = await fetch(`${base}/status`, { cache: "no-store" });

      if (!res.ok) {
        console.error("[RoomsSettings] /status HTTP error:", res.status);
        setServerOnline(false);
        setErrorMessage("Ο WebSocket/Rooms server δεν απάντησε σωστά.");
        return;
      }

      let data: StatusResponse | null = null;
      try {
        data = (await res.json()) as StatusResponse;
      } catch {
        setServerOnline(false);
        setErrorMessage(
          "Ο WebSocket/Rooms server είναι offline ή δεν επιστρέφει JSON."
        );
        return;
      }

      if (!data || !data.ok) {
        setServerOnline(false);
        setErrorMessage("Σφάλμα: ο server δεν επέστρεψε έγκυρα δεδομένα.");
        return;
      }

      setServerOnline(true);

      const uptime =
        typeof data.uptime_sec === "number"
          ? data.uptime_sec
          : typeof data.uptime === "number"
          ? data.uptime
          : undefined;

      setUptimeSec(uptime);

      setRoomCount(
        typeof data.roomCount === "number"
          ? data.roomCount
          : Array.isArray(data.rooms)
          ? data.rooms.length
          : undefined
      );

      setTotalClients(
        typeof data.totalClients === "number" ? data.totalClients : undefined
      );

      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (err: any) {
      console.error("[RoomsSettings] loadStatus error:", err);
      setServerOnline(false);
      setErrorMessage(
        "Αποτυχία επικοινωνίας με τον rooms server: " + (err?.message || "")
      );
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    loadStatus();

    const id = window.setInterval(() => {
      loadStatus();
    }, 10000);

    return () => window.clearInterval(id);
  }, [loadStatus]);

  // ---- ADMIN: manage server ----
  const handleManageServer = async (action: "restart" | "stop" | "start") => {
    const sure = window.confirm(
      `Θες σίγουρα να κάνεις ${action.toUpperCase()} τον rooms server;`
    );
    if (!sure) return;

    try {
      const base = getRoomsBaseUrl();
      const res = await fetch(`${base}/manage-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          key: "RepertorioSecretRestartKey",
        }),
      });

      const data: any = await res.json().catch(() => ({}));
      alert(data?.message || "Ολοκληρώθηκε.");

      setTimeout(() => {
        loadStatus();
      }, 1500);
    } catch (err: any) {
      console.error("[RoomsSettings] handleManageServer error:", err);
      alert(
        "❌ Αποτυχία διαχείρισης server: " + (err?.message || "Άγνωστο σφάλμα.")
      );
    }
  };

  // ---- ADMIN: delete room ----
  const handleDeleteRoom = async (roomName: string) => {
    const sure = window.confirm(
      `Να διαγραφεί οριστικά το room "${roomName}" ;\nΌλοι οι συνδεδεμένοι χρήστες θα αποσυνδεθούν.`
    );
    if (!sure) return;

    try {
      const base = getRoomsBaseUrl();
      const res = await fetch(`${base}/delete-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName }),
      });

      const json: any = await res.json().catch(() => ({}));

      if (!res.ok || !json?.success) {
        alert("❌ Αποτυχία διαγραφής room.");
        return;
      }

      // refresh
      loadStatus();
    } catch (err: any) {
      console.error("[RoomsSettings] handleDeleteRoom error:", err);
      alert("❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα."));
    }
  };

  const filteredRooms = useMemo(() => {
    const filter = searchTerm.trim().toLowerCase();
    if (!filter) return rooms;

    return rooms.filter((r) => {
      const usersArr = Array.isArray(r.users) ? r.users : [];
      const text = [
        r.room,
        ...(usersArr.map((u) => u.username || String(u.user_id || ""))),
        r.last_sync_url || "",
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(filter);
    });
  }, [rooms, searchTerm]);

  return (
    <>
      <ActionBar
        left={<A.backLink href="/rooms" label="Rooms" />}
      />

      <div style={{ maxWidth: 980, margin: "0 auto", padding: 16, color: "#eee" }}>
        <h2 style={{ marginTop: 0 }}>⚙️ Rooms Settings (Admin)</h2>

        {/* Server status */}
        {serverOnline === true && (
          <div id="server-status-card">
            <div className="meta">
              🟢 Server status: <span className="ok">Online</span>
            </div>

            {typeof uptimeSec === "number" && (
              <div className="meta">⏱️ Uptime: {formatMinutesFromSeconds(uptimeSec)}</div>
            )}

            {typeof roomCount === "number" && typeof totalClients === "number" && (
              <div className="meta">
                📊 Δωμάτια: {roomCount} — 👥 Χρήστες: {totalClients}
              </div>
            )}

            <div
              id="server-controls"
              style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              <button
                onClick={() => handleManageServer("start")}
                style={{
                  background: "#27ae60",
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                🟢 Start
              </button>

              <button
                onClick={() => handleManageServer("restart")}
                style={{
                  background: "#f39c12",
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ♻️ Restart
              </button>

              <button
                onClick={() => handleManageServer("stop")}
                style={{
                  background: "#c0392b",
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                🔴 Stop
              </button>

              <button
                onClick={() => loadStatus()}
                style={{
                  background: "#34495e",
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        )}

        {serverOnline === false && (
          <div id="server-status-card">
            <p>
              ❌ Ο WebSocket / Rooms server είναι{" "}
              <strong style={{ color: "#e74c3c" }}>offline</strong>.
            </p>
            {errorMessage && <p style={{ fontSize: 13, color: "#aaa" }}>{errorMessage}</p>}
          </div>
        )}

        {/* Rooms list for admin */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>🗑️ Διαχείριση Rooms</div>

          <input
            type="text"
            placeholder="🔍 Αναζήτηση room/user/url"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: "1 1 320px",
              maxWidth: 520,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#111",
              color: "#eee",
              outline: "none",
            }}
          />
        </div>

        {!initialized && loading && <p style={{ marginTop: 10 }}>🔄 Φόρτωση δεδομένων...</p>}

        {initialized && !loading && filteredRooms.length === 0 && (
          <p style={{ marginTop: 10, color: "#aaa" }}>Δεν υπάρχουν rooms.</p>
        )}

        {filteredRooms.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {filteredRooms.map((r) => {
              const usersArr = Array.isArray(r.users) ? r.users : [];
              const count =
                typeof r.userCount === "number" ? r.userCount : usersArr.length || 0;

              const lastUrl = (r.last_sync_url || "").trim();
              const ts = r.last_sync_timestamp || null;
              const senderName = r.last_sync_username || "Άγνωστος χρήστης";
              const timeSuffix =
                ts != null ? ` (${formatTimeFromTimestamp(ts)} — ${senderName})` : "";

              return (
                <div
                  key={r.room}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "#151515",
                    border: "1px solid #2a2a2a",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800, color: "#fff" }}>
                        {r.hasPassword ? "🔒 " : ""}
                        {r.room}
                      </div>
                      <div style={{ padding: "2px 8px", borderRadius: 999, background: "#222", color: "#eee", fontSize: 13 }}>
                        👥 {count}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteRoom(r.room)}
                      style={{
                        background: "#c0392b",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                      title="Οριστική διαγραφή room"
                    >
                      🗑️ Διαγραφή
                    </button>
                  </div>

                  <div style={{ marginTop: 8, color: "#bbb", fontSize: 13 }}>
                    {lastUrl ? (
                      <>
                        🎵 Τελευταίο:{" "}
                        <a href={lastUrl}>

                          {lastUrl}
                        </a>
                        {timeSuffix}
                      </>
                    ) : (
                      <>Δεν έχει σταλεί ακόμα τραγούδι.</>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
