require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { connectDB } = require("./db/index");
const User = require("./db/User");
const GameRoom = require("./game/GameRoom");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const DB_ENABLED = !!process.env.MONGO_URI;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ── Dev-mode in-memory user store (used when no MONGO_URI) ───────────────────
// Maps username (lowercase) -> { username, passwordHash }
const devUsers = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** 6-char uppercase alphanumeric code (no ambiguous chars I/O/0/1) */
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cookieParser());
app.use(express.json());

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: "Username must be 3–20 characters" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });

  const trimmed = username.trim().toLowerCase(); // always store lowercase
  const passwordHash = await bcrypt.hash(password, 12);

  if (DB_ENABLED) {
    try {
      const existing = await User.findOne({ username: trimmed });
      if (existing)
        return res.status(409).json({ error: "Username already taken" });
      const user = await User.create({ username: trimmed, passwordHash });
      const token = signToken({
        userId: String(user._id),
        username: user.username,
      });
      return res
        .cookie("token", token, COOKIE_OPTS)
        .json({ username: user.username });
    } catch (err) {
      console.error("[Auth] Register error:", err.message);
      return res.status(500).json({ error: "Server error" });
    }
  } else {
    if (devUsers.has(trimmed))
      return res.status(409).json({ error: "Username already taken" });
    devUsers.set(trimmed, { username: trimmed, passwordHash });
    const token = signToken({ userId: trimmed, username: trimmed });
    return res.cookie("token", token, COOKIE_OPTS).json({ username: trimmed });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  const trimmed = username.trim().toLowerCase(); // match lowercase stored value

  if (DB_ENABLED) {
    try {
      const user = await User.findOne({ username: trimmed });
      if (!user)
        return res.status(401).json({ error: "Invalid username or password" });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid)
        return res.status(401).json({ error: "Invalid username or password" });
      const token = signToken({
        userId: String(user._id),
        username: user.username,
      });
      return res
        .cookie("token", token, COOKIE_OPTS)
        .json({ username: user.username });
    } catch (err) {
      console.error("[Auth] Login error:", err.message);
      return res.status(500).json({ error: "Server error" });
    }
  } else {
    // Dev mode
    const record = devUsers.get(trimmed);
    if (!record)
      return res.status(401).json({ error: "Invalid username or password" });
    const valid = await bcrypt.compare(password, record.passwordHash);
    if (!valid)
      return res.status(401).json({ error: "Invalid username or password" });
    const token = signToken({ userId: trimmed, username: record.username });
    return res
      .cookie("token", token, COOKIE_OPTS)
      .json({ username: record.username });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token").json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const payload = verifyToken(req.cookies?.token);
  if (!payload) return res.status(401).json({ error: "Not logged in" });
  res.json({ username: payload.username });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", rooms: rooms.size });
});

// ── Static files ──────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, "../client")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});
app.get("/play", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/controller.html"));
});

// ── Room management ───────────────────────────────────────────────────────────

const rooms = new Map(); // roomId  -> GameRoom
const roomsByCode = new Map(); // code    -> roomId

function onGameOver(roomId) {
  return ({ result, score }) => {
    console.log(`[Game] Room ${roomId} ended: ${result}, score ${score}`);
    setTimeout(() => rooms.delete(roomId), 10000);
  };
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

wss.on("connection", (ws, req) => {
  const params = new URL(req.url, "http://x").searchParams;
  const role = params.get("role");

  ws.role = null;
  ws.username = null;
  ws.playerId = null;
  ws.roomId = null;

  // ── Controller (phone) — no JWT; room code is the session ────────────────
  if (role === "controller") {
    const code = String(params.get("code") ?? "")
      .trim()
      .toUpperCase();
    const roomId = roomsByCode.get(code);
    const target = roomId ? rooms.get(roomId) : null;

    if (!target) {
      ws.send(
        JSON.stringify({
          type: "code_error",
          message: "Room not found. Check the code.",
        }),
      );
      ws.close();
      return;
    }
    if (target.gameState !== "waiting") {
      ws.send(
        JSON.stringify({
          type: "code_error",
          message: "Game already started.",
        }),
      );
      ws.close();
      return;
    }

    const player = target.addPlayer(ws);
    if (!player) {
      ws.send(JSON.stringify({ type: "code_error", message: "Room is full." }));
      ws.close();
      return;
    }
    ws.role = "controller";
    ws.playerId = player.id;
    ws.roomId = roomId;

    ws.send(
      JSON.stringify({
        type: "controller_assigned",
        playerId: player.id,
        code,
      }),
    );

    // Notify display (and any other controllers) that a player joined.
    target.broadcast({
      type: "controller_joined",
      playerId: player.id,
      totalControllers: target.players.length,
    });

    console.log(
      `[Server] Controller joined room ${roomId} as player ${player.id} (code ${code})`,
    );

    attachMessageHandler(ws);
    attachCloseHandler(ws);
    return;
  }

  // ── Display (laptop) — requires a valid JWT ──────────────────────────────
  const cookieHeader = req.headers.cookie ?? "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
  const rawToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
  const authPayload = verifyToken(rawToken);

  if (!authPayload) {
    ws.send(
      JSON.stringify({
        type: "auth_error",
        message: "Not authenticated. Please log in.",
      }),
    );
    ws.close(1008, "Unauthorized");
    return;
  }

  const username = authPayload.username;
  ws.username = username;

  const roomId = `${Date.now()}-couch`;
  const room = new GameRoom(roomId, onGameOver(roomId));
  rooms.set(roomId, room);

  let code;
  do {
    code = generateCode();
  } while (roomsByCode.has(code));
  roomsByCode.set(code, roomId);
  room.code = code;

  room.setDisplay(ws);
  ws.role = "display";
  ws.roomId = roomId;

  ws.send(
    JSON.stringify({
      type: "display_assigned",
      roomCode: code,
      username,
    }),
  );
  console.log(`[Server] Room ${roomId} — display: ${username}, code: ${code}`);

  attachMessageHandler(ws);
  attachCloseHandler(ws);
});

// ── Per-socket handlers (extracted so all roles share them) ─────────────────

function attachMessageHandler(ws) {
  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const currentRoom = ws.roomId ? rooms.get(ws.roomId) : null;
    if (!currentRoom) return;

    if (data.type === "ready") {
      if (ws.role !== "display") return;
      if (currentRoom.players.length < 1) return;
      console.log(
        `[Server] Starting room ${ws.roomId} with ${currentRoom.players.length} player(s)`,
      );
      currentRoom.startGame();
      if (currentRoom.code) roomsByCode.delete(currentRoom.code);
      return;
    }

    if (data.type === "input") {
      if (ws.role === "display") return;
      currentRoom.handleInput(ws.playerId, data.dx, data.dy, data.shooting);
    }
  });
}

function attachCloseHandler(ws) {
  ws.on("close", () => {
    console.log(
      `[Server] ${ws.username ?? "(controller)"} disconnected (role:${ws.role ?? "?"}) from room ${ws.roomId ?? "none"}`,
    );

    if (!ws.roomId) return;
    const currentRoom = rooms.get(ws.roomId);
    if (!currentRoom) return;

    // Only free up the room code when the display itself drops; a phone
    // leaving the lobby just frees its slot so someone else can scan.
    if (ws.role === "display" && currentRoom.code) {
      roomsByCode.delete(currentRoom.code);
      currentRoom.removeDisplay();
    } else if (ws.playerId !== null && ws.playerId !== undefined) {
      currentRoom.removePlayer(ws.playerId);
      if (currentRoom.gameState === "waiting" && currentRoom.display) {
        try {
          currentRoom.display.send(
            JSON.stringify({
              type: "controller_left",
              totalControllers: currentRoom.players.length,
            }),
          );
        } catch {
          /* socket may be closing */
        }
      }
    }

    const hasAnyone = currentRoom.players.length > 0 || currentRoom.display;
    if (currentRoom.isGameOver || !hasAnyone) {
      rooms.delete(ws.roomId);
      console.log(`[Server] Room ${ws.roomId} deleted`);
    }
  });
}

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    if (!DB_ENABLED) {
      console.log("[Server] No MONGO_URI — using in-memory auth (dev mode)");
    }
  });
});
