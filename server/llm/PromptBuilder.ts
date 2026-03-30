import { Unit } from '../game/Unit.js';
import { Base } from '../game/Combat.js';
import { TileType, FogState, PlayerId } from '../../shared/types.js';
import { GAME_CONFIG } from '../game/Config.js';

//
// Build LLM prompt from game state
//

const SYSTEM_PROMPT = `You are a battlefield commander AI for a real-time strategy game.
You receive the player's visible game state and their natural language command, then call the issue_orders tool.

RULES:
- Only command units listed under YOUR UNITS — use their exact IDs.
- Always call issue_orders. Populate "actions" for every unit that should act.
- If the player says "all archers", emit one action per archer. Never skip units.
- When moving multiple units to one spot, spread them in a small formation (vary x/y by 1-2 tiles per unit).
- Targets must be walkable (grass or hill). Never target water (~) or rock (#).

MAP (${GAME_CONFIG.MAP_WIDTH}x${GAME_CONFIG.MAP_HEIGHT}):
- Player 1 base: LEFT side (x=2, y=14). For P1, "forward/right/east" = increasing x.
- Player 2 base: RIGHT side (x=37, y=14). For P2, "forward/left/west" = decreasing x.
- Central lake (IMPASSABLE): x=17-22, y=12-17. Rock borders surround it.
- North passage (safe corridor): y=5-10. South passage: y=19-24.
- Directions: north=low y, south=high y, west=low x, east=high x.

SAFE TARGETS BY DIRECTION:
- "right/east/forward" (P1): x=28, keep each unit's current y
- "left/west/forward" (P2): x=12, keep each unit's current y
- "center/middle": x=20, y=7 (north passage — avoids the lake)
- "north": keep each unit's x, set y=7
- "south": keep each unit's x, set y=22
- "enemy base/charge/attack": x=36 y=14 (P1) or x=3 y=14 (P2)

RELATIVE MOVEMENT: "move X tiles forward/east" → add X to each unit's current x.
"backward/west" → subtract X from x. "north" → subtract X from y. "south" → add X to y.
Compute each unit's target from their actual position in the game state.

ACTION TYPES:
- move: move to target, ignore enemies
- attack_move: move toward target, attack enemies along the way (use for offensive commands)
- hold: stay and fight in range, no target needed
- retreat: fall back to own base, no target needed
`;

/**
 * Build the full prompt for the LLM including scroll, game state, and command.
 */
export function buildPrompt(
  player: PlayerId,
  units: Unit[],
  bases: Base[],
  fogMap: FogState[][],
  mapTiles: TileType[][],
  command: string,
  scroll?: string,
): { system: string; user: string } {
  let system = SYSTEM_PROMPT;

  if (scroll && scroll.trim()) {
    system += `\nPLAYER SCROLL (shorthand definitions):\n${scroll}\n`;
  }

  const playerUnits = units.filter(u => u.owner === player && u.alive);
  const visibleEnemyUnits = units.filter(u => {
    if (u.owner === player || !u.alive) return false;
    const { x, y } = u.position;
    return fogMap[y]?.[x] === FogState.VISIBLE;
  });

  const playerBase = bases.find(b => b.owner === player)!;
  const enemyBase = bases.find(b => b.owner !== player)!;

  let userPrompt = `=== GAME STATE ===\n\n`;

  userPrompt += `YOUR UNITS (Player ${player}) — use exact IDs in issue_orders:\n`;
  for (const unit of playerUnits) {
    userPrompt += `  ${unit.id} | ${unit.type} | HP:${unit.hp}/${unit.maxHp} | pos:(${unit.position.x},${unit.position.y}) | ${unit.state}\n`;
  }

  userPrompt += `\nYOUR BASE: HP ${playerBase.hp}/${playerBase.maxHp} at (${playerBase.position.x},${playerBase.position.y})\n`;

  if (visibleEnemyUnits.length > 0) {
    userPrompt += `\nVISIBLE ENEMIES:\n`;
    for (const unit of visibleEnemyUnits) {
      userPrompt += `  ${unit.type} HP:${unit.hp}/${unit.maxHp} at (${unit.position.x},${unit.position.y})\n`;
    }
  } else {
    userPrompt += `\nNO ENEMY UNITS VISIBLE.\n`;
  }

  const ebPos = enemyBase.position;
  if (fogMap[ebPos.y]?.[ebPos.x] === FogState.VISIBLE) {
    userPrompt += `ENEMY BASE: HP ${enemyBase.hp}/${enemyBase.maxHp} at (${ebPos.x},${ebPos.y})\n`;
  } else {
    userPrompt += `ENEMY BASE: not visible, last known (${ebPos.x},${ebPos.y})\n`;
  }

  userPrompt += `\n=== COMMAND ===\n"${command}"\n\nCall issue_orders now.`;

  return { system, user: userPrompt };
}
