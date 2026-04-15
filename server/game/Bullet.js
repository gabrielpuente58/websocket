'use strict';

let _nextId = 0;

class Bullet {
  constructor(x, y, dx, dy, ownerId) {
    this.id = _nextId++;
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.speed = 0.45; // tiles per tick
    this.ownerId = ownerId;
    this.alive = true;
  }

  /**
   * Advance bullet position. If the new position is inside a wall, mark dead.
   */
  update(map) {
    if (!this.alive) return;

    const nx = this.x + this.dx * this.speed;
    const ny = this.y + this.dy * this.speed;

    if (map.isWall(nx, ny)) {
      this.alive = false;
      return;
    }

    this.x = nx;
    this.y = ny;
  }

  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      dx: this.dx,
      dy: this.dy,
      ownerId: this.ownerId,
      alive: this.alive,
    };
  }
}

module.exports = Bullet;
