/**
 * index.js – Entry point for the rooms WebSocket/REST server.
 *
 * This server exposes a small REST API for creating, listing and managing
 * rooms as well as a WebSocket endpoint for real‑time song synchronisation
 * between users. It is intended to be run behind an HTTP proxy (e.g. Nginx)
 * that forwards both REST and WebSocket requests to the same port.
 *
 * Key endpoints:
 *   - GET  /health                 Health check
 *   - GET  /get-rooms              Returns a list of rooms (name, users, hasPassword)
 *   - POST /create-room            Creates a new room with optional password
 *   - POST /delete-room            Deletes an existing room and disconnects users
 *   - POST /verify-room-password   Verifies that a password matches the room
 *   - GET  /status                 Returns server status (uptime, rooms, users)
 *   - POST /manage-server          Wrapper around pm2 commands (restart/stop/start)
 *
 * The WebSocket endpoint is available on WS_PATH (default "/ws") and
 * handles the following message types:
 *   - init_connection: join a room and receive the last song sync
 *   - song_sync: broadcast a song to all other clients
 *   - leave_room: leave a room gracefully
 *
 * Run with:
 *   node index.js
 *
 * Environment variables:
 *   PORT    – TCP port to listen on (default 44)
 *   WS_PATH – WebSocket path (default "/ws")
 */

const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { exec } = require("child_process");
const { RoomManager } = require("./rooms");
const { handleWSConnection } = require("./ws-handler");

// Configuration via environment variables
const PORT = Number(process.env.PORT || 44);
const WS_PATH = process.env.WS_PATH || "/ws";

// -----------------------------------------------------------------------------
// Express application setup
// -----------------------------------------------------------------------------
const app = express();

// Limit JSON payloads to 32kb to prevent abuse
app.use(express.json({ limit: "32kb" }));

// Restrict CORS origins: only allow repertorio.net subdomains.
const allowedHostRegExp = /(^|\.)repertorio\.net$/i;
app.use(
  cors({
    origin(origin, callback) {
      // Always allow same‑origin or server‑side requests (origin undefined)
      if (!origin) return callback(null, true);
      try {
        const host = new URL(origin).hostname;
        return callback(null, allowedHostRegExp.test(host));
      } catch {
        // Reject malformed origins
        return callback(null, false);
      }
    },
    credentials: false,
  }),
);

// In‑memory room manager. No persistence layer is provided by default.
const roomManager = new RoomManager();

// -----------------------------------------------------------------------------
// REST API endpoints
// -----------------------------------------------------------------------------

// Health check: useful for load balancers and uptime monitoring
app.get("/health", (req, res) => res.json({ ok: true }));

// Retrieve a minimal list of rooms (name, userCount, hasPassword)
// 🔹 Επιστρέφουμε ΜΟΝΟ όσα rooms έχουν τουλάχιστον 1 χρήστη
app.get("/get-rooms", (req, res) => {
  const list = roomManager
    .listRooms()
    .filter((r) => (r.userCount || 0) > 0) // <= φιλτράρισμα άδειων
    .map((r) => ({
      room: r.name,
      userCount: r.userCount,
      hasPassword: r.hasPassword,
    }));

  res.json(list);
});


// Create a new room
app.post("/create-room", (req, res) => {
  const { room, password = "" } = req.body || {};
  if (!room || typeof room !== "string") {
    return res.status(400).json({ success: false, message: "Απαιτείται όνομα δωματίου." });
  }
  const result = roomManager.createRoom(room, password);
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message || "Αποτυχία δημιουργίας." });
  }
  return res.json({ success: true });
});

// Delete a room (disconnecting all clients)
app.post("/delete-room", (req, res) => {
  const { room } = req.body || {};
  if (!room || typeof room !== "string") {
    return res.status(400).json({ success: false, message: "Απαιτείται όνομα δωματίου." });
  }
  const result = roomManager.deleteRoom(room);
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message || "Αποτυχία διαγραφής." });
  }
  return res.json({ success: true });
});

// Verify the password of an existing room
app.post("/verify-room-password", (req, res) => {
  const { room, password = "" } = req.body || {};
  if (!room || typeof room !== "string") {
    return res.status(400).json({ success: false, message: "Απαιτείται όνομα δωματίου." });
  }
  const result = roomManager.verifyPassword(room, password);
  if (!result.ok) {
    // Return 404 if room does not exist, 403 for wrong password
    const code = result.code === "NOT_FOUND" ? 404 : 403;
    return res.status(code).json({ success: false, message: result.message });
  }
  return res.json({ success: true });
});

// Status endpoint: returns uptime, total rooms and clients, and room details
app.get("/status", (req, res) => {
  const uptimeSec = Math.floor(process.uptime());
  const roomList = roomManager.listRooms();

  // 🔹 Κρατάμε μόνο όσα rooms έχουν τουλάχιστον 1 χρήστη
  const nonEmptyRooms = roomList.filter((r) => (r.userCount || 0) > 0);

  const rooms = nonEmptyRooms.map((r) => {
    const last = roomManager.getLastSync(r.name);
    return {
      room: r.name,
      userCount: r.userCount,
      hasPassword: !!r.hasPassword,
      deviceIds: roomManager.getRoomDeviceIds(r.name),
      users: roomManager.getRoomUsers(r.name),
      last_sync_url: last?.sender_url || null,
      last_sync_id: last?.sync_id || null,
      last_sync_device: last?.device_id || null,
    };
  });

  const totalClients = rooms.reduce((sum, r) => sum + (r.userCount || 0), 0);

  res.json({
    ok: true,
    uptime_sec: uptimeSec,
    roomCount: rooms.length,  // μόνο τα μη-άδεια
    totalClients,
    rooms,
  });
});


// Manage the Node process via pm2 (restricted to a secret key)
app.post("/manage-server", (req, res) => {
  const { key, action } = req.body || {};
  const SECRET_KEY = "RepertorioSecretRestartKey";
  if (key !== SECRET_KEY) {
    return res.status(403).json({ success: false, message: "Μη εξουσιοδοτημένο αίτημα." });
  }
  let command;
  if (action === "restart") command = "pm2 restart rooms-ws";
  else if (action === "stop") command = "pm2 stop rooms-ws";
  else if (action === "start") command = "pm2 start rooms-ws";
  else {
    return res.status(400).json({ success: false, message: "Μη έγκυρη ενέργεια." });
  }
  // Immediately respond; run pm2 command asynchronously
  res.json({ success: true, message: `Η ενέργεια '${action}' ξεκίνησε...` });
  setTimeout(() => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error(`PM2 ${action} error:`, err);
      } else {
        console.log(`PM2 ${action} επιτυχές:`, stdout || stderr);
      }
    });
  }, 1000);
});

// -----------------------------------------------------------------------------
// HTTP & WebSocket server setup
// -----------------------------------------------------------------------------
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });

// Handle incoming WebSocket connections
wss.on("connection", (ws, req) => {
  // mark as alive for heartbeat
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  // Parse query parameters from URL
  const queryString = (req.url || "").split("?")[1] || "";
  const params = new URLSearchParams(queryString);
  const room = params.get("room");
  const deviceId = params.get("device_id");
  if (!room || !deviceId) {
    // Invalid connection: close silently
    try { ws.close(); } catch {}
    return;
  }
  // Delegate WebSocket logic
  handleWSConnection(ws, req, roomManager);
});

// Heartbeat: terminate dead sockets every HEARTBEAT_MS
const HEARTBEAT_MS = 30000;
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    if (!client.isAlive) {
      try { client.terminate(); } catch {}
      return;
    }
    client.isAlive = false;
    try { client.ping(); } catch {}
  });
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeatTimer));

// Start listening
httpServer.listen(PORT, () => {
  console.log(`✅ Rooms server listening on http://0.0.0.0:${PORT}`);
  console.log(`   WS path: ${WS_PATH}`);
});