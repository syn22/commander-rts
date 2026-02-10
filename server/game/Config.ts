import { UnitType, TileType } from '../../shared/types.js';
import type { UnitStats } from '../../shared/types.js';

//
// All game configuration — single source of truth
//

export const GAME_CONFIG = {
  // Map (larger to fit 50 units per side)
  MAP_WIDTH: 40,
  MAP_HEIGHT: 30,

  // Tick rate
  TICK_RATE: 10, // ticks per second
  TICK_INTERVAL: 100, // ms between ticks

  // Base
  BASE_HP: 1000,
  BASE_VISION: 8,

  // Player 1 base position (left side)
  P1_BASE: { x: 2, y: 14 },
  // Player 2 base position (right side)
  P2_BASE: { x: 37, y: 14 },

  // Army composition per player (50 units each)
  ARMY_COMPOSITION: {
    [UnitType.FOOTMAN]: 15,
    [UnitType.ARCHER]: 15,
    [UnitType.CAVALRY]: 15,
    [UnitType.CATAPULT]: 5,
  },
} as const;

// Unit stats lookup
// speed = tiles per second (1 = one tile per second)
// atkSpeed = seconds between attacks (higher = slower attacks)
// Balanced for command-based gameplay with slower combat pace
export const UNIT_STATS: Record<UnitType, UnitStats> = {
  [UnitType.FOOTMAN]: {
    hp: 250,
    atk: 12,
    range: 1,
    speed: 1,       // 1 tile/sec — slow infantry
    vision: 5,
    atkSpeed: 3.0,  // attacks every 3 seconds
  },
  [UnitType.ARCHER]: {
    hp: 120,
    atk: 15,
    range: 6,
    speed: 1.5,     // 1.5 tiles/sec — light unit
    vision: 8,
    atkSpeed: 3.5,  // attacks every 3.5 seconds
  },
  [UnitType.CAVALRY]: {
    hp: 180,
    atk: 20,
    range: 1,
    speed: 2.5,     // 2.5 tiles/sec — fastest unit
    vision: 6,
    atkSpeed: 2.5,  // attacks every 2.5 seconds
  },
  [UnitType.CATAPULT]: {
    hp: 150,
    atk: 40,
    range: 10,
    speed: 0.5,     // 0.5 tiles/sec — very slow siege
    vision: 4,
    atkSpeed: 6.0,  // attacks every 6 seconds (much slower)
    minRange: 3,
    splashRadius: 2,
  },
};

// Terrain properties
export const TERRAIN_CONFIG: Record<TileType, { walkable: boolean; moveCost: number; visionBonus: number }> = {
  [TileType.GRASS]: { walkable: true, moveCost: 1, visionBonus: 0 },
  [TileType.WATER]: { walkable: false, moveCost: Infinity, visionBonus: 0 },
  [TileType.ROCK]: { walkable: false, moveCost: Infinity, visionBonus: 0 },
  [TileType.HILL]: { walkable: true, moveCost: 1, visionBonus: 3 },
};
