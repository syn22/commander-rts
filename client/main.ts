import { SocketClient, GameStartingData } from './network/SocketClient.js';
import { GameRenderer } from './renderer/GameRenderer.js';
import { MinimapRenderer } from './renderer/MinimapRenderer.js';
import { UIRenderer } from './renderer/UIRenderer.js';
import { CommandInput } from './input/CommandInput.js';
import { ScrollEditor } from './input/ScrollEditor.js';
import { GameStateUpdate, PlayerId, GameMode, LobbyInfo } from '../shared/types.js';

// ============================================================
// Client entry point — lobby + game flow
// ============================================================

// State
let latestState: GameStateUpdate | null = null;
let myPlayerId: PlayerId = 1;
let myGameMode: GameMode = 'singleplayer';
let opponentName: string = '';
let gameInitialized = false;

// Lobby state
let joiningLobbyId: string | null = null;  // tracks which lobby we're joining (for password modal)

// Create components
const socket = new SocketClient();
const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
const gameRenderer = new GameRenderer(gameCanvas);
const minimapRenderer = new MinimapRenderer(minimapCanvas);
const uiRenderer = new UIRenderer();
const commandInput = new CommandInput();
const scrollEditor = new ScrollEditor();

// ============================================================
// DOM Elements
// ============================================================

// Screens
const lobbyScreen = document.getElementById('lobby-screen')!;
const waitingScreen = document.getElementById('waiting-screen')!;
const gameScreen = document.getElementById('game-screen')!;

// Lobby
const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;
const btnSingleplayer = document.getElementById('btn-singleplayer')!;
const btnMultiplayer = document.getElementById('btn-multiplayer')!;
const lobbyBrowser = document.getElementById('lobby-browser')!;
const lobbyListEl = document.getElementById('lobby-list')!;
const lobbySearchInput = document.getElementById('lobby-search-input') as HTMLInputElement;
const btnRefreshLobbies = document.getElementById('btn-refresh-lobbies')!;
const btnCreateLobby = document.getElementById('btn-create-lobby')!;
const btnBackToMenu = document.getElementById('btn-back-to-menu')!;
const modeButtons = document.getElementById('mode-buttons')!;

// Waiting screen
const waitingLobbyName = document.getElementById('waiting-lobby-name')!;
const btnCancelLobby = document.getElementById('btn-cancel-lobby')!;

// Create lobby modal
const createLobbyModal = document.getElementById('create-lobby-modal')!;
const createLobbyNameInput = document.getElementById('create-lobby-name') as HTMLInputElement;
const createLobbyPasswordInput = document.getElementById('create-lobby-password') as HTMLInputElement;
const btnCancelCreate = document.getElementById('btn-cancel-create')!;
const btnConfirmCreate = document.getElementById('btn-confirm-create')!;

// Join password modal
const joinPasswordModal = document.getElementById('join-password-modal')!;
const joinLobbyPasswordInput = document.getElementById('join-lobby-password') as HTMLInputElement;
const btnCancelJoin = document.getElementById('btn-cancel-join')!;
const btnConfirmJoin = document.getElementById('btn-confirm-join')!;

// Error toast
const errorToast = document.getElementById('lobby-error-toast')!;

// Game
const chatLog = document.getElementById('chat-log')!;
const gameOverEl = document.getElementById('game-over')!;
const gameOverText = document.getElementById('game-over-text')!;
const gameOverStats = document.getElementById('game-over-stats')!;
const restartBtn = document.getElementById('restart-btn')!;
const backToLobbyBtn = document.getElementById('back-to-lobby-btn')!;
const leaveBtn = document.getElementById('leave-btn')!;
const opponentBar = document.getElementById('opponent-bar')!;
const opponentNameEl = document.getElementById('opponent-name')!;

// ============================================================
// Screen management
// ============================================================

function showScreen(screen: 'lobby' | 'waiting' | 'game'): void {
  lobbyScreen.classList.toggle('hidden', screen !== 'lobby');
  lobbyScreen.style.display = screen === 'lobby' ? 'flex' : 'none';
  waitingScreen.classList.toggle('active', screen === 'waiting');
  waitingScreen.style.display = screen === 'waiting' ? 'flex' : 'none';
  gameScreen.classList.toggle('active', screen === 'game');

  if (screen === 'game') {
    gameRenderer.resize();
  }
}

function getPlayerName(): string {
  return playerNameInput.value.trim() || 'Commander';
}

function showError(message: string): void {
  errorToast.textContent = message;
  errorToast.classList.add('active');
  setTimeout(() => errorToast.classList.remove('active'), 3000);
}

// ============================================================
// Chat log system
// ============================================================

function addChatMessage(text: string, type: 'player-cmd' | 'llm-response' | 'llm-clarify' | 'system-msg'): void {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${type}`;

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  const timestamp = document.createElement('div');
  timestamp.className = 'timestamp';
  timestamp.textContent = timeStr;
  msg.appendChild(timestamp);

  const content = document.createElement('div');
  content.textContent = text;
  msg.appendChild(content);

  chatLog.appendChild(msg);

  while (chatLog.children.length > 100) {
    chatLog.removeChild(chatLog.firstChild!);
  }

  chatLog.scrollTop = chatLog.scrollHeight;
}

function clearChatLog(): void {
  chatLog.innerHTML = '';
}

// ============================================================
// Lobby UI Logic
// ============================================================

// Single player button
btnSingleplayer.addEventListener('click', () => {
  socket.startSingleplayer(getPlayerName());
});

// Multiplayer button — show lobby browser
btnMultiplayer.addEventListener('click', () => {
  modeButtons.style.display = 'none';
  lobbyBrowser.classList.add('active');
  socket.searchLobbies();
});

// Back to menu
btnBackToMenu.addEventListener('click', () => {
  lobbyBrowser.classList.remove('active');
  modeButtons.style.display = 'flex';
});

// Refresh lobbies
btnRefreshLobbies.addEventListener('click', () => {
  socket.searchLobbies(lobbySearchInput.value.trim() || undefined);
});

// Search lobbies on input
let searchTimeout: ReturnType<typeof setTimeout>;
lobbySearchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    socket.searchLobbies(lobbySearchInput.value.trim() || undefined);
  }, 300);
});

// Create lobby button — show modal
btnCreateLobby.addEventListener('click', () => {
  createLobbyNameInput.value = `${getPlayerName()}'s Game`;
  createLobbyPasswordInput.value = '';
  createLobbyModal.classList.add('active');
});

// Cancel create
btnCancelCreate.addEventListener('click', () => {
  createLobbyModal.classList.remove('active');
});

// Confirm create
btnConfirmCreate.addEventListener('click', () => {
  const name = createLobbyNameInput.value.trim() || `${getPlayerName()}'s Game`;
  const password = createLobbyPasswordInput.value.trim() || undefined;
  socket.createLobby(getPlayerName(), name, password);
  createLobbyModal.classList.remove('active');
});

// Cancel lobby (waiting screen)
btnCancelLobby.addEventListener('click', () => {
  socket.leaveLobby();
  showScreen('lobby');
  lobbyBrowser.classList.add('active');
  modeButtons.style.display = 'none';
  socket.searchLobbies();
});

// Cancel join password
btnCancelJoin.addEventListener('click', () => {
  joinPasswordModal.classList.remove('active');
  joiningLobbyId = null;
});

// Confirm join with password
btnConfirmJoin.addEventListener('click', () => {
  if (joiningLobbyId) {
    socket.joinLobby(joiningLobbyId, getPlayerName(), joinLobbyPasswordInput.value.trim());
    joinPasswordModal.classList.remove('active');
    joiningLobbyId = null;
  }
});

// ============================================================
// Render lobby list
// ============================================================

function renderLobbyList(lobbies: LobbyInfo[]): void {
  lobbyListEl.innerHTML = '';

  if (lobbies.length === 0) {
    lobbyListEl.innerHTML = '<div class="lobby-empty">No lobbies available. Create one!</div>';
    return;
  }

  for (const lobby of lobbies) {
    const item = document.createElement('div');
    item.className = 'lobby-item';
    item.innerHTML = `
      <div class="lobby-item-info">
        <div class="lobby-item-name">${escapeHtml(lobby.name)}</div>
        <div class="lobby-item-host">Hosted by ${escapeHtml(lobby.hostName)}</div>
      </div>
      <div class="lobby-item-right">
        <span class="lobby-item-players">${lobby.playerCount}/2</span>
        ${lobby.hasPassword ? '<span class="lobby-item-lock">🔒</span>' : ''}
        <span class="lobby-item-status ${lobby.status === 'waiting' ? 'status-waiting' : 'status-playing'}">
          ${lobby.status === 'waiting' ? 'Open' : 'In Game'}
        </span>
      </div>
    `;

    if (lobby.status === 'waiting') {
      item.addEventListener('click', () => {
        if (lobby.hasPassword) {
          joiningLobbyId = lobby.id;
          joinLobbyPasswordInput.value = '';
          joinPasswordModal.classList.add('active');
          joinLobbyPasswordInput.focus();
        } else {
          socket.joinLobby(lobby.id, getPlayerName());
        }
      });
    }

    lobbyListEl.appendChild(item);
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// Game start / end
// ============================================================

function startGame(data: GameStartingData): void {
  myPlayerId = data.playerId;
  myGameMode = data.gameMode;
  opponentName = data.opponentName;

  // Set player identity on renderers
  gameRenderer.setPlayerId(myPlayerId);
  minimapRenderer.setPlayerId(myPlayerId);
  uiRenderer.setPlayerId(myPlayerId);

  // Clear chat and add welcome
  clearChatLog();
  if (myGameMode === 'singleplayer') {
    addChatMessage(`Playing vs AI Commander. Your units deal full damage, AI deals half. Type commands to control your army.`, 'system-msg');
  } else {
    addChatMessage(`Game started vs ${opponentName}. You are Player ${myPlayerId}. Type commands to control your army.`, 'system-msg');
  }

  // Show opponent name
  opponentNameEl.textContent = opponentName;
  opponentBar.classList.add('active');

  // Show/hide restart button based on mode
  restartBtn.style.display = myGameMode === 'singleplayer' ? 'inline-block' : 'none';

  // Switch to game screen
  showScreen('game');
  gameInitialized = false;
}

function showGameOver(state: GameStateUpdate): void {
  const won = state.winner === myPlayerId;
  gameOverText.textContent = won ? 'VICTORY!' : 'DEFEAT';
  gameOverText.className = won ? 'victory' : 'defeat';

  const mins = Math.floor(state.gameTime / 60);
  const secs = state.gameTime % 60;
  gameOverStats.textContent = `Game duration: ${mins}:${secs.toString().padStart(2, '0')}`;

  gameOverEl.classList.add('active');
}

function returnToLobby(): void {
  gameOverEl.classList.remove('active');
  latestState = null;
  gameInitialized = false;
  opponentBar.classList.remove('active');

  // If in multiplayer, leave the lobby
  if (myGameMode === 'multiplayer') {
    socket.leaveLobby();
  }

  showScreen('lobby');
  lobbyBrowser.classList.remove('active');
  modeButtons.style.display = 'flex';
}

// Restart (singleplayer only)
restartBtn.addEventListener('click', () => {
  gameOverEl.classList.remove('active');
  socket.restartGame();
  clearChatLog();
  addChatMessage('Game restarted.', 'system-msg');
});

// Back to menu
backToLobbyBtn.addEventListener('click', () => {
  returnToLobby();
});

// Leave button (in-game header)
leaveBtn.addEventListener('click', () => {
  returnToLobby();
});

// ============================================================
// Socket event handlers
// ============================================================

// Game starting (both modes)
socket.setOnGameStarting((data: GameStartingData) => {
  startGame(data);
});

// Initial state
socket.setOnInitialState((state: GameStateUpdate) => {
  latestState = state;

  if (!gameInitialized) {
    // Center camera on own base
    const myBase = state.bases.find(b => b.owner === myPlayerId);
    if (myBase) {
      gameRenderer.centerOn(myBase.position.x, myBase.position.y);
    } else {
      gameRenderer.centerOn(
        Math.floor(state.mapWidth / 2),
        Math.floor(state.mapHeight / 2),
      );
    }
    gameInitialized = true;
  }
});

// Game state update
socket.setOnStateUpdate((state: GameStateUpdate) => {
  latestState = state;

  if (state.gameOver && state.winner) {
    showGameOver(state);
  }
});

// Command response
socket.setOnCommandResponse((response) => {
  const type = response.needsClarification ? 'llm-clarify' : 'llm-response';
  addChatMessage(response.message, type);
  commandInput.decrementPending();
});

// Lobby events
socket.setOnLobbyCreated((data) => {
  waitingLobbyName.textContent = data.lobbyName;
  showScreen('waiting');
});

socket.setOnLobbyList((lobbies) => {
  renderLobbyList(lobbies);
});

socket.setOnLobbyError((data) => {
  showError(data.message);
});

socket.setOnLobbyLeft(() => {
  // Already handled by UI flow
});

socket.setOnOpponentDisconnected((data) => {
  addChatMessage(data.message, 'system-msg');
  showGameOver({
    ...latestState!,
    gameOver: true,
    winner: myPlayerId,
  });
});

// Command input — supports rapid-fire commands
commandInput.setOnSubmit((command: string) => {
  commandInput.incrementPending();
  addChatMessage(command, 'player-cmd');
  socket.sendCommand(command, scrollEditor.getScroll());
});

// ============================================================
// Render loop
// ============================================================

gameRenderer.resize();

function renderLoop(): void {
  if (latestState && gameScreen.classList.contains('active')) {
    gameRenderer.render(latestState);
    minimapRenderer.render(latestState);
    uiRenderer.update(latestState);
  }
  requestAnimationFrame(renderLoop);
}

renderLoop();

// Start on lobby screen
showScreen('lobby');

// Load saved name from localStorage
const savedName = localStorage.getItem('commander_rts_name');
if (savedName) {
  playerNameInput.value = savedName;
}

// Save name on change
playerNameInput.addEventListener('blur', () => {
  localStorage.setItem('commander_rts_name', playerNameInput.value.trim());
});

console.log('Commander RTS client initialized');
