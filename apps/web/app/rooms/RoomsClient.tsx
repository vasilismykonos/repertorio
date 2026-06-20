// apps/web/app/rooms/RoomsClient.tsx
"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRooms } from "@/app/components/RoomsProvider";
import { A } from "@/app/components/buttons";

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

  // ✅ ΝΕΟ (διάλεξε το σωστό key που υπάρχει στο JSON)
  last_sync_title?: string | null;
  // ή/και:
  last_sync_song_title?: string | null;

  last_sync_timestamp?: number | null;
  last_sync_username?: string | null;
};


type StatusResponse = {
  ok: boolean;
  rooms?: RoomFromStatus[];
};

type RoomsClientProps = {
  initialRooms: BaseRoom[];
  isLoggedIn: boolean;
  isAdmin: boolean; // δεν χρησιμοποιείται εδώ (admin πήγε στο /rooms/settings)
  initialCurrentRoom: string | null;
};

const STORAGE_KEY_ROOM = "repertorio_current_room";
const STORAGE_KEY_ROOM_PWD = "repertorio_current_room_pwd";

function getRoomsBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    process.env.ROOMS_HTTP_BASE_URL ||
    "/rooms-api";

  return base.replace(/\/+$/, "");
}

function formatTimeFromTimestamp(ts: number | undefined | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function safeUsersCount(room: RoomFromStatus): number {
  const usersArr = Array.isArray(room.users) ? room.users : [];
  if (typeof room.userCount === "number") return room.userCount;
  return usersArr.length || 0;
}

function renderUsersString(room: RoomFromStatus): string {
  const usersArr = Array.isArray(room.users) ? room.users : [];
  const count = safeUsersCount(room);

  if (usersArr.length > 0) {
    return usersArr
      .map((u) => {
        const uname = (u.username || "").trim();
        if (uname) return "@" + uname;
        if (typeof u.user_id === "number") return `User #${u.user_id}`;
        const shortId = ((u.device_id || "").slice(0, 8) || "unknown").trim();
        return shortId || "unknown";
      })
      .join(", ");
  }

  if (count > 0) {
    return `${count} ${
      count === 1
        ? "χρήστης (χωρίς λεπτομέρειες)"
        : "χρήστες (χωρίς λεπτομέρειες)"
    }`;
  }

  return "κανένας χρήστης";
}

function normalizeQuery(s: string): string {
  return (s || "").trim().replace(/\s+/g, " ");
}

/** Local “A-like” button (safe: no routing / no notFound). */
function ALikeButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
}) {
  const { children, onClick, disabled, title, variant = "primary", type } = props;

  const baseStyle: React.CSSProperties = {
    height: 40,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 0.2,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const style: React.CSSProperties =
    variant === "ghost"
      ? {
          ...baseStyle,
          background: "transparent",
          color: "#fff",
        }
      : {
          ...baseStyle,
          background: "rgba(255,255,255,0.10)",
          color: "#fff",
        };

  return (
    <button
      type={type || "button"}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={style}
    >
      {children}
    </button>
  );
}

export default function RoomsClient({
  initialRooms,
  isLoggedIn,
  initialCurrentRoom,
}: RoomsClientProps) {
  const { currentRoom, switchRoom } = useRooms();

  const [rooms, setRooms] = useState<RoomFromStatus[]>(() =>
    (initialRooms || []).map((r) => ({
      room: r.room,
      userCount: r.userCount,
      hasPassword: r.hasPassword,
    }))
  );

  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search: input + applied query (με κουμπί)
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Users modal
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

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const base = getRoomsBaseUrl();
      const res = await fetch(`${base}/status`, { cache: "no-store" });

      if (!res.ok) {
        console.error("[RoomsClient] /status HTTP error:", res.status);
        setErrorMessage("Ο Rooms server δεν απάντησε σωστά.");
        setRooms([]);
        return;
      }

      let data: StatusResponse | null = null;
      try {
        data = (await res.json()) as StatusResponse;
      } catch {
        setErrorMessage("Ο Rooms server είναι offline ή δεν επιστρέφει JSON.");
        setRooms([]);
        return;
      }

      if (!data || data.ok !== true) {
        setErrorMessage("Σφάλμα: ο server δεν επέστρεψε έγκυρα δεδομένα.");
        setRooms([]);
        return;
      }
      console.log("[rooms/status room sample]", data?.rooms?.[0]);

      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (err: any) {
      console.error("[RoomsClient] loadRooms error:", err);
      setErrorMessage(
        "Αποτυχία επικοινωνίας με τον rooms server: " + (err?.message || "")
      );
      setRooms([]);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);


  useEffect(() => {
    loadRooms();
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => loadRooms(), 10000);
    return () => window.clearInterval(id);
  }, [loadRooms]);

  // restore room from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentRoom) return;

    const storedRoom = window.localStorage.getItem(STORAGE_KEY_ROOM);
    if (!storedRoom) return;

    const storedPwd =
      window.localStorage.getItem(STORAGE_KEY_ROOM_PWD) || undefined;

    switchRoom(storedRoom, storedPwd);
  }, [currentRoom, switchRoom]);

  // sync initialCurrentRoom (αν το χρησιμοποιήσεις)
  useEffect(() => {
    if (!initialCurrentRoom) return;
    if (currentRoom === initialCurrentRoom) return;
    switchRoom(initialCurrentRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCurrentRoom]);

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
      if (input === null) return;
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
          if (msg === "NOT_FOUND") alert("Το room δεν βρέθηκε ή έχει κλείσει.");
          else if (msg === "WRONG_PASSWORD")
            alert("❌ Λάθος κωδικός για αυτό το room.");
          else alert("❌ Σφάλμα επιβεβαίωσης room.");
          return;
        }
      }

      switchRoom(roomName, password);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_ROOM, roomName);
        if (password) window.localStorage.setItem(STORAGE_KEY_ROOM_PWD, password);
        else window.localStorage.removeItem(STORAGE_KEY_ROOM_PWD);
      }

      setTimeout(() => loadRooms(), 800);
    } catch (err: any) {
      console.error("[RoomsClient] handleConnectRoom error:", err);
      alert("❌ Σφάλμα επικοινωνίας: " + (err?.message || "Άγνωστο σφάλμα."));
    }
  };

  const handleDisconnectRoom = async () => {
    try {
      switchRoom(null);

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY_ROOM);
        window.localStorage.removeItem(STORAGE_KEY_ROOM_PWD);
      }

      setTimeout(() => loadRooms(), 500);
    } catch (err: any) {
      console.error("[RoomsClient] handleDisconnectRoom error:", err);
      alert("❌ Σφάλμα αποσύνδεσης: " + (err?.message || "Άγνωστο σφάλμα."));
    }
  };

  const openUsersModalForRoom = (room: RoomFromStatus) => {
    const users = Array.isArray(room.users) ? room.users : [];
    setUsersModalRoom(room.room);
    setUsersModalUsers(users);
    setUsersModalLastSyncUrl(room.last_sync_url || null);
    setUsersModalLastSyncTimestamp(room.last_sync_timestamp || null);
    setUsersModalLastSyncUsername(room.last_sync_username || null);
    setUsersModalOpen(true);
  };

  const closeUsersModal = () => setUsersModalOpen(false);

  const applySearch = useCallback(() => {
    setSearchQuery(normalizeQuery(searchInput));
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
  }, []);

  const sortedAndFilteredRooms = useMemo(() => {
    const q = normalizeQuery(searchQuery).toLowerCase();

    const base = !q
      ? rooms
      : rooms.filter((room) => {
          const usersArr = Array.isArray(room.users) ? room.users : [];
          const text = [
            room.room,
            ...usersArr.map((u) =>
              (u.username || String(u.user_id || "")).trim()
            ),
            (room.last_sync_url || "").trim(),
          ]
            .join(" ")
            .toLowerCase();
          return text.includes(q);
        });

    // τρέχον πρώτο
    if (!currentRoom) return base;

    const current = base.filter((r) => r.room === currentRoom);
    const rest = base.filter((r) => r.room !== currentRoom);
    rest.sort((a, b) => a.room.localeCompare(b.room, "el"));

    return [...current, ...rest];
  }, [rooms, searchQuery, currentRoom]);

  const hasAppliedQuery = !!normalizeQuery(searchQuery);
  const showEmpty =
    initialized && !loading && sortedAndFilteredRooms.length === 0;

  const hasTypedQuery = !!normalizeQuery(searchInput);
  const currentRoomInfo = currentRoom ? rooms.find((r) => r.room === currentRoom) || null : null;
  const totalSessions = rooms.reduce((sum, room) => sum + safeUsersCount(room), 0);

  return (
    <>
      <div
        id="rooms-container"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* Title */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>
            Rooms
          </div>

          <div style={{ fontSize: 12, color: "#aaa" }}>
            {loading ? "🔄 ενημέρωση..." : ""}
          </div>
        </div>        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8,
          }}
        >
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: currentRoom ? "rgba(33, 150, 243, 0.14)" : "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "10px 12px",
              minWidth: 0,
            }}
          >
            <div style={{ color: "#aaa", fontSize: 12, fontWeight: 800 }}>Σύνδεση</div>
            <div style={{ color: "#fff", fontSize: 15, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentRoom || "Εκτός room"}
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            <div style={{ color: "#aaa", fontSize: 12, fontWeight: 800 }}>Δωμάτια</div>
            <div style={{ color: "#fff", fontSize: 15, fontWeight: 900 }}>{rooms.length}</div>
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            <div style={{ color: "#aaa", fontSize: 12, fontWeight: 800 }}>Συνδέσεις</div>
            <div style={{ color: "#fff", fontSize: 15, fontWeight: 900 }}>{totalSessions}</div>
          </div>
        </div>

        {currentRoomInfo?.last_sync_title && (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "10px 12px",
              color: "#ddd",
              fontSize: 13,
              lineHeight: 1.35,
            }}
          >
            <span style={{ color: "#aaa", fontWeight: 800 }}>Τελευταίο στο ενεργό room:</span>{" "}
            {currentRoomInfo.last_sync_url ? (
              <a href={currentRoomInfo.last_sync_url} style={{ color: "#7db7ff", fontWeight: 800 }}>
                {currentRoomInfo.last_sync_title}
              </a>
            ) : (
              <strong>{currentRoomInfo.last_sync_title}</strong>
            )}
          </div>
        )}



        {/* Search */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            id="roomSearch"
            placeholder="🔍 Αναζήτηση room / χρήστη / link"
            maxLength={80}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
              if (e.key === "Escape") clearSearch();
            }}
            style={{
              flex: "1 1 240px",
              height: 40,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.18)",
              background: "#ffffff",
              color: "#000000",
              outline: "none",
            }}
          />

          {/* ✅ Κεντρικό κουμπί τύπου A */}
          {A.search({
            onClick: applySearch,
            disabled: !hasTypedQuery,
            title: "Αναζήτηση",
            label: "Αναζήτηση",
          })}

          {hasAppliedQuery && (
            <ALikeButton onClick={clearSearch} variant="ghost" title="Καθαρισμός">
              Καθαρισμός
            </ALikeButton>
          )}
        </div>

        {errorMessage && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "#5b5b5b",
              fontSize: 13,
            }}
          >
            {errorMessage}
          </div>
        )}



        {!initialized && loading && <p style={{ margin: 0 }}>🔄 Φόρτωση...</p>}

        {showEmpty && (
          <div style={{ marginTop: 6, color: "#aaa" }}>Δεν βρέθηκαν rooms.</div>
        )}

        {sortedAndFilteredRooms.length > 0 && (
          <div
            id="rooms-list"
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {sortedAndFilteredRooms.map((room) => {
              const count = safeUsersCount(room);
              const isCurrent = !!currentRoom && currentRoom === room.room;

              const lockIcon = room.hasPassword ? (
                <span className="lock-icon">🔒</span>
              ) : null;

              const usersStr = renderUsersString(room);

              const lastUrl = (room.last_sync_url || "").trim();

              // ✅ πάρε τον τίτλο (χρησιμοποίησε ΜΟΝΟ το key που υπάρχει στο JSON)
              const lastTitle = (room.last_sync_title || room.last_sync_song_title || "").trim();

              const ts = room.last_sync_timestamp || null;
              const senderName =
                (room.last_sync_username || "").trim() || "Άγνωστος χρήστης";
              const timeSuffix =
                ts != null
                  ? ` (${formatTimeFromTimestamp(ts)} — ${senderName})`
                  : "";

              return (
                <div
                  key={room.room}
                  className={"room-row" + (isCurrent ? " current-room-row" : "")}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: isCurrent
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.04)",
                    padding: "12px 12px",
                    display: "flex",
                    gap: 12,
                    alignItems: "stretch",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        {lockIcon}
                        <button
                          type="button"
                          onClick={() => openUsersModalForRoom(room)}
                          title="Δες τους χρήστες του room"
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "#fff",
                            fontWeight: 900,
                            fontSize: 16,
                            textAlign: "left",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {room.room}
                        </button>
                      </div>

                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 30,
                          height: 22,
                          padding: "0 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#fff",
                          background: "rgba(255,255,255,0.12)",
                        }}
                        title="Συνδεδεμένοι"
                      >
                        {count}
                      </span>

                      {isCurrent && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "0 10px",
                            height: 22,
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            color: "#fff",
                            background: "rgba(231, 76, 60, 0.35)",
                            border: "1px solid rgba(231, 76, 60, 0.35)",
                          }}
                        >
                          ✅ Τρέχον
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: 6, color: "#ddd", fontSize: 13 }}>
                      <span style={{ color: "#aaa" }}>👥 </span>
                      {usersStr}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      {lastUrl ? (
                        <div style={{ color: "#cfcfcf" }}>
                          <span style={{ color: "#aaa" }}>🎵 </span>
                          <span style={{ color: "#aaa" }}>Τελευταίο:</span>{" "}
                          <a
                            href={lastUrl}

                            rel="noopener noreferrer"
                            style={{ color: "#7db7ff" }}
                            title={lastUrl}
                          >
                            {lastTitle || lastUrl}
                          </a>
                          <span style={{ color: "#aaa" }}>{timeSuffix}</span>
                        </div>
                      ) : (
                        <div style={{ color: "#aaa" }}>Δεν έχει σταλεί ακόμα τραγούδι.</div>
                      )}
                    </div>

                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      flex: "0 0 auto",
                    }}
                  >
                    {isCurrent ? (
                      <ALikeButton onClick={handleDisconnectRoom}>
                        Αποσύνδεση
                      </ALikeButton>
                    ) : (
                      <ALikeButton
                        onClick={() =>
                          handleConnectRoom(room.room, room.hasPassword)
                        }
                        disabled={!isLoggedIn}
                        title={
                          isLoggedIn
                            ? "Σύνδεση στο room"
                            : "Πρέπει να κάνεις login για να συνδεθείς."
                        }
                      >
                        Σύνδεση
                      </ALikeButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Users Modal */}
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
            if (e.target === e.currentTarget) closeUsersModal();
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

            <h3 style={{ marginTop: 0, fontSize: 18 }}>
              {`🎧 Room: ${usersModalRoom || ""}`}
            </h3>

            <div style={{ margin: "8px 0", fontSize: 14, color: "#bbb" }}>
              {usersModalLastSyncUrl ? (
                <p style={{ marginTop: 10, fontSize: 13 }}>
                  🎵 Τελευταίο τραγούδι:
                  <br />
                  <a
                    href={usersModalLastSyncUrl}

                    rel="noopener noreferrer"
                    style={{ color: "#4af" }}
                  >
                    {usersModalLastSyncUrl}
                  </a>
                  {usersModalLastSyncTimestamp != null && (
                    <>
                      {" "}
                      ({formatTimeFromTimestamp(usersModalLastSyncTimestamp)} —{" "}
                      {usersModalLastSyncUsername || "Άγνωστος χρήστης"})
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

            <div style={{ marginTop: 10, fontSize: 15 }}>
              {usersModalUsers.length === 0 ? (
                <p style={{ color: "#aaa" }}>Κανένας ενεργός χρήστης.</p>
              ) : (
                usersModalUsers.map((u, idx) => {
                  const idShort = (u.device_id || "").slice(0, 8) || "unknown";
                  const uname = (u.username || "").trim();
                  const name =
                    uname
                      ? `@${uname}`
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
