import { io, Socket } from 'socket.io-client';
import type { GameStateUpdate, PlayerId, GameMode, LobbyInfo } from '../../shared/types.js';

// ============================================================
// Socket.io client — lobby + singleplayer support
// ============================================================

export interface GameStartingData {
  playerId: PlayerId;
  playerName: string;
  opponentName: string;
  gameMode: GameMode;
}

export class SocketClient {
  private socket: Socket;
  private onStateUpdate: ((state: GameStateUpdate) => void) | null = null;
  private onInitialState: ((state: GameStateUpdate) => void) | null = null;
  private onCommandResponse: ((response: { message: string; needsClarification?: boolean; debug?: any }) => void) | null = null;
  private onGameStarting: ((data: GameStartingData) => void) | null = null;
  private onLobbyCreated: ((data: { lobbyId: string; lobbyName: string; playerId: PlayerId }) => void) | null = null;
  private onLobbyList: ((lobbies: LobbyInfo[]) => void) | null = null;
  private onLobbyError: ((data: { message: string }) => void) | null = null;
  private onLobbyLeft: (() => void) | null = null;
  private onOpponentDisconnected: ((data: { message: string }) => void) | null = null;

  constructor() {
    // Connect to the server — auto-detect host for deployment
    const serverUrl = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('game_state_update', (state: GameStateUpdate) => {
      if (this.onStateUpdate) this.onStateUpdate(state);
    });

    this.socket.on('initial_state', (state: GameStateUpdate) => {
      if (this.onInitialState) this.onInitialState(state);
    });

    this.socket.on('command_response', (response: { message: string; needsClarification?: boolean; debug?: any }) => {
      if (this.onCommandResponse) this.onCommandResponse(response);
    });

    // Lobby events
    this.socket.on('game_starting', (data: GameStartingData) => {
      if (this.onGameStarting) this.onGameStarting(data);
    });

    this.socket.on('lobby_created', (data: { lobbyId: string; lobbyName: string; playerId: PlayerId }) => {
      if (this.onLobbyCreated) this.onLobbyCreated(data);
    });

    this.socket.on('lobby_list', (lobbies: LobbyInfo[]) => {
      if (this.onLobbyList) this.onLobbyList(lobbies);
    });

    this.socket.on('lobby_error', (data: { message: string }) => {
      if (this.onLobbyError) this.onLobbyError(data);
    });

    this.socket.on('lobby_left', () => {
      if (this.onLobbyLeft) this.onLobbyLeft();
    });

    this.socket.on('opponent_disconnected', (data: { message: string }) => {
      if (this.onOpponentDisconnected) this.onOpponentDisconnected(data);
    });
  }

  // Setters for callbacks
  setOnStateUpdate(cb: (state: GameStateUpdate) => void): void { this.onStateUpdate = cb; }
  setOnInitialState(cb: (state: GameStateUpdate) => void): void { this.onInitialState = cb; }
  setOnCommandResponse(cb: (response: { message: string; needsClarification?: boolean; debug?: any }) => void): void { this.onCommandResponse = cb; }
  setOnGameStarting(cb: (data: GameStartingData) => void): void { this.onGameStarting = cb; }
  setOnLobbyCreated(cb: (data: { lobbyId: string; lobbyName: string; playerId: PlayerId }) => void): void { this.onLobbyCreated = cb; }
  setOnLobbyList(cb: (lobbies: LobbyInfo[]) => void): void { this.onLobbyList = cb; }
  setOnLobbyError(cb: (data: { message: string }) => void): void { this.onLobbyError = cb; }
  setOnLobbyLeft(cb: () => void): void { this.onLobbyLeft = cb; }
  setOnOpponentDisconnected(cb: (data: { message: string }) => void): void { this.onOpponentDisconnected = cb; }

  // Game actions
  sendCommand(command: string, scroll?: string, model?: string): void {
    this.socket.emit('send_command', { command, scroll, model });
  }

  requestState(): void {
    this.socket.emit('request_state');
  }

  restartGame(): void {
    this.socket.emit('restart_game');
  }

  // Lobby actions
  startSingleplayer(playerName: string): void {
    this.socket.emit('start_singleplayer', { playerName });
  }

  createLobby(playerName: string, lobbyName: string, password?: string): void {
    this.socket.emit('create_lobby', { playerName, lobbyName, password });
  }

  joinLobby(lobbyId: string, playerName: string, password?: string): void {
    this.socket.emit('join_lobby', { lobbyId, playerName, password });
  }

  searchLobbies(query?: string): void {
    this.socket.emit('search_lobbies', { query });
  }

  leaveLobby(): void {
    this.socket.emit('leave_lobby');
  }
}
