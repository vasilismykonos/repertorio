"use client";

import { useEffect, useState } from "react";
import "@/public/rooms/repertorio-rooms.css";

type RoomsApiUser = {
  device_id?: string;
  user_id?: number;
  username?: string | null;
};

type RoomsApiRoom = {
  room: string;
  users?: RoomsApiUser[];
  userCount?: number;
  hasPassword?: boolean;
  last_sync_url?: string | null;
};

type RoomsStatusResponse = {
  ok: boolean;
  uptime_sec: number;
  roomCount: number;
  totalClients: number;
  rooms: RoomsApiRoom[];
};

const ROOMS_API_BASE =
  process.env.NEXT_PUBLIC_ROOMS_API_BASE_URL ||
  "https://app.repertorio.net/rooms-api";

function getInitialCurrentRoom(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("rep_current_room") || "";
  } catch {
    return "";
  }
}

function setCurrentRoom(room: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (room) {
      window.localStorage.setItem("rep_current_room", room);
    } else {
      window.localStorage.removeItem("rep_current_room");
    }
  } catch {
    // ignore
  }
}

// Προσωρινά flags – εδώ αργότερα θα τα δέσουμε με πραγματικό auth
const IS_LOGGED_IN_DEFAULT = true; // TODO: σύνδεση με σύστημα login
const IS_ADMIN_DEFAULT = false; // TODO: flag admin από JWT/ρόλους

export default function RoomsClient() {
  const [status, setStatus] = useState<RoomsStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentRoom, setCurrentRoomState] = useState<string>(
    getInitialCurrentRoom()
  );

  const [searchTerm, setSearchTerm] = useState<string>("");

  // Create room modal state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>("");
  const [createPwd, setCreatePwd] = useState<string>("");
  const [createStatusMsg, setCreateStatusMsg] = useState<string>("");
  const [createStatusColor, setCreateStatusColor] =
    useState<string>("#ccc");
  const [createBtnLoading, setCreateBtnLoading] = useState<boolean>(false);

  // Modal για λίστα χρηστών
  const [usersModalOpen, setUsersModalOpen] = useState<boolean>(false);
  const [usersModalRoom, setUsersModalRoom] = useState<string>("");
  const [usersModalLastSync, setUsersModalLastSync] =
    useState<string>("");
  const [usersModalUsers, setUsersModalUsers] = useState<RoomsApiUser[]>(
    []
  );

  // Προσωρινά – μέχρι να δέσουμε πραγματικό auth
  const IS_LOGGED_IN = IS_LOGGED_IN_DEFAULT;
  const IS_ADMIN = IS_ADMIN_DEFAULT;

  // Φόρτωση /status από τον rooms server
  async function loadStatus() {
    try {
      setError(null);
      const res = await fetch(`${ROOMS_API_BASE}/status`, {
        cache: "no-store",
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Ο server δεν επέστρεψε JSON (ίσως είναι offline).");
      }

      const data = (await res.json()) as RoomsStatusResponse;
      if (!data.ok) {
        throw new Error("Ο server επέστρεψε ok=false.");
      }

      setStatus(data);
    } catch (err: any) {
      console.error("Rooms status error:", err);
      setError(err?.message || "Αποτυχία φόρτωσης κατάστασης rooms.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  // Αρχική φόρτωση + polling κάθε 10s
  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper: ενημέρωση τρέχοντος room τοπικά + localStorage
  function updateCurrentRoom(room: string | null) {
    setCurrentRoomState(room || "");
    setCurrentRoom(room);
  }

  // Helper: κάλεσμα προς sync client (όταν τον βάλουμε στο Next)
  function notifySyncClient(room: string | null, password: string) {
    if (typeof window === "undefined") return;
    const fn = (window as any).RepRoomsSwitchRoom;
    if (typeof fn === "function") {
      fn(room, password);
    }
  }

  // === Δημιουργία νέου room ===
  async function handleCreateRoom() {
    if (!IS_LOGGED_IN) {
      alert("Πρέπει να έχεις κάνει login για να δημιουργήσεις room.");
      return;
    }

    const name = createName.trim();
    const pwd = createPwd.trim();

    const setStatusLine = (text: string, color = "#ccc") => {
      setCreateStatusMsg(text);
      setCreateStatusColor(color);
    };

    setStatusLine("");

    if (!name) {
      setStatusLine("⚠️ Γράψε όνομα για το νέο room.", "#f1c40f");
      return;
    }

    if (/\s/.test(name)) {
      setStatusLine(
        "⚠️ Το όνομα room δεν πρέπει να έχει κενά. Π.χ. myroom ή my_room.",
        "#f1c40f"
      );
      return;
    }

    setCreateBtnLoading(true);
    setStatusLine("⏳ Γίνεται δημιουργία room...", "#ccc");

    try {
      // 1) Δημιουργία room στον Node
      const createRes = await fetch(`${ROOMS_API_BASE}/create-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: name, password: pwd }),
      });

      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.success) {
        setStatusLine(
          "❌ Δεν ήταν δυνατή η δημιουργία room.",
          "#e57373"
        );
        return;
      }

      // 2) Θεωρούμε ότι ο χρήστης συνδέεται αμέσως σε αυτό το room
      updateCurrentRoom(name);
      setStatusLine("✅ Το room δημιουργήθηκε, σύνδεση...", "#81c784");

      // 3) Ενημέρωση sync client (όταν προστεθεί στο Next)
      notifySyncClient(name, pwd);

      // 4) Καθάρισμα πεδίων, κλείσιμο modal μετά από λίγο, refresh λίστας
      setTimeout(() => {
        setCreateModalOpen(false);
        setCreateName("");
        setCreatePwd("");
        setStatusLine("");
      }, 400);

      setTimeout(() => {
        loadStatus();
      }, 800);
    } catch (err: any) {
      setStatusLine(
        "❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα."),
        "#e57373"
      );
    } finally {
      setCreateBtnLoading(false);
    }
  }

  // === Σύνδεση σε room από τη λίστα ===
  async function handleConnect(room: string, hasPassword: boolean) {
    if (!IS_LOGGED_IN) {
      alert("Πρέπει να έχεις κάνει login για να συνδεθείς σε room.");
      return;
    }

    let password = "";
    if (hasPassword) {
      const input = window.prompt(
        `Το room "${room}" είναι κλειδωμένο.\nΔώσε κωδικό πρόσβασης:`,
        ""
      );
      if (input === null) return; // ακυρώθηκε
      password = input.trim();
    }

    try {
      // 1) verify-room-password
      const verifyRes = await fetch(
        `${ROOMS_API_BASE}/verify-room-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, password }),
        }
      );
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok || !verifyJson.success) {
        const code = verifyJson?.message;
        if (code === "NOT_FOUND") {
          alert("Το room δεν βρέθηκε ή έχει κλείσει.");
        } else if (code === "WRONG_PASSWORD") {
          alert("❌ Λάθος κωδικός για αυτό το room.");
        } else {
          alert("❌ Σφάλμα επιβεβαίωσης room.");
        }
        return;
      }

      // 2) Θεωρούμε ότι τρέχον room = αυτό
      updateCurrentRoom(room);

      // 3) Ενημέρωση sync client
      notifySyncClient(room, password);

      // 4) Refresh list λίγο αργότερα
      setTimeout(() => {
        loadStatus();
      }, 800);
    } catch (err: any) {
      alert(
        "❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα.")
      );
    }
  }

  // === Έξοδος από τρέχον room ===
  function handleDisconnect() {
    // Καθαρίζουμε τρέχον room τοπικά
    updateCurrentRoom(null);

    // Ενημερώνουμε sync client να κλείσει / αποσυνδεθεί
    notifySyncClient(null, "");

    // Refresh λίστα σε λίγο
    setTimeout(() => {
      loadStatus();
    }, 800);
  }

  // === Διαγραφή room (admin μόνο) ===
  async function handleDeleteRoom(room: string) {
    if (!IS_ADMIN) return;

    const ok = window.confirm(
      `Να διαγραφεί οριστικά το room "${room}"; Όλοι οι συνδεδεμένοι χρήστες θα αποσυνδεθούν.`
    );
    if (!ok) return;

    try {
      const res = await fetch(`${ROOMS_API_BASE}/delete-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        alert("❌ Αποτυχία διαγραφής room.");
        return;
      }

      // Αν ο χρήστης ήταν σε αυτό το room, καθαρίζουμε και client-side
      if (currentRoom === room) {
        updateCurrentRoom(null);
        notifySyncClient(null, "");
      }

      // Refresh status
      await loadStatus();
    } catch (err: any) {
      alert(
        "❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα.")
      );
    }
  }

  // === Διαχείριση server (restart/stop) ===
  async function handleManageServer(action: "restart" | "stop") {
    if (!IS_ADMIN) return;

    const ok = window.confirm(
      `Θες σίγουρα να κάνεις ${action.toUpperCase()} τον rooms server;`
    );
    if (!ok) return;

    try {
      const res = await fetch(`${ROOMS_API_BASE}/manage-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          key: "RepertorioSecretRestartKey",
        }),
      });
      const json = await res.json();
      alert(json?.message || "Ολοκληρώθηκε.");
      setTimeout(() => loadStatus(), 3000);
    } catch (err: any) {
      alert(
        "❌ Αποτυχία διαχείρισης server: " +
          (err?.message || "Άγνωστο σφάλμα.")
      );
    }
  }

  // === Άνοιγμα modal χρηστών ενός room ===
  function openUsersModal(room: RoomsApiRoom) {
    setUsersModalRoom(room.room);
    setUsersModalLastSync(room.last_sync_url || "");
    setUsersModalUsers(room.users || []);
    setUsersModalOpen(true);
  }

  // Helper: formatting χρόνου
  function formatUptime(sec: number): string {
    const minutes = sec / 60;
    if (minutes < 60) {
      return `${minutes.toFixed(1)} λεπτά`;
    }
    const hours = minutes / 60;
    return `${hours.toFixed(1)} ώρες`;
  }

  // Rooms ορατά (φιλτράρισμα + χωρίς άδειους)
  const visibleRooms: RoomsApiRoom[] =
    status?.rooms
      ?.filter((room) => {
        const usersArr = Array.isArray(room.users) ? room.users : [];
        const count = Number.isFinite(room.userCount)
          ? room.userCount || 0
          : usersArr.length;
        return count > 0;
      })
      .filter((room) => {
        if (!searchTerm.trim()) return true;
        const text =
          (room.room || "") +
          " " +
          (room.users || [])
            .map((u) => u.username || u.user_id || u.device_id || "")
            .join(" ");
        return text.toLowerCase().includes(searchTerm.toLowerCase());
      }) || [];

  const isLoading = loading && !status && !error;

  return (
    <>
      {/* Wrapper */}
      <div id="rooms-wrapper">
        <h3 style={{ marginBottom: "10px" }}>🔄 Rooms</h3>

        {/* Status block / errors */}
        {isLoading && <p>🔄 Φόρτωση δεδομένων...</p>}

        {!isLoading && error && (
          <p style={{ color: "#e57373" }}>❌ Σφάλμα: {error}</p>
        )}

        {!isLoading && status && (
          <>
            {/* Server status μόνο για admin */}
            {IS_ADMIN && (
              <div id="server-status-card">
                <div className="meta">
                  🟢 Server status: <span className="ok">Online</span>
                </div>
                <div className="meta">
                  ⏱️ Uptime: {formatUptime(status.uptime_sec)}
                </div>
                <div className="meta">
                  📊 Δωμάτια: {status.roomCount} — 👥 Χρήστες:{" "}
                  {status.totalClients}
                </div>
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
              </div>
            )}

            {/* Help text (όπως στο shortcode) */}
            <p
              className="rc-help rc-help-bottom"
              style={{
                marginTop: 8,
                marginBottom: 8,
              }}
            >
              Συνδεθείτε με τους φίλους σας στο ίδιο room, πατήστε το 🔄Room
              και στείλτε τους το τραγούδι!
            </p>

            {/* Topbar: search + create room */}
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
                onClick={() => {
                  if (!IS_LOGGED_IN) {
                    alert(
                      "Πρέπει να έχεις κάνει login για να δημιουργήσεις room."
                    );
                    return;
                  }
                  setCreateStatusMsg("");
                  setCreateStatusColor("#ccc");
                  setCreateModalOpen(true);
                }}
              >
                ✚
                <br />
                <span style={{ fontSize: 13 }}>Room</span>
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                fontWeight: 600,
              }}
            >
              🔄 Ενεργά Rooms
            </div>

            <div id="rooms-container">
              <div id="rooms-list">
                {!visibleRooms.length && (
                  <p style={{ marginTop: 10, color: "#aaa" }}>
                    Δεν υπάρχουν ενεργά rooms αυτή τη στιγμή.
                  </p>
                )}

                {visibleRooms.map((room) => {
                  const usersArr = Array.isArray(room.users)
                    ? room.users
                    : [];
                  const count = Number.isFinite(room.userCount)
                    ? room.userCount || 0
                    : usersArr.length;
                  const safeCount = count || 0;
                  const isCurrent = currentRoom === room.room;

                  const usersStr =
                    usersArr.length > 0
                      ? usersArr
                          .map((u) => {
                            if (
                              u.username &&
                              u.username.trim().length > 0
                            )
                              return "@" + u.username;
                            if (u.user_id) return "User #" + u.user_id;
                            const shortId =
                              (u.device_id || "").slice(0, 8) ||
                              "unknown";
                            return shortId;
                          })
                          .join(", ")
                      : "κανένας χρήστης";

                  const lastUrl =
                    (room.last_sync_url || "").trim() || "";

                  return (
                    <div
                      key={room.room}
                      className={
                        "room-row" +
                        (isCurrent ? " current-room-row" : "")
                      }
                      data-room={room.room}
                    >
                      <div className="room-main">
                        <div className="room-main-line">
                          {room.hasPassword && (
                            <span className="lock-icon">🔒</span>
                          )}
                          <span
                            className="room-title roomLink"
                            onClick={() => openUsersModal(room)}
                            style={{ cursor: "pointer" }}
                          >
                            <strong style={{ color: "#fff" }}>
                              {room.room}
                            </strong>
                          </span>
                          <span className="room-count-badge">
                            {safeCount}
                          </span>
                          {isCurrent && (
                            <span className="current-room-badge">
                              Τρέχον room
                            </span>
                          )}
                        </div>
                        <div className="room-users">{usersStr}</div>
                        {lastUrl ? (
                          <div className="room-last-sync">
                            🎵 Τελευταίο: <a href={lastUrl}>{lastUrl}</a>
                          </div>
                        ) : (
                          <div className="room-last-sync room-last-sync-empty">
                            Δεν έχει σταλεί ακόμα τραγούδι.
                          </div>
                        )}
                      </div>

                      <div className="room-actions">
                        {isCurrent ? (
                          <button
                            className="room-action-btn connect-room-btn exit-btn"
                            onClick={handleDisconnect}
                          >
                            ❌ Έξοδος
                          </button>
                        ) : (
                          <button
                            className="room-action-btn connect-room-btn"
                            onClick={() =>
                              handleConnect(
                                room.room,
                                !!room.hasPassword
                              )
                            }
                          >
                            🔗 Σύνδεση
                          </button>
                        )}

                        {IS_ADMIN && (
                          <button
                            className="room-action-btn delete-room-btn"
                            onClick={() =>
                              handleDeleteRoom(room.room)
                            }
                          >
                            🗑️ Διαγραφή
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal δημιουργίας room */}
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
              setCreateModalOpen(false);
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
              onClick={() => setCreateModalOpen(false)}
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
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
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
                value={createPwd}
                onChange={(e) => setCreatePwd(e.target.value)}
              />
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                className="crm-close"
                style={{
                  padding: "6px 10px",
                  marginRight: 8,
                  borderRadius: 4,
                  border: "1px solid #555",
                  background: "#333",
                  color: "#fff",
                  cursor: "pointer",
                }}
                onClick={() => setCreateModalOpen(false)}
              >
                Ακύρωση
              </button>

              <button
                type="button"
                id="createRoomBtn"
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2980b9",
                  color: "#fff",
                  cursor: createBtnLoading ? "wait" : "pointer",
                  fontWeight: 500,
                  opacity: createBtnLoading ? 0.7 : 1,
                }}
                onClick={handleCreateRoom}
                disabled={createBtnLoading}
              >
                {createBtnLoading ? "⏳ Δημιουργία..." : "➕ Δημιουργία"}
              </button>
            </div>

            <div
              id="createRoomStatus"
              style={{
                marginTop: 10,
                fontSize: 13,
                color: createStatusColor,
                minHeight: 16,
                textAlign: "left",
              }}
            >
              {createStatusMsg}
            </div>
          </div>
        </div>
      )}

      {/* Modal λίστας χρηστών / τελευταίου τραγουδιού */}
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
              setUsersModalOpen(false);
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
              onClick={() => setUsersModalOpen(false)}
            >
              &times;
            </button>

            <h3
              id="modalRoomTitle"
              style={{ marginTop: 0, fontSize: 18 }}
            >
              🎧 Room: {usersModalRoom}
            </h3>

            <div
              id="modalLastSync"
              style={{ margin: "8px 0", fontSize: 14, color: "#bbb" }}
            >
              {usersModalLastSync ? (
                <p
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                  }}
                >
                  🎵 Τελευταίο τραγούδι:
                  <br />
                  <a
                    href={usersModalLastSync}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#4af" }}
                  >
                    {usersModalLastSync}
                  </a>
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "#aaa",
                  }}
                >
                  Δεν υπάρχει πρόσφατο sync.
                </p>
              )}
            </div>

            <hr
              style={{
                border: "none",
                borderTop: "1px solid #444",
              }}
            />

            <div
              id="modalUserList"
              style={{ marginTop: 10, fontSize: 15 }}
            >
              {usersModalUsers.length === 0 && (
                <p style={{ color: "#aaa" }}>
                  Κανένας ενεργός χρήστης.
                </p>
              )}

              {usersModalUsers.map((u, idx) => {
                let label = "";
                if (u.username && u.username.trim().length) {
                  label = "@" + u.username;
                } else if (u.user_id) {
                  label = "User #" + u.user_id;
                } else {
                  label = (u.device_id || "").slice(0, 8) || "unknown";
                }
                return (
                  <div key={idx}>
                    • <span className="userTag">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
