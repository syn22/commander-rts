import { GameStateUpdate, PlayerId } from '../../shared/types.js';

//
// HUD / UI updates
//

export class UIRenderer {
  private baseHpEl: HTMLElement;
  private enemyHpEl: HTMLElement;
  private unitsEl: HTMLElement;
  private timeEl: HTMLElement;
  private myPlayerId: PlayerId = 1;

  constructor() {
    this.baseHpEl = document.getElementById('hud-base-hp')!;
    this.enemyHpEl = document.getElementById('hud-enemy-hp')!;
    this.unitsEl = document.getElementById('hud-units')!;
    this.timeEl = document.getElementById('hud-time')!;
  }

  setPlayerId(id: PlayerId): void {
    this.myPlayerId = id;
  }

  update(state: GameStateUpdate): void {
    // Player base HP
    const playerBase = state.bases.find(b => b.owner === this.myPlayerId);
    if (playerBase) {
      this.baseHpEl.textContent = `${playerBase.hp}/${playerBase.maxHp}`;
    }

    // Enemy base HP
    const enemyBase = state.bases.find(b => b.owner !== this.myPlayerId);
    if (enemyBase) {
      this.enemyHpEl.textContent = `${enemyBase.hp}/${enemyBase.maxHp}`;
    }

    // Unit count (player's alive units)
    const playerUnits = state.units.filter(u => u.owner === this.myPlayerId);
    this.unitsEl.textContent = `${playerUnits.length}`;

    // Game time
    const mins = Math.floor(state.gameTime / 60);
    const secs = state.gameTime % 60;
    this.timeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
