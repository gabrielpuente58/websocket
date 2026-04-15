require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { connectDB } = require('./db/index');
const Score = require('./db/Score');
const User = require('./db/User');
const GameRoom = require('./game/GameRoom');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const DB_ENABLED = !!process.env.MONGO_URI;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ── Dev-mode in-memory user store (used when no MONGO_URI) ───────────────────
// Maps username (lowercase) -> { username, passwordHash }
const devUsers = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

/** 6-char uppercase alphanumeric code (no ambiguous chars I/O/0/1) */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cookieParser());
app.use(express.json());

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const trimmed = username.trim();
  const passwordHash = await bcrypt.hash(password, 12);

  if (DB_ENABLED) {
    try {
      const existing = await User.findOne({ username: trimmed });
      if (existing) return res.status(409).json({ error: 'Username already taken' });
      const user = await User.create({ username: trimmed, passwordHash });
      const token = signToken({ userId: String(user._id), username: user.username });
      return res.cookie('token', token, COOKIE_OPTS).json({ username: user.username });
    } catch (err) {
      console.error('[Auth] Register error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  } else {
    // Dev mode: in-memory store
    if (devUsers.has(trimmed.toLowerCase()))
      return res.status(409).json({ error: 'Username already taken' });
    devUsers.set(trimmed.toLowerCase(), { username: trimmed, passwordHash });
    const token = signToken({ userId: trimmed, username: trimmed });
    return res.cookie('token', token, COOKIE_OPTS).json({ username: trimmed });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const trimmed = username.trim();

  if (DB_ENABLED) {
    try {
      const user = await User.findOne({ username: trimmed });
      if (!user) return res.status(401).json({ error: 'Invalid username or password' });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Invalid username or password' });
      const token = signToken({ userId: String(user._id), username: user.username });
      return res.cookie('token', token, COOKIE_OPTS).json({ username: user.username });
    } catch (err) {
      console.error('[Auth] Login error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  } else {
    // Dev mode
    const record = devUsers.get(trimmed.toLowerCase());
    if (!record) return res.status(401).json({ error: 'Invalid username or password' });
    const valid = await bcrypt.compare(password, record.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });
    const token = signToken({ userId: trimmed, username: record.username });
    return res.cookie('token', token, COOKIE_OPTS).json({ username: record.username });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token').json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const payload = verifyToken(req.cookies?.token);
  if (!payload) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username: payload.username });
});

// ── REST endpoints ────────────────────────────────────────────────────────────

app.get('/api/leaderboard', async (req, res) => {
  try {
    const scores = await Score.find().sort({ score: -1 }).limit(10);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// ── Static files ──────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ── Room management ───────────────────────────────────────────────────────────

const rooms = new Map();       // roomId  -> GameRoom
const readySets = new Map();   // roomId  -> Set of playerIds
const roomsByCode = new Map(); // code    -> roomId

function onGameOver(roomId) {
  return async ({ result, score, wave }) => {
    try {
      if (DB_ENABLED) await Score.create({ result, score, wave });
      console.log(`[Game] Room ${roomId} ended: ${result}, score ${score}`);
    } catch (err) {
      console.error('[DB] Failed to save score:', err.message);
    }
    setTimeout(() => rooms.delete(roomId), 10000);
  };
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  // ── Auth check ──────────────────────────────────────────────────────────────
  // Parse the JWT from the cookie header (browsers send cookies automatically).
  const cookieHeader = req.headers.cookie ?? '';
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
  const rawToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
  const authPayload = verifyToken(rawToken);

  if (!authPayload) {
    ws.send(JSON.stringify({ type: 'auth_error', message: 'Not authenticated. Please log in.' }));
    ws.close(1008, 'Unauthorized');
    return;
  }

  const params = new URL(req.url, 'http://x').searchParams;
  const mode   = params.get('mode') === 'solo' ? 'solo' : 'coop';
  const role   = params.get('role') === 'guest' ? 'guest' : 'host';
  const username = authPayload.username;

  console.log(`[Server] WS connection: ${username} (mode:${mode} role:${role})`);

  ws.mode     = mode;
  ws.username = username;
  ws.playerId = null;
  ws.roomId   = null;

  // ── Solo ────────────────────────────────────────────────────────────────────
  if (mode === 'solo') {
    const roomId = `${Date.now()}-solo`;
    const room   = new GameRoom(roomId, onGameOver(roomId));
    rooms.set(roomId, room);
    readySets.set(roomId, new Set());

    const player = room.addPlayer(ws);
    ws.playerId  = player.id;
    ws.roomId    = roomId;

    ws.send(JSON.stringify({
      type: 'player_assigned',
      playerId: player.id,
      status: 'solo',
      username,
    }));
    console.log(`[Server] Solo room ${roomId} — ${username}`);

  // ── Coop Host ───────────────────────────────────────────────────────────────
  } else if (role === 'host') {
    const roomId = `${Date.now()}-coop`;
    const room   = new GameRoom(roomId, onGameOver(roomId));
    rooms.set(roomId, room);
    readySets.set(roomId, new Set());

    // Generate a unique code
    let code;
    do { code = generateCode(); } while (roomsByCode.has(code));
    roomsByCode.set(code, roomId);
    room.code = code;

    const player = room.addPlayer(ws);
    ws.playerId  = player.id;
    ws.roomId    = roomId;

    ws.send(JSON.stringify({
      type: 'player_assigned',
      playerId: player.id,
      status: 'waiting',
      roomCode: code,
      username,
    }));
    console.log(`[Server] Coop room ${roomId} — host: ${username}, code: ${code}`);

  // ── Coop Guest ──────────────────────────────────────────────────────────────
  } else {
    // Guest has no room yet; ask them to enter the host's code
    ws.send(JSON.stringify({ type: 'need_code' }));
    console.log(`[Server] Guest ${username} waiting for room code`);
  }

  // ── Message handler ────────────────────────────────────────────────────────
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // ── Guest joining by code ────────────────────────────────────────────────
    if (data.type === 'join_room') {
      const code     = String(data.code ?? '').trim().toUpperCase();
      const roomId   = roomsByCode.get(code);
      const target   = roomId ? rooms.get(roomId) : null;

      if (!target || target.players.length >= 2) {
        ws.send(JSON.stringify({
          type: 'code_error',
          message: target ? 'Room is already full.' : 'Room not found — check the code and try again.',
        }));
        return;
      }

      const player = target.addPlayer(ws);
      ws.playerId  = player.id;
      ws.roomId    = roomId;

      // Remove code so nobody else can join with it
      roomsByCode.delete(code);

      // Tell the guest their player info
      ws.send(JSON.stringify({
        type: 'player_assigned',
        playerId: player.id,
        status: 'ready_to_start',
        username,
      }));

      // Tell both players that the opponent has joined (include opponent's username)
      target.players.forEach(p => {
        const opponentUsername = p.id === player.id
          ? target.players[0]?.ws?.username ?? '?'
          : username;
        p.ws.send(JSON.stringify({ type: 'opponent_joined', opponentUsername }));
      });

      console.log(`[Server] ${username} joined room ${roomId} via code ${code}`);
      return;
    }

    // ── Normal game messages ─────────────────────────────────────────────────
    const currentRoom = ws.roomId ? rooms.get(ws.roomId) : null;
    if (!currentRoom) return;

    if (data.type === 'ready') {
      const readySet = readySets.get(ws.roomId);
      if (!readySet) return;
      readySet.add(ws.playerId);
      const required = mode === 'solo' ? 1 : 2;
      console.log(`[Server] ${username} ready in room ${ws.roomId} (${readySet.size}/${required})`);
      if (readySet.size >= required) {
        console.log(`[Server] Starting room ${ws.roomId}`);
        currentRoom.startGame();
        readySets.delete(ws.roomId);
      }
    } else if (data.type === 'input') {
      currentRoom.handleInput(ws.playerId, data.dx, data.dy, data.shooting);
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  ws.on('close', () => {
    console.log(`[Server] ${ws.username} disconnected from room ${ws.roomId ?? 'none'}`);

    if (!ws.roomId) return;
    const currentRoom = rooms.get(ws.roomId);
    if (!currentRoom) return;

    // Clean up code if host leaves before guest joins
    if (currentRoom.code && roomsByCode.has(currentRoom.code)) {
      roomsByCode.delete(currentRoom.code);
    }

    currentRoom.removePlayer(ws.playerId);

    if (currentRoom.isGameOver || currentRoom.players.length === 0) {
      rooms.delete(ws.roomId);
      readySets.delete(ws.roomId);
      console.log(`[Server] Room ${ws.roomId} deleted`);
    }
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    if (!DB_ENABLED) {
      console.log('[Server] No MONGO_URI — using in-memory auth (dev mode)');
    }
  });
});
