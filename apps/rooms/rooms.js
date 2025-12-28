// apps/rooms/rooms.js
const fs = require("fs");
const crypto = require("crypto");

/**
 * Υπολογίζει SHA256(salt + password)
 */
function sha256WithSalt(salt, password) {
  return crypto
    .createHash("sha256")
    .update(salt + password, "utf8")
    .digest("hex");
}

/**
 * RoomManager – κεντρική in-memory διαχείριση rooms.
 *
 * - metaData: room -> { hasPassword, salt, passwordHash }
 * - clients: room -> Set<WebSocket>
 * - clientInfo: ws -> { room, deviceId, userId, username }
 * - lastSync: room -> { syncId, payload, userId, username }
 */
class RoomManager {
  constructor(options = {}) {
    this.metaFile = options.metaFile || "./rooms-meta.json";

    this.metaData = new Map(); // room -> { hasPassword, salt, passwordHash }
    this.clients = new Map(); // room -> Set<WebSocket>
    this.clientInfo = new Map(); // ws -> { room, deviceId, userId, username }
    this.lastSync = new Map(); // room -> { syncId, payload, userId, username }

    this.loadMeta();
  }

  // ---------------------------------------------------------------------------
  // Meta load/save
  // ---------------------------------------------------------------------------

  loadMeta() {
    try {
      if (!fs.existsSync(this.metaFile)) {
        return;
      }
      const text = fs.readFileSync(this.metaFile, "utf8");
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== "object") return;

      for (const [room, meta] of Object.entries(obj)) {
        this.metaData.set(room, {
          hasPassword: !!meta.hasPassword,
          salt: meta.salt || null,
          passwordHash: meta.passwordHash || null,
        });
      }
    } catch (err) {
      console.error("[RoomManager] Failed to load meta:", err);
    }
  }

  saveMeta() {
    try {
      const obj = {};
      for (const [room, meta] of this.metaData.entries()) {
        obj[room] = {
          hasPassword: !!meta.hasPassword,
          salt: meta.salt || null,
          passwordHash: meta.passwordHash || null,
        };
      }
      fs.writeFileSync(this.metaFile, JSON.stringify(obj, null, 2), "utf8");
      // console.log("[RoomManager] Saved meta to", this.metaFile);
    } catch (err) {
      console.error("[RoomManager] Failed to save meta:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Βασικές λειτουργίες rooms
  // ---------------------------------------------------------------------------

  ensureRoom(room) {
    if (!this.metaData.has(room)) {
      this.metaData.set(room, {
        hasPassword: false,
        salt: null,
        passwordHash: null,
      });
      this.saveMeta();
    }
    if (!this.clients.has(room)) {
      this.clients.set(room, new Set());
    }
  }

  getRoomMeta(room) {
    return this.metaData.get(room) || {
      hasPassword: false,
      salt: null,
      passwordHash: null,
    };
  }

  setPassword(room, password) {
    const clean = String(room || "").trim();
    this.ensureRoom(clean);

    if (!password) {
      // Καθαρισμός password
      this.metaData.set(clean, {
        hasPassword: false,
        salt: null,
        passwordHash: null,
      });
      this.saveMeta();
      return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = sha256WithSalt(salt, password.trim());

    this.metaData.set(clean, {
      hasPassword: true,
      salt,
      passwordHash: hash,
    });
    this.saveMeta();
  }
  /**
   * Δημιουργεί ένα room (αν δεν υπάρχει ήδη) και προαιρετικά θέτει password.
   * Αν το room υπάρχει, απλώς ενημερώνει ή καθαρίζει το password.
   */
  createRoom(room, password) {
    const clean = String(room || "").trim();
    if (!clean) {
      throw new Error("Room name is required");
    }

    // Βεβαιώσου ότι υπάρχουν meta + clients set
    this.ensureRoom(clean);

    // Αν υπάρχει password, το ορίζουμε, αλλιώς καθαρίζουμε τυχόν παλιό.
    if (typeof password === "string" && password.trim() !== "") {
      this.setPassword(clean, password);
    } else {
      this.setPassword(clean, null);
    }
  }

  deleteRoom(room) {
    const clean = String(room || "").trim();
    if (!clean) return;

    // Κλείσε όλους τους clients
    const set = this.clients.get(clean);
    if (set) {
      for (const ws of set) {
        try {
          ws.close(1000, "room_deleted");
        } catch {}
      }
      this.clients.delete(clean);
    }

    this.metaData.delete(clean);
    this.lastSync.delete(clean);
    this.saveMeta();
  }

  /**
   * Επιστρέφει λίστα rooms για UI.
   */
  getRoomsList() {
    const result = [];
    for (const [room, meta] of this.metaData.entries()) {
      const set = this.clients.get(room);
      const userCount = set ? set.size : 0;
      result.push({
        room,
        userCount,
        hasPassword: !!meta.hasPassword,
      });
    }
    // sort αλφαβητικά
    result.sort((a, b) => a.room.localeCompare(b.room, "el"));
    return result;
  }

  /**
   * Επισκόπηση rooms για τα REST endpoints (/health, /get-rooms, /status).
   *
   * Επιστρέφει για κάθε room:
   *   - room
   *   - userCount
   *   - hasPassword
   *   - users[]: { device_id, user_id, username }
   *   - last_sync_url
   *   - last_sync_timestamp
   *   - last_sync_username
   */
  getRoomsOverview() {
    const base = this.getRoomsList();
    return base.map((item) => {
      const set = this.clients.get(item.room);
      const users = [];

      if (set) {
        for (const ws of set) {
          const info = this.getClientInfo(ws);
          users.push({
            device_id: info.deviceId || undefined,
            user_id:
              typeof info.userId === "number" ? info.userId : undefined,
            username:
              typeof info.username === "string" ? info.username : null,
          });
        }
      }

      const lastSync = this.getLastSync(item.room) || null;

      let last_sync_url = null;
      let last_sync_timestamp = null;
      let last_sync_username = null;

      if (
        lastSync &&
        lastSync.payload &&
        typeof lastSync.payload === "object"
      ) {
        if (typeof lastSync.payload.url === "string") {
          last_sync_url = lastSync.payload.url;
        }
        if (typeof lastSync.payload.sentAt === "number") {
          last_sync_timestamp = lastSync.payload.sentAt;
        }
      }

      if (lastSync) {
        if (typeof lastSync.username === "string" && lastSync.username.trim()) {
          last_sync_username = lastSync.username;
        } else if (
          typeof lastSync.userId === "number" &&
          Number.isFinite(lastSync.userId)
        ) {
          last_sync_username = "User #" + lastSync.userId;
        }
      }

      return {
        ...item,
        users,
        last_sync_url,
        last_sync_timestamp,
        last_sync_username,
      };
    });
  }

  /**
   * Συνολικός αριθμός clients σε όλα τα rooms.
   */
  getTotalClients() {
    let total = 0;
    for (const set of this.clients.values()) {
      total += set.size;
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // Password check
  // ---------------------------------------------------------------------------

  verifyPassword(room, password = "") {
    const clean = String(room || "").trim();
    const meta = this.metaData.get(clean);
    if (!meta || !meta.hasPassword) {
      // room χωρίς password
      return true;
    }
    if (!password || password.trim() === "") return false;
    if (!meta.salt || !meta.passwordHash) return false;

    const hash = sha256WithSalt(meta.salt, password.trim());
    return hash === meta.passwordHash;
  }

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  attachClient(room, ws, info = {}) {
    const clean = String(room || "").trim();
    if (!clean) return;
    this.ensureRoom(clean);

    // remove from previous room, αν υπάρχει
    const existing = this.clientInfo.get(ws);
    if (existing && existing.room && existing.room !== clean) {
      this.detachClient(ws);
    }

    const set = this.clients.get(clean);
    set.add(ws);

    this.clientInfo.set(ws, {
      room: clean,
      deviceId: info.deviceId || null,
      userId: info.userId ?? null,
      username: info.username || null,
    });

    return set.size;
  }

  detachClient(ws) {
    const info = this.clientInfo.get(ws);
    if (!info || !info.room) return { room: null, userCount: 0 };

    const room = info.room;
    const set = this.clients.get(room);
    let userCount = 0;
    if (set) {
      set.delete(ws);
      userCount = set.size;
      if (set.size === 0) {
        // δεν διαγράφω meta / room, κρατάμε το room
      }
    }

    this.clientInfo.delete(ws);
    return { room, userCount };
  }

  getClientInfo(ws) {
    return (
      this.clientInfo.get(ws) || {
        room: null,
        deviceId: null,
        userId: null,
        username: null,
      }
    );
  }

  // ---------------------------------------------------------------------------
  // song_sync state
  // ---------------------------------------------------------------------------

  setLastSync(room, payload) {
    const clean = String(room || "").trim();
    if (!clean) return;
    this.lastSync.set(clean, payload);
  }

  getLastSync(room) {
    const clean = String(room || "").trim();
    return this.lastSync.get(clean);
  }
}

module.exports = {
  RoomManager,
};
