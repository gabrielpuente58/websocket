'use strict';

// 20 columns (x) x 15 rows (y)
// Tile 0 = floor, 1 = wall
// Border is all walls. Interior has symmetrical obstacle clusters.
// Player 1 spawns at tile center (2.5, 2.5), Player 2 at (3.5, 2.5).

class GameMap {
  constructor() {
    // 15 rows, each row has 20 columns
    this.tiles = [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 0  — top border
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 1
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 2
      [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1], // row 3  — cluster A (cols 3-4) & mirror (cols 15-16)
      [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1], // row 4  — cluster A cont.
      [1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1], // row 5  — cluster B (col 6) & mirror (col 13)
      [1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1], // row 6  — cluster B cont.
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 7  — center cluster (cols 9-10)
      [1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1], // row 8  — center cluster cont.
      [1,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,1], // row 9  — cluster C (cols 6-7) & mirror (cols 12-13)
      [1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1], // row 10 — cluster C cont.
      [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1], // row 11 — cluster D (col 3) & mirror (col 16)
      [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1], // row 12 — cluster D cont. (cols 3-4) & mirror (cols 15-16)
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // row 13
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // row 14 — bottom border
    ];

    // Spawn positions: tile centers (x+0.5, y+0.5) for tile at col x, row y
    this.playerSpawns = [
      { x: 2.5, y: 2.5 }, // Player 0
      { x: 3.5, y: 2.5 }, // Player 1
    ];
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
   * Returns array of {x, y} positions that are on the inner edge of the map
   * (row 1, row 13, col 1, col 18) and are floor tiles (tile === 0).
   * Corners (where row-edge and col-edge meet) are excluded.
   * Returns tile coordinates (integers), not centers.
   */
  getOpenEdgeTiles() {
    const open = [];
    const rows = this.tiles.length;    // 15
    const cols = this.tiles[0].length; // 20

    // Top inner edge: row 1, cols 1..cols-2 (exclude corner cols 1 and cols-2? no — exclude the actual border row 0)
    // We want the inner-most edge row/col that bots can actually stand on.
    // row 1, excluding col 1 and col 18 (those are "corners" of the inner edge)
    for (let col = 2; col <= cols - 3; col++) {
      if (this.tiles[1][col] === 0) {
        open.push({ x: col, y: 1 });
      }
    }

    // Bottom inner edge: row 13, cols 2..cols-3
    for (let col = 2; col <= cols - 3; col++) {
      if (this.tiles[13][col] === 0) {
        open.push({ x: col, y: 13 });
      }
    }

    // Left inner edge: col 1, rows 2..rows-3
    for (let row = 2; row <= rows - 3; row++) {
      if (this.tiles[row][1] === 0) {
        open.push({ x: 1, y: row });
      }
    }

    // Right inner edge: col 18, rows 2..rows-3
    for (let row = 2; row <= rows - 3; row++) {
      if (this.tiles[row][18] === 0) {
        open.push({ x: 18, y: row });
      }
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
