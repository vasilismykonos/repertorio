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

type ApiResponse<T = any> = {
  success: boolean;
  message?: string;
  data?: T;
};

declare global {
  interface Window {
    RepRoomsSwitchRoom?: (room: string | null, password: string) => void;
  }
}

/**
 * Client component που υλοποιεί:
 * - λίστα rooms
 * - δημιουργία room
 * - σύνδεση / αποσύνδεση
 * - διαγραφή (μόνο admin)
 *
 * Μιλάει με Next API routes που ΕΣΥ θα υλοποιήσεις στο NestJS:
 *  - GET    /api/rooms
 *  - POST   /api/rooms/create
 *  - POST   /api/rooms/connect
 *  - POST   /api/rooms/disconnect
 *  - DELETE /api/rooms/:room
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
    if (typeof window !== "undefined" && window.RepRoomsSwitchRoom) {
      window.RepRoomsSwitchRoom(room, password);
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
      callRepRoomsSwitch(room, password || "");

      setCreateName("");
      setCreatePassword("");
      showStatus("✅ Το room δημιουργήθηκε, σύνδεση...", "#81c784");

      // Μικρό delay για να ενημερωθεί ο Node, μετά refresh
      setTimeout(() => {
        refreshRooms();
      }, 800);
    } catch (err: any) {
      showStatus("❌ Σφάλμα επικοινωνίας: " + err.message, "#e57373");
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
      const res = await fetch("/api/rooms/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, password }),
      });

      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        if (json.message === "NOT_FOUND") {
          alert("Το room δεν βρέθηκε ή έχει κλείσει.");
        } else if (json.message === "WRONG_PASSWORD") {
          alert("❌ Λάθος κωδικός για αυτό το room.");
        } else {
          alert("❌ Σφάλμα επιβεβαίωσης room.");
        }
        showStatus("❌ Σφάλμα σύνδεσης στο room.", "#e57373");
        return;
      }

      setCurrentRoom(room);
      callRepRoomsSwitch(room, password || "");

      showStatus("✅ Συνδέθηκες στο room.", "#81c784");

      setTimeout(() => {
        refreshRooms();
      }, 800);
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
    if (!currentRoom) return;

    setLoading(true);
    showStatus("⏳ Αποσύνδεση από το room...", "#ccc");

    try {
      const res = await fetch("/api/rooms/disconnect", {
        method: "POST",
      });
      const json = (await res.json()) as ApiResponse;

      if (!json.success) {
        alert("❌ Σφάλμα αποσύνδεσης από room.");
        showStatus("❌ Σφάλμα αποσύνδεσης.", "#e57373");
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
        alert("❌ Αποτυχία διαγραφής room.");
        showStatus("❌ Αποτυχία διαγραφής.", "#e57373");
        return;
      }

      // Αν ο τρέχων χρήστης ήταν μέσα σε αυτό το room:
      if (currentRoom === room) {
        setCurrentRoom(null);
        callRepRoomsSwitch(null, "");
      }

      showStatus("✅ Το room διαγράφηκε επιτυχώς.", "#81c784");
      refreshRooms();
    } catch (err: any) {
      alert("❌ Σφάλμα επικοινωνίας: " + err.message);
      showStatus("❌ Σφάλμα επικοινωνίας.", "#e57373");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------
  // RENDER
  // -------------------------------------------------
  const filteredRooms = rooms.filter((r) =>
    r.room.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="rooms-container">
      {/* Βοηθητικό κείμενο, όπως στο παλιό shortcode */}
      <p
        className="rc-help rc-help-bottom"
        style={{ marginTop: 8, marginBottom: 8 }}
      >
        Συνδεθείτε με τους φίλους σας στο ίδιο room, πατήστε το 🔄Room και
        στείλτε τους το τραγούδι!
      </p>

      {/* Top bar: αναζήτηση + δημιουργία room */}
      <div id="rooms-topbar">
        <input
          type="text"
          id="roomSearch"
          placeholder="🔍 Αναζήτηση room"
          maxLength={20}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {/* Πεδίο ονόματος νέου room */}
        <input
          type="text"
          placeholder="Νέο room..."
          maxLength={20}
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          style={{ marginLeft: 8 }}
        />

        {/* Προαιρετικός κωδικός */}
        <input
          type="password"
          placeholder="Κωδικός (προαιρετικός)"
          value={createPassword}
          onChange={(e) => setCreatePassword(e.target.value)}
          style={{ marginLeft: 8 }}
        />

        <button
          id="createRoomBtn"
          className="topbar-create-btn"
          onClick={handleCreateRoom}
          disabled={loading || !isLoggedIn}
          title={
            !isLoggedIn
              ? "Πρέπει να κάνεις login για να δημιουργήσεις room."
              : undefined
          }
        >
          ✚<br />
          <span style={{ fontSize: 13 }}>Room</span>
        </button>
      </div>

      {/* Status line */}
      {statusMessage && (
        <p style={{ marginTop: 6, color: statusColor, fontSize: 13 }}>
          {statusMessage}
        </p>
      )}

      {/* Λίστα rooms */}
      <div style={{ marginTop: 10, fontWeight: 600 }}>🔄 Ενεργά Rooms</div>
      <div id="rooms-list">
        {filteredRooms.length === 0 && (
          <p style={{ marginTop: 10, color: "#aaa" }}>
            Δεν υπάρχουν ενεργά rooms αυτή τη στιγμή.
          </p>
        )}

        {filteredRooms.map((r) => {
          const isCurrent = currentRoom === r.room;
          const label = isCurrent ? "❌ Έξοδος" : "🔗 Σύνδεση";

          return (
            <div
              key={r.room}
              className={`room-row ${isCurrent ? "current-room-row" : ""}`}
              data-room={r.room}
            >
              <div className="room-main">
                <div className="room-main-line">
                  {r.hasPassword && <span className="lock-icon">🔒</span>}
                  <span className="room-title">
                    <strong style={{ color: "#fff" }}>{r.room}</strong>
                  </span>
                  <span className="room-count-badge">{r.userCount}</span>
                  {isCurrent && (
                    <span className="current-room-badge">Τρέχον room</span>
                  )}
                </div>
              </div>

              <div className="room-actions">
                <button
                  className={`room-action-btn connect-room-btn${
                    isCurrent ? " exit-btn" : ""
                  }`}
                  onClick={() =>
                    isCurrent
                      ? handleDisconnect()
                      : handleConnectRoom(r.room, r.hasPassword)
                  }
                  disabled={loading}
                >
                  {label}
                </button>

                {isAdmin && (
                  <button
                    className="room-action-btn delete-room-btn"
                    onClick={() => handleDeleteRoom(r.room)}
                    disabled={loading}
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
  );
}
