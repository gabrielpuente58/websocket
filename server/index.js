require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { connectDB } = require('./db/index');
const Score = require('./db/Score');
const GameRoom = require('./game/GameRoom');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Static files
app.use(express.static(path.join(__dirname, '../client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// REST endpoints
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

// Room management
const rooms = new Map();       // roomId -> GameRoom
const readySets = new Map();   // roomId -> Set of playerIds
let waitingRoom = null;        // GameRoom | null

function onGameOver(roomId) {
  return async ({ result, score, wave }) => {
    try {
      await Score.create({ result, score, wave });
      console.log(`[Game] Room ${roomId} ended: ${result}, score ${score}`);
    } catch (err) {
      console.error('[DB] Failed to save score:', err.message);
    }
    setTimeout(() => rooms.delete(roomId), 10000);
  };
}

wss.on('connection', (ws) => {
  console.log('[Server] New WebSocket connection');

  // Assign the incoming player to a room
  let room;
  if (waitingRoom === null) {
    const roomId = Date.now().toString();
    room = new GameRoom(roomId, onGameOver(roomId));
    rooms.set(roomId, room);
    readySets.set(roomId, new Set());
    waitingRoom = room;
    console.log(`[Server] Created room ${roomId}`);
  } else {
    room = waitingRoom;
  }

  const player = room.addPlayer(ws);
  ws.playerId = player.id;
  ws.roomId = room.id;

  if (room.players.length === 2) {
    // Second player joined — clear the waiting slot
    waitingRoom = null;

    // Notify both players
    room.players.forEach((p) => {
      const isFirst = p.id === 0;
      p.ws.send(
        JSON.stringify({
          type: 'player_assigned',
          playerId: p.id,
          status: isFirst ? 'waiting' : 'ready_to_start',
        })
      );
    });

    // Broadcast opponent_joined to both
    room.players.forEach((p) => {
      p.ws.send(JSON.stringify({ type: 'opponent_joined' }));
    });

    console.log(`[Server] Room ${room.id} now has 2 players`);
  } else {
    // First player — tell them to wait
    ws.send(
      JSON.stringify({
        type: 'player_assigned',
        playerId: player.id,
        status: 'waiting',
      })
    );
    console.log(`[Server] Player ${player.id} waiting in room ${room.id}`);
  }

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn('[Server] Malformed JSON from player', ws.playerId);
      return;
    }

    const currentRoom = rooms.get(ws.roomId);
    if (!currentRoom) return;

    if (data.type === 'ready') {
      const readySet = readySets.get(ws.roomId);
      if (!readySet) return;

      readySet.add(ws.playerId);
      console.log(
        `[Server] Player ${ws.playerId} ready in room ${ws.roomId} (${readySet.size}/2)`
      );

      if (readySet.size === 2) {
        console.log(`[Server] Both players ready — starting room ${ws.roomId}`);
        currentRoom.startGame();
        readySets.delete(ws.roomId);
      }
    } else if (data.type === 'input') {
      currentRoom.handleInput(ws.playerId, data.dx, data.dy, data.shooting);
    }
  });

  ws.on('close', () => {
    console.log(
      `[Server] Player ${ws.playerId} disconnected from room ${ws.roomId}`
    );

    const currentRoom = rooms.get(ws.roomId);
    if (!currentRoom) return;

    // If this room was still waiting, clear it
    if (waitingRoom && waitingRoom.id === ws.roomId) {
      waitingRoom = null;
    }

    currentRoom.removePlayer(ws.playerId);

    if (currentRoom.isGameOver || currentRoom.players.length === 0) {
      rooms.delete(ws.roomId);
      readySets.delete(ws.roomId);
      console.log(`[Server] Room ${ws.roomId} deleted`);
    }
  });
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
  });
});
