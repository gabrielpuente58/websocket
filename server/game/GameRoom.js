'use strict';

const Player = require('./Player');
const Bot = require('./Bot');
const Bullet = require('./Bullet');
const GameMap = require('./Map');

const TICK_RATE_MS = 50; // 20 ticks per second
const MAX_WAVES = 3;

class GameRoom {
  constructor(id, onGameOver) {
    this.id = id;
    this.map = new GameMap();
    this.players = [];
    this.bots = [];
    this.bullets = [];
    this.gameState = 'waiting'; // 'waiting' | 'playing' | 'over'
    this.wave = 0;
    this.tickCount = 0;
    this._interval = null;
    this._waveTransitioning = false; // guard against multiple wave-spawns

    // Called when game ends — injected by index.js
    this.onGameOver = typeof onGameOver === 'function' ? onGameOver : null;
  }

  get isGameOver() {
    return this.gameState === 'over';
  }

  /**
   * Add a player to the room. Assigns spawn position from map.
   * Starts the game once 2 players are connected.
   * Returns the created Player instance.
   */
  addPlayer(ws) {
    const id = this.players.length; // 0 or 1
    const player = new Player(id);
    const spawn = this.map.playerSpawns[id];
    player.x = spawn.x;
    player.y = spawn.y;
    player.ws = ws;
    this.players.push(player);
    return player;
  }

  // Called by index.js once both players have sent 'ready'
  startGame() {
    if (this.gameState !== 'waiting') return;
    this._startGame();
  }

  /**
   * Forward input to the correct player. Only processed while game is playing.
   */
  handleInput(playerId, dx, dy, shooting) {
    if (this.gameState !== 'playing') return;
    const player = this.players[playerId];
    if (player) {
      player.applyInput(dx, dy, shooting);
    }
  }

  /**
   * Begin the game: set state, send map + player ids, start wave 1, kick off tick loop.
   */
  _startGame() {
    this.gameState = 'playing';

    // Notify each player individually so they know their own id
    for (const player of this.players) {
      this._sendTo(player.ws, {
        type: 'game_start',
        playerId: player.id,
        map: this.map.toJSON(),
      });
    }

    this._spawnWave(1);
    this._interval = setInterval(() => this._tick(), TICK_RATE_MS);
  }

  /**
   * Spawn a new wave of bots at random open edge tiles.
   */
  _spawnWave(waveNumber) {
    this.wave = waveNumber;
    this.broadcast({ type: 'wave_start', wave: waveNumber });

    const edgeTiles = this.map.getOpenEdgeTiles();
    const count = 4 + waveNumber * 2;

    for (let i = 0; i < count; i++) {
      if (edgeTiles.length === 0) break;
      const idx = Math.floor(Math.random() * edgeTiles.length);
      const tile = edgeTiles[idx];
      // Position bot at tile center
      const bot = new Bot(tile.x + 0.5, tile.y + 0.5);
      this.bots.push(bot);
    }
  }

  /**
   * Main game loop — runs every TICK_RATE_MS ms.
   */
  _tick() {
    if (this.gameState !== 'playing') return;

    this.tickCount++;

    // 1. Update players — collect any bullets fired this tick
    for (const player of this.players) {
      if (!player.alive) continue;
      const bullet = player.update(this.map);
      if (bullet) {
        this.bullets.push(bullet);
      }
    }

    // 2. Update bots
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      bot.update(this.players, this.map, this.tickCount);
    }

    // 3. Update bullets and check bot collisions
    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      bullet.update(this.map);
      if (!bullet.alive) continue;

      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const dx = bullet.x - bot.x;
        const dy = bullet.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.5) {
          bot.takeDamage(35);
          bullet.alive = false;

          // Award score to the owning player
          const shooter = this.players[bullet.ownerId];
          if (shooter) {
            shooter.score += 10;
          }

          break; // Bullet can only hit one bot
        }
      }
    }

    // 4. Clean up dead bullets and bots
    this.bullets = this.bullets.filter(b => b.alive);
    this.bots = this.bots.filter(b => b.alive);

    // 5. Check win/loss conditions
    const allBotsGone = this.bots.length === 0;
    const allPlayersDead = this.players.every(p => !p.alive);

    if (allPlayersDead) {
      this._endGame('lose');
      return;
    }

    if (allBotsGone && !this._waveTransitioning) {
      if (this.wave < MAX_WAVES) {
        this._waveTransitioning = true;
        const nextWave = this.wave + 1;
        setTimeout(() => {
          if (this.gameState === 'playing') {
            this._spawnWave(nextWave);
            this._waveTransitioning = false;
          }
        }, 2000);
      } else {
        this._endGame('win');
        return;
      }
    }

    // 6. Broadcast current state
    this._broadcastState();
  }

  /**
   * End the game, clean up, notify players and external callback.
   */
  _endGame(result) {
    this.gameState = 'over';

    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    const totalScore = this.players.reduce((sum, p) => sum + p.score, 0);

    this.broadcast({
      type: 'game_over',
      result,
      score: totalScore,
      wave: this.wave,
    });

    if (typeof this.onGameOver === 'function') {
      this.onGameOver({
        roomId: this.id,
        result,
        score: totalScore,
        wave: this.wave,
      });
    }
  }

  /**
   * Send a message to all players whose WebSocket is open (readyState === 1).
   */
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const player of this.players) {
      this._sendRaw(player.ws, data);
    }
  }

  /**
   * Broadcast the full game state snapshot to all players.
   */
  _broadcastState() {
    this.broadcast({
      type: 'game_state',
      players: this.players.map(p => p.toJSON()),
      bots: this.bots.map(b => b.toJSON()),
      bullets: this.bullets.map(b => b.toJSON()),
    });
  }

  /**
   * Handle a player disconnecting mid-game.
   */
  removePlayer(playerId) {
    if (this.gameState === 'playing') {
      this._endGame('lose');
    }
    this.players = this.players.filter(p => p.id !== playerId);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _sendTo(ws, msg) {
    this._sendRaw(ws, JSON.stringify(msg));
  }

  _sendRaw(ws, data) {
    if (ws && ws.readyState === 1) {
      ws.send(data);
    }
  }
}

module.exports = GameRoom;
