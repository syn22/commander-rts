import { TileType, FogState, PlayerId, Position } from '../../shared/types.js';
import { Unit } from './Unit.js';
import { Base } from './Combat.js';
import { GAME_CONFIG, TERRAIN_CONFIG, UNIT_STATS } from './Config.js';

// ============================================================
// Fog of War calculation
// ============================================================

export class FogOfWarSystem {
  // Track what each player has ever seen
  private explored: Map<PlayerId, boolean[][]> = new Map();

  constructor() {
    this.initPlayer(1);
    this.initPlayer(2);
  }

  private initPlayer(player: PlayerId): void {
    const grid: boolean[][] = [];
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      grid[y] = new Array(GAME_CONFIG.MAP_WIDTH).fill(false);
    }
    this.explored.set(player, grid);
  }

  /**
   * Compute the fog of war for a player.
   * Returns a 2D grid of FogState for each tile.
   */
  computeFog(
    player: PlayerId,
    units: Unit[],
    bases: Base[],
    map: TileType[][],
  ): FogState[][] {
    const width = GAME_CONFIG.MAP_WIDTH;
    const height = GAME_CONFIG.MAP_HEIGHT;
    const explored = this.explored.get(player)!;

    // Start with all unexplored or previously seen
    const fog: FogState[][] = [];
    for (let y = 0; y < height; y++) {
      fog[y] = [];
      for (let x = 0; x < width; x++) {
        fog[y][x] = explored[y][x] ? FogState.PREVIOUSLY_SEEN : FogState.UNEXPLORED;
      }
    }

    // Collect all vision sources for this player
    const visionSources: { pos: Position; range: number }[] = [];

    for (const unit of units) {
      if (unit.owner !== player || !unit.alive) continue;

      let visionRange = unit.stats.vision;

      // Hill bonus
      if (map[unit.position.y][unit.position.x] === TileType.HILL) {
        visionRange += TERRAIN_CONFIG[TileType.HILL].visionBonus;
      }

      visionSources.push({ pos: unit.position, range: visionRange });
    }

    // Base vision
    for (const base of bases) {
      if (base.owner !== player || base.hp <= 0) continue;
      visionSources.push({ pos: base.position, range: GAME_CONFIG.BASE_VISION });
    }

    // Mark visible tiles
    for (const source of visionSources) {
      const range = source.range;
      const sx = source.pos.x;
      const sy = source.pos.y;

      // Check all tiles in range
      const minX = Math.max(0, sx - range);
      const maxX = Math.min(width - 1, sx + range);
      const minY = Math.max(0, sy - range);
      const maxY = Math.min(height - 1, sy + range);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - sx;
          const dy = y - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= range) {
            fog[y][x] = FogState.VISIBLE;
            explored[y][x] = true;
          }
        }
      }
    }

    return fog;
  }
}
