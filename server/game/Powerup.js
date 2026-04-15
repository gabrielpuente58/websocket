'use strict';

let _nextPowerupId = 0;

class Powerup {
  constructor(x, y, kind) {
    this.id = _nextPowerupId++;
    this.x = x;
    this.y = y;
    this.kind = kind; // 'health' | 'rapidfire' | 'shield'
    this.alive = true;
    this.ttl = 300; // disappears after 300 ticks (~15s)
  }

  tick() {
    if (--this.ttl <= 0) this.alive = false;
  }

  toJSON() {
    return { id: this.id, x: this.x, y: this.y, kind: this.kind };
  }
}

module.exports = Powerup;
