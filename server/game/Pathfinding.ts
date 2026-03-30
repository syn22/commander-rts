import { TileType, Position } from '../../shared/types.js';
import { TERRAIN_CONFIG } from './Config.js';

//
// A* Pathfinding on the grid
//

interface AStarNode {
  x: number;
  y: number;
  g: number;  // cost from start
  h: number;  // heuristic (distance to goal)
  f: number;  // g + h
  parent: AStarNode | null;
}

function heuristic(a: Position, b: Position): number {
  // Euclidean distance
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.sqrt(dx * dx + dy * dy);
}

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

// 8-directional neighbors
const DIRS = [
  { dx: 0, dy: -1 },  // N
  { dx: 1, dy: -1 },  // NE
  { dx: 1, dy: 0 },   // E
  { dx: 0, dy: 1 },   // S
  { dx: -1, dy: 1 },  // SW
  { dx: -1, dy: 0 },  // W
  { dx: -1, dy: -1 }, // NW
  { dx: 1, dy: 1 },   // SE
];

export function findPath(
  map: TileType[][],
  start: Position,
  goal: Position,
  occupiedPositions?: Set<string>,  // positions occupied by other units
): Position[] | null {
  const height = map.length;
  const width = map[0].length;

  // Check bounds
  if (goal.x < 0 || goal.x >= width || goal.y < 0 || goal.y >= height) {
    return null;
  }

  // Check if goal is walkable
  if (!TERRAIN_CONFIG[map[goal.y][goal.x]].walkable) {
    // Find nearest walkable tile to goal
    return null;
  }

  // If start == goal
  if (start.x === goal.x && start.y === goal.y) {
    return [goal];
  }

  const openSet: AStarNode[] = [];
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, goal),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  openSet.push(startNode);

  const gScores = new Map<string, number>();
  gScores.set(posKey(start.x, start.y), 0);

  let iterations = 0;
  const MAX_ITERATIONS = 2000;

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Find node with lowest f score
    let lowestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIdx].f) {
        lowestIdx = i;
      }
    }
    const current = openSet[lowestIdx];

    // Goal reached
    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct path
      const path: Position[] = [];
      let node: AStarNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      // Remove start position from path
      if (path.length > 0 && path[0].x === start.x && path[0].y === start.y) {
        path.shift();
      }
      return path;
    }

    // Move current from open to closed
    openSet.splice(lowestIdx, 1);
    closedSet.add(posKey(current.x, current.y));

    // Check neighbors
    for (const dir of DIRS) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      // Bounds check
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const key = posKey(nx, ny);

      // Already evaluated
      if (closedSet.has(key)) continue;

      // Walkable check
      const terrain = map[ny][nx];
      const terrainConfig = TERRAIN_CONFIG[terrain];
      if (!terrainConfig.walkable) continue;

      // Occupied check (skip for the goal tile)
      if (occupiedPositions && occupiedPositions.has(key) && !(nx === goal.x && ny === goal.y)) {
        continue;
      }

      // Diagonal movement: check if we can cut corners
      if (dir.dx !== 0 && dir.dy !== 0) {
        const adjX = map[current.y][current.x + dir.dx];
        const adjY = map[current.y + dir.dy][current.x];
        if (!TERRAIN_CONFIG[adjX].walkable || !TERRAIN_CONFIG[adjY].walkable) {
          continue; // Can't cut corners around impassable terrain
        }
      }

      const isDiagonal = dir.dx !== 0 && dir.dy !== 0;
      const moveCost = terrainConfig.moveCost * (isDiagonal ? 1.414 : 1);
      const tentativeG = current.g + moveCost;

      const existingG = gScores.get(key);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScores.set(key, tentativeG);

      const neighbor: AStarNode = {
        x: nx,
        y: ny,
        g: tentativeG,
        h: heuristic({ x: nx, y: ny }, goal),
        f: tentativeG + heuristic({ x: nx, y: ny }, goal),
        parent: current,
      };

      // Check if already in open set
      const existingIdx = openSet.findIndex(n => n.x === nx && n.y === ny);
      if (existingIdx >= 0) {
        openSet[existingIdx] = neighbor;
      } else {
        openSet.push(neighbor);
      }
    }
  }

  // No path found
  return null;
}
