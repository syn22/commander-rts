import { GameState } from './GameState.js';
import { Unit } from './Unit.js';
import { findPath } from './Pathfinding.js';
import {
  findTarget,
  canAttackBase,
  canAttackThisTick,
  attackUnit,
  attackBase,
} from './Combat.js';
import {
  PlayerId,
  UnitState,
  ActionType,
  FogState,
  GameStateUpdate,
  GameMode,
  TileType,
  CombatEvent,
} from '../../shared/types.js';
import { GAME_CONFIG } from './Config.js';

//
// Game Engine — tick-based simulation
//

export class GameEngine {
  state: GameState;
  gameMode: GameMode;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onTick: ((update: GameStateUpdate, player: PlayerId) => void) | null = null;
  private combatEvents: CombatEvent[] = [];  // collected during each tick

  constructor(gameMode: GameMode = 'singleplayer') {
    this.state = new GameState();
    this.gameMode = gameMode;
  }

  /**
   * Start the game loop
   */
  start(onTick: (update: GameStateUpdate, player: PlayerId) => void): void {
    this.onTick = onTick;
    this.tickInterval = setInterval(() => {
      this.tick();
    }, GAME_CONFIG.TICK_INTERVAL);
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Main tick — called TICK_RATE times per second
   */
  tick(): void {
    if (this.state.gameOver) return;

    this.state.tick++;
    this.combatEvents = [];  // reset each tick

    // 1. Process movement for all units
    this.processMovement();

    // 2. Process combat (auto-attack)
    this.processCombat();

    // 3. Remove dead units (already handled by takeDamage setting state to DEAD)
    this.cleanupDead();

    // 4. Check win condition
    this.state.checkWinCondition();

    // 5. Send updates to players
    if (this.onTick) {
      const update1 = this.getStateForPlayer(1);
      this.onTick(update1, 1);
      // In multiplayer, also send to player 2
      if (this.gameMode === 'multiplayer') {
        const update2 = this.getStateForPlayer(2);
        this.onTick(update2, 2);
      }
    }
  }

  /**
   * Process all unit movement
   */
  private processMovement(): void {
    for (const unit of this.state.units) {
      if (!unit.alive || !unit.order) continue;
      if (unit.state === UnitState.ATTACKING) {
        // If attacking, check if target moved out of range — if so, resume moving
        // For simplicity in prototype, reset to moving after attack cooldown
      }

      if (unit.order.type === ActionType.HOLD) continue;

      if (unit.order.type === ActionType.RETREAT) {
        // Move toward own base
        const base = this.state.getBase(unit.owner);
        if (!unit.order.path || unit.order.path.length === 0) {
          // Units can pass through each other
          const path = findPath(this.state.map, unit.position, base.position);
          if (path) {
            unit.order.path = path;
            unit.order.pathIndex = 0;
          } else {
            unit.clearOrder();
            continue;
          }
        }
      }

      // Attack-move: check for enemies along the way
      if (unit.order.type === ActionType.ATTACK_MOVE) {
        const enemies = this.state.getEnemyUnits(unit.owner);
        const target = findTarget(unit, enemies);
        if (target) {
          // Stop and fight
          unit.state = UnitState.ATTACKING;
          continue;
        }
      }

      // Move along path
      if (unit.order.path && unit.order.pathIndex !== undefined) {
        this.moveUnitAlongPath(unit);
      } else if (unit.order.target) {
        // Compute path if we don't have one (units can pass through each other)
        const path = findPath(this.state.map, unit.position, unit.order.target);
        if (path && path.length > 0) {
          unit.order.path = path;
          unit.order.pathIndex = 0;
          unit.state = UnitState.MOVING;
        } else {
          unit.clearOrder();
        }
      }
    }
  }

  /**
   * Move a unit one step along its path based on its speed
   */
  private moveUnitAlongPath(unit: Unit): void {
    if (!unit.order?.path || unit.order.pathIndex === undefined) return;

    const path = unit.order.path;
    const idx = unit.order.pathIndex;

    if (idx >= path.length) {
      // Reached destination
      unit.clearOrder();
      return;
    }

    // Speed: tiles per second → tiles per tick
    const tilesPerTick = unit.stats.speed / GAME_CONFIG.TICK_RATE;
    unit.moveProgress += tilesPerTick;

    while (unit.moveProgress >= 1 && unit.order.pathIndex! < path.length) {
      const nextPos = path[unit.order.pathIndex!];
      const isLastStep = unit.order.pathIndex! === path.length - 1;

      // Only block if this is the final destination AND it's occupied
      if (isLastStep && this.state.isTileOccupied(nextPos.x, nextPos.y, unit.id)) {
        // Final destination is occupied - stop here (one tile before)
        unit.clearOrder();
        unit.state = UnitState.IDLE;
        break;
      }

      // Units can pass through each other during movement
      unit.position = { ...nextPos };
      unit.order.pathIndex!++;
      unit.moveProgress -= 1;
      unit.state = UnitState.MOVING;
    }

    // Check if we've reached the end (only if order still exists)
    if (unit.order && unit.order.pathIndex! >= path.length) {
      unit.clearOrder();
    }
  }

  /**
   * Process auto-attack for all units
   */
  private processCombat(): void {
    for (const unit of this.state.units) {
      if (!unit.alive) continue;

      if (!canAttackThisTick(unit, this.state.tick)) continue;

      const enemies = this.state.getEnemyUnits(unit.owner);
      const enemyBase = this.state.getEnemyBase(unit.owner);

      // In singleplayer, Player 2 (bot) deals half damage
      const dmgMultiplier = (this.gameMode === 'singleplayer' && unit.owner === 2) ? 0.5 : 1;

      // Try to attack a unit first
      const target = findTarget(unit, enemies);
      if (target) {
        const damaged = attackUnit(unit, target, enemies, this.state.tick, dmgMultiplier);
        const actualDmg = Math.floor(unit.stats.atk * dmgMultiplier);
        this.combatEvents.push({
          attackerId: unit.id,
          attackerPos: { ...unit.position },
          targetPos: { ...target.position },
          attackerType: unit.type,
          damage: actualDmg,
          splash: damaged.length > 1,
        });
        continue;
      }

      // Try to attack the enemy base
      if (enemyBase.hp > 0 && canAttackBase(unit, enemyBase)) {
        attackBase(unit, enemyBase, this.state.tick, dmgMultiplier);
        const actualDmg = Math.floor(unit.stats.atk * dmgMultiplier);
        this.combatEvents.push({
          attackerId: unit.id,
          attackerPos: { ...unit.position },
          targetPos: { ...enemyBase.position },
          attackerType: unit.type,
          damage: actualDmg,
          targetIsBase: true,
        });
        continue;
      }

      // If we were attacking but no target, go back to moving or idle
      if (unit.state === UnitState.ATTACKING) {
        if (unit.order && unit.order.type === ActionType.ATTACK_MOVE) {
          unit.state = UnitState.MOVING;
          // Recompute path if needed
          if (unit.order.target && (!unit.order.path || unit.order.pathIndex! >= unit.order.path.length)) {
            // Units can pass through each other
            const path = findPath(this.state.map, unit.position, unit.order.target);
            if (path) {
              unit.order.path = path;
              unit.order.pathIndex = 0;
            } else {
              unit.clearOrder();
            }
          }
        } else {
          unit.state = UnitState.IDLE;
        }
      }
    }
  }

  /**
   * Clean up dead units (mark them, but keep in array for death animations later)
   */
  private cleanupDead(): void {
    // For prototype, just filter out dead units
    this.state.units = this.state.units.filter(u => u.alive);
  }

  /**
   * Get game state filtered for a specific player (fog of war applied)
   */
  getStateForPlayer(player: PlayerId): GameStateUpdate {
    const fogMap = this.state.fog.computeFog(
      player,
      this.state.units,
      this.state.bases,
      this.state.map,
    );

    // Filter units: only show units visible to this player
    const visibleUnits = this.state.units.filter(unit => {
      // Always show own units
      if (unit.owner === player) return true;
      // Show enemy units only if they're in a visible tile
      const { x, y } = unit.position;
      return fogMap[y][x] === FogState.VISIBLE;
    });

    // Filter combat events to only visible ones
    const visibleCombatEvents = this.combatEvents.filter(evt => {
      const { x: ax, y: ay } = evt.attackerPos;
      const { x: tx, y: ty } = evt.targetPos;
      return (fogMap[ay]?.[ax] === FogState.VISIBLE) || (fogMap[ty]?.[tx] === FogState.VISIBLE);
    });

    return {
      tick: this.state.tick,
      playerId: player,
      gameMode: this.gameMode,
      units: visibleUnits.map(u => u.toData()),
      bases: this.state.bases.map(b => ({
        owner: b.owner,
        position: { ...b.position },
        hp: b.hp,
        maxHp: b.maxHp,
      })),
      fogMap,
      mapTiles: this.state.map,
      mapWidth: GAME_CONFIG.MAP_WIDTH,
      mapHeight: GAME_CONFIG.MAP_HEIGHT,
      gameTime: this.state.getGameTime(),
      gameOver: this.state.gameOver,
      winner: this.state.winner,
      combatEvents: visibleCombatEvents,
    };
  }
}
