/*
 * rooms.js – Implements an in‑memory manager for chat rooms.
 *
 * Each room can optionally have a password. When a room is created with
 * a password, a random salt is generated and the SHA256(salt+password) is
 * stored. The salt is kept alongside the hash to verify passwords later.
 *
 * The manager tracks:
 *   - metaData:   persistent metadata about rooms (hasPassword, salt, hash)
 *   - clients:    live WebSocket clients connected per room
 *   - lastSync:   the last song_sync message sent in a room
 *
 * Rooms are stored only in memory by default, but you can provide
 * a metaFile option to persist the room metadata (passwords) to JSON.
 */

const fs = require("fs");
const crypto = require("crypto");

// Compute SHA256 hex digest of a string
function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

class RoomManager {
  /**
   * Create a new RoomManager. Optionally pass { metaFile: "path.json" }
   * to persist room metadata across restarts.
   */
  constructor(opts = {}) {
    this.metaFile = opts.metaFile || null;
    this.metaData = new Map(); // room => { hasPassword, salt, hash }
    this.clients  = new Map(); // room => Map(tabKey => { ws, deviceId, userId, username })
    this.lastSync = new Map(); // room => last song_sync payload
    this._listCache = null;    // { time, data } for listRooms caching
    if (this.metaFile) {
      this.loadMeta();
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  /**
   * Load room metadata (passwords) from disk. If the file does not exist
   * or cannot be parsed, the metadata map will remain empty.
   */
  loadMeta() {
    if (!this.metaFile) return;
    try {
      const raw = fs.readFileSync(this.metaFile, "utf8");
      const obj = JSON.parse(raw);
      this.metaData.clear();
      Object.keys(obj).forEach((room) => {
        this.metaData.set(room, obj[room]);
      });
      console.log(`✅ Loaded rooms meta from ${this.metaFile} (${this.metaData.size} rooms).`);
    } catch (err) {
      console.warn(`ℹ️ Could not load rooms meta (${this.metaFile}): ${err.message}`);
    }
  }

  /**
   * Persist the current metadata to disk if a metaFile was provided.
   */
  async saveMeta() {
    if (!this.metaFile) return;
    try {
      const obj = {};
      for (const [room, meta] of this.metaData.entries()) {
        obj[room] = meta;
      }
      await fs.promises.writeFile(this.metaFile, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
      console.error("❌ Failed to save rooms meta:", err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Room management
  // ---------------------------------------------------------------------------

  /**
   * Return true if either metadata or live clients exist for the room.
   */
  hasRoom(room) {
    return this.metaData.has(room) || this.clients.has(room);
  }

  /**
   * Ensure that internal maps exist for a room. If metadata does not exist,
   * it will be initialised with no password. Always creates an entry in
   * this.clients.
   */
  ensureRoom(room) {
    if (!this.clients.has(room)) {
      this.clients.set(room, new Map());
    }
    if (!this.metaData.has(room)) {
      this.metaData.set(room, { hasPassword: false, salt: "", hash: "" });
      this.saveMeta();
    }
  }

  /**
   * Create a new room. If it already exists, returns { ok: false }.
   * A random salt is generated and the password hashed.
   */
  createRoom(room, password = "") {
  const name = String(room || "").trim();
  if (!name) {
    return { ok: false, message: "Missing room name." };
  }

  // Αν το room υπάρχει ήδη, δες αν είναι "άδειο" (χωρίς clients)
  if (this.hasRoom(name)) {
    const userCount = this.getRoomDeviceIds(name).length;

    // ✅ Αν ΔΕΝ έχει κανέναν συνδεδεμένο χρήστη, το ξαναχρησιμοποιούμε
    if (userCount === 0) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = sha256(salt + password);

      this.metaData.set(name, {
        hasPassword: !!password,
        salt,
        hash,
      });

      // βεβαιώσου ότι υπάρχει Map για clients, έστω και άδειο
      if (!this.clients.has(name)) {
        this.clients.set(name, new Map());
      }

      this._listCache = null;
      this.saveMeta();
      console.log(`♻️ Room reused: ${name} (hasPassword: ${!!password})`);
      return { ok: true, reused: true };
    }

    // Υπάρχει room ΚΑΙ έχει χρήστες → κανονικό error
    return { ok: false, message: "Το δωμάτιο υπάρχει ήδη." };
  }

  // ✅ Κανονική δημιουργία νέου room
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = sha256(salt + password);
  this.metaData.set(name, {
    hasPassword: !!password,
    salt,
    hash,
  });
  this.clients.set(name, new Map());
  this._listCache = null;
  this.saveMeta();
  console.log(`✅ Room created: ${name} (hasPassword: ${!!password})`);
  return { ok: true };
}


  /**
   * Verify that a password matches a room. Returns an object with
   * ok: boolean and code/message fields for errors.
   */
  verifyPassword(room, password = "") {
    const meta = this.metaData.get(room);
    if (!meta) {
      return { ok: false, code: "NOT_FOUND", message: "NOT_FOUND" };
    }
    if (!meta.hasPassword) {
      return { ok: true, code: "NO_PASSWORD" };
    }
    const expected = meta.hash;
    const attempt = sha256(meta.salt + password);
    if (attempt === expected) {
      return { ok: true };
    }
    return { ok: false, code: "WRONG_PASSWORD", message: "WRONG_PASSWORD" };
  }

  /**
   * List rooms along with metadata and live user counts. Uses a small
   * cache (2s) to avoid recomputing counts too frequently.
   *
   * Returns an array of objects: { name, hasPassword, userCount }
   */
  listRooms() {
    const now = Date.now();
    if (this._listCache && now - this._listCache.time < 2000) {
      return this._listCache.data;
    }
    const result = [];
    // Union of rooms from metadata and live clients
    const allNames = new Set([
      ...Array.from(this.metaData.keys()),
      ...Array.from(this.clients.keys()),
    ]);
    for (const name of allNames) {
      const meta = this.metaData.get(name) || { hasPassword: false };
      const uniqueIds = this.getRoomDeviceIds(name);
      result.push({
        name,
        hasPassword: !!meta.hasPassword,
        userCount: uniqueIds.length,
      });
    }
    // sort by descending userCount then by name
    result.sort((a, b) => (b.userCount - a.userCount) || a.name.localeCompare(b.name));
    this._listCache = { time: now, data: result };
    return result;
  }

  // ---------------------------------------------------------------------------
  // Client management
  // ---------------------------------------------------------------------------

  /**
   * Add a client (WebSocket) to a room. Each browser tab is given a unique
   * key (deviceId + random suffix) to allow multiple tabs from the same
   * device to be tracked individually. An existing tab with the same key
   * will be closed to keep only the latest connection.
   */
  addClient(room, deviceId, ws, tabId = null) {
    this.ensureRoom(room);
    const roomMap = this.clients.get(room);
    // Generate a unique key for this tab
    const suffix = tabId || Math.random().toString(36).slice(2, 10);
    const tabKey = `${deviceId}_${suffix}`;
    // If a client with this tabKey already exists, close it
    const existing = roomMap.get(tabKey);
    if (existing && existing.ws && existing.ws.readyState === 1) {
      try {
        existing.ws.close(4001, "Replaced by new tab connection");
      } catch {}
    }
    roomMap.set(tabKey, { ws, deviceId, userId: null, username: null });
    this._listCache = null;
  }

  /**
   * Remove a client from a room. If the room becomes empty, it is removed from
   * the clients map (but metadata and lastSync remain until deletion).
   */
  removeClient(room, ws) {
    const roomMap = this.clients.get(room);
    if (!roomMap) return;
    for (const [key, entry] of roomMap.entries()) {
      if (entry.ws === ws) {
        roomMap.delete(key);
        break;
      }
    }
    if (roomMap.size === 0) {
      this.clients.delete(room);
    }
    this._listCache = null;
  }

  /**
   * Return an array of unique device IDs connected to a room.
   */
  getRoomDeviceIds(room) {
    const roomMap = this.clients.get(room);
    if (!roomMap) return [];
    const ids = new Set();
    for (const entry of roomMap.values()) {
      if (entry.deviceId) ids.add(entry.deviceId);
    }
    return Array.from(ids);
  }

  /**
   * Update userId and username metadata for all tabs belonging to a device
   * within a room. This allows all tabs to reflect the logged-in user.
   */
  setClientMeta(room, deviceId, userId, username) {
    const roomMap = this.clients.get(room);
    if (!roomMap) return;
    const prefix = `${deviceId}_`;
    for (const [key, entry] of roomMap.entries()) {
      if (key.startsWith(prefix)) {
        entry.userId = userId;
        entry.username = username;
      }
    }
  }

  /**
   * Get the metadata (userId, username) for a specific client tab within a room.
   * Note: deviceId parameter here refers to the tabKey, not the plain deviceId.
   */
  getClientMeta(room, deviceId) {
    const roomMap = this.clients.get(room);
    if (!roomMap) return null;
    const entry = roomMap.get(deviceId);
    if (!entry) return null;
    return { userId: entry.userId || null, username: entry.username || null };
  }

  /**
   * Return a list of users present in a room. Each device appears once even
   * if multiple tabs are open. Returns objects with device_id, user_id and username.
   */
  getRoomUsers(room) {
    const roomMap = this.clients.get(room);
    if (!roomMap) return [];
    const users = new Map();
    for (const entry of roomMap.values()) {
      const deviceId = entry.deviceId;
      if (!deviceId) continue;
      if (!users.has(deviceId)) {
        users.set(deviceId, {
          device_id: deviceId,
          user_id: entry.userId || null,
          username: entry.username || null,
        });
      }
    }
    return Array.from(users.values());
  }

  /**
   * Return an array of WebSocket instances connected to a room.
   */
  getRoomClients(room) {
    const roomMap = this.clients.get(room);
    if (!roomMap) return [];
    const sockets = [];
    for (const entry of roomMap.values()) {
      if (entry.ws) sockets.push(entry.ws);
    }
    return sockets;
  }

  // ---------------------------------------------------------------------------
  // Deletion / cleanup
  // ---------------------------------------------------------------------------

  /**
   * Delete an entire room: disconnect all clients, remove metadata, and clear
   * lastSync. Returns { ok: true } or { ok: false, message }.
   */
  deleteRoom(room) {
    const name = String(room || "").trim();
    if (!name) {
      return { ok: false, message: "Missing room name." };
    }
    // Close all sockets
    const roomMap = this.clients.get(name);
    if (roomMap) {
      for (const entry of roomMap.values()) {
        if (entry && entry.ws) {
          try { entry.ws.close(1000, "Room deleted"); } catch {}
        }
      }
      this.clients.delete(name);
    }
    // Remove metadata and last sync
    this.metaData.delete(name);
    this.lastSync.delete(name);
    this._listCache = null;
    this.saveMeta();
    return { ok: true };
  }

  /**
   * Remove all rooms. Useful for manual resets.
   */
  clearAllRooms() {
    for (const [room, roomMap] of this.clients.entries()) {
      for (const entry of roomMap.values()) {
        if (entry && entry.ws) {
          try { entry.ws.close(1000, "Server reset"); } catch {}
        }
      }
    }
    this.clients.clear();
    this.metaData.clear();
    this.lastSync.clear();
    this._listCache = null;
    this.saveMeta();
  }

  // ---------------------------------------------------------------------------
  // Song sync tracking
  // ---------------------------------------------------------------------------

  /**
   * Store the last song_sync payload for a room.
   */
  setLastSync(room, payload) {
    this.lastSync.set(room, payload);
  }

  /**
   * Retrieve the last song_sync payload for a room, or undefined.
   */
  getLastSync(room) {
    return this.lastSync.get(room);
  }
}

module.exports = { RoomManager };