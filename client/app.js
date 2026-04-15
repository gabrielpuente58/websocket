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
  bullet: '#ffff00',
  botBullet: '#ff6600',
  hpGreen: '#00cc55',
  hpRed: '#cc2222',
  // Bot type colors:
  scout:    '#ff9933',
  standard: '#ff4444',
  heavy:    '#aa00ff',
  boss:     '#ff0055',
  // Powerup colors:
  health:    '#00ff88',
  rapidfire: '#ffdd00',
  shield:    '#44aaff',
};

const BOT_SCORE = {
  scout: 10,
  standard: 15,
  heavy: 25,
  boss: 100,
};

const BOT_RADIUS = {
  scout: 11,
  standard: 14,
  heavy: 18,
  boss: 24,
};

const POWERUP_ICON = {
  health: '+',
  rapidfire: '⚡',
  shield: '⬡',
};

function hpColor(ratio) {
  if (ratio > 0.6) return COLORS.hpGreen;
  if (ratio > 0.3) return '#ccaa00';
  return COLORS.hpRed;
}

createApp({
  template: `
    <!-- ══════════════════════════════════════════════════════ AUTH SCREEN -->
    <template v-if="screen === 'auth'">
      <div class="screen">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="start-icon-ring" style="width:56px;height:56px;font-size:22px;">
              <i class="fa-solid fa-crosshairs"></i>
            </div>
            <h2 class="auth-title">Co-op Shooter</h2>
          </div>

          <div class="auth-tabs">
            <button :class="['auth-tab', { active: authTab === 'login' }]" @click="authTab='login'; authError=''">Login</button>
            <button :class="['auth-tab', { active: authTab === 'register' }]" @click="authTab='register'; authError=''">Register</button>
          </div>

          <form class="auth-form" @submit.prevent="authTab === 'login' ? login() : register()">
            <input
              class="auth-input"
              v-model="authUsername"
              type="text"
              placeholder="Username"
              autocomplete="username"
              maxlength="20"
            />
            <input
              class="auth-input"
              v-model="authPassword"
              type="password"
              placeholder="Password"
              autocomplete="current-password"
            />
            <div class="auth-error" v-if="authError">{{ authError }}</div>
            <button class="btn auth-submit-btn" type="submit" :disabled="authLoading">
              <i v-if="authLoading" class="fa-solid fa-circle-notch fa-spin"></i>
              <span v-else>{{ authTab === 'login' ? 'Login' : 'Create Account' }}</span>
            </button>
          </form>
        </div>
      </div>
    </template>

    <!-- ══════════════════════════════════════════════════════ START SCREEN -->
    <template v-else-if="screen === 'start'">
      <div class="screen start-screen">
        <div class="start-hero">
          <div class="start-icon-ring">
            <i class="fa-solid fa-crosshairs"></i>
          </div>
          <h1>Co-op Shooter</h1>
          <p class="subtitle">Survive endless waves of enemies — how far can you go?</p>
        </div>

        <div class="auth-user-bar" v-if="currentUser">
          <i class="fa-solid fa-user" style="color:#8888aa;font-size:12px;"></i>
          <span style="color:#aaa;font-size:13px;">{{ currentUser.username }}</span>
          <button class="btn btn-ghost" style="padding:4px 12px;font-size:12px;" @click="logout">Logout</button>
        </div>

        <div class="mode-btns">
          <button class="mode-card" @click="selectMode('solo')">
            <i class="fa-solid fa-user mode-card-icon"></i>
            <span class="mode-card-title">Solo</span>
            <span class="mode-card-sub">Play alone</span>
          </button>
          <button class="mode-card mode-card-coop" @click="selectMode('coop')">
            <i class="fa-solid fa-user-group mode-card-icon"></i>
            <span class="mode-card-title">Co-op</span>
            <span class="mode-card-sub">2 players</span>
          </button>
        </div>

        <div class="info-panel">
          <div class="info-section">
            <div class="info-section-title"><i class="fa-solid fa-keyboard"></i> Controls</div>
            <div class="info-row">
              <span class="info-label">Move</span>
              <span class="info-value"><kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd></span>
            </div>
            <div class="info-row">
              <span class="info-label">Shoot</span>
              <span class="info-value"><kbd>Space</kbd></span>
            </div>
          </div>

          <div class="info-divider"></div>

          <div class="info-section">
            <div class="info-section-title"><i class="fa-solid fa-star"></i> Powerups</div>
            <div class="info-row">
              <span class="powerup-dot" style="background:#00ff88;"></span>
              <span class="info-value">Health +40 HP</span>
            </div>
            <div class="info-row">
              <span class="powerup-dot" style="background:#ffdd00;"></span>
              <span class="info-value">Rapid Fire 10s</span>
            </div>
            <div class="info-row">
              <span class="powerup-dot" style="background:#44aaff;"></span>
              <span class="info-value">Shield (1 hit)</span>
            </div>
          </div>

          <div class="info-divider"></div>

          <div class="info-section">
            <div class="info-section-title"><i class="fa-solid fa-wave-square"></i> Waves</div>
            <div class="wave-row"><span class="wave-num">1–2</span><span>Scouts &amp; Standards</span></div>
            <div class="wave-row"><span class="wave-num">3+</span><span>Heavies join the fight</span></div>
            <div class="wave-row"><span class="wave-num">5+</span><span>Bosses appear</span></div>
            <div class="wave-row" style="margin-top:6px;font-size:11px;color:#aaa;">Waves never end — survive as long as you can</div>
          </div>
        </div>
      </div>
    </template>

    <!-- ══════════════════════════════════════════════════════ LOBBY SCREEN -->
    <template v-else-if="screen === 'lobby'">
      <div class="screen">
        <div class="lobby-card">
          <div class="lobby-header">
            <span class="status-dot" :class="{ connected }"></span>
            <span class="lobby-mode-label">
              <i :class="gameMode === 'solo' ? 'fa-solid fa-user' : 'fa-solid fa-user-group'"></i>
              {{ gameMode === 'solo' ? 'Solo Mode' : 'Co-op Mode' }}
            </span>
          </div>

          <!-- Co-op role selection (before connecting) -->
          <template v-if="gameMode === 'coop' && coopRole === null">
            <p style="color:#aaa;font-size:0.88rem;margin:0;">How do you want to join?</p>
            <div class="mode-btns" style="gap:12px;">
              <button class="mode-card" style="width:130px;padding:20px 12px;" @click="selectRole('host')">
                <i class="fa-solid fa-tower-broadcast mode-card-icon" style="font-size:22px;"></i>
                <span class="mode-card-title" style="font-size:0.9rem;">Create Room</span>
                <span class="mode-card-sub">Get a room code</span>
              </button>
              <button class="mode-card mode-card-coop" style="width:130px;padding:20px 12px;" @click="selectRole('guest')">
                <i class="fa-solid fa-right-to-bracket mode-card-icon" style="font-size:22px;"></i>
                <span class="mode-card-title" style="font-size:0.9rem;">Join Room</span>
                <span class="mode-card-sub">Enter a code</span>
              </button>
            </div>
          </template>

          <!-- Guest: enter code -->
          <template v-else-if="gameMode === 'coop' && coopRole === 'guest' && awaitingCode">
            <p style="color:#aaa;font-size:0.88rem;margin:0;">Enter your partner's room code:</p>
            <input
              class="code-input"
              v-model="roomCodeInput"
              type="text"
              placeholder="ABC123"
              maxlength="6"
              @keyup.enter="joinRoom"
              style="text-transform:uppercase;"
            />
            <div class="auth-error" v-if="codeError">{{ codeError }}</div>
            <button class="btn btn-ready" @click="joinRoom" :disabled="roomCodeInput.length < 6">
              <i class="fa-solid fa-right-to-bracket"></i> Join Room
            </button>
          </template>

          <!-- Normal lobby state (connected, waiting) -->
          <template v-else-if="coopRole !== null || gameMode === 'solo'">
            <!-- Host: show room code -->
            <div class="room-code-block" v-if="gameMode === 'coop' && coopRole === 'host' && roomCode">
              <div class="room-code-label">Your room code</div>
              <div class="room-code">{{ roomCode }}</div>
              <div class="room-code-hint">Share this with your partner</div>
            </div>

            <div class="lobby-player-badge" v-if="myPlayerId !== null" :style="{ borderColor: myPlayerId === 0 ? '#00d4ff' : '#ff6b35' }">
              <i class="fa-solid fa-user" :style="{ color: myPlayerId === 0 ? '#00d4ff' : '#ff6b35' }"></i>
              <span :style="{ color: myPlayerId === 0 ? '#00d4ff' : '#ff6b35' }">
                {{ currentUser ? currentUser.username : 'Player ' + (myPlayerId + 1) }}
              </span>
            </div>

            <div class="lobby-status">
              <div class="lobby-spinner" v-if="!readyToStart">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
              </div>
              <p>{{ statusMsg }}</p>
            </div>

            <button class="btn btn-ready" v-if="readyToStart" @click="sendReady">
              <i class="fa-solid fa-play"></i> Ready!
            </button>
          </template>

          <button class="btn btn-ghost" @click="goBack">
            <i class="fa-solid fa-arrow-left"></i> Back
          </button>
        </div>
      </div>
    </template>

    <!-- ══════════════════════════════════════════════════════ GAME SCREEN -->
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

            <template v-if="!player.alive">
              <div class="respawn-msg" style="color:#ff9933;">
                Needs Revive
              </div>
            </template>
            <template v-else>
              <div class="health-bar-bg" style="width:120px;">
                <div
                  class="health-bar-fill"
                  :style="{
                    width: Math.max(0, Math.min(100, player.hp)) + '%',
                    backgroundColor: hpColorForPlayer(player.hp)
                  }"
                ></div>
              </div>
            </template>

            <div class="powerup-badge" v-if="player.shield || player.rapidFire">
              <span v-if="player.shield" class="badge-shield">
                <i class="fa-solid fa-shield"></i>
              </span>
              <span v-if="player.rapidFire" class="badge-rapid">
                <i class="fa-solid fa-bolt"></i>
              </span>
            </div>

            <div class="player-score" v-if="player.score !== undefined">
              Score: {{ player.score }}
            </div>
          </div>
        </div>

        <div class="hud-center" v-if="waveNumber > 0">Wave {{ waveNumber }}</div>
        <div class="wave-banner" v-if="waveBanner">{{ waveBanner }}</div>
      </div>
    </template>

    <!-- ══════════════════════════════════════════════════════ GAME OVER SCREEN -->
    <template v-else-if="screen === 'gameover'">
      <div class="screen gameover-screen">
        <div class="gameover-result result-lose-block">
          <i class="fa-solid fa-skull result-icon"></i>
          <div class="result-title">Game Over</div>
        </div>

        <div class="gameover-stats">
          <div class="stat-block">
            <div class="stat-value">{{ finalScore }}</div>
            <div class="stat-label">Score</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-block">
            <div class="stat-value">{{ waveNumber }}</div>
            <div class="stat-label">Wave Reached</div>
          </div>
        </div>

        <div class="leaderboard-panel">
          <div class="leaderboard-title"><i class="fa-solid fa-ranking-star"></i> Leaderboard</div>
          <div v-if="leaderboard.length === 0" class="no-leaderboard">No scores yet.</div>
          <table v-else class="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Score</th>
                <th>Wave</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, i) in leaderboard" :key="i" :class="{ 'lb-highlight': entry.score === finalScore && i === 0 }">
                <td>
                  <span v-if="i === 0" class="lb-medal gold"><i class="fa-solid fa-medal"></i></span>
                  <span v-else-if="i === 1" class="lb-medal silver"><i class="fa-solid fa-medal"></i></span>
                  <span v-else-if="i === 2" class="lb-medal bronze"><i class="fa-solid fa-medal"></i></span>
                  <span v-else class="lb-rank-num">{{ i + 1 }}</span>
                </td>
                <td><strong>{{ entry.score }}</strong></td>
                <td>{{ entry.wave || '-' }}</td>
                <td><span :class="entry.result === 'win' ? 'lb-win' : 'lb-lose'">{{ entry.result === 'win' ? 'Win' : 'Loss' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <button class="btn btn-play-again" @click="playAgain">
          <i class="fa-solid fa-rotate-right"></i> Play Again
        </button>
      </div>
    </template>
  `,

  data() {
    return {
      // constants exposed to template
      CANVAS_W,
      CANVAS_H,

      // auth
      screen: 'auth',
      authTab: 'login',           // 'login' | 'register'
      authUsername: '',
      authPassword: '',
      authError: '',
      authLoading: false,
      currentUser: null,          // { username } after login

      // connection / lobby
      gameMode: null,       // 'solo' | 'coop'
      coopRole: null,       // 'host' | 'guest'
      awaitingCode: false,  // guest is waiting to enter a code
      roomCode: '',         // host: code from server; guest: n/a
      roomCodeInput: '',    // guest: typed input
      codeError: '',        // error from bad code attempt
      connected: false,
      statusMsg: 'Connecting...',
      myPlayerId: null,
      readyToStart: false,

      // game state
      gameData: {
        players: [],
        bots: [],
        bullets: [],
        powerups: [],
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

      // animation / render state
      tickCount: 0,
      prevBotIds: {},
      botTypeMap: {},
      popups: [],
    };
  },

  computed: {
    playerColorStyle() {
      const color = this.myPlayerId === 0 ? COLORS.player0 : COLORS.player1;
      return { color };
    },
  },

  mounted() {
    // Check if already logged in
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.username) {
          this.currentUser = data;
          this.screen = 'start';
        }
      })
      .catch(() => {});
  },

  beforeUnmount() {
    this.stopRenderLoop();
    if (this._keydownHandler) window.removeEventListener('keydown', this._keydownHandler);
    if (this._keyupHandler) window.removeEventListener('keyup', this._keyupHandler);
    if (this.ws) this.ws.close();
    if (this._waveBannerTimer) clearTimeout(this._waveBannerTimer);
  },

  methods: {
    // ── Auth methods ─────────────────────────────────────────────────────────

    async login() {
      this.authError = '';
      this.authLoading = true;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: this.authUsername, password: this.authPassword }),
        });
        const data = await res.json();
        if (!res.ok) { this.authError = data.error ?? 'Login failed'; return; }
        this.currentUser = data;
        this.authUsername = '';
        this.authPassword = '';
        this.screen = 'start';
      } catch {
        this.authError = 'Connection error. Try again.';
      } finally {
        this.authLoading = false;
      }
    },

    async register() {
      this.authError = '';
      this.authLoading = true;
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: this.authUsername, password: this.authPassword }),
        });
        const data = await res.json();
        if (!res.ok) { this.authError = data.error ?? 'Registration failed'; return; }
        this.currentUser = data;
        this.authUsername = '';
        this.authPassword = '';
        this.screen = 'start';
      } catch {
        this.authError = 'Connection error. Try again.';
      } finally {
        this.authLoading = false;
      }
    },

    async logout() {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      this.currentUser = null;
      this.screen = 'auth';
      this.authTab = 'login';
      this.authError = '';
    },

    joinRoom() {
      const code = this.roomCodeInput.trim().toUpperCase();
      if (code.length < 6) return;
      this.codeError = '';
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'join_room', code }));
      }
    },

    // ── Game methods ──────────────────────────────────────────────────────────

    hpColorForPlayer(hp) {
      const ratio = Math.max(0, Math.min(100, hp)) / 100;
      return hpColor(ratio);
    },

    selectMode(mode) {
      this.gameMode = mode;
      this.coopRole = null;
      this.awaitingCode = false;
      this.roomCode = '';
      this.roomCodeInput = '';
      this.codeError = '';
      this.screen = 'lobby';
      this.statusMsg = 'Connecting...';
      if (mode === 'solo') this.connectWS();
      // coop: wait for user to pick host/guest role
    },

    selectRole(role) {
      this.coopRole = role;
      this.connectWS();
    },

    goBack() {
      if (this.ws) { this.ws.close(); this.ws = null; }
      this.screen = 'start';
      this.myPlayerId = null;
      this.readyToStart = false;
      this.connected = false;
      this.coopRole = null;
      this.awaitingCode = false;
      this.roomCode = '';
      this.roomCodeInput = '';
      this.codeError = '';
    },

    connectWS() {
      const role = this.coopRole ?? 'host';
      const ws = new WebSocket(`${WS_URL}?mode=${this.gameMode}&role=${role}`);
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
        case 'auth_error':
          // JWT rejected by server — send back to auth screen
          if (this.ws) { this.ws.close(); this.ws = null; }
          this.currentUser = null;
          this.screen = 'auth';
          this.authError = 'Session expired. Please log in again.';
          break;

        case 'need_code':
          this.awaitingCode = true;
          break;

        case 'code_error':
          this.codeError = msg.message ?? 'Invalid code. Try again.';
          break;

        case 'player_assigned':
          this.myPlayerId = msg.playerId ?? msg.player_id ?? msg.id;
          this.awaitingCode = false;
          this.codeError = '';
          if (msg.roomCode) this.roomCode = msg.roomCode;
          if (msg.status === 'solo') {
            this.readyToStart = true;
            this.statusMsg = 'Press Ready to start!';
          } else if (msg.status === 'ready_to_start') {
            this.readyToStart = true;
            this.statusMsg = 'Joined! Press Ready when you want to start.';
          } else {
            this.statusMsg = `Waiting for partner to enter code ${this.roomCode}…`;
          }
          break;

        case 'opponent_joined':
          this.readyToStart = true;
          this.statusMsg = msg.opponentUsername
            ? `${msg.opponentUsername} joined! Press Ready when you want to start.`
            : 'Opponent joined! Press Ready when you want to start.';
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

        case 'game_state': {
          const newBots = msg.bots ?? this.gameData.bots;

          // Build set of current bot ids and their positions/types
          const newBotIdSet = new Set(newBots.filter(b => b.alive !== false).map(b => b.id));
          const newBotMap = {};
          const newBotTypeMap = {};
          for (const bot of newBots) {
            newBotMap[bot.id] = bot;
            newBotTypeMap[bot.id] = bot.type || 'standard';
          }

          // Detect bots that died since last frame
          for (const id of Object.keys(this.prevBotIds)) {
            const numId = Number(id);
            if (!newBotIdSet.has(numId)) {
              // Bot disappeared — spawn kill popup
              const lastBot = this.prevBotIds[id];
              const type = this.botTypeMap[id] || 'standard';
              const scoreVal = BOT_SCORE[type] ?? 15;
              this.popups.push({
                x: (lastBot.x ?? 0) * TILE_SIZE,
                y: (lastBot.y ?? 0) * TILE_SIZE,
                text: '+' + scoreVal,
                alpha: 1.0,
                vy: 1.5,
              });
            }
          }

          // Update prevBotIds: only alive bots tracked by their position
          const nextPrevBotIds = {};
          for (const bot of newBots) {
            if (bot.alive !== false) {
              nextPrevBotIds[bot.id] = { x: bot.x, y: bot.y };
            }
          }
          this.prevBotIds = nextPrevBotIds;
          this.botTypeMap = newBotTypeMap;

          this.gameData.players = msg.players ?? this.gameData.players;
          this.gameData.bots = newBots;
          this.gameData.bullets = msg.bullets ?? this.gameData.bullets;
          this.gameData.powerups = msg.powerups ?? this.gameData.powerups ?? [];
          break;
        }

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
        if (keys['arrowleft'])  dx -= 1;
        if (keys['arrowright']) dx += 1;
        if (keys['arrowup'])    dy -= 1;
        if (keys['arrowdown'])  dy += 1;
        const shooting = !!keys[' '];
        this.input.dx = dx;
        this.input.dy = dy;
        this.input.shooting = shooting;
        this.sendInput();
      };

      this._keydownHandler = (e) => {
        const key = e.key.toLowerCase();
        if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) {
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

      // Increment local animation tick
      this.tickCount++;
      const tick = this.tickCount;

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
            const isWall = tile === 1 || tile === 'wall' || tile === true;
            if (isWall) {
              const x = col * TILE_SIZE;
              const y = row * TILE_SIZE;

              ctx.fillStyle = COLORS.wall;
              ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

              ctx.fillStyle = COLORS.wallHighlight;
              ctx.fillRect(x, y, TILE_SIZE, 2);
              ctx.fillRect(x, y, 2, TILE_SIZE);

              ctx.fillStyle = 'rgba(0,0,0,0.4)';
              ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
              ctx.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE);
            } else {
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

      // Draw powerups
      const powerups = this.gameData.powerups || [];
      for (const pu of powerups) {
        const px = pu.x * TILE_SIZE;
        const py = pu.y * TILE_SIZE;
        const kind = pu.kind || 'health';
        const baseColor = COLORS[kind] || COLORS.health;
        const pulse = Math.sin(tick * 0.08) * 2;
        const radius = 12 + pulse;

        ctx.save();

        // Background circle at 80% opacity
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();

        // White border
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icon
        const icon = POWERUP_ICON[kind] ?? '+';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, px, py);

        ctx.restore();
      }

      // Draw bullets
      const bullets = this.gameData.bullets || [];
      for (const bullet of bullets) {
        if (bullet.alive === false) continue;
        const bx = bullet.x * TILE_SIZE;
        const by = bullet.y * TILE_SIZE;

        ctx.save();

        if (bullet.fromBot === true) {
          // Bot bullet: orange, radius 5, with glow
          ctx.fillStyle = COLORS.botBullet;
          ctx.beginPath();
          ctx.arc(bx, by, 5, 0, Math.PI * 2);
          ctx.fill();

          // Orange glow
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = COLORS.botBullet;
          ctx.beginPath();
          ctx.arc(bx, by, 9, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Player bullet: yellow, radius 4
          ctx.fillStyle = COLORS.bullet;
          ctx.beginPath();
          ctx.arc(bx, by, 4, 0, Math.PI * 2);
          ctx.fill();

          // Bullet glow
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = COLORS.bullet;
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // Draw bots
      const bots = this.gameData.bots || [];
      for (const bot of bots) {
        if (bot.alive === false) continue;

        const bx = bot.x * TILE_SIZE;
        const by = bot.y * TILE_SIZE;
        const type = bot.type || 'standard';
        const botColor = COLORS[type] || COLORS.standard;
        const radius = BOT_RADIUS[type] || 14;
        const hpRatio = Math.max(0, Math.min(bot.maxHp ?? 100, bot.hp ?? 0)) / (bot.maxHp ?? 100);

        ctx.save();

        // Boss pulsing outer ring
        if (type === 'boss') {
          ctx.globalAlpha = 0.3 + 0.2 * Math.sin(tick * 0.1);
          ctx.strokeStyle = COLORS.boss;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(bx, by, 32, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }

        // Bot body
        ctx.fillStyle = botColor;
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fill();

        // Bot outline
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Face dot (darker center)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(3, radius * 0.35), 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#ffcc00';
        const eyeOff = Math.max(2, radius * 0.28);
        ctx.beginPath();
        ctx.arc(bx - eyeOff, by - eyeOff, 2, 0, Math.PI * 2);
        ctx.arc(bx + eyeOff, by - eyeOff, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // HP bar above bot
        this.drawEntityHPBar(ctx, bx, by - radius - 4, radius * 2, hpRatio);

        // Type label below HP bar
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const label = type.charAt(0).toUpperCase();
        ctx.fillText(label, bx, by - radius - 4 - 2);
        ctx.restore();
      }

      // Draw players
      const players = this.gameData.players || [];
      for (const player of players) {
        // Skip if dead with no revive progress to show
        if (player.alive === false && !(player.reviveProgress > 0)) continue;

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

        // Dead: ghost at 20% opacity
        if (!player.alive) {
          ctx.globalAlpha = 0.2;
        }

        // Shield ring (behind player body)
        if (player.shield) {
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = '#44aaff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, 22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Rapid fire ring (behind player body)
        if (player.rapidFire) {
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = '#ffdd00';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 20, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Player body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fill();

        // Outline
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

        // Dead player: revive progress arc + flashing REVIVE label
        if (!player.alive) {
          const progress = player.reviveProgress ?? 0;
          if (progress > 0) {
            ctx.save();
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(px, py, 22, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(tick * 0.05));
          ctx.fillStyle = '#00ff88';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('REVIVE', px, py - 26);
          ctx.restore();
        }

        // HP bar above player (always full opacity, only if alive)
        if (player.alive !== false) {
          this.drawEntityHPBar(ctx, px, py - 22, 32, hpRatio);
        }
      }

      // Draw kill score popups
      const nextPopups = [];
      for (const popup of this.popups) {
        popup.y -= popup.vy;
        popup.alpha -= 0.02;
        if (popup.alpha > 0) {
          ctx.save();
          ctx.globalAlpha = popup.alpha;
          ctx.fillStyle = `rgba(255,255,255,${popup.alpha})`;
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(popup.text, popup.x, popup.y);
          ctx.restore();
          nextPopups.push(popup);
        }
      }
      this.popups = nextPopups;
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
