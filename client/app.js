'use strict';

const { createApp, reactive, computed } = Vue;

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}`;

const TILE_SIZE = 40;
const MAP_COLS = 20;
const MAP_ROWS = 15;
const CANVAS_W = MAP_COLS * TILE_SIZE; // 800
const CANVAS_H = MAP_ROWS * TILE_SIZE; // 600

const COLORS = {
  floor: '#2a2a3a',
  wall: '#4a4a6a',
  wallHighlight: '#5a5a8a',
  player0: '#00d4ff',
  player1: '#ff6b35',
  bot: '#ff4444',
  bullet: '#ffff00',
  hpGreen: '#00cc55',
  hpRed: '#cc2222',
};

function hpColor(ratio) {
  if (ratio > 0.6) return COLORS.hpGreen;
  if (ratio > 0.3) return '#ccaa00';
  return COLORS.hpRed;
}

createApp({
  template: `
    <template v-if="screen === 'lobby'">
      <div class="screen">
        <h1><i class="fa-solid fa-gamepad"></i> Co-op Shooter</h1>
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:center;margin-bottom:8px;">
            <span class="status-dot" :class="{ connected }"></span>
            <span style="font-size:13px;color:#aaa;">{{ connected ? 'Connected' : 'Disconnected' }}</span>
          </div>
          <p>{{ statusMsg }}</p>
          <div v-if="myPlayerId !== null" style="margin:16px 0;">
            <p>You are
              <strong :style="playerColorStyle">Player {{ myPlayerId + 1 }}</strong>
            </p>
          </div>
          <button class="btn" v-if="readyToStart" @click="sendReady">Ready!</button>
        </div>
      </div>
    </template>

    <template v-else-if="screen === 'game'">
      <div class="game-wrapper">
        <canvas ref="gameCanvas" id="game-canvas" :width="CANVAS_W" :height="CANVAS_H"></canvas>

        <div class="hud">
          <div
            v-for="(player, idx) in gameData.players"
            :key="player.id"
            class="player-hud"
            :style="idx === 1 ? 'text-align:right;align-items:flex-end;' : 'align-items:flex-start;'"
          >
            <div
              class="player-hud-label"
              :style="{ color: player.id === 0 ? '#00d4ff' : '#ff6b35' }"
            >
              <i v-if="player.id === myPlayerId" class="fa-solid fa-caret-right"></i> Player {{ player.id + 1 }}
              <span v-if="!player.alive" style="color:#ff4444;font-size:10px;"> (Dead)</span>
            </div>
            <div class="health-bar-bg" style="width:120px;">
              <div
                class="health-bar-fill"
                :style="{
                  width: Math.max(0, Math.min(100, player.hp)) + '%',
                  backgroundColor: hpColorForPlayer(player.hp)
                }"
              ></div>
            </div>
            <div class="player-score" v-if="player.score !== undefined">
              Score: {{ player.score }}
            </div>
          </div>
        </div>

        <div class="wave-banner" v-if="waveBanner">{{ waveBanner }}</div>

        <div class="mobile-controls">
          <div class="dpad">
            <div class="dpad-btn transparent"></div>
            <button
              class="dpad-btn"
              @touchstart.prevent="dpadPress(0, -1)"
              @touchend.prevent="dpadRelease('y')"
              @mousedown.prevent="dpadPress(0, -1)"
              @mouseup.prevent="dpadRelease('y')"
              @mouseleave="dpadRelease('y')"
            ><i class="fa-solid fa-caret-up"></i></button>
            <div class="dpad-btn transparent"></div>

            <button
              class="dpad-btn"
              @touchstart.prevent="dpadPress(-1, 0)"
              @touchend.prevent="dpadRelease('x')"
              @mousedown.prevent="dpadPress(-1, 0)"
              @mouseup.prevent="dpadRelease('x')"
              @mouseleave="dpadRelease('x')"
            ><i class="fa-solid fa-caret-left"></i></button>
            <div class="dpad-btn transparent"></div>
            <button
              class="dpad-btn"
              @touchstart.prevent="dpadPress(1, 0)"
              @touchend.prevent="dpadRelease('x')"
              @mousedown.prevent="dpadPress(1, 0)"
              @mouseup.prevent="dpadRelease('x')"
              @mouseleave="dpadRelease('x')"
            ><i class="fa-solid fa-caret-right"></i></button>

            <div class="dpad-btn transparent"></div>
            <button
              class="dpad-btn"
              @touchstart.prevent="dpadPress(0, 1)"
              @touchend.prevent="dpadRelease('y')"
              @mousedown.prevent="dpadPress(0, 1)"
              @mouseup.prevent="dpadRelease('y')"
              @mouseleave="dpadRelease('y')"
            ><i class="fa-solid fa-caret-down"></i></button>
            <div class="dpad-btn transparent"></div>
          </div>

          <button
            class="shoot-btn"
            @touchstart.prevent="startShooting"
            @touchend.prevent="stopShooting"
            @mousedown.prevent="startShooting"
            @mouseup.prevent="stopShooting"
            @mouseleave="stopShooting"
          ><i class="fa-solid fa-crosshairs"></i></button>
        </div>
      </div>
    </template>

    <template v-else-if="screen === 'gameover'">
      <div class="screen">
        <div class="card">
          <h2 :class="gameResult === 'win' ? 'result-win' : 'result-lose'">
            <i :class="gameResult === 'win' ? 'fa-solid fa-trophy' : 'fa-solid fa-skull'"></i>
            {{ gameResult === 'win' ? ' Victory!' : ' Defeated' }}
          </h2>
          <p>Score: <strong style="font-size:1.4em;color:#fff;">{{ finalScore }}</strong></p>
          <p>Wave reached: <strong>{{ waveNumber }}</strong></p>

          <h3>Leaderboard</h3>
          <div v-if="leaderboard.length === 0" class="no-leaderboard">
            No scores yet.
          </div>
          <table v-else class="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Score</th>
                <th>Wave</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, i) in leaderboard" :key="i">
                <td>{{ i + 1 }}</td>
                <td>{{ entry.name || entry.player || ('Player ' + (i + 1)) }}</td>
                <td>{{ entry.score }}</td>
                <td>{{ entry.wave || '-' }}</td>
              </tr>
            </tbody>
          </table>

          <button class="btn" @click="playAgain" style="margin-top:24px;">Play Again</button>
        </div>
      </div>
    </template>
  `,

  data() {
    return {
      // constants exposed to template
      CANVAS_W,
      CANVAS_H,

      // connection / lobby
      screen: 'lobby',
      connected: false,
      statusMsg: 'Connecting...',
      myPlayerId: null,
      readyToStart: false,

      // game state
      gameData: {
        players: [],
        bots: [],
        bullets: [],
      },
      mapTiles: [],
      waveNumber: 0,
      waveBanner: '',
      _waveBannerTimer: null,

      // result
      gameResult: null,
      finalScore: 0,
      leaderboard: [],

      // input
      input: { dx: 0, dy: 0, shooting: false },

      // internal
      ws: null,
      _rafHandle: null,
      _keydownHandler: null,
      _keyupHandler: null,
      _keysHeld: {},

      // direction tracking
      prevPositions: {},
      playerDirections: {},
    };
  },

  computed: {
    playerColorStyle() {
      const color = this.myPlayerId === 0 ? COLORS.player0 : COLORS.player1;
      return { color };
    },
  },

  mounted() {
    this.connectWS();
  },

  beforeUnmount() {
    this.stopRenderLoop();
    if (this._keydownHandler) window.removeEventListener('keydown', this._keydownHandler);
    if (this._keyupHandler) window.removeEventListener('keyup', this._keyupHandler);
    if (this.ws) this.ws.close();
    if (this._waveBannerTimer) clearTimeout(this._waveBannerTimer);
  },

  methods: {
    hpColorForPlayer(hp) {
      const ratio = Math.max(0, Math.min(100, hp)) / 100;
      return hpColor(ratio);
    },

    connectWS() {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this.statusMsg = 'Connected! Waiting for opponent...';
      };

      ws.onclose = () => {
        this.connected = false;
        this.statusMsg = 'Disconnected';
      };

      ws.onerror = () => {
        this.statusMsg = 'Connection error';
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        this.handleMessage(msg);
      };
    },

    handleMessage(msg) {
      switch (msg.type) {
        case 'player_assigned':
          this.myPlayerId = msg.playerId ?? msg.player_id ?? msg.id;
          this.statusMsg = `You are Player ${this.myPlayerId + 1}. Waiting for opponent...`;
          break;

        case 'opponent_joined':
          this.readyToStart = true;
          this.statusMsg = 'Opponent joined! Press Ready when you want to start.';
          break;

        case 'game_start':
          this.mapTiles = msg.map ?? msg.mapTiles ?? [];
          this.screen = 'game';
          // Wait a tick so the canvas ref is rendered
          this.$nextTick(() => {
            this.startRenderLoop();
            this.setupInput();
          });
          break;

        case 'game_state':
          this.gameData.players = msg.players ?? this.gameData.players;
          this.gameData.bots = msg.bots ?? this.gameData.bots;
          this.gameData.bullets = msg.bullets ?? this.gameData.bullets;
          break;

        case 'wave_start':
          this.waveNumber = msg.wave ?? msg.waveNumber ?? this.waveNumber + 1;
          this.waveBanner = `Wave ${this.waveNumber}!`;
          if (this._waveBannerTimer) clearTimeout(this._waveBannerTimer);
          this._waveBannerTimer = setTimeout(() => {
            this.waveBanner = '';
          }, 2500);
          break;

        case 'game_over':
          this.gameResult = msg.result ?? (msg.win ? 'win' : 'lose');
          this.finalScore = msg.score ?? 0;
          this.screen = 'gameover';
          this.stopRenderLoop();
          this.fetchLeaderboard();
          break;

        default:
          break;
      }
    },

    sendReady() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ready' }));
      }
    },

    sendInput() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'input',
          dx: this.input.dx,
          dy: this.input.dy,
          shooting: this.input.shooting,
        }));
      }
    },

    setupInput() {
      const updateFromKeys = () => {
        const keys = this._keysHeld;
        let dx = 0, dy = 0;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        const shooting = !!keys[' '];
        this.input.dx = dx;
        this.input.dy = dy;
        this.input.shooting = shooting;
        this.sendInput();
      };

      this._keydownHandler = (e) => {
        const key = e.key.toLowerCase();
        if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) {
          e.preventDefault();
        }
        this._keysHeld[key] = true;
        updateFromKeys();
      };

      this._keyupHandler = (e) => {
        const key = e.key.toLowerCase();
        this._keysHeld[key] = false;
        updateFromKeys();
      };

      window.addEventListener('keydown', this._keydownHandler);
      window.addEventListener('keyup', this._keyupHandler);
    },

    // Mobile D-pad handlers
    dpadPress(dx, dy) {
      if (dx !== 0) this.input.dx = dx;
      if (dy !== 0) this.input.dy = dy;
      this.sendInput();
    },

    dpadRelease(axis) {
      if (axis === 'x') this.input.dx = 0;
      if (axis === 'y') this.input.dy = 0;
      this.sendInput();
    },

    startShooting() {
      this.input.shooting = true;
      this.sendInput();
    },

    stopShooting() {
      this.input.shooting = false;
      this.sendInput();
    },

    startRenderLoop() {
      const loop = () => {
        this.render();
        this._rafHandle = requestAnimationFrame(loop);
      };
      this._rafHandle = requestAnimationFrame(loop);
    },

    stopRenderLoop() {
      if (this._rafHandle != null) {
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = null;
      }
    },

    render() {
      const canvas = this.$refs.gameCanvas;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      // Clear with floor color
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw map tiles
      if (this.mapTiles && this.mapTiles.length > 0) {
        for (let row = 0; row < this.mapTiles.length; row++) {
          const tileRow = this.mapTiles[row];
          if (!tileRow) continue;
          for (let col = 0; col < tileRow.length; col++) {
            const tile = tileRow[col];
            // tile === 1 or tile === 'wall' = wall; else floor
            const isWall = tile === 1 || tile === 'wall' || tile === true;
            if (isWall) {
              const x = col * TILE_SIZE;
              const y = row * TILE_SIZE;

              // Main wall fill
              ctx.fillStyle = COLORS.wall;
              ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

              // Pseudo-3D highlight on top and left edges
              ctx.fillStyle = COLORS.wallHighlight;
              ctx.fillRect(x, y, TILE_SIZE, 2);       // top edge
              ctx.fillRect(x, y, 2, TILE_SIZE);       // left edge

              // Darker shadow on bottom/right
              ctx.fillStyle = 'rgba(0,0,0,0.4)';
              ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2); // bottom
              ctx.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE); // right
            } else {
              // Floor tile — draw subtle grid lines
              const x = col * TILE_SIZE;
              const y = row * TILE_SIZE;
              ctx.strokeStyle = 'rgba(255,255,255,0.03)';
              ctx.lineWidth = 0.5;
              ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
            }
          }
        }
      } else {
        // Fallback grid when no map data
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        for (let col = 0; col <= MAP_COLS; col++) {
          ctx.beginPath();
          ctx.moveTo(col * TILE_SIZE, 0);
          ctx.lineTo(col * TILE_SIZE, CANVAS_H);
          ctx.stroke();
        }
        for (let row = 0; row <= MAP_ROWS; row++) {
          ctx.beginPath();
          ctx.moveTo(0, row * TILE_SIZE);
          ctx.lineTo(CANVAS_W, row * TILE_SIZE);
          ctx.stroke();
        }
      }

      // Draw bullets
      const bullets = this.gameData.bullets || [];
      ctx.fillStyle = COLORS.bullet;
      for (const bullet of bullets) {
        const bx = bullet.x * TILE_SIZE;
        const by = bullet.y * TILE_SIZE;
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();

        // Bullet glow
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = COLORS.bullet;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw bots
      const bots = this.gameData.bots || [];
      for (const bot of bots) {
        const bx = bot.x * TILE_SIZE;
        const by = bot.y * TILE_SIZE;
        const hpRatio = Math.max(0, Math.min(100, bot.hp ?? 100)) / 100;
        const botColor = hpRatio < 0.3 ? '#ff8800' : COLORS.bot;

        // Bot body
        ctx.fillStyle = botColor;
        ctx.beginPath();
        ctx.arc(bx, by, 14, 0, Math.PI * 2);
        ctx.fill();

        // Bot outline
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // "Face" dot (darker center)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();

        // Enemy indicator — small red eyes
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(bx - 4, by - 4, 2, 0, Math.PI * 2);
        ctx.arc(bx + 4, by - 4, 2, 0, Math.PI * 2);
        ctx.fill();

        // HP bar above bot
        this.drawEntityHPBar(ctx, bx, by - 18, 28, hpRatio);
      }

      // Draw players
      const players = this.gameData.players || [];
      for (const player of players) {
        const px = player.x * TILE_SIZE;
        const py = player.y * TILE_SIZE;
        const isMe = player.id === this.myPlayerId;
        const color = player.id === 0 ? COLORS.player0 : COLORS.player1;
        const hpRatio = Math.max(0, Math.min(100, player.hp ?? 100)) / 100;

        // Track direction from position deltas
        const prev = this.prevPositions[player.id];
        if (prev) {
          const ddx = player.x - prev.x;
          const ddy = player.y - prev.y;
          if (ddx !== 0 || ddy !== 0) {
            this.playerDirections[player.id] = { dx: ddx, dy: ddy };
          }
        }
        this.prevPositions[player.id] = { x: player.x, y: player.y };

        ctx.save();

        if (player.alive === false) {
          ctx.globalAlpha = 0.3;
        }

        // Player body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fill();

        // White outline for "my" player
        if (isMe) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Direction indicator triangle
        const dir = this.playerDirections[player.id];
        if (dir) {
          const len = Math.sqrt(dir.dx * dir.dx + dir.dy * dir.dy);
          if (len > 0) {
            const ndx = dir.dx / len;
            const ndy = dir.dy / len;
            const tipX = px + ndx * 22;
            const tipY = py + ndy * 22;
            const perpX = -ndy * 5;
            const perpY = ndx * 5;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - ndx * 10 + perpX, tipY - ndy * 10 + perpY);
            ctx.lineTo(tipX - ndx * 10 - perpX, tipY - ndy * 10 - perpY);
            ctx.closePath();
            ctx.fill();
          }
        }

        ctx.restore();

        // HP bar above player (always full opacity)
        this.drawEntityHPBar(ctx, px, py - 22, 32, hpRatio);
      }
    },

    drawEntityHPBar(ctx, cx, cy, width, hpRatio) {
      const h = 4;
      const x = cx - width / 2;
      const y = cy - h;

      // Background
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 1, y - 1, width + 2, h + 2);

      // Fill
      ctx.fillStyle = hpColor(hpRatio);
      ctx.fillRect(x, y, width * hpRatio, h);
    },

    fetchLeaderboard() {
      fetch('/api/leaderboard')
        .then(r => {
          if (!r.ok) throw new Error('Not ok');
          return r.json();
        })
        .then(data => {
          this.leaderboard = Array.isArray(data) ? data : (data.scores ?? data.entries ?? []);
        })
        .catch(() => {
          this.leaderboard = [];
        });
    },

    playAgain() {
      window.location.reload();
    },
  },
}).mount('#app');
