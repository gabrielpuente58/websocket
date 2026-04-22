'use strict';

const { createApp } = Vue;

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}`;

const TILE_SIZE = 40;
const MAP_COLS = 20;
const MAP_ROWS = 15;
const CANVAS_W = MAP_COLS * TILE_SIZE;
const CANVAS_H = MAP_ROWS * TILE_SIZE;

const COLORS = {
  floor: '#1e1e2e',
  wall: '#44446a',
  wallHi: '#5a5a8a',
  grid: 'rgba(255,255,255,0.03)',
  player0: '#00d4ff',
  player1: '#ff6b35',
  bullet: '#ffff00',
  botBullet: '#ff6600',
  hpGreen: '#00cc55',
  hpRed: '#cc2222',
  scout:    '#ff9933',
  standard: '#ff4444',
  heavy:    '#aa00ff',
  boss:     '#ff0055',
  health:    '#00ff88',
  rapidfire: '#ffdd00',
  shield:    '#44aaff',
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
  data() {
    return {
      CANVAS_W,
      CANVAS_H,

      // auth
      screen: 'auth',
      authTab: 'login',
      authUsername: '',
      authPassword: '',
      authError: '',
      authLoading: false,
      currentUser: null,

      // lobby
      roomCode: '',
      connected: false,
      couchControllers: 0,
      _qrRendered: false,

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
      finalScore: 0,

      // internal
      ws: null,
      _rafHandle: null,
      tickCount: 0,

      // direction indicator
      prevPositions: {},
      playerDirections: {},
    };
  },

  mounted() {
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
    if (this.ws) this.ws.close();
    if (this._waveBannerTimer) clearTimeout(this._waveBannerTimer);
  },

  methods: {
    async login() {
      this.authError = '';
      this.authLoading = true;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
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
          credentials: 'same-origin',
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

    hpColorForPlayer(hp) {
      const ratio = Math.max(0, Math.min(100, hp)) / 100;
      return hpColor(ratio);
    },

    startGame() {
      this.roomCode = '';
      this.couchControllers = 0;
      this._qrRendered = false;
      this.screen = 'lobby';
      this.connectWS();
    },

    goBack() {
      if (this.ws) { this.ws.close(); this.ws = null; }
      this.screen = 'start';
      this.connected = false;
      this.roomCode = '';
      this.couchControllers = 0;
      this._qrRendered = false;
    },

    connectWS() {
      const ws = new WebSocket(`${WS_URL}?role=display`);
      this.ws = ws;

      ws.onopen = () => { this.connected = true; };
      ws.onclose = () => { this.connected = false; };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        this.handleMessage(msg);
      };
    },

    handleMessage(msg) {
      switch (msg.type) {
        case 'auth_error':
          if (this.ws) { this.ws.close(); this.ws = null; }
          this.currentUser = null;
          this.screen = 'auth';
          this.authError = 'Session expired. Please log in again.';
          break;

        case 'display_assigned':
          this.roomCode = msg.roomCode ?? '';
          this.$nextTick(() => this.renderQr());
          break;

        case 'controller_joined':
          this.couchControllers = msg.totalControllers ?? this.couchControllers + 1;
          break;

        case 'controller_left':
          this.couchControllers = msg.totalControllers ?? Math.max(0, this.couchControllers - 1);
          break;

        case 'game_start':
          this.mapTiles = msg.map ?? [];
          this.screen = 'game';
          this.$nextTick(() => this.startRenderLoop());
          break;

        case 'game_state':
          this.gameData.players  = msg.players  ?? this.gameData.players;
          this.gameData.bots     = msg.bots     ?? this.gameData.bots;
          this.gameData.bullets  = msg.bullets  ?? this.gameData.bullets;
          this.gameData.powerups = msg.powerups ?? this.gameData.powerups;
          break;

        case 'wave_start':
          this.waveNumber = msg.wave ?? this.waveNumber + 1;
          this.waveBanner = `Wave ${this.waveNumber}!`;
          if (this._waveBannerTimer) clearTimeout(this._waveBannerTimer);
          this._waveBannerTimer = setTimeout(() => { this.waveBanner = ''; }, 2500);
          break;

        case 'game_over':
          this.finalScore = msg.score ?? 0;
          this.screen = 'gameover';
          this.stopRenderLoop();
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

    renderQr() {
      const el = this.$refs.qrContainer;
      if (!el || !this.roomCode || this._qrRendered) return;
      if (typeof QRCode === 'undefined') return;
      el.innerHTML = '';
      const url = `${window.location.origin}/play?code=${encodeURIComponent(this.roomCode)}`;
      new QRCode(el, {
        text: url,
        width: 180,
        height: 180,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      this._qrRendered = true;
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

      this.tickCount++;
      const tick = this.tickCount;

      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Walls
      if (this.mapTiles && this.mapTiles.length > 0) {
        for (let row = 0; row < this.mapTiles.length; row++) {
          const tileRow = this.mapTiles[row];
          if (!tileRow) continue;
          for (let col = 0; col < tileRow.length; col++) {
            const x = col * TILE_SIZE;
            const y = row * TILE_SIZE;
            if (tileRow[col] === 1) {
              ctx.fillStyle = COLORS.wall;
              ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = COLORS.wallHi;
              ctx.fillRect(x, y, TILE_SIZE, 2);
              ctx.fillRect(x, y, 2, TILE_SIZE);
              ctx.fillStyle = 'rgba(0,0,0,0.45)';
              ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
              ctx.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE);
            } else {
              ctx.strokeStyle = COLORS.grid;
              ctx.lineWidth = 0.5;
              ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
            }
          }
        }
      }

      // Powerups
      for (const pu of this.gameData.powerups || []) {
        const px = pu.x * TILE_SIZE;
        const py = pu.y * TILE_SIZE;
        const kind = pu.kind || 'health';
        const baseColor = COLORS[kind] || COLORS.health;
        const radius = 12 + Math.sin(tick * 0.08) * 2;

        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(POWERUP_ICON[kind] ?? '+', px, py);
        ctx.restore();
      }

      // Bullets
      for (const bullet of this.gameData.bullets || []) {
        if (bullet.alive === false) continue;
        const bx = bullet.x * TILE_SIZE;
        const by = bullet.y * TILE_SIZE;
        const color = bullet.fromBot ? COLORS.botBullet : COLORS.bullet;
        const r = bullet.fromBot ? 5 : 4;

        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(bx, by, r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Bots
      for (const bot of this.gameData.bots || []) {
        if (bot.alive === false) continue;

        const bx = bot.x * TILE_SIZE;
        const by = bot.y * TILE_SIZE;
        const type = bot.type || 'standard';
        const botColor = COLORS[type] || COLORS.standard;
        const radius = BOT_RADIUS[type] || 14;
        const hpRatio = Math.max(0, Math.min(bot.maxHp ?? 100, bot.hp ?? 0)) / (bot.maxHp ?? 100);

        ctx.save();
        if (type === 'boss') {
          ctx.globalAlpha = 0.3 + 0.2 * Math.sin(tick * 0.1);
          ctx.strokeStyle = COLORS.boss;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(bx, by, 32, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }

        ctx.fillStyle = botColor;
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(3, radius * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        this.drawEntityHPBar(ctx, bx, by - radius - 4, radius * 2, hpRatio);
      }

      // Players
      for (const player of this.gameData.players || []) {
        const px = player.x * TILE_SIZE;
        const py = player.y * TILE_SIZE;
        const color = player.id === 0 ? COLORS.player0 : COLORS.player1;
        const hpRatio = Math.max(0, Math.min(100, player.hp ?? 100)) / 100;

        // Dead — draw a death marker at the death location and a revive-progress ring.
        if (player.alive === false) {
          const progress = player.reviveProgress ?? 0;

          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(px - 7, py - 7);
          ctx.lineTo(px + 7, py + 7);
          ctx.moveTo(px + 7, py - 7);
          ctx.lineTo(px - 7, py + 7);
          ctx.stroke();
          ctx.restore();

          if (progress > 0) {
            ctx.save();
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(px, py, 22, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          continue;
        }

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

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const dir = this.playerDirections[player.id];
        if (dir) {
          const len = Math.hypot(dir.dx, dir.dy);
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

        this.drawEntityHPBar(ctx, px, py - 22, 32, hpRatio);
      }
    },

    drawEntityHPBar(ctx, cx, cy, width, hpRatio) {
      const h = 4;
      const x = cx - width / 2;
      const y = cy - h;
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 1, y - 1, width + 2, h + 2);
      ctx.fillStyle = hpColor(hpRatio);
      ctx.fillRect(x, y, width * hpRatio, h);
    },

    playAgain() {
      window.location.reload();
    },
  },
}).mount('#app');
