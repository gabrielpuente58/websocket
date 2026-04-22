'use strict';

// 20 columns x 15 rows. 0 = floor, 1 = wall. Border is all walls.

const TILES = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const PLAYER_SPAWNS = [
  { x: 2.5, y: 2.5 },
  { x: 3.5, y: 2.5 },
];

class GameMap {
  constructor() {
    this.tiles = TILES;
    this.playerSpawns = PLAYER_SPAWNS;
  }

  isWall(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (row < 0 || row >= this.tiles.length) return true;
    if (col < 0 || col >= this.tiles[0].length) return true;
    return this.tiles[row][col] === 1;
  }

  /** Floor tiles on the inner edges — used for bot spawn points. */
  getOpenEdgeTiles() {
    const open = [];
    const rows = this.tiles.length;
    const cols = this.tiles[0].length;

    for (let col = 2; col <= cols - 3; col++) {
      if (this.tiles[1][col] === 0) open.push({ x: col, y: 1 });
      if (this.tiles[rows - 2][col] === 0) open.push({ x: col, y: rows - 2 });
    }
    for (let row = 2; row <= rows - 3; row++) {
      if (this.tiles[row][1] === 0) open.push({ x: 1, y: row });
      if (this.tiles[row][cols - 2] === 0) open.push({ x: cols - 2, y: row });
    }

    return open;
  }

  toJSON() {
    return this.tiles;
  }
}

module.exports = { GameMap };
