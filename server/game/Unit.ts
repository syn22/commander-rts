import { UnitType, UnitState, ActionType, PlayerId, Position, UnitData } from '../../shared/types.js';
import { UNIT_STATS } from './Config.js';

export interface UnitOrder {
  type: ActionType;
  target?: Position;
  path?: Position[];  // computed path from A*
  pathIndex?: number;  // current position in path
}

export class Unit {
  id: string;
  type: UnitType;
  owner: PlayerId;
  position: Position;
  hp: number;
  maxHp: number;
  state: UnitState;
  order: UnitOrder | null = null;

  // Combat timing
  lastAttackTick: number = 0;

  // Movement: fractional position for smooth movement between tiles
  moveProgress: number = 0;

  constructor(id: string, type: UnitType, owner: PlayerId, position: Position) {
    this.id = id;
    this.type = type;
    this.owner = owner;
    this.position = { ...position };
    const stats = UNIT_STATS[type];
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.state = UnitState.IDLE;
  }

  get stats() {
    return UNIT_STATS[this.type];
  }

  get alive(): boolean {
    return this.state !== UnitState.DEAD && this.hp > 0;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.state = UnitState.DEAD;
      this.order = null;
    }
  }

  setOrder(order: UnitOrder): void {
    this.order = order;
    this.moveProgress = 0;
    if (order.type === ActionType.HOLD) {
      this.state = UnitState.IDLE;
    } else {
      this.state = UnitState.MOVING;
    }
  }

  clearOrder(): void {
    this.order = null;
    this.state = UnitState.IDLE;
    this.moveProgress = 0;
  }

  toData(): UnitData {
    return {
      id: this.id,
      type: this.type,
      owner: this.owner,
      position: { ...this.position },
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
    };
  }

  distanceTo(pos: Position): number {
    const dx = this.position.x - pos.x;
    const dy = this.position.y - pos.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceToUnit(other: Unit): number {
    return this.distanceTo(other.position);
  }
}
