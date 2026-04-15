'use strict';

const Bullet = require('./Bullet');

let _nextBotId = 0;

const BOT_STATS = {
  scout:    { hp: 15,  maxHp: 15,  speed: 0.14, CONTACT_DAMAGE: 8,  CONTACT_RANGE: 0.55, scoreValue: 10,  bfsInterval: 10, shootInterval: null },
  standard: { hp: 30,  maxHp: 30,  speed: 0.07, CONTACT_DAMAGE: 15, CONTACT_RANGE: 0.6,  scoreValue: 15,  bfsInterval: 15, shootInterval: null },
  heavy:    { hp: 80,  maxHp: 80,  speed: 0.04, CONTACT_DAMAGE: 25, CONTACT_RANGE: 0.65, scoreValue: 25,  bfsInterval: 20, shootInterval: null },
  boss:     { hp: 200, maxHp: 200, speed: 0.05, CONTACT_DAMAGE: 30, CONTACT_RANGE: 0.7,  scoreValue: 100, bfsInterval: 12, shootInterval: 40  },
};

class Bot {
  constructor(x, y, type) {
    const kind = type || 'standard';
    const stats = BOT_STATS[kind] || BOT_STATS.standard;

    this.id = _nextBotId++;
    this.type = kind;
    this.x = x;
    this.y = y;
    this.hp = stats.hp;
    this.maxHp = stats.maxHp;
    this.alive = true;
    this.speed = stats.speed;
    this.scoreValue = stats.scoreValue;

    this.CONTACT_DAMAGE = stats.CONTACT_DAMAGE;
    this.CONTACT_RANGE = stats.CONTACT_RANGE;
    this.CONTACT_COOLDOWN = 20;
    this._contactCooldown = 0;

    this._bfsInterval = stats.bfsInterval;
    this._shootInterval = stats.shootInterval;
    this._shootCooldown = 0;

    this._path = [];
    this._targetTick = 0;
  }

  /**
   * BFS from (startX, startY) to (targetX, targetY) on integer tile coords.
   * Returns array of {x, y} tile centers (start exclusive, target inclusive).
   * Returns [] if no path or already at same tile.
   */
  _bfs(startX, startY, targetX, targetY, map) {
    const sc = Math.floor(startX);
    const sr = Math.floor(startY);
    const tc = Math.floor(targetX);
    const tr = Math.floor(targetY);

    if (sc === tc && sr === tr) return [];

    const DIRS = [
      [0, -1],
      [0,  1],
      [-1, 0],
      [1,  0],
    ];

    const visited = new Map();
    const key = (c, r) => `${c},${r}`;

    const queue = [{ c: sc, r: sr, path: [] }];
    visited.set(key(sc, sr), true);

    while (queue.length > 0) {
      const { c, r, path } = queue.shift();

      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        const k = key(nc, nr);

        if (visited.has(k)) continue;
        if (map.isWall(nc, nr)) continue;

        const newPath = path.concat({ x: nc + 0.5, y: nr + 0.5 });

        if (nc === tc && nr === tr) return newPath;

        visited.set(k, true);
        queue.push({ c: nc, r: nr, path: newPath });
      }
    }

    return [];
  }

  /**
   * Main update. Returns Bullet[] — bullets fired this tick (empty for non-boss).
   */
  update(players, map, tickCount) {
    if (!this.alive) return [];

    // Find nearest living player
    let nearest = null;
    let nearestDist = Infinity;

    for (const p of players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }

    if (!nearest) return [];

    // Recalculate BFS path on schedule
    if (tickCount >= this._targetTick) {
      this._path = this._bfs(this.x, this.y, nearest.x, nearest.y, map);
      this._targetTick = tickCount + this._bfsInterval;
    }

    // Move toward next waypoint
    if (this._path.length > 0) {
      const wp = this._path[0];
      const dx = wp.x - this.x;
      const dy = wp.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.15) {
        this._path.shift();
      } else {
        const nx = this.x + (dx / dist) * this.speed;
        const ny = this.y + (dy / dist) * this.speed;

        if (!map.isWall(nx, ny)) {
          this.x = nx;
          this.y = ny;
        } else if (!map.isWall(nx, this.y)) {
          this.x = nx;
        } else if (!map.isWall(this.x, ny)) {
          this.y = ny;
        }
      }
    }

    // Contact damage
    for (const p of players) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - this.x, p.y - this.y) <= this.CONTACT_RANGE && this._contactCooldown <= 0) {
        p.takeDamage(this.CONTACT_DAMAGE);
        this._contactCooldown = this.CONTACT_COOLDOWN;
        break;
      }
    }

    if (this._contactCooldown > 0) this._contactCooldown--;

    // Boss shooting — fires a Bullet at nearest player on interval
    const firedBullets = [];

    if (this.type === 'boss' && this._shootInterval !== null) {
      if (this._shootCooldown <= 0) {
        const ddx = nearest.x - this.x;
        const ddy = nearest.y - this.y;
        const len = Math.hypot(ddx, ddy);
        if (len > 0) {
          const bullet = new Bullet(this.x, this.y, ddx / len, ddy / len, -1);
          bullet.fromBot = true;
          firedBullets.push(bullet);
          this._shootCooldown = this._shootInterval;
        }
      } else {
        this._shootCooldown--;
      }
    }

    return firedBullets;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      hp: this.hp,
      maxHp: this.maxHp,
      alive: this.alive,
      type: this.type,
    };
  }
}

module.exports = Bot;
