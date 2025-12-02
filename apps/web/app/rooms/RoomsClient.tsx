"use client";

import { useCallback, useEffect, useState } from "react";

type Room = {
  room: string;
  userCount: number;
  hasPassword: boolean;
};

type RoomsClientProps = {
  initialRooms: Room[];
  isLoggedIn: boolean;
  isAdmin: boolean;
  initialCurrentRoom: string | null;
};

type ApiResponse = {
  success: boolean;
  message?: string;
};

/**
 * RoomsClient
 *
 * Ανάλογο του παλιού shortcode, αλλά σε React:
 *  - Φόρμα δημιουργίας room
 *  - Λίστα rooms με πλήθος χρηστών
 *  - Κουμπιά Σύνδεση / Αποσύνδεση / Διαγραφή
 *  - Επικοινωνία με:
 *      - GET    /api/rooms
 *      - POST   /api/rooms/create
 *      - POST   /api/rooms/join
 *      - POST   /api/rooms/disconnect
 *      - DELETE /api/rooms/:room
 */
export default function RoomsClient({
  initialRooms,
  isLoggedIn,
  isAdmin,
  initialCurrentRoom,
}: RoomsClientProps) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentRoom, setCurrentRoom] = useState<string | null>(
    initialCurrentRoom
  );
  const [loading, setLoading] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusColor, setStatusColor] = useState<string>("#ccc");

  // -------------------------------------------------
  // Helper για refresh λίστας rooms από /api/rooms
  // -------------------------------------------------
  const refreshRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRooms(data as Room[]);
      } else if (Array.isArray(data.rooms)) {
        setRooms(data.rooms as Room[]);
      }
    } catch (err) {
      console.error("refreshRooms error:", err);
    }
  }, []);

  // Προαιρετικό auto refresh ανά 10s (όπως στο παλιό setInterval)
  useEffect(() => {
    const id = setInterval(() => {
      refreshRooms();
    }, 10000);
    return () => clearInterval(id);
  }, [refreshRooms]);

  const showStatus = (msg: string, color: string = "#ccc") => {
    setStatusMessage(msg);
    setStatusColor(color);
  };

  const callRepRoomsSwitch = (room: string | null, password: string) => {
    if (typeof window !== "undefined" && (window as any).RepRoomsSwitchRoom) {
      (window as any).RepRoomsSwitchRoom(room, password);
    }
  };

  // -------------------------------------------------
  // CREATE ROOM
  // -------------------------------------------------
  const handleCreateRoom = async () => {
    if (!isLoggedIn) {
      alert("Πρέπει να έχεις κάνει login για να δημιουργήσεις room.");
      return;
    }

    const room = createName.trim();
    const password = createPassword.trim();

    showStatus("", "#ccc");

    if (!room) {
      showStatus("⚠️ Γράψε όνομα για το νέο room.", "#f1c40f");
      return;
    }

    if (/\s/.test(room)) {
      showStatus(
        "⚠️ Το όνομα room δεν πρέπει να έχει κενά. Π.χ. 'myroom' ή 'my_room'.",
        "#f1c40f"
      );
      return;
    }

    setLoading(true);
    showStatus("⏳ Γίνεται δημιουργία room...", "#ccc");

    try {
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, password }),
      });

      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        showStatus(
          "❌ Δεν ήταν δυνατή η δημιουργία room: " +
            (json.message || "Άγνωστο σφάλμα."),
          "#e57373"
        );
        return;
      }

      // Όλα καλά: ενημέρωσε currentRoom & WebSocket
      setCurrentRoom(room);
      callRepRoomsSwitch(room, password);

      setCreateName("");
      setCreatePassword("");

      showStatus("✅ Το room δημιουργήθηκε.", "#81c784");

      // Φόρτωσε ξανά τη λίστα
      refreshRooms();
    } catch (err: any) {
      alert("❌ Σφάλμα επικοινωνίας: " + err.message);
      showStatus("❌ Σφάλμα επικοινωνίας.", "#e57373");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------
  // CONNECT ROOM
  // -------------------------------------------------
  const handleConnectRoom = async (room: string, hasPassword: boolean) => {
    if (!isLoggedIn) {
      alert("Πρέπει να έχεις κάνει login για να συνδεθείς σε room.");
      return;
    }

    let password = "";
    if (hasPassword) {
      const answer = window.prompt(
        `Το room "${room}" είναι κλειδωμένο.\nΔώσε κωδικό πρόσβασης:`,
        ""
      );
      if (answer === null) {
        return;
      }
      password = answer.trim();
    }

    setLoading(true);
    showStatus("⏳ Σύνδεση στο room...", "#ccc");

    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, password }),
      });

      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        showStatus(
          "❌ Δεν ήταν δυνατή η σύνδεση στο room: " +
            (json.message || "Άγνωστο σφάλμα."),
          "#e57373"
        );
        return;
      }

      setCurrentRoom(room);
      callRepRoomsSwitch(room, password);

      showStatus("✅ Συνδέθηκες στο room.", "#81c784");
      refreshRooms();
    } catch (err: any) {
      alert("❌ Σφάλμα επικοινωνίας: " + err.message);
      showStatus("❌ Σφάλμα επικοινωνίας.", "#e57373");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------
  // DISCONNECT
  // -------------------------------------------------
  const handleDisconnect = async () => {
    if (!currentRoom) {
      return;
    }

    setLoading(true);
    showStatus("⏳ Αποσύνδεση από το room...", "#ccc");

    try {
      const res = await fetch("/api/rooms/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: currentRoom }),
      });

      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        showStatus(
          "❌ Δεν ήταν δυνατή η αποσύνδεση από το room: " +
            (json.message || "Άγνωστο σφάλμα."),
          "#e57373"
        );
        return;
      }

      setCurrentRoom(null);
      callRepRoomsSwitch(null, "");

      showStatus("✅ Αποσυνδέθηκες από το room.", "#81c784");
      refreshRooms();
    } catch (err: any) {
      alert("❌ Σφάλμα επικοινωνίας: " + err.message);
      showStatus("❌ Σφάλμα επικοινωνίας.", "#e57373");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------
  // DELETE ROOM (ADMIN ONLY)
  // -------------------------------------------------
  const handleDeleteRoom = async (room: string) => {
    if (!isAdmin) return;

    const ok = window.confirm(
      `Να διαγραφεί οριστικά το room "${room}" ; Όλοι οι συνδεδεμένοι χρήστες θα αποσυνδεθούν.`
    );
    if (!ok) return;

    setLoading(true);
    showStatus("⏳ Διαγραφή room...", "#ccc");

    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(room)}`, {
        method: "DELETE",
      });

      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        showStatus(
          "❌ Δεν ήταν δυνατή η διαγραφή room: " +
            (json.message || "Άγνωστο σφάλμα."),
          "#e57373"
        );
        return;
      }

      if (currentRoom === room) {
        setCurrentRoom(null);
        callRepRoomsSwitch(null, "");
      }

      showStatus("✅ Το room διαγράφηκε.", "#81c784");
      refreshRooms();
    } catch (err: any) {
      alert("❌ Σφάλμα επικοινωνίας: " + err.message);
      showStatus("❌ Σφάλμα επικοινωνίας.", "#e57373");
    } finally {
      setLoading(false);
    }
  };

  // Φιλτράρισμα λίστας rooms
  const filteredRooms = rooms.filter((r) =>
    r.room.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="rooms-container">
      {/* Φόρμα δημιουργίας room */}
      <div className="create-room-box">
        <h4>Δημιουργία νέου room</h4>
        <div className="create-room-fields">
          <input
            type="text"
            placeholder="Όνομα room (χωρίς κενά)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            disabled={loading}
            className="create-room-input"
          />
          <input
            type="password"
            placeholder="Προαιρετικός κωδικός (για κλειδωμένο room)"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            disabled={loading}
            className="create-room-input"
          />
          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={loading}
            className="create-room-button"
          >
            ✚ Room
          </button>
        </div>
        {statusMessage && (
          <div
            className="rooms-status-message"
            style={{ color: statusColor }}
          >
            {statusMessage}
          </div>
        )}
      </div>

      {/* Πάνω μέρος: αναζήτηση & τρέχον room */}
      <div className="rooms-top-bar">
        <input
          type="text"
          placeholder="Αναζήτηση room..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={loading}
          className="rooms-search-input"
        />

        <div className="current-room-info">
          {currentRoom ? (
            <>
              <span>Τρέχον room: </span>
              <strong>{currentRoom}</strong>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="room-action-btn"
              >
                Αποσύνδεση
              </button>
            </>
          ) : (
            <span>Δεν είσαι συνδεδεμένος σε room.</span>
          )}
        </div>
      </div>

      {/* Λίστα rooms */}
      <div className="rooms-list">
        {filteredRooms.length === 0 && (
          <div className="no-rooms">Δεν υπάρχουν διαθέσιμα rooms.</div>
        )}

        {filteredRooms.map((r) => {
          const isCurrent = r.room === currentRoom;
          return (
            <div
              key={r.room}
              className={`room-row ${isCurrent ? "room-row-current" : ""}`}
            >
              <div className="room-main-info">
                <span className="room-name">{r.room}</span>
                {r.hasPassword && (
                  <span className="room-locked">🔒 Κλειδωμένο</span>
                )}
              </div>
              <div className="room-secondary-info">
                <span className="room-users">
                  Χρήστες: {r.userCount ?? 0}
                </span>

                <div className="room-actions">
                  {!isCurrent && (
                    <button
                      type="button"
                      className="room-action-btn"
                      onClick={() =>
                        handleConnectRoom(r.room, r.hasPassword)
                      }
                      disabled={loading}
                    >
                      Σύνδεση
                    </button>
                  )}
                  {isCurrent && (
                    <button
                      type="button"
                      className="room-action-btn"
                      onClick={handleDisconnect}
                      disabled={loading}
                    >
                      Αποσύνδεση
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      className="room-action-btn delete-room-btn"
                      onClick={() => handleDeleteRoom(r.room)}
                      disabled={loading}
                    >
                      🗑️ Διαγραφή
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
