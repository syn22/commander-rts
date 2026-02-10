// ============================================================
// Shared types between server and client
// ============================================================

// --- Tile Types ---
export enum TileType {
  GRASS = 'grass',
  WATER = 'water',
  ROCK = 'rock',
  HILL = 'hill',
}

// --- Unit Types ---
export enum UnitType {
  FOOTMAN = 'footman',
  ARCHER = 'archer',
  CAVALRY = 'cavalry',
  CATAPULT = 'catapult',
}

// --- Unit State ---
export enum UnitState {
  IDLE = 'idle',
  MOVING = 'moving',
  ATTACKING = 'attacking',
  DEAD = 'dead',
}

// --- Action Types (from LLM) ---
export enum ActionType {
  MOVE = 'move',
  ATTACK_MOVE = 'attack_move',
  HOLD = 'hold',
  RETREAT = 'retreat',
}

// --- Player ---
export type PlayerId = 1 | 2;

// --- Position ---
export interface Position {
  x: number;
  y: number;
}

// --- Unit Data (sent to client) ---
export interface UnitData {
  id: string;
  type: UnitType;
  owner: PlayerId;
  position: Position;
  hp: number;
  maxHp: number;
  state: UnitState;
}

// --- Base Data ---
export interface BaseData {
  owner: PlayerId;
  position: Position;
  hp: number;
  maxHp: number;
}

// --- Tile Data (sent to client) ---
export interface TileData {
  type: TileType;
  x: number;
  y: number;
}

// --- Fog of War State ---
export enum FogState {
  UNEXPLORED = 'unexplored',
  PREVIOUSLY_SEEN = 'previously_seen',
  VISIBLE = 'visible',
}

// --- LLM Action ---
export interface LLMAction {
  unitId: string;
  type: ActionType;
  target?: Position;
}

// --- LLM Response ---
export interface LLMResponse {
  actions: LLMAction[];
  response: string;
  needsClarification?: boolean;
}

// --- Combat Event (for animations) ---
export interface CombatEvent {
  attackerId: string;
  attackerPos: Position;
  targetPos: Position;
  attackerType: UnitType;
  damage: number;
  targetIsBase?: boolean;
  splash?: boolean;
}

// --- Game State Update (sent to client each tick) ---
export interface GameStateUpdate {
  tick: number;
  units: UnitData[];
  bases: BaseData[];
  fogMap: FogState[][];
  mapTiles: TileType[][];  // only sent once on initial load
  mapWidth: number;
  mapHeight: number;
  gameTime: number;       // seconds elapsed
  gameOver: boolean;
  winner: PlayerId | null;
  combatEvents: CombatEvent[];  // attacks that happened this tick
  playerId?: PlayerId;    // which player this update is for
  gameMode?: GameMode;    // 'singleplayer' or 'multiplayer'
}

// --- Client Events ---
export interface ClientEvents {
  send_command: (data: { command: string; scroll?: string }) => void;
  request_state: () => void;
}

// --- Server Events ---
export interface ServerEvents {
  game_state_update: (state: GameStateUpdate) => void;
  command_response: (response: { message: string; needsClarification?: boolean }) => void;
  game_over: (data: { winner: PlayerId }) => void;
  initial_state: (state: GameStateUpdate) => void;
}

// --- Game Mode ---
export type GameMode = 'singleplayer' | 'multiplayer';

// --- Lobby Types ---
export interface LobbyInfo {
  id: string;
  name: string;
  hasPassword: boolean;
  hostName: string;
  playerCount: number;  // 1 or 2
  status: 'waiting' | 'playing';
}

export interface LobbyJoinResult {
  success: boolean;
  error?: string;
  lobbyId?: string;
  playerId?: PlayerId;
  playerName?: string;
  opponentName?: string;
}

// --- Unit Stats Config ---
export interface UnitStats {
  hp: number;
  atk: number;
  range: number;
  speed: number;      // tiles per second
  vision: number;     // tile radius
  atkSpeed: number;   // seconds between attacks
  minRange?: number;  // minimum range (catapult)
  splashRadius?: number; // splash damage radius (catapult)
}
