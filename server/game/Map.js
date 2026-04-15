'use strict';

// 20 columns (x) x 15 rows (y)
// Tile 0 = floor, 1 = wall
// Border is all walls. Player spawns are floor tiles.

const MAPS = [
  {
    // Map 0: Symmetrical clusters (original)
    tiles: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 0  — top border
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 1
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 2
      [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1], // row 3
      [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1], // row 4
      [1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1], // row 5
      [1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1], // row 6
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 7
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 8
      [1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1], // row 9
      [1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1], // row 10
      [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1], // row 11
      [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1], // row 12
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 13
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 14 — bottom border
    ],
    playerSpawns: [
      { x: 2.5, y: 2.5 },
      { x: 3.5, y: 2.5 },
    ],
  },
  {
    // Map 1: Open Arena — sparse single pillars
    tiles: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 0
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 1
      [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1], // row 2
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 3
      [1,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,1], // row 4
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 5
      [1,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,1], // row 6
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 7
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 8
      [1,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,1], // row 9
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 10
      [1,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,1], // row 11
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 12
      [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1], // row 13
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 14
    ],
    playerSpawns: [
      { x: 2.5, y: 7.5 },
      { x: 3.5, y: 7.5 },
    ],
  },
  {
    // Map 2: Corridors — horizontal walls with gaps forcing movement
    tiles: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 0
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 1
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 2
      [1,1,1,1,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,1], // row 3 — wall, gaps at col 7 and col 14
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 4
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 5
      [1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1], // row 6 — wall, gaps at col 2 and col 14
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 7
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 8
      [1,1,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,1,1], // row 9 — wall, gaps at col 5 and col 14
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 10
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 11
      [1,1,1,1,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,1], // row 12 — wall, gaps at col 7 and col 14
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 13
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 14
    ],
    playerSpawns: [
      { x: 2.5, y: 1.5 },
      { x: 3.5, y: 1.5 },
    ],
  },
  {
    // Map 3: Bunker — corner L-walls with a center obstacle cluster
    tiles: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 0
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 1
      [1,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1], // row 2
      [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1], // row 3
      [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1], // row 4
      [1,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,1], // row 5
      [1,0,0,0,0,1,0,0,0,1,1,0,0,1,0,0,0,0,0,1], // row 6
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 7
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 8
      [1,0,0,0,0,1,0,0,0,1,1,0,0,1,0,0,0,0,0,1], // row 9
      [1,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,1], // row 10
      [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1], // row 11
      [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1], // row 12
      [1,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1], // row 13
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 14
    ],
    playerSpawns: [
      { x: 2.5, y: 7.5 },
      { x: 3.5, y: 7.5 },
    ],
  },
];

class GameMap {
  constructor() {
    const chosen = MAPS[Math.floor(Math.random() * MAPS.length)];
    this.tiles = chosen.tiles;
    this.playerSpawns = chosen.playerSpawns;
  }

  /**
   * Returns true if the tile at floor(x), floor(y) is a wall or out of bounds.
   */
  isWall(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (row < 0 || row >= this.tiles.length) return true;
    if (col < 0 || col >= this.tiles[0].length) return true;
    return this.tiles[row][col] === 1;
  }

  /**
   * Returns array of {x, y} tile coordinates on the inner edges that are floor tiles.
   * Used for bot spawn points.
   */
  getOpenEdgeTiles() {
    const open = [];
    const rows = this.tiles.length;    // 15
    const cols = this.tiles[0].length; // 20

    // Top inner edge: row 1, cols 2..cols-3
    for (let col = 2; col <= cols - 3; col++) {
      if (this.tiles[1][col] === 0) open.push({ x: col, y: 1 });
    }

    // Bottom inner edge: row 13, cols 2..cols-3
    for (let col = 2; col <= cols - 3; col++) {
      if (this.tiles[13][col] === 0) open.push({ x: col, y: 13 });
    }

    // Left inner edge: col 1, rows 2..rows-3
    for (let row = 2; row <= rows - 3; row++) {
      if (this.tiles[row][1] === 0) open.push({ x: 1, y: row });
    }

    // Right inner edge: col 18, rows 2..rows-3
    for (let row = 2; row <= rows - 3; row++) {
      if (this.tiles[row][18] === 0) open.push({ x: 18, y: row });
    }

    return open;
  }

  /**
   * Returns the 2D tiles array (sent once to clients at game start).
   */
  toJSON() {
    return this.tiles;
  }
}

module.exports = GameMap;
