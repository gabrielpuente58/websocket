'use strict';

let _nextBotId = 0;

class Bot {
  constructor(x, y) {
    this.id = _nextBotId++;
    this.x = x;
    this.y = y;
    this.hp = 30;
    this.alive = true;
    this.speed = 0.07; // tiles per tick

    // BFS path: array of {x, y} tile centers
    this._path = [];
    // Recalculate path when tickCount reaches this value
    this._targetTick = 0;

    // Contact attack
    this.CONTACT_DAMAGE = 15;
    this.CONTACT_RANGE = 0.6;  // tile distance
    this.CONTACT_COOLDOWN = 20; // ticks between damage hits
    this._contactCooldown = 0;
  }

  /**
   * BFS from (startX, startY) to (targetX, targetY) on integer tile coords.
   * Returns array of {x, y} tile centers (start exclusive, target inclusive).
   * Returns [] if no path or already adjacent.
   */
  _bfs(startX, startY, targetX, targetY, map) {
    const sc = Math.floor(startX);
    const sr = Math.floor(startY);
    const tc = Math.floor(targetX);
    const tr = Math.floor(targetY);

    // Already at same tile
    if (sc === tc && sr === tr) return [];

    const DIRS = [
      [0, -1], // up
      [0,  1], // down
      [-1, 0], // left
      [1,  0], // right
    ];

    // visited[row][col] = true
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

        if (nc === tc && nr === tr) {
          return newPath;
        }

        visited.set(k, true);
        queue.push({ c: nc, r: nr, path: newPath });
      }
    }

    // No path found
    return [];
  }

  /**
   * Main update: pathfind toward nearest living player, move, deal contact damage.
   */
  update(players, map, tickCount) {
    if (!this.alive) return;

    // Find nearest living player
    let nearest = null;
    let nearestDist = Infinity;

    for (const player of players) {
      if (!player.alive) continue;
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = player;
      }
    }

    if (!nearest) return;

    // Recalculate BFS path on schedule
    if (tickCount >= this._targetTick) {
      this._path = this._bfs(this.x, this.y, nearest.x, nearest.y, map);
      this._targetTick = tickCount + 15;
    }

    // Move toward next waypoint
    if (this._path.length > 0) {
      const waypoint = this._path[0];
      const dx = waypoint.x - this.x;
      const dy = waypoint.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.15) {
        // Reached waypoint — advance to next
        this._path.shift();
      } else {
        // Move toward waypoint
        const nx = this.x + (dx / dist) * this.speed;
        const ny = this.y + (dy / dist) * this.speed;

        // Simple wall check: only move if new position is not a wall
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

    // Contact damage: check all living players
    for (const player of players) {
      if (!player.alive) continue;
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= this.CONTACT_RANGE && this._contactCooldown <= 0) {
        player.takeDamage(this.CONTACT_DAMAGE);
        this._contactCooldown = this.CONTACT_COOLDOWN;
        break; // Only hit once per tick
      }
    }

    // Decrement contact cooldown
    if (this._contactCooldown > 0) {
      this._contactCooldown--;
    }
  }

  /**
   * Reduce hp by amount. Mark dead if hp reaches 0.
   */
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
      alive: this.alive,
    };
  }
}

module.exports = Bot;
