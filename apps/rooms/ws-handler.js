/*
 * ws-handler.js – Implements the WebSocket protocol for rooms.
 *
 * Each connected browser tab initiates the connection by sending an
 * `init_connection` message containing its room name, device ID, user ID and
 * username. The server responds with an `update_count` message containing
 * the list of active device IDs and users, and (optionally) the last
 * `song_sync` message if the new client has not already seen it.
 *
 * Clients can then send a `song_sync` message to broadcast a new song URL
 * to all other clients in the room. A unique sync_id and timestamp are
 * generated server‑side and stored so late joiners can be brought up to
 * date.
 *
 * A `leave_room` message will remove a client immediately. Normal tab
 * refreshes or navigation will trigger the WebSocket `close` event; a
 * grace period is used to allow quick reconnections without flicker.
 */

/**
 * Safely parse JSON; returns null on failure.
 * @param {string} text
 * @returns {any|null}
 */
function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Broadcast a payload to all clients in a room. Optionally exclude a
 * device ID (so the originating client does not receive its own message).
 *
 * @param {RoomManager} roomManager
 * @param {string} room
 * @param {object} payload
 * @param {string|null} exceptDeviceId
 */
function broadcastToRoom(roomManager, room, payload, exceptDeviceId = null) {
  const message = JSON.stringify(payload);
  const clients = roomManager.getRoomClients(room);
  for (const client of clients) {
    if (client.readyState !== 1) continue;
    if (exceptDeviceId && client.__deviceId === exceptDeviceId) continue;
    try {
      client.send(message);
    } catch {}
  }
}

/**
 * Handle a WebSocket connection for the rooms service.
 *
 * @param {WebSocket} ws – the client's socket
 * @param {http.IncomingMessage} req – the HTTP upgrade request
 * @param {RoomManager} roomManager – the shared room manager
 * @param {string|null} msgRaw – if provided, process this message immediately
 */
function handleWSConnection(ws, req, roomManager, msgRaw = null) {
  // Heartbeat is handled by index.js via ws.isAlive/ping/pong

  /**
   * Process a JSON message from the client.
   * Expects messages in the form:
   *   { action: string, user_room: string, device_id: string, ... }
   */
  function processMessage(raw) {
    const msg = safeJSONParse(raw);
    if (!msg || typeof msg !== "object") return;
    const { action, user_room, device_id, sender_url } = msg;
    if (!action || !user_room || !device_id) return;

    // Initialise connection
    if (action === "init_connection") {
      ws.__room = user_room;
      ws.__deviceId = device_id;
      ws.__userId = msg.user_id || null;
      ws.__username = msg.username || null;
      const clientLastSeenId = msg.last_seen_sync_id || null;

      // Register this client with the RoomManager
      roomManager.addClient(user_room, device_id, ws);
           
      // Καθαρίζουμε τυχόν παλιές συμμετοχές του ίδιου device σε άλλα rooms
      if (typeof roomManager.clients === "object") {
        for (const [rName, roomMap] of roomManager.clients.entries()) {
          if (rName === user_room) continue;
          for (const [key, entry] of roomMap.entries()) {
            if (entry.deviceId === device_id) {
              try { if (entry.ws && entry.ws.readyState === 1) entry.ws.close(4000, "Moved to another room"); } catch {}
              roomMap.delete(key);
            }
          }
        }
      }

      if (msg.user_id || msg.username) {
        roomManager.setClientMeta(user_room, device_id, msg.user_id || null, msg.username || null);
        console.log(`🟢 ${user_room}: συνδέθηκε ${msg.username || 'anonymous'} (ID: ${msg.user_id || '-'})`);
      } else {
        console.log(`⚠️ ${user_room}: σύνδεση χωρίς στοιχεία χρήστη από device ${device_id}`);
      }

      // Send immediate update_count to this client
      const ids = roomManager.getRoomDeviceIds(user_room);
      const users = roomManager.getRoomUsers(user_room);
      ws.send(JSON.stringify({
        action: "update_count",
        user_room,
        count: ids.length,
        deviceIds: ids,
        users,
      }));

      // Determine whether to resend the last song_sync to this client
      try {
        const last = roomManager.getLastSync(user_room);
        if (last && last.sender_url) {
          const sameDevice = last.device_id && last.device_id === device_id;
          const MAX_LAST_SYNC_AGE_MS = 10 * 60 * 1000; // 10 minutes
          const tooOld = typeof last.timestamp === "number" && (Date.now() - last.timestamp) > MAX_LAST_SYNC_AGE_MS;
          const alreadySeen = last.sync_id && clientLastSeenId && clientLastSeenId === last.sync_id;
          if (!sameDevice && !tooOld && !alreadySeen) {
            const resendPayload = Object.assign({}, last, { manual: true });
            ws.send(JSON.stringify(resendPayload));
            console.log(`[ROOM:${user_room}] Sent last song_sync to new client device=${device_id} -> ${last.sender_url}`);
          } else {
            console.log(`[ROOM:${user_room}] Not sending last song_sync to device=${device_id} (sameDevice=${sameDevice}, tooOld=${tooOld}, alreadySeen=${alreadySeen})`);
          }
        }
      } catch (err) {
        console.error("Failed to send last song_sync on init_connection:", err);
      }

      // Broadcast updated counts to all other clients after a short delay
      setTimeout(() => {
        const idsNow = roomManager.getRoomDeviceIds(user_room);
        const usersNow = roomManager.getRoomUsers(user_room);
        broadcastToRoom(roomManager, user_room, {
          action: "update_count",
          user_room,
          count: idsNow.length,
          deviceIds: idsNow,
          users: usersNow,
        }, ws.__deviceId);
      }, 500);
    }

    // Broadcast a new song to all other clients
    else if (action === "song_sync") {
        const sync_id =
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 10);

        const payload = {
          action: "song_sync",
          sender_user_id: ws.__userId || null,
          sender_username: ws.__username || null,
          user_room,
          device_id,
          sender_url,
          selected_tonicity: msg.selected_tonicity || null,  // ⭐ ΣΩΖΟΥΜΕ ΕΔΩ ΤΗΝ ΤΟΝΙΚΟΤΗΤΑ
          sync_id,
          timestamp: Date.now(),
        };

        roomManager.setLastSync(user_room, payload);

        console.log(
          `[ROOM:${user_room}] song_sync από ${device_id} (tonicity=${payload.selected_tonicity})`
        );

        broadcastToRoom(roomManager, user_room, payload, device_id);
    }


    // Immediate leave message from the client
    else if (action === "leave_room") {
      const room = ws.__room;
      if (room) {
        roomManager.removeClient(room, ws);
        const deviceIds = roomManager.getRoomDeviceIds(room);
        broadcastToRoom(roomManager, room, {
          action: "update_count",
          user_room: room,
          count: deviceIds.length,
          deviceIds,
        });
      }
      try { ws.close(); } catch {}
    }
  }

  // Bind message handler
  ws.on("message", processMessage);
  // If an initial message was provided (from index.js), process it now
  if (msgRaw) {
    processMessage(msgRaw);
  }

  // Handle socket closure with a grace period to allow reconnection
  const GRACE_MS = 8000;
  ws.on("close", (code, reason) => {
    const room = ws.__room;
    const deviceId = ws.__deviceId;
    console.log(
      `[ROOM:${room || "-"}] WS close: code=${code} ` +
      `reason=${reason?.toString?.() || ""} device=${deviceId || "-"}`
    );

    if (!room || !deviceId) return;

    setTimeout(() => {
      // 1) Αφαιρούμε ΠΑΝΤΑ αυτό το συγκεκριμένο socket από το room
      roomManager.removeClient(room, ws);

      // 2) Υπολογίζουμε ξανά τους ενεργούς χρήστες μετά το cleanup
      const deviceIds = roomManager.getRoomDeviceIds(room);
      const users    = roomManager.getRoomUsers(room);

      // 3) Στέλνουμε update_count με το πραγματικό state
      broadcastToRoom(roomManager, room, {
        action: "update_count",
        user_room: room,
        count: deviceIds.length,
        deviceIds,
        users,
      });

      console.log(
        `[ROOM:${room}] cleanup after close for device=${deviceId} ` +
        `(${deviceIds.length} ενεργοί χρήστες)`
      );
    }, GRACE_MS);
  });


  ws.on("error", (err) => {
    console.error("WebSocket internal error:", err.message);
  });
}

module.exports = { handleWSConnection };