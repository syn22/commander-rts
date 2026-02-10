import { LLMAction, ActionType, TileType } from '../../shared/types.js';
import { Unit } from '../game/Unit.js';
import { GAME_CONFIG, TERRAIN_CONFIG } from '../game/Config.js';

// ============================================================
// Validate LLM-generated actions before execution
// ============================================================

const VALID_ACTION_TYPES = new Set<string>([
  ActionType.MOVE,
  ActionType.ATTACK_MOVE,
  ActionType.HOLD,
  ActionType.RETREAT,
]);

/**
 * Validate and filter actions from the LLM.
 * Ensures: unit exists, belongs to player, target is valid, action type is valid.
 */
export function validateActions(
  actions: LLMAction[],
  playerUnits: Unit[],
  mapTiles: TileType[][],
): LLMAction[] {
  if (!Array.isArray(actions)) return [];

  const unitMap = new Map<string, Unit>();
  for (const unit of playerUnits) {
    unitMap.set(unit.id, unit);
  }

  const validated: LLMAction[] = [];

  for (const action of actions) {
    // Check action has required fields
    if (!action || !action.unitId || !action.type) {
      console.warn('Invalid action (missing fields):', action);
      continue;
    }

    // Check action type is valid
    if (!VALID_ACTION_TYPES.has(action.type)) {
      console.warn('Invalid action type:', action.type);
      continue;
    }

    // Check unit belongs to player
    const unit = unitMap.get(action.unitId);
    if (!unit) {
      console.warn('Unit not found or not owned by player:', action.unitId);
      continue;
    }

    // Check unit is alive
    if (!unit.alive) {
      console.warn('Unit is dead:', action.unitId);
      continue;
    }

    // For move/attack_move, validate target
    if (action.type === ActionType.MOVE || action.type === ActionType.ATTACK_MOVE) {
      if (!action.target) {
        console.warn('Move/attack_move action missing target:', action);
        continue;
      }

      const { x, y } = action.target;

      // Bounds check
      if (x < 0 || x >= GAME_CONFIG.MAP_WIDTH || y < 0 || y >= GAME_CONFIG.MAP_HEIGHT) {
        console.warn('Target out of bounds:', action.target);
        continue;
      }

      // Check target tile is walkable
      if (!TERRAIN_CONFIG[mapTiles[y][x]].walkable) {
        console.warn('Target tile is not walkable:', action.target, mapTiles[y][x]);
        continue;
      }
    }

    // Hold and retreat don't need target validation
    validated.push(action);
  }

  return validated;
}
