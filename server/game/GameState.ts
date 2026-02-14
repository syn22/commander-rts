import { TileType, UnitType, PlayerId, Position, ActionType } from '../../shared/types.js';
import { GAME_CONFIG, UNIT_STATS } from './Config.js';
import { Unit, UnitOrder } from './Unit.js';
import { Base, createBase } from './Combat.js';
import { generateMap } from './MapGenerator.js';
import { FogOfWarSystem } from './FogOfWar.js';

//
// Game State — holds all game data
//

export class GameState {
  map: TileType[][];
  units: Unit[] = [];
  bases: Base[] = [];
  fog: FogOfWarSystem;
  tick: number = 0;
  gameOver: boolean = false;
  winner: PlayerId | null = null;
  startTime: number = Date.now();

  constructor() {
    this.map = generateMap();
    this.fog = new FogOfWarSystem();
    this.bases = [createBase(1), createBase(2)];
    this.spawnUnits(1);
    this.spawnUnits(2);
  }

  /**
   * Spawn all units for a player in formation near their base
   */
  private spawnUnits(player: PlayerId): void {
    const base = player === 1 ? GAME_CONFIG.P1_BASE : GAME_CONFIG.P2_BASE;
    const dir = player === 1 ? 1 : -1; // P1 spawns to the right of base, P2 to the left

    // Spawn positions relative to base in organized grid formations
    // Layout (from base outward):
    // - Catapults (5x1) closest to base
    // - Archers (5x3) behind catapults
    // - Footmen (5x3) in middle
    // - Cavalry (5x3) at front (fastest, can engage first)

    const comp = GAME_CONFIG.ARMY_COMPOSITION;

    // Catapults — 5x1 formation, closest to base (siege units stay back)
    for (let i = 0; i < comp[UnitType.CATAPULT]; i++) {
      const row = i % 5;
      const pos: Position = {
        x: base.x + dir * 2,
        y: base.y - 2 + row,
      };
      const safePos = this.clampToMap(this.findNearestWalkable(pos));
      this.units.push(new Unit(`${player}_catapult_${i + 1}`, UnitType.CATAPULT, player, safePos));
    }

    // Archers — 5x3 formation behind catapults
    for (let i = 0; i < comp[UnitType.ARCHER]; i++) {
      const col = Math.floor(i / 5);
      const row = i % 5;
      const pos: Position = {
        x: base.x + dir * (4 + col),
        y: base.y - 2 + row,
      };
      const safePos = this.clampToMap(this.findNearestWalkable(pos));
      this.units.push(new Unit(`${player}_archer_${i + 1}`, UnitType.ARCHER, player, safePos));
    }

    // Footmen — 5x3 formation in middle
    for (let i = 0; i < comp[UnitType.FOOTMAN]; i++) {
      const col = Math.floor(i / 5);
      const row = i % 5;
      const pos: Position = {
        x: base.x + dir * (7 + col),
        y: base.y - 2 + row,
      };
      const safePos = this.clampToMap(this.findNearestWalkable(pos));
      this.units.push(new Unit(`${player}_footman_${i + 1}`, UnitType.FOOTMAN, player, safePos));
    }

    // Cavalry — 5x3 formation at front (fastest units in front)
    for (let i = 0; i < comp[UnitType.CAVALRY]; i++) {
      const col = Math.floor(i / 5);
      const row = i % 5;
      const pos: Position = {
        x: base.x + dir * (10 + col),
        y: base.y - 2 + row,
      };
      const safePos = this.clampToMap(this.findNearestWalkable(pos));
      this.units.push(new Unit(`${player}_cavalry_${i + 1}`, UnitType.CAVALRY, player, safePos));
    }
  }

  private clampToMap(pos: Position): Position {
    return {
      x: Math.max(0, Math.min(GAME_CONFIG.MAP_WIDTH - 1, pos.x)),
      y: Math.max(0, Math.min(GAME_CONFIG.MAP_HEIGHT - 1, pos.y)),
    };
  }

  /**
   * If a position isn't walkable, find the nearest walkable tile
   */
  private findNearestWalkable(pos: Position): Position {
    const { MAP_WIDTH, MAP_HEIGHT } = GAME_CONFIG;
    const px = Math.max(0, Math.min(MAP_WIDTH - 1, pos.x));
    const py = Math.max(0, Math.min(MAP_HEIGHT - 1, pos.y));

    if (this.isWalkable(px, py)) return { x: px, y: py };

    // BFS for nearest walkable
    for (let radius = 1; radius < 10; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && this.isWalkable(nx, ny)) {
            return { x: nx, y: ny };
          }
        }
      }
    }

    return { x: px, y: py }; // fallback
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= GAME_CONFIG.MAP_WIDTH || y < 0 || y >= GAME_CONFIG.MAP_HEIGHT) return false;
    const tile = this.map[y][x];
    return tile === TileType.GRASS || tile === TileType.HILL;
  }

  getPlayerUnits(player: PlayerId): Unit[] {
    return this.units.filter(u => u.owner === player && u.alive);
  }

  getEnemyUnits(player: PlayerId): Unit[] {
    const enemy = player === 1 ? 2 : 1;
    return this.units.filter(u => u.owner === (enemy as PlayerId) && u.alive);
  }

  getBase(player: PlayerId): Base {
    return this.bases.find(b => b.owner === player)!;
  }

  getEnemyBase(player: PlayerId): Base {
    const enemy = player === 1 ? 2 : 1;
    return this.bases.find(b => b.owner === (enemy as PlayerId))!;
  }

  checkWinCondition(): void {
    // Win by destroying enemy base
    if (this.bases[0].hp <= 0) {
      this.gameOver = true;
      this.winner = 2;
      return;
    }
    if (this.bases[1].hp <= 0) {
      this.gameOver = true;
      this.winner = 1;
      return;
    }

    // Lose if all your units are dead
    const p1Units = this.getPlayerUnits(1);
    const p2Units = this.getPlayerUnits(2);
    if (p1Units.length === 0) {
      this.gameOver = true;
      this.winner = 2;
      return;
    }
    if (p2Units.length === 0) {
      this.gameOver = true;
      this.winner = 1;
      return;
    }
  }

  /**
   * Get a set of all occupied positions (as "x,y" strings), optionally excluding a specific unit
   */
  getOccupiedPositions(excludeUnitId?: string): Set<string> {
    const occupied = new Set<string>();
    for (const unit of this.units) {
      if (!unit.alive) continue;
      if (excludeUnitId && unit.id === excludeUnitId) continue;
      occupied.add(`${unit.position.x},${unit.position.y}`);
    }
    return occupied;
  }

  /**
   * Check if a tile is occupied by any alive unit (optionally excluding one)
   */
  isTileOccupied(x: number, y: number, excludeUnitId?: string): boolean {
    for (const unit of this.units) {
      if (!unit.alive) continue;
      if (excludeUnitId && unit.id === excludeUnitId) continue;
      if (unit.position.x === x && unit.position.y === y) return true;
    }
    return false;
  }

  getGameTime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}
