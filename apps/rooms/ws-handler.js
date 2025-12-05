// apps/rooms/ws-handler.js

/**
 * Ασφαλές JSON.parse
 */
function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Στέλνει JSON σε client.
 */
function send(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}

/**
 * Broadcast σε όλα τα ws ενός room.
 */
function broadcastToRoom(roomManager, room, msg) {
  const set = roomManager.clients.get(room);
  if (!set) return;
  for (const ws of set) {
    send(ws, msg);
  }
}

/**
 * Δημιουργεί handler για κάθε WebSocket connection.
 */
function createWsHandler(roomManager, ws) {
  // Προαιρετικό welcome
  send(ws, { type: "welcome" });

  ws.on("message", (raw) => {
    const msg = safeJSONParse(String(raw));
    if (!msg || typeof msg !== "object") return;

    const type = msg.type || msg.action;

    // ------------------------------------------------------
    // JOIN ROOM (ή init_connection από παλιό κώδικα)
    // ------------------------------------------------------
    if (type === "join_room" || type === "init_connection") {
      const room = String(msg.room || "").trim();
      const password = msg.password || "";
      const deviceId = msg.deviceId || null;
      const userId = Number.isFinite(msg.userId) ? Number(msg.userId) : null;
      const username = msg.username || null;

      if (!room) {
        send(ws, {
          type: "join_denied",
          room,
          reason: "ROOM_REQUIRED",
        });
        return;
      }

      // Έλεγχος password
      const ok = roomManager.verifyPassword(room, password);
      if (!ok) {
        send(ws, {
          type: "join_denied",
          room,
          reason: "WRONG_PASSWORD",
        });
        return;
      }

      // Attach client
      const userCount = roomManager.attachClient(room, ws, {
        deviceId,
        userId,
        username,
      });

      // Επιβεβαίωση στον ίδιο
      send(ws, {
        type: "join_accepted",
        room,
        userCount,
      });

      // Ενημέρωση όλων στο room για το νέο count
      broadcastToRoom(roomManager, room, {
        type: "update_count",
        room,
        userCount,
      });

      // Στείλε στον νέο client το τελευταίο song_sync, αν υπάρχει
      const lastSync = roomManager.getLastSync(room);
      if (lastSync) {
        send(ws, {
          type: "song_sync",
          room,
          syncId: lastSync.syncId,
          payload: lastSync.payload,
        });
      }

      return;
    }

    // ------------------------------------------------------
    // SONG_SYNC – broadcast και αποθήκευση τελευταίας κατάστασης
    // ------------------------------------------------------
    if (type === "song_sync") {
      const info = roomManager.getClientInfo(ws);
      const room = String(msg.room || info.room || "").trim();
      if (!room) return;

      const syncId = Number.isFinite(msg.syncId)
        ? Number(msg.syncId)
        : Date.now();
      const payload = msg.payload ?? null;

      // Αποθήκευση τελευταίας κατάστασης για το room
      roomManager.setLastSync(room, {
        syncId,
        payload,
        userId: info.userId,
        username: info.username,
      });

      // Broadcast σε όλους στο room
      broadcastToRoom(roomManager, room, {
        type: "song_sync",
        room,
        syncId,
        payload,
      });

      return;
    }

    // ------------------------------------------------------
    // Ping / Pong λογικού επιπέδου (προαιρετικό)
    // ------------------------------------------------------
    if (type === "ping") {
      send(ws, { type: "pong" });
      return;
    }

    // Μπορείς να προσθέσεις κι άλλες ενέργειες εδώ αν χρειαστεί.
  });

  ws.on("close", () => {
    const { room, userCount } = roomManager.detachClient(ws);
    if (!room) return;

    broadcastToRoom(roomManager, room, {
      type: "update_count",
      room,
      userCount,
    });
  });

  ws.on("error", (err) => {
    console.error("[ws-handler] WebSocket error:", err);
  });
}

module.exports = {
  createWsHandler,
};
