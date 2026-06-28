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
 * - clientInfo: ws -> { room, clientId, deviceId, tabId, userId, username }
 * - lastSync: room -> { syncId, requestId, payload, userId, username, senderClientId }
 */
class RoomManager {
  constructor(options = {}) {
    this.metaFile = options.metaFile || "./rooms-meta.json";

    this.metaData = new Map(); // room -> { hasPassword, salt, passwordHash }
    this.clients = new Map(); // room -> Set<WebSocket>
    this.clientInfo = new Map(); // ws -> { room, deviceId, userId, username }
    this.lastSync = new Map(); // room -> { syncId, payload, userId, username }
    this.songHistory = new Map(); // room -> recent sync entries[]
    this.syncReceipts = new Map(); // room -> identityKey -> { lastSyncId, requestIds[] }

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
    this.songHistory.delete(clean);
    this.syncReceipts.delete(clean);
    this.saveMeta();
  }

  /**
   * Επιστρέφει λίστα rooms για UI.
   */
  getRoomsList() {
    const result = [];
    for (const [room, meta] of this.metaData.entries()) {
      const counts = this.getPresenceCounts(room);
      result.push({
        room,
        userCount: counts.uniqueUsers,
        uniqueUsers: counts.uniqueUsers,
        sessions: counts.sessions,
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
   *   - userCount (unique logged-in users / guest identities)
   *   - sessions (open devices/tabs)
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
            client_id: info.clientId || undefined,
            device_id: info.deviceId || undefined,
            tab_id: info.tabId || undefined,
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
      let last_sync_title = null;
      let last_sync_song_id = null;
      let last_sync_tonicity = null;
      let last_sync_request_id = null;
      const song_history = this.getSongHistory(item.room);

      if (
        lastSync &&
        lastSync.payload &&
        typeof lastSync.payload === "object"
      ) {
        if (typeof lastSync.payload.url === "string") {
          last_sync_url = lastSync.payload.url;
        }
        if (typeof lastSync.payload.title === "string") {
          last_sync_title = lastSync.payload.title;
        }
        const songId = Number(lastSync.payload.songId);
        if (Number.isFinite(songId) && songId > 0) {
          last_sync_song_id = Math.trunc(songId);
        }
        if (typeof lastSync.payload.selectedTonicity === "string") {
          last_sync_tonicity = lastSync.payload.selectedTonicity;
        }
        if (typeof lastSync.payload.sentAt === "number") {
          last_sync_timestamp = lastSync.payload.sentAt;
        }
      }

      if (lastSync) {
        if (typeof lastSync.requestId === "string" && lastSync.requestId.trim()) {
          last_sync_request_id = lastSync.requestId;
        }
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
        last_sync_title,
        last_sync_song_id,
        last_sync_tonicity,
        last_sync_request_id,
        song_history,
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

    const existingInfo = this.clientInfo.get(ws) || {};
    this.clientInfo.set(ws, {
      room: clean,
      clientId: info.clientId || existingInfo.clientId || null,
      deviceId: info.deviceId || null,
      tabId: info.tabId || existingInfo.tabId || null,
      userId: info.userId ?? null,
      username: info.username || null,
      joinedAt: existingInfo.joinedAt || Date.now(),
      lastSeenAt: Date.now(),
    });

    return set.size;
  }

  updateClientInfo(ws, patch = {}) {
    const existing = this.clientInfo.get(ws) || {
      room: null,
      clientId: null,
      deviceId: null,
      tabId: null,
      userId: null,
      username: null,
      joinedAt: Date.now(),
    };

    const next = {
      ...existing,
      ...patch,
      lastSeenAt: Date.now(),
    };

    this.clientInfo.set(ws, next);
    return next;
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
        clientId: null,
        deviceId: null,
        tabId: null,
        userId: null,
        username: null,
        joinedAt: null,
        lastSeenAt: null,
      }
    );
  }

  getPresenceCounts(room) {
    const clean = String(room || "").trim();
    const set = this.clients.get(clean);
    if (!set) return { uniqueUsers: 0, sessions: 0 };

    const nameToUserKey = new Map();
    for (const ws of set) {
      const info = this.getClientInfo(ws);
      const name =
        typeof info.username === "string" && info.username.trim()
          ? info.username.trim().toLocaleLowerCase("el-GR")
          : null;
      if (name && typeof info.userId === "number" && Number.isFinite(info.userId)) {
        nameToUserKey.set(name, `u:${info.userId}`);
      }
    }

    const unique = new Set();
    for (const ws of set) {
      const info = this.getClientInfo(ws);
      const name =
        typeof info.username === "string" && info.username.trim()
          ? info.username.trim().toLocaleLowerCase("el-GR")
          : null;
      if (name && nameToUserKey.has(name)) {
        unique.add(nameToUserKey.get(name));
      } else if (typeof info.userId === "number" && Number.isFinite(info.userId)) {
        unique.add(`u:${info.userId}`);
      } else if (name) {
        unique.add(`n:${name}`);
      } else if (info.clientId) {
        unique.add(`c:${info.clientId}`);
      } else if (info.deviceId) {
        unique.add(`d:${info.deviceId}`);
      } else {
        unique.add(ws);
      }
    }

    return {
      uniqueUsers: unique.size,
      sessions: set.size,
    };
  }

  // ---------------------------------------------------------------------------
  // song_sync state
  // ---------------------------------------------------------------------------

  receiptIdentityKey(info = {}) {
    if (typeof info.userId === "number" && Number.isFinite(info.userId) && info.userId > 0) {
      return "u:" + Math.trunc(info.userId);
    }
    if (info.deviceId) return "d:" + info.deviceId;
    if (info.clientId) return "c:" + info.clientId;
    return null;
  }

  markSyncReceived(room, info = {}, requestId, syncId) {
    const clean = String(room || "").trim();
    const key = this.receiptIdentityKey(info);
    if (!clean || !key) return false;

    const req = String(requestId || "").trim();
    const sid = Number(syncId || 0);
    if (!req && (!Number.isFinite(sid) || sid <= 0)) return false;

    let roomMap = this.syncReceipts.get(clean);
    if (!roomMap) {
      roomMap = new Map();
      this.syncReceipts.set(clean, roomMap);
    }

    const current = roomMap.get(key) || { lastSyncId: 0, requestIds: [] };
    if (Number.isFinite(sid) && sid > current.lastSyncId) current.lastSyncId = Math.trunc(sid);
    if (req && !current.requestIds.includes(req)) {
      current.requestIds.push(req);
      if (current.requestIds.length > 80) current.requestIds = current.requestIds.slice(-80);
    }
    current.lastReceiptAt = Date.now();
    roomMap.set(key, current);
    return true;
  }

  hasReceivedSync(room, info = {}, requestId, syncId) {
    const clean = String(room || "").trim();
    const key = this.receiptIdentityKey(info);
    if (!clean || !key) return false;

    const roomMap = this.syncReceipts.get(clean);
    if (!roomMap) return false;
    const receipt = roomMap.get(key);
    if (!receipt) return false;

    const req = String(requestId || "").trim();
    if (req && Array.isArray(receipt.requestIds) && receipt.requestIds.includes(req)) return true;

    const sid = Number(syncId || 0);
    return Number.isFinite(sid) && sid > 0 && Number(receipt.lastSyncId || 0) >= sid;
  }

  setLastSync(room, payload) {
    const clean = String(room || "").trim();
    if (!clean) return;
    this.lastSync.set(clean, payload);
    this.addSongHistory(clean, payload);
    this.markSyncReceived(clean, payload, payload?.requestId, payload?.syncId);
  }

  addSongHistory(room, entry) {
    const clean = String(room || "").trim();
    if (!clean || !entry || typeof entry !== "object") return;

    const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : {};
    const requestId = typeof entry.requestId === "string" ? entry.requestId.trim() : "";
    const syncId = Number(entry.syncId || 0);
    const songId = Number(payload.songId || 0);
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const url = typeof payload.url === "string" ? payload.url.trim() : "";
    if (!requestId && !Number.isFinite(syncId) && !url && !title) return;

    const item = {
      syncId: Number.isFinite(syncId) && syncId > 0 ? Math.trunc(syncId) : null,
      requestId: requestId || null,
      songId: Number.isFinite(songId) && songId > 0 ? Math.trunc(songId) : null,
      title: title || null,
      url: url || null,
      selectedTonicity:
        typeof payload.selectedTonicity === "string" && payload.selectedTonicity.trim()
          ? payload.selectedTonicity.trim()
          : null,
      sentAt:
        typeof payload.sentAt === "number" && Number.isFinite(payload.sentAt)
          ? payload.sentAt
          : Date.now(),
      userId:
        typeof entry.userId === "number" && Number.isFinite(entry.userId)
          ? Math.trunc(entry.userId)
          : null,
      username:
        typeof entry.username === "string" && entry.username.trim()
          ? entry.username.trim()
          : null,
    };

    const current = this.songHistory.get(clean) || [];
    const next = [
      item,
      ...current.filter((existing) => {
        if (item.requestId && existing.requestId) return item.requestId !== existing.requestId;
        if (item.syncId && existing.syncId) return item.syncId !== existing.syncId;
        return true;
      }),
    ].slice(0, 20);

    this.songHistory.set(clean, next);
  }

  getSongHistory(room) {
    const clean = String(room || "").trim();
    if (!clean) return [];
    const history = this.songHistory.get(clean);
    return Array.isArray(history) ? history.slice(0, 20) : [];
  }

  getLastSync(room) {
    const clean = String(room || "").trim();
    return this.lastSync.get(clean);
  }

  hasSameLastSyncRequest(room, requestId) {
    const clean = String(room || "").trim();
    const id = String(requestId || "").trim();
    if (!clean || !id) return false;

    const last = this.lastSync.get(clean);
    return !!last && last.requestId === id;
  }
}

module.exports = {
  RoomManager,
};
