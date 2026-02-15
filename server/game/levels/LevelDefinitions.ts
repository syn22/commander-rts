import { UnitType, Position, TileType } from '../../../shared/types.js';

//
// Singleplayer puzzle level definitions
//

export interface ArmyUnit {
  type: UnitType;
  count: number;
}

export interface EnemyGroup {
  type: UnitType;
  count: number;
  position: Position; // center of group formation
}

export interface LevelDefinition {
  id: number;
  name: string;
  description: string;
  playerArmy: ArmyUnit[];
  enemyArmy: EnemyGroup[];
  // Star thresholds in seconds — lower = harder to achieve
  stars: { three: number; two: number; one: number };
  // Optional map modifier for level-specific terrain changes
  mapModifier?: (map: TileType[][]) => void;
}

export const LEVELS: LevelDefinition[] = [
  // Level 1: First Blood — Easy intro, overwhelm weak footmen
  {
    id: 1,
    name: 'First Blood',
    description: 'Crush a small enemy garrison. Learn to command your troops.',
    playerArmy: [
      { type: UnitType.FOOTMAN, count: 15 },
      { type: UnitType.ARCHER, count: 10 },
    ],
    enemyArmy: [
      { type: UnitType.FOOTMAN, count: 10, position: { x: 30, y: 14 } },
    ],
    stars: { three: 45, two: 90, one: Infinity },
  },

  // Level 2: Archer's Gambit — Teach flanking around obstacles
  {
    id: 2,
    name: "Archer's Gambit",
    description: 'Enemy archers hold the rocks. Use cavalry to flank them.',
    playerArmy: [
      { type: UnitType.ARCHER, count: 10 },
      { type: UnitType.CAVALRY, count: 5 },
    ],
    enemyArmy: [
      { type: UnitType.ARCHER, count: 15, position: { x: 28, y: 14 } },
    ],
    stars: { three: 60, two: 120, one: Infinity },
  },

  // Level 3: Siege Breaker — Use catapults to break defenses
  {
    id: 3,
    name: 'Siege Breaker',
    description: 'A fortified position blocks your advance. Break through with siege.',
    playerArmy: [
      { type: UnitType.FOOTMAN, count: 10 },
      { type: UnitType.ARCHER, count: 5 },
      { type: UnitType.CATAPULT, count: 3 },
    ],
    enemyArmy: [
      { type: UnitType.FOOTMAN, count: 20, position: { x: 25, y: 14 } },
      { type: UnitType.ARCHER, count: 5, position: { x: 28, y: 14 } },
    ],
    stars: { three: 90, two: 150, one: Infinity },
  },

  // Level 4: The Gauntlet — Enemies spread across passages
  {
    id: 4,
    name: 'The Gauntlet',
    description: 'Enemy forces guard all passages. Split your army wisely.',
    playerArmy: [
      { type: UnitType.CAVALRY, count: 15 },
      { type: UnitType.ARCHER, count: 5 },
    ],
    enemyArmy: [
      { type: UnitType.FOOTMAN, count: 5, position: { x: 25, y: 7 } },
      { type: UnitType.FOOTMAN, count: 5, position: { x: 25, y: 22 } },
      { type: UnitType.ARCHER, count: 5, position: { x: 30, y: 7 } },
      { type: UnitType.ARCHER, count: 5, position: { x: 30, y: 22 } },
      { type: UnitType.CATAPULT, count: 3, position: { x: 33, y: 14 } },
    ],
    stars: { three: 90, two: 180, one: Infinity },
  },

  // Level 5: Final Stand — Full army battle, hardest puzzle
  {
    id: 5,
    name: 'Final Stand',
    description: 'The enemy has assembled their full army. Destroy them all.',
    playerArmy: [
      { type: UnitType.FOOTMAN, count: 12 },
      { type: UnitType.ARCHER, count: 8 },
      { type: UnitType.CAVALRY, count: 8 },
      { type: UnitType.CATAPULT, count: 2 },
    ],
    enemyArmy: [
      { type: UnitType.FOOTMAN, count: 20, position: { x: 26, y: 14 } },
      { type: UnitType.ARCHER, count: 15, position: { x: 30, y: 14 } },
      { type: UnitType.CAVALRY, count: 5, position: { x: 25, y: 7 } },
      { type: UnitType.CATAPULT, count: 5, position: { x: 34, y: 14 } },
    ],
    stars: { three: 120, two: 240, one: Infinity },
  },
];

export function getLevelById(id: number): LevelDefinition | undefined {
  return LEVELS.find(l => l.id === id);
}

export function calculateStars(levelDef: LevelDefinition, timeSeconds: number): number {
  if (timeSeconds <= levelDef.stars.three) return 3;
  if (timeSeconds <= levelDef.stars.two) return 2;
  return 1;
}
