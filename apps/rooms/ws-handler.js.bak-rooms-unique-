// apps/rooms/ws-handler.js

function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore broken clients
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPositiveInteger(value) {
  const n = toNumber(value);
  if (n == null || n <= 0) return null;
  return Math.trunc(n);
}

function cleanString(value, maxLength = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function clientIdentityFromMessage(msg) {
  const deviceId = cleanString(msg.deviceId, 120);
  const tabId = cleanString(msg.tabId, 120);
  const explicitClientId = cleanString(msg.clientId, 260);
  const clientId = explicitClientId || [deviceId, tabId].filter(Boolean).join(":") || null;

  return {
    clientId,
    deviceId,
    tabId,
    userId: toPositiveInteger(msg.userId),
    username: cleanString(msg.username, 160),
  };
}

function buildPresenceMessage(roomManager, room) {
  const counts = roomManager.getPresenceCounts(room);
  return {
    type: "presence_counts",
    room,
    userCount: counts.sessions,
    uniqueUsers: counts.uniqueUsers,
    sessions: counts.sessions,
  };
}

function broadcastToRoom(roomManager, room, msg, options = {}) {
  const set = roomManager.clients.get(room);
  if (!set) return 0;

  let delivered = 0;
  for (const ws of set) {
    if (options.except && ws === options.except) continue;
    send(ws, msg);
    delivered += 1;
  }
  return delivered;
}

function broadcastRoomCounts(roomManager, room) {
  const presence = buildPresenceMessage(roomManager, room);
  broadcastToRoom(roomManager, room, {
    type: "update_count",
    room,
    userCount: presence.sessions,
    uniqueUsers: presence.uniqueUsers,
    sessions: presence.sessions,
  });
  broadcastToRoom(roomManager, room, presence);
}

function cleanSongPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const songId = toPositiveInteger(payload.songId);
  const sentAt = toPositiveInteger(payload.sentAt) || Date.now();

  return {
    kind: cleanString(payload.kind, 40) || "song",
    songId,
    title: cleanString(payload.title, 240),
    url: cleanString(payload.url, 1200),
    selectedTonicity: cleanString(payload.selectedTonicity, 80),
    sentAt,
  };
}

function maybeSendLastSync(roomManager, ws, room, msg) {
  const lastSync = roomManager.getLastSync(room);
  if (!lastSync) return;

  const identity = clientIdentityFromMessage(msg);
  const lastSeenSyncId = toPositiveInteger(msg.lastSeenSyncId) || 0;
  const lastSeenRequestId = cleanString(msg.lastSeenRequestId, 260);

  if (lastSeenRequestId || lastSeenSyncId > 0) {
    roomManager.markSyncReceived(room, identity, lastSeenRequestId, lastSeenSyncId);
  }

  if (lastSync.senderClientId && identity.clientId && lastSync.senderClientId === identity.clientId) {
    return;
  }
  if (roomManager.hasReceivedSync(room, identity, lastSync.requestId, lastSync.syncId)) {
    return;
  }
  if (lastSync.requestId && lastSeenRequestId && lastSync.requestId === lastSeenRequestId) {
    return;
  }
  if (toPositiveInteger(lastSync.syncId) && lastSync.syncId <= lastSeenSyncId) {
    return;
  }

  send(ws, {
    type: "song_sync",
    room,
    syncId: lastSync.syncId,
    requestId: lastSync.requestId,
    senderClientId: lastSync.senderClientId,
    senderName: lastSync.username || null,
    payload: lastSync.payload,
  });
}

function createWsHandler(roomManager, ws) {
  send(ws, { type: "welcome" });

  ws.on("message", (raw) => {
    const msg = safeJSONParse(String(raw));
    if (!msg || typeof msg !== "object") return;

    const type = msg.type || msg.action;

    if (type === "hello") {
      const identity = clientIdentityFromMessage(msg);
      const info = roomManager.updateClientInfo(ws, identity);
      send(ws, {
        type: "hello_ack",
        clientId: info.clientId,
        room: info.room || null,
      });
      return;
    }

    if (type === "join_room" || type === "init_connection") {
      const room = String(msg.room || "").trim();
      const password = msg.password || "";

      if (!room) {
        send(ws, { type: "join_denied", room, reason: "ROOM_REQUIRED" });
        return;
      }

      if (!roomManager.verifyPassword(room, password)) {
        send(ws, { type: "join_denied", room, reason: "WRONG_PASSWORD" });
        return;
      }

      const previous = roomManager.getClientInfo(ws);
      if (previous.room && previous.room !== room) {
        const left = roomManager.detachClient(ws);
        if (left.room) broadcastRoomCounts(roomManager, left.room);
      }

      const identity = clientIdentityFromMessage(msg);
      const userCount = roomManager.attachClient(room, ws, identity);
      const presence = roomManager.getPresenceCounts(room);

      send(ws, {
        type: "join_accepted",
        room,
        userCount,
        uniqueUsers: presence.uniqueUsers,
        sessions: presence.sessions,
        clientId: identity.clientId,
      });

      broadcastRoomCounts(roomManager, room);
      maybeSendLastSync(roomManager, ws, room, msg);
      return;
    }

    if (type === "leave_room") {
      const left = roomManager.detachClient(ws);
      if (left.room) {
        send(ws, { type: "leave_accepted", room: left.room });
        broadcastRoomCounts(roomManager, left.room);
      }
      return;
    }

    if (type === "song_sync_received") {
      const info = roomManager.getClientInfo(ws);
      const room = String(msg.room || info.room || "").trim();
      if (!room) return;
      roomManager.markSyncReceived(
        room,
        info,
        cleanString(msg.requestId, 300),
        toPositiveInteger(msg.syncId) || 0,
      );
      send(ws, {
        type: "song_sync_received_ack",
        room,
        syncId: toPositiveInteger(msg.syncId) || 0,
        requestId: cleanString(msg.requestId, 300),
      });
      return;
    }

    if (type === "song_sync") {
      const info = roomManager.getClientInfo(ws);
      const joinedRoom = String(info.room || "").trim();
      const requestedRoom = String(msg.room || "").trim();
      const room = joinedRoom || requestedRoom;

      if (!room || (joinedRoom && requestedRoom && joinedRoom !== requestedRoom)) {
        send(ws, { type: "song_sync_denied", reason: "ROOM_MISMATCH" });
        return;
      }
      if (!joinedRoom) {
        send(ws, { type: "song_sync_denied", reason: "NOT_JOINED" });
        return;
      }

      const syncId = toPositiveInteger(msg.syncId) || Date.now();
      const senderClientId = cleanString(msg.senderClientId, 260) || info.clientId || null;
      const requestId =
        cleanString(msg.requestId, 300) ||
        [senderClientId || info.deviceId || "client", String(syncId)].join(":");
      const payload = cleanSongPayload(msg.payload);

      if (!payload.url) {
        send(ws, { type: "song_sync_denied", reason: "URL_REQUIRED" });
        return;
      }

      if (roomManager.hasSameLastSyncRequest(room, requestId)) {
        send(ws, {
          type: "song_sync_ack",
          room,
          syncId,
          requestId,
          duplicate: true,
          delivered: 0,
        });
        return;
      }

      roomManager.setLastSync(room, {
        syncId,
        requestId,
        payload,
        userId: info.userId,
        username: info.username,
        senderClientId,
      });

      const delivered = broadcastToRoom(
        roomManager,
        room,
        {
          type: "song_sync",
          room,
          syncId,
          requestId,
          senderClientId,
          senderName: info.username || null,
          payload,
        },
        { except: ws },
      );

      send(ws, {
        type: "song_sync_ack",
        room,
        syncId,
        requestId,
        delivered,
      });
      return;
    }

    if (type === "ping") {
      send(ws, { type: "pong" });
    }
  });

  ws.on("close", () => {
    const { room } = roomManager.detachClient(ws);
    if (!room) return;
    broadcastRoomCounts(roomManager, room);
  });

  ws.on("error", (err) => {
    console.error("[ws-handler] WebSocket error:", err);
  });
}

module.exports = {
  createWsHandler,
};
