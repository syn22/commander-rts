import { Server, Socket } from 'socket.io';
import { GameEngine } from '../game/GameEngine.js';
import { parseCommand } from '../llm/CommandParser.js';
import { findPath } from '../game/Pathfinding.js';
import { ActionType, PlayerId, LLMAction, GameStateUpdate, GameMode, LobbyInfo, LobbyJoinResult } from '../../shared/types.js';
import { Unit, UnitOrder } from '../game/Unit.js';
import { randomBytes } from 'crypto';

// ============================================================
// Socket.io event handler — lobby + singleplayer support
// ============================================================

interface Lobby {
  id: string;
  name: string;
  password?: string;
  hostSocketId: string;
  hostName: string;
  guestSocketId?: string;
  guestName?: string;
  status: 'waiting' | 'playing';
  engine?: GameEngine;
}

interface PlayerSession {
  socketId: string;
  playerName: string;
  lobbyId?: string;
  playerId?: PlayerId;
  // Singleplayer session (no lobby)
  soloEngine?: GameEngine;
}

// Track all active sessions and lobbies
const sessions = new Map<string, PlayerSession>();
const lobbies = new Map<string, Lobby>();

function generateLobbyId(): string {
  return randomBytes(4).toString('hex');
}

function getLobbyList(): LobbyInfo[] {
  const list: LobbyInfo[] = [];
  for (const lobby of lobbies.values()) {
    list.push({
      id: lobby.id,
      name: lobby.name,
      hasPassword: !!lobby.password,
      hostName: lobby.hostName,
      playerCount: lobby.guestSocketId ? 2 : 1,
      status: lobby.status,
    });
  }
  return list;
}

export function setupSocketHandlers(io: Server): void {

  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create session for this socket
    const session: PlayerSession = {
      socketId: socket.id,
      playerName: '',
    };
    sessions.set(socket.id, session);

    // ==========================================
    // Singleplayer (no lobby, just play)
    // ==========================================

    socket.on('start_singleplayer', (data: { playerName: string }) => {
      const sess = sessions.get(socket.id);
      if (!sess) return;

      // Clean up any existing game
      cleanupSession(socket.id, io);

      sess.playerName = data.playerName || 'Commander';
      sess.playerId = 1;

      const engine = new GameEngine('singleplayer');
      sess.soloEngine = engine;

      engine.start((update: GameStateUpdate, player: PlayerId) => {
        // Only send P1 updates to the solo player
        if (player === 1 && socket.connected) {
          socket.emit('game_state_update', update);
        }
      });

      const initialState = engine.getStateForPlayer(1);
      socket.emit('game_starting', {
        playerId: 1 as PlayerId,
        playerName: sess.playerName,
        opponentName: 'AI Commander',
        gameMode: 'singleplayer' as GameMode,
      });
      socket.emit('initial_state', initialState);

      console.log(`[${socket.id}] Started singleplayer as "${sess.playerName}"`);
    });

    // ==========================================
    // Lobby system
    // ==========================================

    socket.on('create_lobby', (data: { playerName: string; lobbyName: string; password?: string }) => {
      const sess = sessions.get(socket.id);
      if (!sess) return;

      // Clean up any existing game/lobby
      cleanupSession(socket.id, io);

      sess.playerName = data.playerName || 'Host';

      const lobbyId = generateLobbyId();
      const lobby: Lobby = {
        id: lobbyId,
        name: data.lobbyName || `${sess.playerName}'s Game`,
        password: data.password || undefined,
        hostSocketId: socket.id,
        hostName: sess.playerName,
        status: 'waiting',
      };

      lobbies.set(lobbyId, lobby);
      sess.lobbyId = lobbyId;
      sess.playerId = 1;

      socket.emit('lobby_created', {
        lobbyId,
        lobbyName: lobby.name,
        playerId: 1 as PlayerId,
      });

      // Broadcast updated lobby list to everyone
      io.emit('lobby_list', getLobbyList());

      console.log(`[${socket.id}] Created lobby "${lobby.name}" (${lobbyId})`);
    });

    socket.on('join_lobby', (data: { lobbyId: string; playerName: string; password?: string }) => {
      const sess = sessions.get(socket.id);
      if (!sess) return;

      const lobby = lobbies.get(data.lobbyId);
      if (!lobby) {
        socket.emit('lobby_error', { message: 'Lobby not found.' });
        return;
      }

      if (lobby.status !== 'waiting') {
        socket.emit('lobby_error', { message: 'Game already in progress.' });
        return;
      }

      if (lobby.guestSocketId) {
        socket.emit('lobby_error', { message: 'Lobby is full.' });
        return;
      }

      // Check password
      if (lobby.password && data.password !== lobby.password) {
        socket.emit('lobby_error', { message: 'Incorrect password.' });
        return;
      }

      // Clean up any previous session
      cleanupSession(socket.id, io);

      sess.playerName = data.playerName || 'Guest';
      sess.lobbyId = lobby.id;
      sess.playerId = 2;

      lobby.guestSocketId = socket.id;
      lobby.guestName = sess.playerName;
      lobby.status = 'playing';

      // Create the game engine in multiplayer mode
      const engine = new GameEngine('multiplayer');
      lobby.engine = engine;

      // Start game loop — route updates to the correct player socket
      engine.start((update: GameStateUpdate, player: PlayerId) => {
        const targetSocketId = player === 1 ? lobby.hostSocketId : lobby.guestSocketId;
        if (targetSocketId) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket?.connected) {
            targetSocket.emit('game_state_update', update);
          }
        }
      });

      // Notify both players that the game is starting
      const hostSocket = io.sockets.sockets.get(lobby.hostSocketId);
      if (hostSocket?.connected) {
        hostSocket.emit('game_starting', {
          playerId: 1 as PlayerId,
          playerName: lobby.hostName,
          opponentName: sess.playerName,
          gameMode: 'multiplayer' as GameMode,
        });
        const hostState = engine.getStateForPlayer(1);
        hostSocket.emit('initial_state', hostState);
      }

      socket.emit('game_starting', {
        playerId: 2 as PlayerId,
        playerName: sess.playerName,
        opponentName: lobby.hostName,
        gameMode: 'multiplayer' as GameMode,
      });
      const guestState = engine.getStateForPlayer(2);
      socket.emit('initial_state', guestState);

      // Broadcast updated lobby list
      io.emit('lobby_list', getLobbyList());

      console.log(`[${socket.id}] "${sess.playerName}" joined lobby "${lobby.name}" — game starting!`);
    });

    socket.on('search_lobbies', (data?: { query?: string }) => {
      let list = getLobbyList();
      if (data?.query) {
        const q = data.query.toLowerCase();
        list = list.filter(l =>
          l.name.toLowerCase().includes(q) ||
          l.hostName.toLowerCase().includes(q)
        );
      }
      socket.emit('lobby_list', list);
    });

    socket.on('leave_lobby', () => {
      cleanupSession(socket.id, io);
      socket.emit('lobby_left');
      io.emit('lobby_list', getLobbyList());
    });

    // ==========================================
    // In-game commands (works for both modes)
    // ==========================================

    socket.on('send_command', async (data: { command: string; scroll?: string }) => {
      const sess = sessions.get(socket.id);
      if (!sess || !sess.playerId) return;

      const engine = getEngineForSession(sess);
      if (!engine) return;

      const player = sess.playerId;
      const { command, scroll } = data;
      console.log(`[${socket.id}] P${player} Command: "${command}"`);

      // Get current fog for the player
      const fogMap = engine.state.fog.computeFog(
        player,
        engine.state.units,
        engine.state.bases,
        engine.state.map,
      );

      try {
        const response = await parseCommand(
          player,
          command,
          engine.state.units,
          engine.state.bases,
          fogMap,
          engine.state.map,
          scroll,
        );

        console.log(`[${socket.id}] LLM response: ${response.response}`);

        if (!response.needsClarification) {
          executeActions(engine, player, response.actions);
        }

        socket.emit('command_response', {
          message: response.response,
          needsClarification: response.needsClarification,
        });
      } catch (error) {
        console.error(`[${socket.id}] Command processing error:`, error);
        socket.emit('command_response', {
          message: 'Failed to process command. Please try again.',
          needsClarification: false,
        });
      }
    });

    socket.on('request_state', () => {
      const sess = sessions.get(socket.id);
      if (!sess || !sess.playerId) return;

      const engine = getEngineForSession(sess);
      if (!engine) return;

      const state = engine.getStateForPlayer(sess.playerId);
      socket.emit('game_state_update', state);
    });

    // ==========================================
    // Restart (works for singleplayer; multiplayer restarts go back to lobby)
    // ==========================================

    socket.on('restart_game', () => {
      const sess = sessions.get(socket.id);
      if (!sess) return;

      if (sess.soloEngine) {
        // Singleplayer restart
        sess.soloEngine.stop();
        const engine = new GameEngine('singleplayer');
        sess.soloEngine = engine;

        engine.start((update: GameStateUpdate, player: PlayerId) => {
          if (player === 1 && socket.connected) {
            socket.emit('game_state_update', update);
          }
        });

        const initialState = engine.getStateForPlayer(1);
        socket.emit('initial_state', initialState);
        console.log(`[${socket.id}] Singleplayer game restarted`);
      }
      // For multiplayer, client should go back to lobby via 'leave_lobby'
    });

    // ==========================================
    // Disconnect
    // ==========================================

    socket.on('disconnect', () => {
      cleanupSession(socket.id, io);
      sessions.delete(socket.id);
      io.emit('lobby_list', getLobbyList());
      console.log(`Player disconnected: ${socket.id}`);
    });
  });
}

// ============================================================
// Helpers
// ============================================================

function getEngineForSession(sess: PlayerSession): GameEngine | null {
  if (sess.soloEngine) return sess.soloEngine;
  if (sess.lobbyId) {
    const lobby = lobbies.get(sess.lobbyId);
    return lobby?.engine ?? null;
  }
  return null;
}

function cleanupSession(socketId: string, io: Server): void {
  const sess = sessions.get(socketId);
  if (!sess) return;

  // Stop solo engine
  if (sess.soloEngine) {
    sess.soloEngine.stop();
    sess.soloEngine = undefined;
  }

  // Handle lobby cleanup
  if (sess.lobbyId) {
    const lobby = lobbies.get(sess.lobbyId);
    if (lobby) {
      if (lobby.engine) {
        lobby.engine.stop();
      }

      if (lobby.status === 'playing') {
        // Notify the other player they won
        const otherSocketId = lobby.hostSocketId === socketId
          ? lobby.guestSocketId
          : lobby.hostSocketId;

        if (otherSocketId) {
          const otherSocket = io.sockets.sockets.get(otherSocketId);
          if (otherSocket?.connected) {
            otherSocket.emit('opponent_disconnected', {
              message: 'Your opponent has disconnected. You win!',
            });
          }

          // Clean up the other player's session reference
          const otherSess = sessions.get(otherSocketId);
          if (otherSess) {
            otherSess.lobbyId = undefined;
            otherSess.playerId = undefined;
          }
        }
      }

      lobbies.delete(lobby.id);
    }

    sess.lobbyId = undefined;
    sess.playerId = undefined;
  }
}

/**
 * Execute validated LLM actions on the game engine
 */
function executeActions(engine: GameEngine, player: PlayerId, actions: LLMAction[]): void {
  for (const action of actions) {
    const unit = engine.state.units.find(u => u.id === action.unitId && u.owner === player && u.alive);
    if (!unit) continue;

    const order: UnitOrder = {
      type: action.type,
      target: action.target,
    };

    // Compute path for move/attack_move (avoid occupied tiles)
    if ((action.type === ActionType.MOVE || action.type === ActionType.ATTACK_MOVE) && action.target) {
      const occupied = engine.state.getOccupiedPositions(unit.id);
      const path = findPath(engine.state.map, unit.position, action.target, occupied);
      if (path) {
        order.path = path;
        order.pathIndex = 0;
      }
    }

    unit.setOrder(order);
  }
}
