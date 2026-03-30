import {
  TileType,
  FogState,
  UnitData,
  BaseData,
  PlayerId,
  GameStateUpdate,
} from '../../shared/types.js';

//
// Minimap renderer
//

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;

const TERRAIN_MINIMAP_COLORS: Record<TileType, string> = {
  [TileType.GRASS]: '#2a4a30',
  [TileType.WATER]: '#152a4f',
  [TileType.ROCK]: '#444',
  [TileType.HILL]: '#3a5a3a',
};

export class MinimapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private myPlayerId: PlayerId = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = MINIMAP_WIDTH;
    this.canvas.height = MINIMAP_HEIGHT;
  }

  setPlayerId(id: PlayerId): void {
    this.myPlayerId = id;
  }

  render(state: GameStateUpdate): void {
    const ctx = this.ctx;
    const tileW = MINIMAP_WIDTH / state.mapWidth;
    const tileH = MINIMAP_HEIGHT / state.mapHeight;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw terrain
    for (let y = 0; y < state.mapHeight; y++) {
      for (let x = 0; x < state.mapWidth; x++) {
        const tile = state.mapTiles[y][x];
        const fog = state.fogMap[y]?.[x] ?? FogState.UNEXPLORED;

        if (fog === FogState.UNEXPLORED) continue;

        ctx.fillStyle = TERRAIN_MINIMAP_COLORS[tile];
        if (fog === FogState.PREVIOUSLY_SEEN) {
          ctx.globalAlpha = 0.5;
        } else {
          ctx.globalAlpha = 1;
        }
        ctx.fillRect(x * tileW, y * tileH, tileW + 0.5, tileH + 0.5);
      }
    }

    ctx.globalAlpha = 1;

    // Draw units as dots
    for (const unit of state.units) {
      const fog = state.fogMap[unit.position.y]?.[unit.position.x] ?? FogState.UNEXPLORED;
      if (fog !== FogState.VISIBLE) continue;

      ctx.fillStyle = unit.owner === this.myPlayerId ? '#4a90d9' : '#d94a4a';
      const px = unit.position.x * tileW;
      const py = unit.position.y * tileH;
      ctx.fillRect(px, py, Math.max(tileW, 2), Math.max(tileH, 2));
    }

    // Draw bases
    for (const base of state.bases) {
      ctx.fillStyle = base.owner === this.myPlayerId ? '#6ab0f9' : '#f96a6a';
      const px = base.position.x * tileW - 2;
      const py = base.position.y * tileH - 2;
      ctx.fillRect(px, py, 5, 5);
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
  }
}
