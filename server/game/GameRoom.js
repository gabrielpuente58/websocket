'use strict';

const Player = require('./Player');
const Bot = require('./Bot');
const Bullet = require('./Bullet');
const { GameMap } = require('./Map');
const Powerup = require('./Powerup');

const TICK_RATE_MS = 50; // 20 ticks per second
const REVIVE_RADIUS = 1.5;   // tiles — how close partner must be
const REVIVE_RATE   = 2;     // progress points per tick while nearby (100 = ~2.5s)
const REVIVE_DECAY  = 1;     // progress lost per tick when partner leaves

const POWERUP_KINDS = ['health', 'rapidfire', 'shield'];

function randomPowerupKind() {
  return POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
}

/**
 * Build wave bot composition that scales with wave number.
 *   Wave 1: 2 scouts, 1 standard
 *   Each wave adds more of each type; bosses appear from wave 3, one extra every 2 waves.
 */
function buildWaveComposition(waveNumber) {
  const scouts    = 2 + Math.floor(waveNumber / 2);
  const standards = 1 + Math.floor(waveNumber * 0.8);
  const heavies   = waveNumber >= 2 ? Math.floor((waveNumber - 1) * 0.5) : 0;
  const bosses    = waveNumber >= 3 ? Math.floor((waveNumber - 2) / 2)    : 0;

  return [
    ...Array(scouts).fill('scout'),
    ...Array(standards).fill('standard'),
    ...Array(heavies).fill('heavy'),
    ...Array(bosses).fill('boss'),
  ];
}

class GameRoom {
  constructor(id, onGameOver) {
    this.id = id;
    this.map = new GameMap();
    this.players = [];
    this.bots = [];
    this.bullets = [];
    this.powerups = [];
    this.display = null; // couch mode: WebSocket of the display client (no player slot)
    this.gameState = 'waiting'; // 'waiting' | 'playing' | 'over'
    this.wave = 0;
    this.tickCount = 0;
    this._interval = null;
    this._waveTransitioning = false;

    this.onGameOver = typeof onGameOver === 'function' ? onGameOver : null;
  }

  get isGameOver() {
    return this.gameState === 'over';
  }

  /**
   * Add a player to the room. Assigns spawn position from map.
   */
  addPlayer(ws) {
    // Assign the lowest free slot id (0 or 1) so churn in the lobby reuses slots.
    const used = new Set(this.players.map(p => p.id));
    let id = 0;
    while (used.has(id) && id < 2) id++;
    if (id >= 2) return null; // room is full

    const player = new Player(id);
    const spawn = this.map.playerSpawns[id];
    player.x = spawn.x;
    player.y = spawn.y;
    player.spawnX = spawn.x;
    player.spawnY = spawn.y;
    player.ws = ws;
    this.players.push(player);
    return player;
  }

  /** Register the display client (laptop) that renders the game. */
  setDisplay(ws) {
    this.display = ws;
  }

  startGame() {
    if (this.gameState !== 'waiting') return;
    this._startGame();
  }

  handleInput(playerId, dx, dy, shooting) {
    if (this.gameState !== 'playing') return;
    const player = this.players[playerId];
    if (player) player.applyInput(dx, dy, shooting);
  }

  _startGame() {
    this.gameState = 'playing';

    // Each player gets their own id; display (couch mode) gets a neutral payload.
    for (const player of this.players) {
      this._sendTo(player.ws, {
        type: 'game_start',
        playerId: player.id,
        map: this.map.toJSON(),
      });
    }
    if (this.display) {
      this._sendTo(this.display, {
        type: 'game_start',
        playerId: null,     // display is an observer
        map: this.map.toJSON(),
      });
    }

    this._spawnWave(1);
    this._interval = setInterval(() => this._tick(), TICK_RATE_MS);
  }

  /**
   * Spawn a wave with dynamically scaled composition.
   */
  _spawnWave(waveNumber) {
    this.wave = waveNumber;
    this.broadcast({ type: 'wave_start', wave: waveNumber });

    const edgeTiles = this.map.getOpenEdgeTiles();
    const composition = buildWaveComposition(waveNumber);

    // Shuffle edge tiles so bots don't all pile at same corner
    for (let i = edgeTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [edgeTiles[i], edgeTiles[j]] = [edgeTiles[j], edgeTiles[i]];
    }

    for (let i = 0; i < composition.length; i++) {
      const tile = edgeTiles[i % edgeTiles.length];
      this.bots.push(new Bot(tile.x + 0.5, tile.y + 0.5, composition[i]));
    }
  }

  /**
   * Main game loop — runs every TICK_RATE_MS ms.
   */
  _tick() {
    if (this.gameState !== 'playing') return;

    this.tickCount++;

    // 1. Update players — collect bullets
    for (const player of this.players) {
      const bullet = player.update(this.map);
      if (bullet) this.bullets.push(bullet);
    }

    // 2. Update bots — collect boss bullets
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const botBullets = bot.update(this.players, this.map, this.tickCount);
      for (const b of botBullets) this.bullets.push(b);
    }

    // 3. Update bullets and resolve collisions
    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      bullet.update(this.map);
      if (!bullet.alive) continue;

      if (bullet.fromBot) {
        for (const player of this.players) {
          if (!player.alive) continue;
          if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < 0.5) {
            player.takeDamage(20);
            bullet.alive = false;
            break;
          }
        }
      } else {
        for (const bot of this.bots) {
          if (!bot.alive) continue;
          if (Math.hypot(bullet.x - bot.x, bullet.y - bot.y) < 0.5) {
            bot.takeDamage(35);
            bullet.alive = false;
            const shooter = this.players[bullet.ownerId];
            if (shooter) shooter.score += bot.scoreValue;
            break;
          }
        }
      }
    }

    // 4. Tick powerups and check pickups
    for (const powerup of this.powerups) powerup.tick();

    for (const powerup of this.powerups) {
      if (!powerup.alive) continue;
      for (const player of this.players) {
        if (!player.alive) continue;
        if (Math.hypot(player.x - powerup.x, player.y - powerup.y) < 0.6) {
          player.applyPowerup(powerup.kind);
          powerup.alive = false;
          break;
        }
      }
    }

    // 5. Spawn powerups on bot death
    const justDied = this.bots.filter(b => !b.alive);
    for (const bot of justDied) {
      if (Math.random() < 0.25) {
        this.powerups.push(new Powerup(bot.x, bot.y, randomPowerupKind()));
      }
    }

    // Filter dead entities
    this.bullets  = this.bullets.filter(b => b.alive);
    this.bots     = this.bots.filter(b => b.alive);
    this.powerups = this.powerups.filter(p => p.alive);

    // 6. Cooperative revive logic
    //    Dead players gain reviveProgress when a living partner stands nearby.
    //    Progress decays when nobody is close. At 100: revived with 60 HP.
    for (const dead of this.players) {
      if (dead.alive) continue;

      const hasNearbyAlly = this.players.some(
        p => p.alive && Math.hypot(p.x - dead.x, p.y - dead.y) < REVIVE_RADIUS
      );

      if (hasNearbyAlly) {
        dead.reviveProgress = Math.min(100, dead.reviveProgress + REVIVE_RATE);
        if (dead.reviveProgress >= 100) {
          dead.revive();
        }
      } else {
        dead.reviveProgress = Math.max(0, dead.reviveProgress - REVIVE_DECAY);
      }
    }

    // 7. Win/lose check
    //    All players dead and none can be revived (no living partner) = game over
    const allDead = this.players.every(p => !p.alive);
    if (allDead) {
      this._endGame('lose');
      return;
    }

    // All bots cleared — spawn next wave (unlimited)
    if (this.bots.length === 0 && !this._waveTransitioning) {
      this._waveTransitioning = true;
      const nextWave = this.wave + 1;
      setTimeout(() => {
        if (this.gameState === 'playing') {
          this._spawnWave(nextWave);
          this._waveTransitioning = false;
        }
      }, 2000);
    }

    // 8. Broadcast state
    this._broadcastState();
  }

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
      this.onGameOver({ roomId: this.id, result, score: totalScore, wave: this.wave });
    }
  }

  /** Send to every connected socket in the room (players + display if any). */
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const player of this.players) this._sendRaw(player.ws, data);
    if (this.display) this._sendRaw(this.display, data);
  }

  _broadcastState() {
    // Display (laptop) gets the full state. Phones only need HUD data.
    const fullData = JSON.stringify({
      type: 'game_state',
      players: this.players.map(p => p.toJSON()),
      bots: this.bots.map(b => b.toJSON()),
      bullets: this.bullets.map(b => b.toJSON()),
      powerups: this.powerups.map(p => p.toJSON()),
    });

    if (this.display) this._sendRaw(this.display, fullData);
    for (const player of this.players) {
      this._sendTo(player.ws, {
        type: 'controller_state',
        playerId: player.id,
        hp: player.hp,
        maxHp: player.maxHp,
        alive: player.alive,
        shield: player.shield,
        rapidFire: player.rapidFire,
        score: player.score,
        wave: this.wave,
        reviveProgress: player.reviveProgress,
      });
    }
  }

  removePlayer(playerId) {
    if (this.gameState === 'playing') this._endGame('lose');
    this.players = this.players.filter(p => p.id !== playerId);
  }

  /** Called when the display disconnects. Ends the game — can't play blind. */
  removeDisplay() {
    this.display = null;
    if (this.gameState === 'playing') this._endGame('lose');
  }

  _sendTo(ws, msg) { this._sendRaw(ws, JSON.stringify(msg)); }

  _sendRaw(ws, data) {
    if (ws && ws.readyState === 1) ws.send(data);
  }
}

module.exports = GameRoom;
