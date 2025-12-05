// apps/web/app/rooms/RoomsClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRooms } from "@/app/components/RoomsProvider";

type BaseRoom = {
  room: string;
  userCount: number;
  hasPassword: boolean;
};

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

type RoomsClientProps = {
  initialRooms: BaseRoom[];
  isLoggedIn: boolean;
  isAdmin: boolean;
  initialCurrentRoom: string | null;
};

// NEW: keys για localStorage persistence
const STORAGE_KEY_ROOM = "repertorio_current_room";
const STORAGE_KEY_ROOM_PWD = "repertorio_current_room_pwd";

/**
 * Βασικό URL για HTTP κλήσεις προς τον rooms server.
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

export default function RoomsClient({
  initialRooms,
  isLoggedIn,
  isAdmin,
  initialCurrentRoom,
}: RoomsClientProps) {
  const { currentRoom, switchRoom } = useRooms();

  // ----------------- State για rooms & server status -----------------

  const [rooms, setRooms] = useState<RoomFromStatus[]>(() =>
    (initialRooms || []).map((r) => ({
      room: r.room,
      userCount: r.userCount,
      hasPassword: r.hasPassword,
    }))
  );

  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [uptimeSec, setUptimeSec] = useState<number | undefined>(undefined);
  const [roomCount, setRoomCount] = useState<number | undefined>(undefined);
  const [totalClients, setTotalClients] = useState<number | undefined>(
    undefined
  );

  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  // ----------------- State για Create Room Modal -----------------

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  // ----------------- State για Users Modal -----------------

  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [usersModalRoom, setUsersModalRoom] = useState<string | null>(null);
  const [usersModalUsers, setUsersModalUsers] = useState<RoomUser[]>([]);
  const [usersModalLastSyncUrl, setUsersModalLastSyncUrl] = useState<
    string | null
  >(null);
  const [usersModalLastSyncTimestamp, setUsersModalLastSyncTimestamp] =
    useState<number | null>(null);
  const [usersModalLastSyncUsername, setUsersModalLastSyncUsername] =
    useState<string | null>(null);

  // ----------------- Helper: ορατά rooms (>0 users) -----------------

  const visibleRooms = useMemo(() => {
    return (rooms || []).filter((room) => {
      const usersArr = Array.isArray(room.users) ? room.users : [];
      const count =
        typeof room.userCount === "number"
          ? room.userCount
          : usersArr.length || 0;
      return count > 0;
    });
  }, [rooms]);

  // ----------------- Φόρτωση rooms από /status -----------------

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const base = getRoomsBaseUrl();
      const res = await fetch(`${base}/status`, {
        cache: "no-store",
      });

      if (!res.ok) {
        console.error("[RoomsClient] /status HTTP error:", res.status);
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
          : data.rooms
          ? data.rooms.length
          : undefined
      );
      setTotalClients(
        typeof data.totalClients === "number" ? data.totalClients : undefined
      );

      if (Array.isArray(data.rooms)) {
        setRooms(data.rooms);
      } else {
        setRooms([]);
      }
    } catch (err: any) {
      console.error("[RoomsClient] loadRooms error:", err);
      setServerOnline(false);
      setErrorMessage(
        "Αποτυχία επικοινωνίας με τον rooms server: " + (err?.message || "")
      );
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  // ----------------- Αρχικό load + περιοδικό refresh -----------------

  useEffect(() => {
    loadRooms();
    if (typeof window === "undefined") return;

    const id = window.setInterval(() => {
      loadRooms();
    }, 10000);

    return () => {
      window.clearInterval(id);
    };
  }, [loadRooms]);

  // ----------------- Αρχική ανάγνωση room από localStorage (NEW) -----------------

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Αν ήδη έχουμε currentRoom από RoomsProvider, δεν χρειάζεται restore
    if (currentRoom) return;

    const storedRoom = window.localStorage.getItem(STORAGE_KEY_ROOM);
    if (!storedRoom) return;

    const storedPwd =
      window.localStorage.getItem(STORAGE_KEY_ROOM_PWD) || undefined;

    console.log(
      "[RoomsClient] restoring room from localStorage:",
      storedRoom
    );

    switchRoom(storedRoom, storedPwd);
  }, [currentRoom, switchRoom]);

  // ----------------- Sync αρχικού currentRoom από server (αν κάποτε το χρησιμοποιήσεις) -----------------

  useEffect(() => {
    if (!initialCurrentRoom) return;
    if (currentRoom === initialCurrentRoom) return;
    switchRoom(initialCurrentRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCurrentRoom]);

  // ----------------- Δημιουργία room -----------------

  const handleOpenCreateModal = () => {
    if (!isLoggedIn) {
      alert("Πρέπει να έχεις κάνει login για να δημιουργήσεις room.");
      return;
    }
    setCreateName("");
    setCreatePassword("");
    setCreateStatus(null);
    setCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    if (createBusy) return;
    setCreateModalOpen(false);
  };

  const handleCreateRoom = async () => {
    if (!isLoggedIn) {
      alert("Πρέπει να έχεις κάνει login για να δημιουργήσεις room.");
      return;
    }

    const room = (createName || "").trim();
    const password = (createPassword || "").trim();

    if (!room) {
      setCreateStatus("⚠️ Γράψε όνομα για το νέο room.");
      return;
    }

    if (/\s/.test(room)) {
      setCreateStatus(
        '⚠️ Το όνομα room δεν πρέπει να έχει κενά. Π.χ. "myroom" ή "my_room".'
      );
      return;
    }

    setCreateBusy(true);
    setCreateStatus("⏳ Γίνεται δημιουργία room...");

    try {
      const base = getRoomsBaseUrl();
      const createRes = await fetch(`${base}/create-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, password }),
      });

      const createJson: any = await createRes.json().catch(() => ({}));

      if (!createRes.ok || !createJson.success) {
        const msg: string =
          createJson?.message || "Δεν ήταν δυνατή η δημιουργία room.";
        setCreateStatus("❌ " + msg);
        return;
      }

      // Σύνδεση στο room μέσω RoomsProvider (WebSocket join_room)
      switchRoom(room, password);

      // NEW: αποθήκευση σε localStorage
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_ROOM, room);
        if (password) {
          window.localStorage.setItem(STORAGE_KEY_ROOM_PWD, password);
        } else {
          window.localStorage.removeItem(STORAGE_KEY_ROOM_PWD);
        }
      }

      setCreateStatus("✅ Το room δημιουργήθηκε και συνδέθηκες.");
      setCreateName("");
      setCreatePassword("");

      setTimeout(() => {
        setCreateModalOpen(false);
      }, 400);

      setTimeout(() => {
        loadRooms();
      }, 800);
    } catch (err: any) {
      console.error("[RoomsClient] handleCreateRoom error:", err);
      setCreateStatus(
        "❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα.")
      );
    } finally {
      setCreateBusy(false);
    }
  };

  // ----------------- Σύνδεση / Έξοδος από room -----------------

  const handleConnectRoom = async (roomName: string, hasPassword: boolean) => {
    if (!isLoggedIn) {
      alert("Πρέπει να έχεις κάνει login για να συνδεθείς σε room.");
      return;
    }

    let password = "";

    if (hasPassword) {
      const input = window.prompt(
        `Το room "${roomName}" είναι κλειδωμένο.\nΔώσε κωδικό πρόσβασης:`,
        ""
      );
      if (input === null) {
        return;
      }
      password = input.trim();
    }

    try {
      const base = getRoomsBaseUrl();

      if (hasPassword) {
        const verifyRes = await fetch(`${base}/verify-room-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: roomName, password }),
        });

        const verifyJson: any = await verifyRes.json().catch(() => ({}));
        const msg: string | undefined = verifyJson?.message;

        if (!verifyRes.ok || verifyJson?.success === false) {
          if (msg === "NOT_FOUND") {
            alert("Το room δεν βρέθηκε ή έχει κλείσει.");
          } else if (msg === "WRONG_PASSWORD") {
            alert("❌ Λάθος κωδικός για αυτό το room.");
          } else {
            alert("❌ Σφάλμα επιβεβαίωσης room.");
          }
          return;
        }
      }

      switchRoom(roomName, password);

      // NEW: αποθήκευση σε localStorage
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_ROOM, roomName);
        if (password) {
          window.localStorage.setItem(STORAGE_KEY_ROOM_PWD, password);
        } else {
          window.localStorage.removeItem(STORAGE_KEY_ROOM_PWD);
        }
      }

      setTimeout(() => {
        loadRooms();
      }, 800);
    } catch (err: any) {
      console.error("[RoomsClient] handleConnectRoom error:", err);
      alert("❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα."));
    }
  };

  const handleDisconnectRoom = async () => {
    try {
      switchRoom(null);

      // NEW: καθάρισμα localStorage
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY_ROOM);
        window.localStorage.removeItem(STORAGE_KEY_ROOM_PWD);
      }

      setTimeout(() => {
        loadRooms();
      }, 500);
    } catch (err: any) {
      console.error("[RoomsClient] handleDisconnectRoom error:", err);
      alert("❌ Σφάλμα αποσύνδεσης: " + (err?.message || "Άγνωστο σφάλμα."));
    }
  };

  // ----------------- Διαγραφή room (μόνο για admin) -----------------

  const handleDeleteRoom = async (roomName: string) => {
    if (!isAdmin) return;

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

      if (currentRoom === roomName) {
        switchRoom(null);

        // NEW: καθάρισμα localStorage αν διαγραφεί το τρέχον
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEY_ROOM);
          window.localStorage.removeItem(STORAGE_KEY_ROOM_PWD);
        }
      }

      loadRooms();
    } catch (err: any) {
      console.error("[RoomsClient] handleDeleteRoom error:", err);
      alert("❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα."));
    }
  };

  // ----------------- Διαχείριση server (restart/stop) -----------------

  const handleManageServer = async (action: "restart" | "stop" | "start") => {
    if (!isAdmin) return;

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
        loadRooms();
      }, 3000);
    } catch (err: any) {
      console.error("[RoomsClient] handleManageServer error:", err);
      alert(
        "❌ Αποτυχία διαχείρισης server: " + (err?.message || "Άγνωστο σφάλμα.")
      );
    }
  };

  // ----------------- Modal: εμφάνιση χρηστών room -----------------

  const openUsersModalForRoom = (room: RoomFromStatus) => {
    const users = Array.isArray(room.users) ? room.users : [];
    setUsersModalRoom(room.room);
    setUsersModalUsers(users);
    setUsersModalLastSyncUrl(room.last_sync_url || null);
    setUsersModalLastSyncTimestamp(room.last_sync_timestamp || null);
    setUsersModalLastSyncUsername(room.last_sync_username || null);
    setUsersModalOpen(true);
  };

  const closeUsersModal = () => {
    setUsersModalOpen(false);
  };

  // ----------------- Φιλτράρισμα rooms από search -----------------

  const filteredRooms = useMemo(() => {
    const filter = searchTerm.trim().toLowerCase();
    if (!filter) return visibleRooms;
    return visibleRooms.filter((room) => {
      const text = [
        room.room,
        ...(Array.isArray(room.users)
          ? room.users.map((u) => u.username || String(u.user_id || ""))
          : []),
        room.last_sync_url || "",
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(filter);
    });
  }, [visibleRooms, searchTerm]);

  // ----------------- Render -----------------

  return (
    <>
      <div id="rooms-container">
        {serverOnline === true && (
          <div id="server-status-card">
            <div className="meta">
              🟢 Server status: <span className="ok">Online</span>
            </div>
            {typeof uptimeSec === "number" && (
              <div className="meta">
                ⏱️ Uptime: {formatMinutesFromSeconds(uptimeSec)}
              </div>
            )}
            {typeof roomCount === "number" &&
              typeof totalClients === "number" && (
                <div className="meta">
                  📊 Δωμάτια: {roomCount} — 👥 Χρήστες: {totalClients}
                </div>
              )}

            {isAdmin && (
              <div
                id="server-controls"
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
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
              </div>
            )}
          </div>
        )}

        {serverOnline === false && (
          <div id="server-status-card">
            <p>
              ❌ Ο WebSocket / Rooms server είναι{" "}
              <strong style={{ color: "#e74c3c" }}>offline</strong>.
            </p>
            {errorMessage && (
              <p style={{ fontSize: 13, color: "#aaa" }}>{errorMessage}</p>
            )}
          </div>
        )}

        <p
          className="rc-help rc-help-bottom"
          style={{ marginTop: 8, marginBottom: 8 }}
        >
          Συνδεθείτε με τους φίλους σας στο ίδιο room, πατήστε το 🔄Room και
          στείλτε τους το τραγούδι!
        </p>

        <div id="rooms-topbar">
          <input
            type="text"
            id="roomSearch"
            placeholder="🔍 Αναζήτηση room"
            maxLength={20}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            id="openCreateRoomModal"
            className="topbar-create-btn"
            onClick={handleOpenCreateModal}
            disabled={!isLoggedIn}
            title={
              isLoggedIn
                ? "Νέο room"
                : "Πρέπει να κάνεις login για να δημιουργήσεις room."
            }
          >
            ✚
            <br />
            <span style={{ fontSize: 13 }}>Room</span>
          </button>
        </div>

        <div style={{ marginTop: 10, fontWeight: 600 }}>🔄 Ενεργά Rooms</div>

        {!initialized && loading && <p>🔄 Φόρτωση δεδομένων...</p>}

        {initialized && !loading && filteredRooms.length === 0 && (
          <p style={{ marginTop: 10, color: "#aaa" }}>
            Δεν υπάρχουν ενεργά rooms αυτή τη στιγμή.
          </p>
        )}

        {filteredRooms.length > 0 && (
          <div id="rooms-list">
            {filteredRooms.map((room) => {
              const usersArr = Array.isArray(room.users) ? room.users : [];
              const count =
                typeof room.userCount === "number"
                  ? room.userCount
                  : usersArr.length || 0;
              const safeCount = count || 0;
              const isCurrent = !!currentRoom && currentRoom === room.room;
              const isCurrFlag = isCurrent ? "1" : "0";
              const label = isCurrent ? "❌ Έξοδος" : "🔗 Σύνδεση";
              const extraClass = isCurrent ? " exit-btn" : "";
              const lockIcon = room.hasPassword ? (
                <span className="lock-icon">🔒</span>
              ) : null;

              // usersArr: λίστα με αναλυτικά στοιχεία χρηστών (αν τη δώσει ο server)
              // safeCount: συνολικός αριθμός χρηστών στο room (από userCount ή usersArr.length)
              const usersStr =
                usersArr.length > 0
                  ? usersArr
                      .map((u) => {
                        if (u.username && u.username.trim().length) {
                          return "@" + u.username;
                        }
                        if (typeof u.user_id === "number") {
                          return "User #" + u.user_id;
                        }
                        const shortId = (u.device_id || "").slice(0, 8) || "unknown";
                        return shortId;
                      })
                      .join(", ")
                  : safeCount > 0
                  ? `${safeCount} ${
                      safeCount === 1 ? "χρήστης (χωρίς λεπτομέρειες)" : "χρήστες (χωρίς λεπτομέρειες)"
                    }`
                  : "κανένας χρήστης";


              const lastUrlRaw =
                typeof room.last_sync_url === "string"
                  ? room.last_sync_url
                  : "";
              const lastUrl = lastUrlRaw.trim();
              const lastLabel = lastUrl || "Δεν υπάρχει URL";

              const ts = room.last_sync_timestamp || null;
              const senderNameRaw = room.last_sync_username || "";
              const senderName = senderNameRaw || "Άγνωστος χρήστης";
              const timeSuffix =
                ts != null
                  ? ` (${formatTimeFromTimestamp(ts)} — ${senderName})`
                  : "";

              const lastSyncHtml = lastUrl ? (
                <div className="room-last-sync">
                  🎵 Τελευταίο:{" "}
                  <a href={lastUrl} target="_blank" rel="noopener noreferrer">
                    {lastLabel}
                  </a>
                  {timeSuffix}
                </div>
              ) : (
                <div className="room-last-sync room-last-sync-empty">
                  Δεν έχει σταλεί ακόμα τραγούδι.
                </div>
              );

              return (
                <div
                  key={room.room}
                  className={
                    "room-row" + (isCurrent ? " current-room-row" : "")
                  }
                  data-room={room.room}
                >
                  <div className="room-main">
                    <div className="room-main-line">
                      {lockIcon}
                      <span
                        className="room-title roomLink"
                        onClick={() => openUsersModalForRoom(room)}
                      >
                        <strong style={{ color: "#fff" }}>{room.room}</strong>
                      </span>
                      <span className="room-count-badge">{safeCount}</span>
                      {isCurrent && (
                        <span className="current-room-badge">
                          Τρέχον room
                        </span>
                      )}
                    </div>

                    <div className="room-users">{usersStr}</div>

                    {lastSyncHtml}
                  </div>

                  <div className="room-actions">
                    <button
                      className={
                        "room-action-btn connect-room-btn" + extraClass
                      }
                      data-room={room.room}
                      data-haspwd={room.hasPassword ? 1 : 0}
                      data-iscurr={isCurrFlag}
                      onClick={() =>
                        isCurrent
                          ? handleDisconnectRoom()
                          : handleConnectRoom(room.room, room.hasPassword)
                      }
                    >
                      {label}
                    </button>

                    {isAdmin && (
                      <button
                        className="room-action-btn delete-room-btn"
                        data-room={room.room}
                        onClick={() => handleDeleteRoom(room.room)}
                      >
                        🗑️ Διαγραφή
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Δημιουργίας Room */}
      {createModalOpen && (
        <div
          id="createRoomModal"
          style={{
            display: "flex",
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.65)",
            zIndex: 9999,
            justifyContent: "center",
            alignItems: "center",
            backdropFilter: "blur(2px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseCreateModal();
            }
          }}
        >
          <div
            style={{
              position: "relative",
              background: "#222",
              padding: "20px 25px",
              borderRadius: 12,
              width: "90%",
              maxWidth: 420,
              color: "#fff",
              boxShadow: "0 0 20px rgba(0,0,0,0.4)",
            }}
          >
            <button
              className="crm-close"
              aria-label="Κλείσιμο"
              style={{
                position: "absolute",
                top: 8,
                right: 10,
                border: "none",
                background: "transparent",
                color: "#fff",
                fontSize: 20,
                cursor: "pointer",
                lineHeight: 1,
              }}
              onClick={handleCloseCreateModal}
            >
              &times;
            </button>

            <h3 style={{ marginTop: 0, fontSize: 18 }}>➕ Νέο Room</h3>

            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="roomCreateName"
                style={{ display: "block", marginBottom: 4 }}
              >
                Όνομα room
              </label>
              <input
                id="roomCreateName"
                name="roomCreateName"
                type="text"
                maxLength={32}
                placeholder="Όνομα room"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #444",
                  background: "#111",
                  color: "#eee",
                  boxSizing: "border-box",
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="roomCreatePwd"
                style={{ display: "block", marginBottom: 4 }}
              >
                Κωδικός (προαιρετικό)
              </label>
              <input
                id="roomCreatePwd"
                name="roomCreatePwd"
                type="password"
                maxLength={32}
                placeholder="Κωδικός (προαιρετικό)"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #444",
                  background: "#111",
                  color: "#eee",
                  boxSizing: "border-box",
                }}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                className="crm-close"
                onClick={handleCloseCreateModal}
                disabled={createBusy}
                style={{
                  padding: "6px 10px",
                  marginRight: 8,
                  borderRadius: 4,
                  border: "1px solid #555",
                  background: "#333",
                  color: "#fff",
                  cursor: createBusy ? "default" : "pointer",
                  opacity: createBusy ? 0.6 : 1,
                }}
              >
                Ακύρωση
              </button>

              <button
                type="button"
                id="createRoomBtn"
                onClick={handleCreateRoom}
                disabled={createBusy}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2980b9",
                  color: "#fff",
                  cursor: createBusy ? "default" : "pointer",
                  fontWeight: 500,
                  opacity: createBusy ? 0.7 : 1,
                }}
              >
                {createBusy ? "⏳ Δημιουργία..." : "➕ Δημιουργία"}
              </button>
            </div>

            <div
              id="createRoomStatus"
              style={{
                marginTop: 10,
                fontSize: 13,
                color: "#ccc",
                minHeight: 16,
                textAlign: "left",
              }}
            >
              {createStatus}
            </div>
          </div>
        </div>
      )}

      {/* Modal Λίστας Χρηστών / Last Sync */}
      {usersModalOpen && (
        <div
          id="usersModal"
          style={{
            display: "flex",
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.65)",
            zIndex: 9999,
            justifyContent: "center",
            alignItems: "center",
            backdropFilter: "blur(2px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeUsersModal();
            }
          }}
        >
          <div
            style={{
              position: "relative",
              background: "#222",
              padding: "20px 25px",
              borderRadius: 12,
              width: "90%",
              maxWidth: 420,
              color: "#fff",
              boxShadow: "0 0 20px rgba(0,0,0,0.4)",
            }}
          >
            <button
              id="closeModalBtn"
              aria-label="Κλείσιμο"
              style={{
                position: "absolute",
                top: 8,
                right: 10,
                border: "none",
                background: "transparent",
                color: "#fff",
                fontSize: 20,
                cursor: "pointer",
                lineHeight: 1,
              }}
              onClick={closeUsersModal}
            >
              &times;
            </button>

            <h3
              id="modalRoomTitle"
              style={{ marginTop: 0, fontSize: 18 }}
            >{`🎧 Room: ${usersModalRoom || ""}`}</h3>

            <div
              id="modalLastSync"
              style={{ margin: "8px 0", fontSize: 14, color: "#bbb" }}
            >
              {usersModalLastSyncUrl ? (
                <p style={{ marginTop: 10, fontSize: 13 }}>
                  🎵 Τελευταίο τραγούδι:
                  <br />
                  <a
                    href={usersModalLastSyncUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#4af" }}
                  >
                    {usersModalLastSyncUrl}
                  </a>
                  {usersModalLastSyncTimestamp != null && (
                    <>
                      {" "}
                      (
                      {formatTimeFromTimestamp(
                        usersModalLastSyncTimestamp
                      )}{" "}
                      — {usersModalLastSyncUsername || "Άγνωστος χρήστης"})
                    </>
                  )}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "#aaa" }}>
                  Δεν υπάρχει πρόσφατο sync.
                </p>
              )}
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #444" }} />

            <div
              id="modalUserList"
              style={{ marginTop: 10, fontSize: 15 }}
            >
              {usersModalUsers.length === 0 ? (
                <p style={{ color: "#aaa" }}>Κανένας ενεργός χρήστης.</p>
              ) : (
                usersModalUsers.map((u, idx) => {
                  const idShort =
                    (u.device_id || "").slice(0, 8) || "unknown";
                  const name =
                    u.username && u.username.trim().length
                      ? `@${u.username}`
                      : typeof u.user_id === "number"
                      ? `User #${u.user_id}`
                      : idShort;

                  return (
                    <div key={idx}>
                      • <span className="userTag">{name}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
