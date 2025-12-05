/**
 * index.js – Entry point for the rooms WebSocket/REST server.
 *
 * Αυτός ο server παρέχει:
 *  - REST API για διαχείριση rooms (δημιουργία, λίστα, διαγραφή, έλεγχο password)
 *  - WebSocket endpoint για real-time song synchronisation μεταξύ χρηστών.
 *
 * Είναι σχεδιασμένος να τρέχει πίσω από Nginx:
 *  - Proxy για REST:       /rooms-api/*   -> http://127.0.0.1:4455/*
 *  - Proxy για WebSocket: /rooms-api/ws  -> ws://127.0.0.1:4455/ws (ή /rooms-api/ws → 4455 χωρίς αλλαγή path)
 *
 * Για να αποφύγουμε προβλήματα με το path, ο WebSocketServer δέχεται
 * connections σε ΟΠΟΙΟΔΗΠΟΤΕ path σε αυτό το port, όπως έκανε και το παλιό σύστημα.
 */

const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const { RoomManager } = require("./rooms");
const { createWsHandler } = require("./ws-handler");
const { exec } = require("child_process");

const app = express();
app.use(express.json());

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------
const allowedOrigins =
  (process.env.ROOMS_ALLOWED_ORIGINS ||
    "https://repertorio.net,https://app.repertorio.net")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Επιτρέπουμε κλήσεις χωρίς Origin (π.χ. curl, backend-to-backend).
      if (!origin) return callback(null, true);

      try {
        const url = new URL(origin);
        const host = url.host;
        const allowedHostRegExp = new RegExp(
          allowedOrigins.map((h) => h.replace(/\./g, "\\.")).join("|"),
          "i"
        );
        return callback(null, allowedHostRegExp.test(host));
      } catch {
        // Malformed origin
        return callback(null, false);
      }
    },
    credentials: false,
  })
);

// -----------------------------------------------------------------------------
// RoomManager (in-memory state + meta file)
// -----------------------------------------------------------------------------
const roomManager = new RoomManager();

/**
 * Helper για βασικό logging REST requests.
 */
function logRequest(req, extra = {}) {
  const info = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    body: req.body,
    ...extra,
  };
  console.log("[REST]", JSON.stringify(info));
}

// -----------------------------------------------------------------------------
// REST endpoints
// -----------------------------------------------------------------------------

// Simple health check
app.get("/health", (req, res) => {
  const overview = roomManager.getRoomsOverview();
  res.json({
    ok: true,
    uptime: process.uptime(),
    rooms: overview,
    totalClients: roomManager.getTotalClients(),
  });
});

/**
 * Επιστρέφει τη λίστα των rooms με αναλυτικά στοιχεία (users, last_sync κτλ).
 */
app.get("/get-rooms", (req, res) => {
  logRequest(req);
  try {
    const rooms = roomManager.getRoomsOverview();
    res.json(rooms);
  } catch (err) {
    console.error("[/get-rooms] error:", err);
    res.status(500).json({
      success: false,
      message: "Εσωτερικό σφάλμα κατά την ανάγνωση των rooms.",
    });
  }
});

/**
 * Δημιουργία νέου room με προαιρετικό password.
 */
app.post("/create-room", (req, res) => {
  logRequest(req, { body: req.body });

  const { room, password } = req.body || {};

  if (!room || typeof room !== "string" || !room.trim()) {
    return res.status(400).json({
      success: false,
      message: "Το όνομα του room είναι υποχρεωτικό.",
    });
  }

  try {
    const normalizedRoom = room.trim();
    const pwd =
      typeof password === "string" && password.trim() !== ""
        ? password
        : null;

    roomManager.createRoom(normalizedRoom, pwd);

    return res.json({
      success: true,
      message: `Το room "${normalizedRoom}" δημιουργήθηκε επιτυχώς.`,
      room: normalizedRoom,
      hasPassword: !!pwd,
    });
  } catch (err) {
    console.error("[/create-room] error:", err);
    return res.status(500).json({
      success: false,
      message: "Εσωτερικό σφάλμα κατά τη δημιουργία του room.",
    });
  }
});

/**
 * Διαγραφή room (και αποσύνδεση χρηστών).
 */
app.post("/delete-room", (req, res) => {
  logRequest(req, { body: req.body });

  const { room } = req.body || {};
  if (!room || typeof room !== "string" || !room.trim()) {
    return res.status(400).json({
      success: false,
      message: "Το όνομα του room είναι υποχρεωτικό.",
    });
  }

  try {
    const normalizedRoom = room.trim();
    roomManager.deleteRoom(normalizedRoom);

    return res.json({
      success: true,
      message: `Το room "${normalizedRoom}" διαγράφηκε επιτυχώς.`,
    });
  } catch (err) {
    console.error("[/delete-room] error:", err);
    return res.status(500).json({
      success: false,
      message: "Εσωτερικό σφάλμα κατά τη διαγραφή του room.",
    });
  }
});

/**
 * Έλεγχος password room.
 */
app.post("/verify-room-password", (req, res) => {
  logRequest(req, { body: req.body });

  const { room, password } = req.body || {};
  if (!room || typeof room !== "string" || !room.trim()) {
    return res.status(400).json({
      success: false,
      message: "Το όνομα του room είναι υποχρεωτικό.",
    });
  }
  if (typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "Το password είναι υποχρεωτικό.",
    });
  }

  try {
    const normalizedRoom = room.trim();
    const ok = roomManager.verifyPassword(normalizedRoom, password);
    return res.status(200).json({
      success: ok,
      message: ok ? "OK" : "Λάθος password.",
    });
  } catch (err) {
    console.error("[/verify-room-password] error:", err);
    return res.status(500).json({
      success: false,
      message: "Εσωτερικό σφάλμα κατά τον έλεγχο password.",
    });
  }
});

/**
 * Status endpoint – για debugging, σαν το παλιό /status.
 */
app.get("/status", (req, res) => {
  logRequest(req);

  try {
    const rooms = roomManager.getRoomsOverview();
    const totalClients = roomManager.getTotalClients();

    res.json({
      ok: true,
      uptime: process.uptime(),
      uptime_sec: process.uptime(),
      roomCount: rooms.length,
      totalClients,
      rooms,
      memoryUsage: process.memoryUsage(),
    });
  } catch (err) {
    console.error("[/status] error:", err);
    res.status(500).json({
      ok: false,
      message: "Εσωτερικό σφάλμα στο /status.",
    });
  }
});

/**
 * manage-server – wrapper γύρω από systemctl για restart/stop/start
 * του systemd service (π.χ. repertorio-rooms.service).
 */
app.post("/manage-server", (req, res) => {
  logRequest(req, { body: req.body });

  const { action } = req.body || {};
  if (!action || !["restart", "stop", "start"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Άγνωστη ενέργεια. Επιτρεπτές: restart, stop, start.",
    });
  }

  const serviceName =
    process.env.ROOMS_SERVICE_NAME || "repertorio-rooms.service";
  const command = `systemctl ${action} ${serviceName}`;

  console.log(`[manage-server] Executing: ${command}`);

  // Απαντάμε αμέσως στον client
  res.json({
    success: true,
    message: `Η ενέργεια '${action}' ξεκίνησε...`,
  });

  // Τρέχουμε την εντολή ασύγχρονα
  setTimeout(() => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[manage-server] Error executing "${command}"`, error);
      } else {
        console.log(`[manage-server] "${command}" executed successfully`);
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
      }
    });
  }, 100);
});

// -----------------------------------------------------------------------------
// HTTP server + WebSocket server
// -----------------------------------------------------------------------------

const httpServer = http.createServer(app);

const PORT = Number(process.env.PORT || 4455);

// ΔΕΝ ορίζουμε path εδώ ώστε να δεχόμαστε WebSocket σε ΟΠΟΙΟΔΗΠΟΤΕ path.
const wss = new WebSocketServer({ server: httpServer });

// Heartbeat (όπως παλιά)
const HEARTBEAT_MS = 30000;

wss.on("connection", (ws, req) => {
  console.log(
    "[WS] New connection from",
    req.socket.remoteAddress,
    "path:",
    req.url
  );

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  createWsHandler(roomManager, ws);
});

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) {
      try {
        client.terminate();
      } catch {}
      return;
    }
    client.isAlive = false;
    try {
      client.ping();
    } catch {}
  });
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeatTimer));

httpServer.listen(PORT, () => {
  console.log(`✅ Rooms server listening on http://0.0.0.0:${PORT}`);
  console.log(`   WS endpoint: accepts WebSocket on any path on this port`);
});
