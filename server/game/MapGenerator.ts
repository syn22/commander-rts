import { TileType } from '../../shared/types.js';
import { GAME_CONFIG } from './Config.js';

// ============================================================
// Fixed hand-crafted map for prototype
// 40 wide x 30 tall — larger battlefield for 50 units per side
// Symmetric left-right (mirrored at column 20)
//
// Features:
//   - Central lake with rock borders
//   - Three passages: north, center-gap, south
//   - Hills near passages for scouting
//   - Rock formations for cover
//   - Bases on far left/right
// ============================================================

const G = TileType.GRASS;
const W = TileType.WATER;
const R = TileType.ROCK;
const H = TileType.HILL;

export function generateMap(): TileType[][] {
  const { MAP_WIDTH, MAP_HEIGHT } = GAME_CONFIG;

  // Start with all grass
  const map: TileType[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      map[y][x] = G;
    }
  }

  // Helper: set a tile (with bounds check)
  const set = (x: number, y: number, tile: TileType) => {
    if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
      map[y][x] = tile;
    }
  };

  // Helper: set mirrored (symmetric left-right around center)
  const setMirrored = (x: number, y: number, tile: TileType) => {
    set(x, y, tile);
    set(MAP_WIDTH - 1 - x, y, tile);
  };

  // === Central Lake (water) — rows 12-17, cols 18-21 ===
  for (let y = 12; y <= 17; y++) {
    for (let x = 18; x <= 21; x++) {
      setMirrored(x, y, W);
    }
  }

  // === Rock borders around the lake ===
  // Top edge
  for (let x = 17; x <= 22; x++) {
    setMirrored(x, 11, R);
  }
  // Bottom edge
  for (let x = 17; x <= 22; x++) {
    setMirrored(x, 18, R);
  }
  // Side edges
  for (let y = 12; y <= 17; y++) {
    setMirrored(17, y, R);
  }

  // === North passage (rows 6-8) — open grass corridor ===
  // Hills flanking the north passage
  setMirrored(14, 5, H);
  setMirrored(14, 6, H);
  setMirrored(15, 5, H);
  setMirrored(14, 8, H);
  setMirrored(15, 8, H);

  // === South passage (rows 21-23) — open grass corridor ===
  // Hills flanking the south passage
  setMirrored(14, 21, H);
  setMirrored(14, 22, H);
  setMirrored(15, 22, H);
  setMirrored(14, 24, H);
  setMirrored(15, 24, H);

  // === Rock formations for cover ===
  // Near bases (defensive rocks)
  setMirrored(6, 10, R);
  setMirrored(6, 11, R);
  setMirrored(6, 18, R);
  setMirrored(6, 19, R);

  // Mid-field rocks
  setMirrored(10, 7, R);
  setMirrored(10, 22, R);
  setMirrored(12, 14, R);

  // === Scattered hills for scouting ===
  // Near bases
  setMirrored(5, 12, H);
  setMirrored(5, 16, H);

  // Mid-field
  setMirrored(10, 3, H);
  setMirrored(10, 26, H);

  // === Top/bottom border rocks ===
  setMirrored(12, 0, R);
  setMirrored(13, 0, R);
  setMirrored(14, 0, R);
  setMirrored(12, 29, R);
  setMirrored(13, 29, R);
  setMirrored(14, 29, R);

  // Edge rocks for flavor
  setMirrored(8, 1, R);
  setMirrored(8, 28, R);
  setMirrored(16, 2, R);
  setMirrored(16, 27, R);

  return map;
}

// Debug: print the map to console
export function printMap(map: TileType[][]): void {
  const charMap: Record<TileType, string> = {
    [TileType.GRASS]: '.',
    [TileType.WATER]: '~',
    [TileType.ROCK]: '#',
    [TileType.HILL]: '^',
  };

  console.log('Map (' + map[0].length + 'x' + map.length + '):');
  for (let y = 0; y < map.length; y++) {
    const row = map[y].map(t => charMap[t]).join('');
    console.log(y.toString().padStart(2, '0') + ' ' + row);
  }
}
