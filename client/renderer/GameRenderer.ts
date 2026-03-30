import {
  TileType,
  FogState,
  UnitType,
  UnitState,
  UnitData,
  BaseData,
  PlayerId,
  GameStateUpdate,
  CombatEvent,
} from '../../shared/types.js';

// ============================================================
// Enhanced 2D game renderer
// — Smooth interpolation, shadows, labels, terrain detail
// ============================================================

const TILE_SIZE = 36; // smaller tiles for larger 40x30 map

// ---- Color palette ----
const TERRAIN_COLORS: Record<TileType, string> = {
  [TileType.GRASS]: '#3a5a40',
  [TileType.WATER]: '#1e3a5f',
  [TileType.ROCK]: '#555555',
  [TileType.HILL]: '#5a7a4a',
};

const TERRAIN_COLORS_ALT: Record<TileType, string> = {
  [TileType.GRASS]: '#3f6145',
  [TileType.WATER]: '#1a3555',
  [TileType.ROCK]: '#4e4e4e',
  [TileType.HILL]: '#557548',
};

const PLAYER_COLORS: Record<PlayerId, string> = {
  1: '#4a90d9',
  2: '#d94a4a',
};

const PLAYER_COLORS_LIGHT: Record<PlayerId, string> = {
  1: '#6ab0f9',
  2: '#f96a6a',
};

const PLAYER_GLOW: Record<PlayerId, string> = {
  1: 'rgba(74, 144, 217, 0.35)',
  2: 'rgba(217, 74, 74, 0.35)',
};

const UNIT_LABELS: Record<UnitType, string> = {
  [UnitType.FOOTMAN]: 'FTM',
  [UnitType.ARCHER]: 'ARC',
  [UnitType.CAVALRY]: 'CAV',
  [UnitType.CATAPULT]: 'CAT',
};

const BASE_ICON = '\uD83C\uDFF0';

const PLAYER_ARMOR: Record<PlayerId, string> = {
  1: '#2255bb',
  2: '#bb2222',
};
const PLAYER_ARMOR_LIGHT: Record<PlayerId, string> = {
  1: '#4499ff',
  2: '#ff5555',
};
const PLAYER_ARMOR_DARK: Record<PlayerId, string> = {
  1: '#112266',
  2: '#661111',
};

// ---- Interpolation tracking ----
interface UnitVisual {
  renderX: number;
  renderY: number;
  targetX: number;
  targetY: number;
  lastUpdate: number;
}

// ---- Attack animation ----
interface AttackAnimation {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  attackerType: UnitType;
  startTime: number;
  duration: number;
  splash: boolean;
  damage: number;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Camera
  private cameraX: number = 0;
  private cameraY: number = 0;
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Smooth unit interpolation
  private unitVisuals: Map<string, UnitVisual> = new Map();
  private readonly LERP_SPEED = 8; // higher = snappier

  // Attack animations
  private animations: AttackAnimation[] = [];

  // Time for animated effects
  private timeAccum: number = 0;

  // Player identity
  private myPlayerId: PlayerId = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();

    // Mouse panning
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.cameraX += e.clientX - this.lastMouseX;
        this.cameraY += e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    canvas.addEventListener('mouseup', () => { this.isDragging = false; });
    canvas.addEventListener('mouseleave', () => { this.isDragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('resize', () => this.resize());
  }

  setPlayerId(id: PlayerId): void {
    this.myPlayerId = id;
  }

  resize(): void {
    const container = this.canvas.parentElement!;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  centerOn(tileX: number, tileY: number): void {
    this.cameraX = this.canvas.width / 2 - tileX * TILE_SIZE - TILE_SIZE / 2;
    this.cameraY = this.canvas.height / 2 - tileY * TILE_SIZE - TILE_SIZE / 2;
  }

  // ============================================================
  // Main render
  // ============================================================
  render(state: GameStateUpdate): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = performance.now();

    this.timeAccum = now;

    // Process new combat events
    if (state.combatEvents && state.combatEvents.length > 0) {
      for (const evt of state.combatEvents) {
        const isRanged = evt.attackerType === UnitType.ARCHER || evt.attackerType === UnitType.CATAPULT;
        this.animations.push({
          fromX: evt.attackerPos.x * TILE_SIZE + TILE_SIZE / 2,
          fromY: evt.attackerPos.y * TILE_SIZE + TILE_SIZE / 2,
          toX: evt.targetPos.x * TILE_SIZE + TILE_SIZE / 2,
          toY: evt.targetPos.y * TILE_SIZE + TILE_SIZE / 2,
          attackerType: evt.attackerType,
          startTime: now,
          duration: isRanged ? 500 : 300,
          splash: evt.splash || false,
          damage: evt.damage,
        });
      }
    }

    // Update unit interpolation targets
    this.updateUnitVisuals(state.units, now);

    // Clear
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.cameraX, this.cameraY);

    // Layers (back to front)
    this.drawTerrain(state.mapTiles, state.fogMap);
    this.drawGrid(state.mapWidth, state.mapHeight);
    this.drawUnitShadows(state.units, state.fogMap);
    this.drawBases(state.bases, state.fogMap);
    this.drawUnits(state.units, state.fogMap);
    this.drawAnimations();

    ctx.restore();
  }

  // ============================================================
  // Smooth interpolation
  // ============================================================
  private updateUnitVisuals(units: UnitData[], now: number): void {
    const activeIds = new Set<string>();

    for (const unit of units) {
      activeIds.add(unit.id);
      const targetX = unit.position.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = unit.position.y * TILE_SIZE + TILE_SIZE / 2;

      let vis = this.unitVisuals.get(unit.id);
      if (!vis) {
        // First time seeing this unit — snap to position
        vis = { renderX: targetX, renderY: targetY, targetX, targetY, lastUpdate: now };
        this.unitVisuals.set(unit.id, vis);
      } else {
        vis.targetX = targetX;
        vis.targetY = targetY;

        // Lerp toward target
        const dt = Math.min((now - vis.lastUpdate) / 1000, 0.1); // cap delta
        const factor = 1 - Math.exp(-this.LERP_SPEED * dt);
        vis.renderX += (vis.targetX - vis.renderX) * factor;
        vis.renderY += (vis.targetY - vis.renderY) * factor;
        vis.lastUpdate = now;
      }
    }

    // Remove visuals for units that no longer exist
    for (const id of this.unitVisuals.keys()) {
      if (!activeIds.has(id)) {
        this.unitVisuals.delete(id);
      }
    }
  }

  private getUnitRenderPos(unitId: string): { x: number; y: number } | null {
    return this.unitVisuals.get(unitId) ? { x: this.unitVisuals.get(unitId)!.renderX, y: this.unitVisuals.get(unitId)!.renderY } : null;
  }

  // ============================================================
  // Terrain
  // ============================================================
  private drawTerrain(mapTiles: TileType[][], fogMap: FogState[][]): void {
    const ctx = this.ctx;

    for (let y = 0; y < mapTiles.length; y++) {
      for (let x = 0; x < mapTiles[y].length; x++) {
        const tile = mapTiles[y][x];
        const fog = fogMap[y]?.[x] ?? FogState.UNEXPLORED;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (fog === FogState.UNEXPLORED) {
          ctx.fillStyle = '#08081a';
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          continue;
        }

        // Checkerboard pattern for grass/hill
        const isAlt = (x + y) % 2 === 0;
        ctx.fillStyle = isAlt ? TERRAIN_COLORS_ALT[tile] : TERRAIN_COLORS[tile];
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Terrain details
        if (tile === TileType.HILL) {
          this.drawHillDetail(px, py);
        } else if (tile === TileType.WATER) {
          this.drawWaterDetail(px, py);
        } else if (tile === TileType.ROCK) {
          this.drawRockDetail(px, py);
        } else if (tile === TileType.GRASS) {
          this.drawGrassDetail(px, py, x, y);
        }

        // Fog overlay
        if (fog === FogState.PREVIOUSLY_SEEN) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private drawHillDetail(px: number, py: number): void {
    const ctx = this.ctx;

    // Gradient overlay for depth
    const grad = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
    grad.addColorStop(0, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Triangle hill marker
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(px + TILE_SIZE / 2, py + 8);
    ctx.lineTo(px + TILE_SIZE - 10, py + TILE_SIZE - 10);
    ctx.lineTo(px + 10, py + TILE_SIZE - 10);
    ctx.closePath();
    ctx.fill();

    // Small "^" hint
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('^', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
  }

  private drawWaterDetail(px: number, py: number): void {
    const ctx = this.ctx;
    const time = this.timeAccum / 1500;

    // Animated wave lines
    ctx.strokeStyle = 'rgba(60, 140, 200, 0.4)';
    ctx.lineWidth = 1.5;
    for (let wy = 0; wy < 3; wy++) {
      const yy = py + 10 + wy * 13;
      const phase = time + wy * 0.8 + px * 0.01;
      ctx.beginPath();
      ctx.moveTo(px + 4, yy + Math.sin(phase) * 2);
      ctx.quadraticCurveTo(px + TILE_SIZE / 4, yy - 3 + Math.sin(phase + 1) * 2, px + TILE_SIZE / 2, yy + Math.sin(phase + 2) * 2);
      ctx.quadraticCurveTo(px + (3 * TILE_SIZE) / 4, yy + 3 + Math.sin(phase + 3) * 2, px + TILE_SIZE - 4, yy + Math.sin(phase + 4) * 2);
      ctx.stroke();
    }

    // Subtle shimmer
    ctx.fillStyle = `rgba(100, 180, 255, ${0.05 + Math.sin(time * 2) * 0.03})`;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  private drawRockDetail(px: number, py: number): void {
    const ctx = this.ctx;

    // Dark bottom edge for depth
    const grad = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Random-ish stone shapes (deterministic based on position)
    ctx.fillStyle = '#6a6a6a';
    ctx.beginPath();
    ctx.roundRect(px + 6, py + 6, 14, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#5e5e5e';
    ctx.beginPath();
    ctx.roundRect(px + 26, py + 16, 12, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#686868';
    ctx.beginPath();
    ctx.roundRect(px + 10, py + 28, 16, 12, 3);
    ctx.fill();

    // Highlight edge
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  }

  private drawGrassDetail(px: number, py: number, tileX: number, tileY: number): void {
    const ctx = this.ctx;

    // Subtle grass tufts (deterministic pseudo-random)
    const seed = (tileX * 7 + tileY * 13) % 5;
    ctx.fillStyle = 'rgba(80, 140, 70, 0.3)';
    if (seed === 0) {
      ctx.fillRect(px + 8, py + 12, 2, 6);
      ctx.fillRect(px + 32, py + 30, 2, 5);
    } else if (seed === 1) {
      ctx.fillRect(px + 20, py + 8, 2, 5);
      ctx.fillRect(px + 38, py + 22, 2, 6);
    } else if (seed === 2) {
      ctx.fillRect(px + 14, py + 34, 2, 5);
      ctx.fillRect(px + 28, py + 10, 2, 6);
    }
  }

  // ============================================================
  // Grid
  // ============================================================
  private drawGrid(mapWidth: number, mapHeight: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= mapWidth; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE_SIZE, 0);
      ctx.lineTo(x * TILE_SIZE, mapHeight * TILE_SIZE);
      ctx.stroke();
    }
    for (let y = 0; y <= mapHeight; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE_SIZE);
      ctx.lineTo(mapWidth * TILE_SIZE, y * TILE_SIZE);
      ctx.stroke();
    }
  }

  // ============================================================
  // Unit shadows (drawn before units for layering)
  // ============================================================
  private drawUnitShadows(units: UnitData[], fogMap: FogState[][]): void {
    const ctx = this.ctx;

    for (const unit of units) {
      const fog = fogMap[unit.position.y]?.[unit.position.x] ?? FogState.UNEXPLORED;
      if (fog !== FogState.VISIBLE) continue;

      const vis = this.getUnitRenderPos(unit.id);
      if (!vis) continue;

      // Shadow ellipse below unit
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(vis.x + 2, vis.y + TILE_SIZE * 0.3, TILE_SIZE * 0.3, TILE_SIZE * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============================================================
  // Bases
  // ============================================================
  private drawBases(bases: BaseData[], fogMap: FogState[][]): void {
    const ctx = this.ctx;

    for (const base of bases) {
      const fog = fogMap[base.position.y]?.[base.position.x] ?? FogState.UNEXPLORED;
      if (fog === FogState.UNEXPLORED) continue;

      const px = base.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = base.position.y * TILE_SIZE + TILE_SIZE / 2;
      const color = PLAYER_COLORS[base.owner];

      // Glow ring
      ctx.fillStyle = PLAYER_GLOW[base.owner];
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(px + 2, py + TILE_SIZE * 0.35, TILE_SIZE * 0.35, TILE_SIZE * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Colored background
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Castle emoji
      ctx.font = `${Math.round(TILE_SIZE * 0.65)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(BASE_ICON, px, py - 2);

      // HP bar
      this.drawHPBar(px, py - TILE_SIZE * 0.45 - 10, TILE_SIZE * 0.9, 6, base.hp, base.maxHp);

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(base.owner === this.myPlayerId ? 'YOUR BASE' : 'ENEMY', px, py + TILE_SIZE * 0.45 + 10);

      // Dim if previously seen
      if (fog === FogState.PREVIOUSLY_SEEN) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(px, py, TILE_SIZE * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ============================================================
  // Units — Ragnarok-style 2.5D sprites
  // ============================================================
  private drawUnits(units: UnitData[], fogMap: FogState[][]): void {
    const ctx = this.ctx;
    const now = this.timeAccum;

    for (const unit of units) {
      const fog = fogMap[unit.position.y]?.[unit.position.x] ?? FogState.UNEXPLORED;
      if (fog !== FogState.VISIBLE) continue;

      const vis = this.getUnitRenderPos(unit.id);
      if (!vis) continue;

      const px = vis.x;
      const py = vis.y;

      // Subtle glow ring for own units
      if (unit.owner === this.myPlayerId) {
        ctx.fillStyle = PLAYER_GLOW[this.myPlayerId];
        ctx.beginPath();
        ctx.arc(px, py, TILE_SIZE * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      this.drawCharacterSprite(unit, px, py, now);
      ctx.restore();

      // HP bar above sprite
      this.drawHPBar(px, py - TILE_SIZE * 0.6 - 6, TILE_SIZE * 0.75, 4, unit.hp, unit.maxHp);

      // Unit label below
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(UNIT_LABELS[unit.type], px, py + TILE_SIZE * 0.42);
    }
  }

  private drawCharacterSprite(unit: UnitData, cx: number, cy: number, now: number): void {
    const ctx = this.ctx;
    const isMoving = unit.state === UnitState.MOVING;
    const isAttacking = unit.state === UnitState.ATTACKING;

    // Bob & breathe animation
    const breath = Math.sin(now / 900) * 1;
    const walkBob = isMoving ? Math.sin(now / 180) * 2.5 : 0;
    const attackBob = isAttacking ? Math.abs(Math.sin(now / 120)) * -2 : 0;
    const dy = breath + walkBob + attackBob;

    const armor = PLAYER_ARMOR[unit.owner];
    const armorLight = PLAYER_ARMOR_LIGHT[unit.owner];
    const armorDark = PLAYER_ARMOR_DARK[unit.owner];

    switch (unit.type) {
      case UnitType.FOOTMAN:
        this.drawFootman(cx, cy + dy, armor, armorLight, armorDark, isAttacking, now);
        break;
      case UnitType.ARCHER:
        this.drawArcher(cx, cy + dy, armor, armorLight, armorDark, isAttacking, now);
        break;
      case UnitType.CAVALRY:
        this.drawCavalry(cx, cy + dy, armor, armorLight, armorDark, isAttacking, now);
        break;
      case UnitType.CATAPULT:
        this.drawCatapult(cx, cy, armor, armorDark, now);
        break;
    }
  }

  // ---- Footman: heavy armored warrior, sword + shield ----
  private drawFootman(
    cx: number, cy: number,
    armor: string, armorLight: string, armorDark: string,
    isAttacking: boolean, now: number,
  ): void {
    const ctx = this.ctx;
    const s = TILE_SIZE / 36; // scale factor

    // Boots
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(cx - 6 * s, cy + 10 * s, 5 * s, 5 * s);
    ctx.fillRect(cx + 1 * s, cy + 10 * s, 5 * s, 5 * s);

    // Legs (greaves)
    ctx.fillStyle = '#666';
    ctx.fillRect(cx - 6 * s, cy + 3 * s, 5 * s, 8 * s);
    ctx.fillRect(cx + 1 * s, cy + 3 * s, 5 * s, 8 * s);

    // Body armor (breastplate)
    ctx.fillStyle = armor;
    ctx.beginPath();
    ctx.roundRect(cx - 8 * s, cy - 10 * s, 16 * s, 15 * s, 2 * s);
    ctx.fill();

    // Armor highlight (left-top shine)
    ctx.fillStyle = armorLight;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(cx - 7 * s, cy - 9 * s, 5 * s, 5 * s);
    ctx.globalAlpha = 1;

    // Armor outline
    ctx.strokeStyle = armorDark;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.roundRect(cx - 8 * s, cy - 10 * s, 16 * s, 15 * s, 2 * s);
    ctx.stroke();

    // Shield (left side)
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.roundRect(cx - 14 * s, cy - 9 * s, 7 * s, 12 * s, 2 * s);
    ctx.fill();
    ctx.strokeStyle = '#4a2a0a';
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    // Shield boss
    ctx.fillStyle = '#c8a000';
    ctx.beginPath();
    ctx.arc(cx - 10.5 * s, cy - 3 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Sword (right side — raised when attacking)
    const swordAngle = isAttacking ? -Math.PI / 3 : -Math.PI / 6;
    const swordX = cx + 8 * s;
    const swordY = cy - 4 * s;
    ctx.save();
    ctx.translate(swordX, swordY);
    ctx.rotate(swordAngle);
    // Blade
    ctx.strokeStyle = '#d0d8e0';
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -14 * s);
    ctx.stroke();
    // Crossguard
    ctx.strokeStyle = '#c8a000';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-3 * s, 0);
    ctx.lineTo(3 * s, 0);
    ctx.stroke();
    ctx.restore();

    // Neck
    ctx.fillStyle = '#f0c080';
    ctx.fillRect(cx - 2 * s, cy - 13 * s, 4 * s, 4 * s);

    // Head
    ctx.fillStyle = '#f0c080';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18 * s, 5.5 * s, 5.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Helmet
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(cx, cy - 19 * s, 6 * s, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // Helmet visor bar
    ctx.fillStyle = '#555';
    ctx.fillRect(cx - 5.5 * s, cy - 19 * s, 11 * s, 3 * s);
    // Helmet outline
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.arc(cx, cy - 19 * s, 6 * s, Math.PI, 0);
    ctx.stroke();

    // Attack flash eyes
    if (isAttacking) {
      ctx.fillStyle = '#ff4400';
      ctx.beginPath();
      ctx.arc(cx - 2 * s, cy - 18 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.arc(cx + 2 * s, cy - 18 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Archer: light armor, bow, hood ----
  private drawArcher(
    cx: number, cy: number,
    armor: string, armorLight: string, armorDark: string,
    isAttacking: boolean, now: number,
  ): void {
    const ctx = this.ctx;
    const s = TILE_SIZE / 36;

    // Boots
    ctx.fillStyle = '#3a2510';
    ctx.fillRect(cx - 5 * s, cy + 10 * s, 4 * s, 5 * s);
    ctx.fillRect(cx + 1 * s, cy + 10 * s, 4 * s, 5 * s);

    // Legs (leather)
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(cx - 5 * s, cy + 3 * s, 4 * s, 8 * s);
    ctx.fillRect(cx + 1 * s, cy + 3 * s, 4 * s, 8 * s);

    // Tunic/light body
    ctx.fillStyle = armor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(cx - 6 * s, cy - 10 * s, 12 * s, 14 * s, 3 * s);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = armorDark;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.roundRect(cx - 6 * s, cy - 10 * s, 12 * s, 14 * s, 3 * s);
    ctx.stroke();

    // Quiver (right side)
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(cx + 7 * s, cy - 8 * s, 4 * s, 9 * s);
    // Arrows in quiver
    ctx.strokeStyle = '#c8a000';
    ctx.lineWidth = 1 * s;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + 8 * s + i * 1.5 * s, cy - 8 * s);
      ctx.lineTo(cx + 8 * s + i * 1.5 * s, cy - 14 * s);
      ctx.stroke();
    }

    // Bow (left side — draw arc)
    const bowPull = isAttacking ? 0.3 : 0;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(cx - 12 * s + bowPull * 4 * s, cy - 4 * s, 10 * s, -0.9, 0.9);
    ctx.stroke();
    // Bowstring
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(cx - 12 * s + bowPull * 4 * s, cy - 4 * s - 9 * s);
    ctx.lineTo(cx - 4 * s - bowPull * 3 * s, cy - 4 * s);
    ctx.lineTo(cx - 12 * s + bowPull * 4 * s, cy - 4 * s + 9 * s);
    ctx.stroke();
    // Arrow on string when attacking
    if (isAttacking) {
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(cx - 4 * s - bowPull * 3 * s, cy - 4 * s);
      ctx.lineTo(cx + 4 * s, cy - 4 * s);
      ctx.stroke();
    }

    // Neck
    ctx.fillStyle = '#f0c080';
    ctx.fillRect(cx - 2 * s, cy - 13 * s, 4 * s, 4 * s);

    // Head
    ctx.fillStyle = '#f0c080';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18 * s, 5 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hood
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.arc(cx, cy - 20 * s, 6 * s, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // Hood sides
    ctx.beginPath();
    ctx.moveTo(cx - 6 * s, cy - 20 * s);
    ctx.lineTo(cx - 7 * s, cy - 14 * s);
    ctx.lineTo(cx - 3 * s, cy - 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 6 * s, cy - 20 * s);
    ctx.lineTo(cx + 7 * s, cy - 14 * s);
    ctx.lineTo(cx + 3 * s, cy - 14 * s);
    ctx.closePath();
    ctx.fill();
  }

  // ---- Cavalry: rider on horseback with lance ----
  private drawCavalry(
    cx: number, cy: number,
    armor: string, armorLight: string, armorDark: string,
    isAttacking: boolean, now: number,
  ): void {
    const ctx = this.ctx;
    const s = TILE_SIZE / 36;
    const gallop = Math.sin(now / 160) * 3 * s;

    // Horse legs (4 lines with alternating animation)
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    const legPhase = now / 160;
    const legSwing = 5 * s;
    // Front legs
    ctx.beginPath();
    ctx.moveTo(cx + 5 * s, cy + 6 * s);
    ctx.lineTo(cx + 5 * s + Math.sin(legPhase) * legSwing, cy + 15 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 2 * s, cy + 6 * s);
    ctx.lineTo(cx + 2 * s + Math.sin(legPhase + 1) * legSwing, cy + 15 * s);
    ctx.stroke();
    // Back legs
    ctx.beginPath();
    ctx.moveTo(cx - 5 * s, cy + 6 * s);
    ctx.lineTo(cx - 5 * s + Math.sin(legPhase + Math.PI) * legSwing, cy + 15 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 8 * s, cy + 6 * s);
    ctx.lineTo(cx - 8 * s + Math.sin(legPhase + Math.PI + 1) * legSwing, cy + 15 * s);
    ctx.stroke();

    // Horse body (elongated ellipse)
    ctx.fillStyle = '#7a4a1a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3 * s + gallop * 0.3, 13 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3a0a';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // Horse neck + head
    ctx.fillStyle = '#7a4a1a';
    ctx.beginPath();
    ctx.ellipse(cx + 10 * s, cy - 4 * s + gallop * 0.3, 4 * s, 7 * s, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Mane
    ctx.fillStyle = '#3a1a00';
    ctx.beginPath();
    ctx.ellipse(cx + 9 * s, cy - 5 * s, 3 * s, 6 * s, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Rider body
    ctx.fillStyle = armor;
    ctx.beginPath();
    ctx.roundRect(cx - 6 * s, cy - 16 * s, 11 * s, 11 * s, 2 * s);
    ctx.fill();
    ctx.strokeStyle = armorDark;
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // Lance (tilted forward when attacking)
    const lanceAngle = isAttacking ? -0.15 : -0.4;
    ctx.save();
    ctx.translate(cx + 4 * s, cy - 10 * s);
    ctx.rotate(lanceAngle);
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -22 * s);
    ctx.stroke();
    // Lance tip
    ctx.fillStyle = '#d0d8e0';
    ctx.beginPath();
    ctx.moveTo(0, -22 * s);
    ctx.lineTo(-2 * s, -18 * s);
    ctx.lineTo(2 * s, -18 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Rider head
    ctx.fillStyle = '#f0c080';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 20 * s, 4.5 * s, 4.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Helmet (closed knight helmet)
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(cx, cy - 21 * s, 5 * s, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = armorLight;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(cx - 1 * s, cy - 22 * s, 2.5 * s, Math.PI * 0.8, Math.PI * 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- Catapult: wooden siege weapon ----
  private drawCatapult(
    cx: number, cy: number,
    armor: string, armorDark: string, now: number,
  ): void {
    const ctx = this.ctx;
    const s = TILE_SIZE / 36;

    // Wheels
    const wheelY = cy + 9 * s;
    for (const wx of [cx - 9 * s, cx + 9 * s]) {
      // Outer wheel
      ctx.fillStyle = '#5a3a10';
      ctx.beginPath();
      ctx.arc(wx, wheelY, 7 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2008';
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      // Spokes
      ctx.strokeStyle = '#3a2008';
      ctx.lineWidth = 1 * s;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + now / 2000;
        ctx.beginPath();
        ctx.moveTo(wx, wheelY);
        ctx.lineTo(wx + Math.cos(a) * 6 * s, wheelY + Math.sin(a) * 6 * s);
        ctx.stroke();
      }
      // Hub
      ctx.fillStyle = '#c8a000';
      ctx.beginPath();
      ctx.arc(wx, wheelY, 2 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Frame base (axle)
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(cx - 12 * s, cy + 5 * s, 24 * s, 5 * s);
    ctx.strokeStyle = '#3a2008';
    ctx.lineWidth = 1 * s;
    ctx.strokeRect(cx - 12 * s, cy + 5 * s, 24 * s, 5 * s);

    // Frame uprights
    ctx.fillStyle = '#8B5a2a';
    ctx.fillRect(cx - 10 * s, cy - 5 * s, 4 * s, 12 * s);
    ctx.fillRect(cx + 6 * s, cy - 5 * s, 4 * s, 12 * s);

    // Cross beam
    ctx.fillRect(cx - 10 * s, cy - 5 * s, 20 * s, 3 * s);

    // Arm (throwing arm — slightly angled)
    const armAngle = -0.9 + Math.sin(now / 1200) * 0.15;
    ctx.save();
    ctx.translate(cx, cy - 3 * s);
    ctx.rotate(armAngle);
    ctx.fillStyle = '#7a4a1a';
    ctx.fillRect(-2 * s, -20 * s, 4 * s, 22 * s);
    // Bucket/cup at end
    ctx.fillStyle = '#5a3010';
    ctx.beginPath();
    ctx.arc(0, -20 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    // Rock in bucket
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(0, -20 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Counterweight
    ctx.save();
    ctx.translate(cx, cy - 3 * s);
    ctx.rotate(armAngle + Math.PI);
    ctx.fillStyle = '#5a3010';
    ctx.fillRect(-3 * s, 2 * s, 6 * s, 8 * s);
    ctx.restore();
  }

  // ============================================================
  // HP bar helper
  // ============================================================
  private drawHPBar(cx: number, y: number, width: number, height: number, hp: number, maxHp: number): void {
    const ctx = this.ctx;
    const hpPct = hp / maxHp;
    const barX = cx - width / 2;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(barX - 1, y - 1, width + 2, height + 2, 2);
    ctx.fill();

    // HP fill
    const hpColor = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = hpColor;
    ctx.beginPath();
    ctx.roundRect(barX, y, width * hpPct, height, 1);
    ctx.fill();

    // Highlight shine on top half
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, y, width * hpPct, height / 2);
  }

  // ============================================================
  // Attack animations
  // ============================================================
  private drawAnimations(): void {
    const ctx = this.ctx;
    const now = this.timeAccum;

    // Remove expired
    this.animations = this.animations.filter(a => now - a.startTime < a.duration + 400);

    for (const anim of this.animations) {
      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.duration, 1);
      const isRanged = anim.attackerType === UnitType.ARCHER || anim.attackerType === UnitType.CATAPULT;

      if (isRanged) {
        this.drawRangedAnimation(anim, progress, elapsed);
      } else {
        this.drawMeleeAnimation(anim, progress, elapsed);
      }
    }
  }

  private drawRangedAnimation(anim: AttackAnimation, progress: number, elapsed: number): void {
    const ctx = this.ctx;
    const isCatapult = anim.attackerType === UnitType.CATAPULT;
    const arcHeight = isCatapult ? 50 : 20;

    const projX = anim.fromX + (anim.toX - anim.fromX) * progress;
    const projY = anim.fromY + (anim.toY - anim.fromY) * progress;
    const arcY = -Math.sin(progress * Math.PI) * arcHeight;

    // Projectile in flight
    if (progress < 1) {
      // Trail
      const trailLen = 0.25;
      const trailProg = Math.max(0, progress - trailLen);
      const trailX = anim.fromX + (anim.toX - anim.fromX) * trailProg;
      const trailY = anim.fromY + (anim.toY - anim.fromY) * trailProg;
      const trailArcY = -Math.sin(trailProg * Math.PI) * arcHeight;

      // Gradient trail
      const grad = ctx.createLinearGradient(trailX, trailY + trailArcY, projX, projY + arcY);
      grad.addColorStop(0, 'rgba(255, 200, 50, 0)');
      grad.addColorStop(1, isCatapult ? '#ff6600' : '#ffdd00');

      ctx.strokeStyle = grad;
      ctx.lineWidth = isCatapult ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(trailX, trailY + trailArcY);
      ctx.lineTo(projX, projY + arcY);
      ctx.stroke();

      // Projectile glow
      ctx.fillStyle = isCatapult ? '#ff8800' : '#ffee44';
      ctx.shadowColor = isCatapult ? '#ff4400' : '#ffaa00';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(projX, projY + arcY, isCatapult ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Impact
    if (progress >= 0.7) {
      const impactProg = (progress - 0.7) / 0.3;
      const alpha = (1 - impactProg) * 0.8;
      const radius = 10 + impactProg * (anim.splash ? 35 : 18);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = isCatapult ? '#ff4400' : '#ffaa00';
      ctx.beginPath();
      ctx.arc(anim.toX, anim.toY, radius, 0, Math.PI * 2);
      ctx.fill();

      if (anim.splash) {
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(anim.toX, anim.toY, radius * 1.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Floating damage number
    if (elapsed > anim.duration && elapsed < anim.duration + 400) {
      const fadeProg = (elapsed - anim.duration) / 400;
      ctx.globalAlpha = 1 - fadeProg;
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`-${anim.damage}`, anim.toX, anim.toY - 20 - fadeProg * 20);
      ctx.globalAlpha = 1;
    }
  }

  private drawMeleeAnimation(anim: AttackAnimation, progress: number, elapsed: number): void {
    const ctx = this.ctx;

    if (progress < 1) {
      const slashAlpha = (1 - progress) * 0.9;
      const slashSize = 12 + progress * 22;

      ctx.globalAlpha = slashAlpha;

      const hitX = anim.toX + (anim.toX - anim.fromX) * 0.15;
      const hitY = anim.toY + (anim.toY - anim.fromY) * 0.15;

      // Slash arcs
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3 + progress * 2.5;
        const innerR = slashSize * 0.25;
        const outerR = slashSize;
        ctx.beginPath();
        ctx.moveTo(hitX + Math.cos(angle) * innerR, hitY + Math.sin(angle) * innerR);
        ctx.lineTo(hitX + Math.cos(angle) * outerR, hitY + Math.sin(angle) * outerR);
        ctx.stroke();
      }

      // Impact flash
      if (progress < 0.25) {
        const flashAlpha = (0.25 - progress) / 0.25;
        ctx.globalAlpha = flashAlpha * 0.7;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(hitX, hitY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = 1;
    }

    // Floating damage
    if (elapsed > anim.duration && elapsed < anim.duration + 400) {
      const fadeProg = (elapsed - anim.duration) / 400;
      ctx.globalAlpha = 1 - fadeProg;
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`-${anim.damage}`, anim.toX, anim.toY - 20 - fadeProg * 20);
      ctx.globalAlpha = 1;
    }
  }
}
