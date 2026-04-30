# WebSocket Shooter

Real-time co-op top-down shooter. The laptop is the **display** (game view); phones are **controllers** that join via a 6-character room code. Server-authoritative game loop runs at 20 ticks/sec over WebSockets.

**Live:** https://websocket-production-2245.up.railway.app/

## Stack

- **Server:** Node.js, Express, `ws`, JWT auth, optional MongoDB
- **Client:** Vue 3 (CDN), plain HTML/CSS/JS — no build step
- **Deploy:** Railway

## Run locally

```bash
cd server
npm install
node index.js
```

## Environment

Optional `server/.env`:

```
PORT=3000
JWT_SECRET=your-secret
MONGO_URI=mongodb://...   # omit for in-memory dev users
```

## Gameplay

- 20×15 tile map with walls
- 3 waves of bots (BFS pathfinding); survive all waves to win
- Players: 100 HP, shoot every 10 ticks; bots: 30 HP, 10 dmg on contact
