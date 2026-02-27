import { Unit } from '../game/Unit.js';
import { Base } from '../game/Combat.js';
import { TileType, FogState, PlayerId, Position } from '../../shared/types.js';
import { GAME_CONFIG } from '../game/Config.js';

//
// Build LLM prompt from game state
//

const SYSTEM_PROMPT = `You are a battlefield commander AI for a real-time strategy game. You receive the player's visible game state and their natural language command, and you must translate it into specific unit actions.

IMPORTANT RULES:
- You can ONLY command units that belong to the player. Do NOT reference enemy units in actions.
- You can ONLY target tiles that are within the map bounds (0-${GAME_CONFIG.MAP_WIDTH - 1} x, 0-${GAME_CONFIG.MAP_HEIGHT - 1} y).
- Unit IDs follow the format: {player}_{type}_{number} (e.g., "1_archer_1", "1_footman_3").
- When splitting units into groups, YOU MUST generate actions for ALL units mentioned, not just some.
- When positioning multiple units in one location, spread them out in a small formation (2-3 tile radius) instead of stacking on one point.
- You MUST respond with VALID JSON ONLY. Use double quotes for all strings and property names. No trailing commas. No markdown code blocks.

AVAILABLE ACTION TYPES:
- "move" — Move to a position. Requires "target": {"x": number, "y": number}
- "attack_move" — Move toward position, attack any enemies on the way. Requires "target": {"x": number, "y": number}
- "hold" — Stop moving, stay and fight anything in range. No target needed.
- "retreat" — Move back toward own base. No target needed.

RESPONSE FORMAT - Return ONLY a valid JSON object. Do not add any text before or after the JSON:

Example 1 (moving units in formation):
{"actions":[{"unitId":"1_archer_1","type":"move","target":{"x":15,"y":8}},{"unitId":"1_archer_2","type":"move","target":{"x":16,"y":8}},{"unitId":"1_archer_3","type":"move","target":{"x":17,"y":8}}],"response":"Moving archers north.","needsClarification":false}

Example 2 (splitting into groups - MUST include ALL units):
{"actions":[{"unitId":"1_cavalry_1","type":"move","target":{"x":10,"y":10}},{"unitId":"1_cavalry_2","type":"move","target":{"x":11,"y":10}},{"unitId":"1_cavalry_3","type":"move","target":{"x":30,"y":10}},{"unitId":"1_cavalry_4","type":"move","target":{"x":31,"y":10}}],"response":"Split cavalry into 2 groups.","needsClarification":false}

Example 3 (need clarification):
{"actions":[],"response":"Which archers? You have 2 groups.","needsClarification":true}

RELATIVE MOVEMENT: When the player says "move X tiles/blocks forward/east", compute each unit's new position by adding X to their current x. "backward/west" subtracts X from x. "north" subtracts X from y. "south" adds X to y. You MUST generate one action per unit using their actual current position from the game state — do not skip any units.

CRITICAL: Your entire response must be a single line of valid JSON. No markdown, no code blocks, no explanation text. You MUST emit an action for EVERY unit mentioned — never return actions:[] if you understood the command.

Map reference (40x30 grid):
- Player 1 base is on the LEFT side (x=2, y=14). For P1, "forward" = east = increasing x.
- Player 2 base is on the RIGHT side (x=37, y=14). For P2, "forward" = west = decreasing x.
- The center of the map has a lake with rock borders, blocking direct east-west movement through the middle.
- Three passages around the lake: NORTH (around y=6-8), and SOUTH (around y=21-23).
- Hills near the passages provide scouting bonuses.
- "north" means low y values, "south" means high y values, "left/west" means low x, "right/east" means high x.
- "center" or "middle" means around x=20, y=14.
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

  // Add scroll (player's custom shorthand)
  if (scroll && scroll.trim()) {
    system += `\n\nPLAYER'S CUSTOM SCROLL (shorthand definitions):\n${scroll}\n`;
  }

  // Build the visible state for the user prompt
  const playerUnits = units.filter(u => u.owner === player && u.alive);
  const visibleEnemyUnits = units.filter(u => {
    if (u.owner === player || !u.alive) return false;
    const { x, y } = u.position;
    return fogMap[y]?.[x] === FogState.VISIBLE;
  });

  const playerBase = bases.find(b => b.owner === player)!;
  const enemyBase = bases.find(b => b.owner !== player)!;

  let userPrompt = `CURRENT GAME STATE:\n\n`;

  // Your units
  userPrompt += `YOUR UNITS (Player ${player}):\n`;
  for (const unit of playerUnits) {
    userPrompt += `  ${unit.id} | ${unit.type} | HP: ${unit.hp}/${unit.maxHp} | Pos: (${unit.position.x}, ${unit.position.y}) | State: ${unit.state}\n`;
  }

  // Your base
  userPrompt += `\nYOUR BASE: HP ${playerBase.hp}/${playerBase.maxHp} at (${playerBase.position.x}, ${playerBase.position.y})\n`;

  // Visible enemies
  if (visibleEnemyUnits.length > 0) {
    userPrompt += `\nVISIBLE ENEMY UNITS:\n`;
    for (const unit of visibleEnemyUnits) {
      userPrompt += `  ${unit.type} | HP: ${unit.hp}/${unit.maxHp} | Pos: (${unit.position.x}, ${unit.position.y})\n`;
    }
  } else {
    userPrompt += `\nNO ENEMY UNITS VISIBLE.\n`;
  }

  // Enemy base (visible or not)
  const ebPos = enemyBase.position;
  if (fogMap[ebPos.y]?.[ebPos.x] === FogState.VISIBLE) {
    userPrompt += `ENEMY BASE: HP ${enemyBase.hp}/${enemyBase.maxHp} at (${ebPos.x}, ${ebPos.y})\n`;
  } else {
    userPrompt += `ENEMY BASE: Not currently visible (last known position: (${ebPos.x}, ${ebPos.y}))\n`;
  }

  // Compact map legend
  userPrompt += `\nMAP: ${GAME_CONFIG.MAP_WIDTH}x${GAME_CONFIG.MAP_HEIGHT} grid. Terrain: grass(.), water(~, impassable), rock(#, impassable), hill(^, vision bonus)\n`;

  // Player's command
  userPrompt += `\nPLAYER COMMAND: "${command}"\n\n`;
  userPrompt += `Respond with a single line of valid JSON following the exact format shown in the examples. Start your response with { and end with }. No other text.`;

  return { system, user: userPrompt };
}
