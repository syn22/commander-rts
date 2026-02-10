import { Unit } from './Unit.js';
import { GAME_CONFIG, UNIT_STATS } from './Config.js';
import { PlayerId, Position, UnitState } from '../../shared/types.js';

//
// Combat system
//

export interface Base {
  owner: PlayerId;
  position: Position;
  hp: number;
  maxHp: number;
}

export function createBase(owner: PlayerId): Base {
  const pos = owner === 1 ? GAME_CONFIG.P1_BASE : GAME_CONFIG.P2_BASE;
  return {
    owner,
    position: { ...pos },
    hp: GAME_CONFIG.BASE_HP,
    maxHp: GAME_CONFIG.BASE_HP,
  };
}

/**
 * Find the nearest enemy unit within attack range
 */
export function findTarget(unit: Unit, enemies: Unit[]): Unit | null {
  const stats = unit.stats;
  let nearest: Unit | null = null;
  let nearestDist = Infinity;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const dist = unit.distanceToUnit(enemy);

    // Check range
    if (dist > stats.range) continue;

    // Check minimum range (catapult)
    if (stats.minRange && dist < stats.minRange) continue;

    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }

  return nearest;
}

/**
 * Find if the enemy base is within attack range
 */
export function canAttackBase(unit: Unit, base: Base): boolean {
  const stats = unit.stats;
  const dist = unit.distanceTo(base.position);

  if (dist > stats.range) return false;
  if (stats.minRange && dist < stats.minRange) return false;

  return true;
}

/**
 * Check if a unit can attack this tick (respects attack speed)
 */
export function canAttackThisTick(unit: Unit, currentTick: number): boolean {
  const stats = unit.stats;
  const ticksBetweenAttacks = stats.atkSpeed * GAME_CONFIG.TICK_RATE;
  return (currentTick - unit.lastAttackTick) >= ticksBetweenAttacks;
}

/**
 * Apply damage from attacker to target unit.
 * Returns splash targets for catapult.
 * dmgMultiplier: optional damage scaling (0.5 for singleplayer bot)
 */
export function attackUnit(attacker: Unit, target: Unit, allEnemies: Unit[], currentTick: number, dmgMultiplier: number = 1): Unit[] {
  attacker.lastAttackTick = currentTick;
  attacker.state = UnitState.ATTACKING;

  const stats = attacker.stats;
  const damaged: Unit[] = [target];

  // Direct damage (scaled by multiplier)
  const dmg = Math.floor(stats.atk * dmgMultiplier);
  target.takeDamage(dmg);

  // Splash damage (catapult)
  if (stats.splashRadius && stats.splashRadius > 0) {
    const splashDmg = Math.floor((stats.atk / 2) * dmgMultiplier);
    for (const enemy of allEnemies) {
      if (enemy === target || !enemy.alive) continue;

      const dist = Math.sqrt(
        Math.pow(enemy.position.x - target.position.x, 2) +
        Math.pow(enemy.position.y - target.position.y, 2)
      );

      if (dist <= stats.splashRadius) {
        enemy.takeDamage(splashDmg);
        damaged.push(enemy);
      }
    }
  }

  return damaged;
}

/**
 * Apply damage from attacker to base
 * dmgMultiplier: optional damage scaling (0.5 for singleplayer bot)
 */
export function attackBase(attacker: Unit, base: Base, currentTick: number, dmgMultiplier: number = 1): void {
  attacker.lastAttackTick = currentTick;
  attacker.state = UnitState.ATTACKING;
  const dmg = Math.floor(attacker.stats.atk * dmgMultiplier);
  base.hp = Math.max(0, base.hp - dmg);
}
