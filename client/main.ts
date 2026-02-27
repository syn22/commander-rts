import { SocketClient, GameStartingData } from './network/SocketClient.js';
import { GameRenderer } from './renderer/GameRenderer.js';
import { MinimapRenderer } from './renderer/MinimapRenderer.js';
import { UIRenderer } from './renderer/UIRenderer.js';
import { CommandInput } from './input/CommandInput.js';
import { ScrollEditor } from './input/ScrollEditor.js';
import { LandingAnimation } from './landing-animation.js';
import { GameStateUpdate, PlayerId, GameMode, LobbyInfo, LevelInfo, LevelCompleteData } from '../shared/types.js';

//
// Client entry point — lobby + game flow
//

// State
let latestState: GameStateUpdate | null = null;
let myPlayerId: PlayerId = 1;
let myGameMode: GameMode = 'singleplayer';
let opponentName: string = '';
let gameInitialized = false;
let lastCommand: string = ''; // Store last command for debug panel

// Level state
let currentLevelId: number | null = null;
let levelStarsData: Record<number, { stars: number; bestTime: number }> = {};
let cachedLevels: LevelInfo[] = [];

// Lobby state
let joiningLobbyId: string | null = null;  // tracks which lobby we're joining (for password modal)

// Load saved level progress from localStorage
function loadLevelProgress(): void {
  try {
    const saved = localStorage.getItem('commander_rts_levels');
    if (saved) {
      levelStarsData = JSON.parse(saved);
    }
  } catch { /* ignore */ }
}

function saveLevelProgress(): void {
  localStorage.setItem('commander_rts_levels', JSON.stringify(levelStarsData));
}

function isLevelUnlocked(levelId: number): boolean {
  if (levelId === 1) return true;
  // Level N is unlocked if level N-1 has at least 1 star
  const prev = levelStarsData[levelId - 1];
  return prev !== undefined && prev.stars >= 1;
}

loadLevelProgress();

// Create components
const socket = new SocketClient();
const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
const landingCanvas = document.getElementById('landing-canvas') as HTMLCanvasElement;
const gameRenderer = new GameRenderer(gameCanvas);
const minimapRenderer = new MinimapRenderer(minimapCanvas);
const uiRenderer = new UIRenderer();
const commandInput = new CommandInput();
const scrollEditor = new ScrollEditor();
const landingAnimation = new LandingAnimation(landingCanvas);

//
// DOM Elements
//

// Screens
const landingPage = document.getElementById('landing-page')!;
const lobbyScreen = document.getElementById('lobby-screen')!;
const waitingScreen = document.getElementById('waiting-screen')!;
const gameScreen = document.getElementById('game-screen')!;
const levelSelectScreen = document.getElementById('level-select-screen')!;

// Lobby
const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;
const btnSingleplayer = document.getElementById('btn-singleplayer')!;
const btnCampaign = document.getElementById('btn-campaign')!;
const btnMultiplayer = document.getElementById('btn-multiplayer')!;
const lobbyBrowser = document.getElementById('lobby-browser')!;
const lobbyListEl = document.getElementById('lobby-list')!;
const lobbySearchInput = document.getElementById('lobby-search-input') as HTMLInputElement;
const btnRefreshLobbies = document.getElementById('btn-refresh-lobbies')!;
const btnCreateLobby = document.getElementById('btn-create-lobby')!;
const btnBackToMenu = document.getElementById('btn-back-to-menu')!;
const modeButtons = document.getElementById('mode-buttons')!;

// Level select
const levelCardsContainer = document.getElementById('level-cards-container')!;
const btnBackFromLevels = document.getElementById('btn-back-from-levels')!;

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

// Leaderboard
const leaderboardList = document.getElementById('leaderboard-list')!;

// Game
const chatLog = document.getElementById('chat-log')!;
const gameOverEl = document.getElementById('game-over')!;
const gameOverText = document.getElementById('game-over-text')!;
const gameOverStars = document.getElementById('game-over-stars')!;
const gameOverStats = document.getElementById('game-over-stats')!;
const restartBtn = document.getElementById('restart-btn')!;
const nextLevelBtn = document.getElementById('next-level-btn')!;
const backToLobbyBtn = document.getElementById('back-to-lobby-btn')!;
const leaveBtn = document.getElementById('leave-btn')!;
const opponentBar = document.getElementById('opponent-bar')!;
const opponentNameEl = document.getElementById('opponent-name')!;

// Debug panel
const debugPanel = document.getElementById('debug-panel')!;
const debugToggleBtn = document.getElementById('debug-toggle-btn')!;
const debugContent = document.getElementById('debug-content')!;

// Model selector
const modelSelector = document.getElementById('model-selector') as HTMLSelectElement;
const modelInfo = document.getElementById('model-info')!;

// Landing page buttons
const landingPlayBtn = document.getElementById('landing-play-btn')!;

//
// Screen management
//

function showScreen(screen: 'landing' | 'lobby' | 'waiting' | 'game' | 'levels'): void {
  landingPage.classList.toggle('hidden', screen !== 'landing');
  lobbyScreen.classList.toggle('hidden', screen !== 'lobby');
  lobbyScreen.style.display = screen === 'lobby' ? 'flex' : 'none';
  waitingScreen.classList.toggle('active', screen === 'waiting');
  waitingScreen.style.display = screen === 'waiting' ? 'flex' : 'none';
  gameScreen.classList.toggle('active', screen === 'game');
  levelSelectScreen.classList.toggle('active', screen === 'levels');
  levelSelectScreen.style.display = screen === 'levels' ? 'flex' : 'none';

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

//
// Star rendering helpers
//

function renderStarsHtml(earned: number, size: 'small' | 'large' = 'small'): string {
  const starChar = size === 'large' ? '\u2B50' : '\u2605';
  let html = '';
  for (let i = 1; i <= 3; i++) {
    if (i <= earned) {
      html += `<span class="star-earned">${starChar}</span>`;
    } else {
      html += `<span class="star-empty">${starChar}</span>`;
    }
  }
  return html;
}

//
// Chat log system
//

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

//
// Debug panel system
//

function addDebugEntry(command: string, jsonResponse: any): void {
  const entry = document.createElement('div');
  entry.className = 'debug-entry';

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  entry.innerHTML = `
    <div class="debug-timestamp">${timeStr}</div>
    <div class="debug-command">Command: "${command}"</div>
    <pre class="debug-json">${JSON.stringify(jsonResponse, null, 2)}</pre>
  `;

  // Clear placeholder text
  if (debugContent.children.length === 1 && debugContent.firstElementChild?.textContent?.includes('Send a command')) {
    debugContent.innerHTML = '';
  }

  debugContent.insertBefore(entry, debugContent.firstChild);

  // Keep only last 20 entries
  while (debugContent.children.length > 20) {
    debugContent.removeChild(debugContent.lastChild!);
  }
}

debugToggleBtn.addEventListener('click', () => {
  debugPanel.classList.toggle('active');
  debugToggleBtn.classList.toggle('active');
});

function clearChatLog(): void {
  chatLog.innerHTML = '';
}

function loadLeaderboard(): void {
  leaderboardList.innerHTML = '<div class="leaderboard-loading">Loading...</div>';

  socket.getLeaderboard((entries) => {
    if (entries.length === 0) {
      leaderboardList.innerHTML = '<div class="leaderboard-loading">No victories yet. Be the first!</div>';
      return;
    }

    leaderboardList.innerHTML = '';
    entries.forEach((entry, index) => {
      const div = document.createElement('div');
      div.className = 'leaderboard-entry';

      const rank = document.createElement('div');
      rank.className = 'leaderboard-rank';
      rank.textContent = `#${index + 1}`;

      const name = document.createElement('div');
      name.className = 'leaderboard-name';
      name.textContent = entry.playerName;

      const time = document.createElement('div');
      time.className = 'leaderboard-time';
      const minutes = Math.floor(entry.timeSeconds / 60);
      const seconds = Math.floor(entry.timeSeconds % 60);
      time.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      div.appendChild(rank);
      div.appendChild(name);
      div.appendChild(time);

      leaderboardList.appendChild(div);
    });
  });
}

//
// Level select UI
//

function renderLevelSelect(levels: LevelInfo[]): void {
  cachedLevels = levels;
  levelCardsContainer.innerHTML = '';

  for (const level of levels) {
    const unlocked = isLevelUnlocked(level.id);
    const progress = levelStarsData[level.id];
    const card = document.createElement('div');
    card.className = `level-card${unlocked ? '' : ' locked'}`;

    const bestTimeStr = progress
      ? `${Math.floor(progress.bestTime / 60)}:${(progress.bestTime % 60).toString().padStart(2, '0')}`
      : '--:--';

    card.innerHTML = `
      <div class="level-number">${unlocked ? level.id : '\uD83D\uDD12'}</div>
      <div class="level-info">
        <div class="level-name">${escapeHtml(level.name)}</div>
        <div class="level-description">${escapeHtml(level.description)}</div>
      </div>
      <div class="level-stars">${renderStarsHtml(progress?.stars || 0)}</div>
      <div class="level-best-time">${bestTimeStr}</div>
    `;

    if (unlocked) {
      card.addEventListener('click', () => {
        currentLevelId = level.id;
        socket.startLevel(getPlayerName(), level.id);
      });
    }

    levelCardsContainer.appendChild(card);
  }
}

function showLevelSelect(): void {
  showScreen('levels');
  socket.getLevels((levels) => {
    renderLevelSelect(levels);
  });
}

//
// Lobby UI Logic
//

// Landing page - Play Now button
landingPlayBtn.addEventListener('click', () => {
  showScreen('lobby');
  lobbyScreen.classList.add('active');
  loadLeaderboard();
});

// Campaign button — show level select
btnCampaign.addEventListener('click', () => {
  showLevelSelect();
});

// Free play (singleplayer) button
btnSingleplayer.addEventListener('click', () => {
  currentLevelId = null;
  socket.startSingleplayer(getPlayerName());
});

// Multiplayer button — show lobby browser
btnMultiplayer.addEventListener('click', () => {
  modeButtons.style.display = 'none';
  lobbyBrowser.classList.add('active');
  socket.searchLobbies();
});

// Back to menu from lobby browser
btnBackToMenu.addEventListener('click', () => {
  lobbyBrowser.classList.remove('active');
  modeButtons.style.display = 'flex';
});

// Back from level select
btnBackFromLevels.addEventListener('click', () => {
  showScreen('lobby');
  lobbyScreen.classList.add('active');
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

//
// Render lobby list
//

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
        ${lobby.hasPassword ? '<span class="lobby-item-lock">\uD83D\uDD12</span>' : ''}
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

//
// Game start / end
//

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
  if (currentLevelId) {
    addChatMessage(`Level ${currentLevelId}: ${opponentName}. Command your army to defeat all enemies!`, 'system-msg');
  } else if (myGameMode === 'singleplayer') {
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

  // Clear stars display
  gameOverStars.innerHTML = '';
  nextLevelBtn.style.display = 'none';

  // Submit victory to leaderboard only for singleplayer wins
  if (won && myGameMode === 'singleplayer') {
    const playerName = getPlayerName();
    socket.submitVictory(playerName, state.gameTime, myGameMode, currentLevelId ?? undefined);
  }

  gameOverEl.classList.add('active');
}

// Handle level completion (with stars)
socket.setOnLevelComplete((data: LevelCompleteData) => {
  // Update local progress
  const existing = levelStarsData[data.levelId];
  if (!existing || data.stars > existing.stars || (data.stars === existing.stars && data.timeSeconds < existing.bestTime)) {
    levelStarsData[data.levelId] = {
      stars: Math.max(existing?.stars || 0, data.stars),
      bestTime: existing ? Math.min(existing.bestTime, data.timeSeconds) : data.timeSeconds,
    };
    saveLevelProgress();
  }

  // Show stars on game over
  gameOverStars.innerHTML = renderStarsHtml(data.stars, 'large');

  // Show next level button if there's a next level and it's now unlocked
  const nextId = data.levelId + 1;
  if (nextId <= 5 && isLevelUnlocked(nextId)) {
    nextLevelBtn.style.display = 'inline-block';
  }
});

function returnToLobby(): void {
  gameOverEl.classList.remove('active');
  latestState = null;
  gameInitialized = false;
  opponentBar.classList.remove('active');
  currentLevelId = null;

  // If in multiplayer, leave the lobby
  if (myGameMode === 'multiplayer') {
    socket.leaveLobby();
  }

  showScreen('lobby');
  lobbyBrowser.classList.remove('active');
  modeButtons.style.display = 'flex';
  loadLeaderboard();
}

// Restart (singleplayer only)
restartBtn.addEventListener('click', () => {
  gameOverEl.classList.remove('active');
  socket.restartGame();
  clearChatLog();
  addChatMessage('Game restarted.', 'system-msg');
});

// Next level
nextLevelBtn.addEventListener('click', () => {
  if (currentLevelId) {
    const nextId = currentLevelId + 1;
    if (nextId <= 5) {
      gameOverEl.classList.remove('active');
      currentLevelId = nextId;
      socket.startLevel(getPlayerName(), nextId);
    }
  }
});

// Back to menu
backToLobbyBtn.addEventListener('click', () => {
  returnToLobby();
});

// Leave button (in-game header)
leaveBtn.addEventListener('click', () => {
  returnToLobby();
});

//
// Socket event handlers
//

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

  // Add to debug panel if debug data is present
  if (response.debug) {
    addDebugEntry(lastCommand, response.debug);
  }
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

// Model selector — update info text and save to localStorage
modelSelector.addEventListener('change', () => {
  const model = modelSelector.value;
  const infoMap: Record<string, string> = {
    'haiku': '~200ms',
    'sonnet-3.5': '~500ms',
    'sonnet-4': '~1500ms'
  };
  modelInfo.textContent = infoMap[model] || '~500ms';
  localStorage.setItem('selected-model', model);
});

// Load saved model preference
const savedModel = localStorage.getItem('selected-model');
if (savedModel && ['haiku', 'sonnet-3.5', 'sonnet-4'].includes(savedModel)) {
  modelSelector.value = savedModel;
  modelSelector.dispatchEvent(new Event('change'));
}

// Command input — supports rapid-fire commands
commandInput.setOnSubmit((command: string) => {
  lastCommand = command; // Store for debug panel
  commandInput.incrementPending();
  addChatMessage(command, 'player-cmd');
  const selectedModel = modelSelector.value;
  socket.sendCommand(command, scrollEditor.getScroll(), selectedModel);
});

//
// Render loop
//

gameRenderer.resize();

function renderLoop(): void {
  if (latestState && gameScreen.classList.contains('active')) {
    gameRenderer.render(latestState);
    minimapRenderer.render(latestState);
    uiRenderer.update(latestState);

    // Update zoom indicator
    const zoomValue = document.getElementById('zoom-value');
    if (zoomValue) {
      zoomValue.textContent = `${Math.round(gameRenderer.getZoom() * 100)}%`;
    }
  }
  requestAnimationFrame(renderLoop);
}

renderLoop();

// Start on landing page
showScreen('landing');

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
