'use strict';

const Bullet = require('./Bullet');

class Player {
  constructor(id) {
    this.id = id;

    // Position set by GameRoom from map.playerSpawns
    this.x = 0;
    this.y = 0;

    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.score = 0;

    // Movement constants
    this.speed = 0.12; // tiles per tick

    // Shooting
    this.SHOOT_COOLDOWN = 12; // ticks between shots
    this.shootCooldown = 0;   // ticks remaining before next shot

    // Pending input (set each tick before update)
    this._dx = 0;
    this._dy = 0;
    this._shooting = false;

    // WebSocket reference (set by GameRoom)
    this.ws = null;
  }

  /**
   * Store input values. dx/dy are clamped to -1, 0, or 1.
   */
  applyInput(dx, dy, shooting) {
    this._dx = Math.max(-1, Math.min(1, Math.sign(dx === 0 ? 0 : dx)));
    this._dy = Math.max(-1, Math.min(1, Math.sign(dy === 0 ? 0 : dy)));
    this._shooting = !!shooting;
  }

  /**
   * Move with wall-sliding collision, decrement shoot cooldown.
   * Returns a Bullet instance if fired this tick, otherwise null.
   */
  update(map) {
    if (!this.alive) return null;

    const moveX = this._dx * this.speed;
    const moveY = this._dy * this.speed;

    // Try X movement first (slide along Y axis if blocked)
    if (moveX !== 0) {
      const nx = this.x + moveX;
      if (!map.isWall(nx, this.y)) {
        this.x = nx;
      }
    }

    // Try Y movement independently (slide along X axis if blocked)
    if (moveY !== 0) {
      const ny = this.y + moveY;
      if (!map.isWall(this.x, ny)) {
        this.y = ny;
      }
    }

    // Decrement shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown--;
    }

    // Attempt to fire
    if (this._shooting && this.shootCooldown === 0) {
      const ddx = this._dx;
      const ddy = this._dy;

      // Only fire if a direction is given
      if (ddx !== 0 || ddy !== 0) {
        const len = Math.sqrt(ddx * ddx + ddy * ddy);
        const ndx = ddx / len;
        const ndy = ddy / len;

        this.shootCooldown = this.SHOOT_COOLDOWN;

        return new Bullet(this.x, this.y, ndx, ndy, this.id);
      }
    }

    return null;
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
      maxHp: this.maxHp,
      alive: this.alive,
      score: this.score,
    };
  }
}

module.exports = Player;
