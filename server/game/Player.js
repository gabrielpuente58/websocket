'use strict';

const Bullet = require('./Bullet');

class Player {
  constructor(id) {
    this.id = id;

    // Position set by GameRoom from map.playerSpawns
    this.x = 0;
    this.y = 0;

    // Spawn coords (set by GameRoom after construction)
    this.spawnX = 0;
    this.spawnY = 0;

    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.score = 0;

    // Powerup states
    this.shield = false;
    this.rapidFire = false;
    this.rapidFireTimer = 0;

    // Revive progress (0–100). Filled by living partner standing within 1.5 tiles.
    this.reviveProgress = 0;

    // Movement
    this.speed = 0.12;

    // Shooting
    this.SHOOT_COOLDOWN = 12;
    this.shootCooldown = 0;

    // Pending input
    this._dx = 0;
    this._dy = 0;
    this._shooting = false;

    // Last non-zero direction (default: face right)
    this._lastDx = 1;
    this._lastDy = 0;

    // WebSocket reference (set by GameRoom)
    this.ws = null;
  }

  /**
   * Store input values. dx/dy clamped to -1, 0, or 1.
   */
  applyInput(dx, dy, shooting) {
    this._dx = Math.max(-1, Math.min(1, Math.sign(dx === 0 ? 0 : dx)));
    this._dy = Math.max(-1, Math.min(1, Math.sign(dy === 0 ? 0 : dy)));
    this._shooting = !!shooting;
  }

  /**
   * Move with wall-sliding collision, decrement cooldowns.
   * Returns a Bullet if fired this tick, otherwise null.
   * Dead players return null immediately (revive is handled by GameRoom).
   */
  update(map) {
    if (!this.alive) return null;

    // Decrement rapid fire timer
    if (this.rapidFireTimer > 0) {
      this.rapidFireTimer--;
      if (this.rapidFireTimer === 0) this.rapidFire = false;
    }

    const moveX = this._dx * this.speed;
    const moveY = this._dy * this.speed;

    if (moveX !== 0) {
      const nx = this.x + moveX;
      if (!map.isWall(nx, this.y)) this.x = nx;
    }

    if (moveY !== 0) {
      const ny = this.y + moveY;
      if (!map.isWall(this.x, ny)) this.y = ny;
    }

    if (this.shootCooldown > 0) this.shootCooldown--;

    if (this._dx !== 0 || this._dy !== 0) {
      this._lastDx = this._dx;
      this._lastDy = this._dy;
    }

    if (this._shooting && this.shootCooldown === 0) {
      const ddx = this._lastDx;
      const ddy = this._lastDy;
      const len = Math.sqrt(ddx * ddx + ddy * ddy);
      this.shootCooldown = this.rapidFire ? 4 : this.SHOOT_COOLDOWN;
      return new Bullet(this.x, this.y, ddx / len, ddy / len, this.id);
    }

    return null;
  }

  /**
   * Reduce hp by amount. Shield absorbs one hit. On death, stay at death position.
   */
  takeDamage(amount) {
    if (!this.alive) return;

    if (this.shield) {
      this.shield = false;
      return;
    }

    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.reviveProgress = 0;
      // x, y intentionally left at death position so partner can find and revive
    }
  }

  /**
   * Called by GameRoom when a partner has fully revived this player.
   */
  revive() {
    this.alive = true;
    this.hp = 60;
    this.reviveProgress = 0;
  }

  /**
   * Apply a collected powerup effect.
   */
  applyPowerup(kind) {
    if (kind === 'health') {
      this.hp = Math.min(this.maxHp, this.hp + 40);
    } else if (kind === 'rapidfire') {
      this.rapidFire = true;
      this.rapidFireTimer = 200;
    } else if (kind === 'shield') {
      this.shield = true;
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
      shield: this.shield,
      rapidFire: this.rapidFire,
      reviveProgress: this.reviveProgress,
    };
  }
}

module.exports = Player;
