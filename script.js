/**
 * PANDLE Multimodo
 */

// ============================================================================
// CONFIGURACIÓN Y CONSTANTES
// ============================================================================
const DB_NAME = "PandleAppDB";
const DB_VERSION = 5;

const DIFFICULTY_ATTEMPTS = { easy: 8, normal: 6, hard: 5, extreme: 4 };

const DIFFICULTY_SCORE_MULTIPLIER = { easy: 0.5, normal: 1.0, hard: 1.5, extreme: 2.0 };

const TIME_LIMITS = {
  easy: 10 * 60,
  normal: 7 * 60,
  hard: 5 * 60,
  extreme: 3 * 60
};

const BASE_RATING = 1500;
const MAX_RATING = 5000;

const KEYBOARD_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace']
];

// ============================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ============================================================================
let dbInstance = null;

let currentMode = "classic";
let wordLength = 5;
let currentDifficulty = "normal";
let maxAttempts = DIFFICULTY_ATTEMPTS[currentDifficulty];

let wordList = [];
let targetWord = "";
let currentRow = 0;
let currentTile = 0;
let isGameOver = false;
let isAnimating = false;
let currentGuess = "";
let currentMatchGuesses = [];

let lastGameEfficiency = null;
let lastGameScore = null;
let matchEvaluationsHistory = [];

// Variables de los Modos Especiales
let timerInterval = null;
let timeLeft = 0;
let timerStarted = false;
let marathonWords = 0;
let marathonStreak = 0;
let marathonScoreAccumulator = 0;
let totalMarathonEfficiency = 0;

// Variables Visor Modal
let statsViewingMode = "classic";
let statsViewingLength = 5;
let isCurrentlyViewingEndGame = false;
let isCurrentlyViewingWin = false;

// Elementos del DOM
const boardElement = document.getElementById("board");
const keyboardElement = document.getElementById("keyboard");
const modeSelect = document.getElementById("mode-select");
const lengthSelect = document.getElementById("length-select");
const difficultySelect = document.getElementById("difficulty-select");
const toastContainer = document.getElementById("toast-container");
const statsModal = document.getElementById("stats-modal");
const statsBtn = document.getElementById("stats-btn");
const modalCloseBtn = document.getElementById("modal-close");
const playAgainBtn = document.getElementById("play-again-btn");
const resetDataBtn = document.getElementById("reset-data-btn");
const secretWordReveal = document.getElementById("secret-word-reveal");
const modalTitle = document.getElementById("modal-title");

const statsFilterMode = document.getElementById("stats-filter-mode");
const statsFilterLength = document.getElementById("stats-filter-length");
const headerGlobalRating = document.getElementById("header-global-rating");
const headerTierName = document.getElementById("header-tier-name");

// Paneles Informativos
const gameInfoPanel = document.getElementById("game-info-panel");
const timerDisplay = document.getElementById("timer-display");
const marathonCounter = document.getElementById("marathon-counter");

// ============================================================================
// BASE DE DATOS (INDEXEDDB)
// ============================================================================
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Borramos el almacén anterior si existe al actualizar de versión, ya que la clave principal cambió
      if (event.oldVersion < DB_VERSION) {
        if (db.objectStoreNames.contains("mode_stats")) db.deleteObjectStore("mode_stats");
      }
      
      if (!db.objectStoreNames.contains("mode_stats")) {
        db.createObjectStore("mode_stats", { keyPath: "modeId" });
      }
      if (!db.objectStoreNames.contains("game_history")) {
        const historyStore = db.createObjectStore("game_history", { keyPath: "id", autoIncrement: true });
        historyStore.createIndex("by_mode", "modeId", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function dbClear(storeName) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// GESTIÓN DE RATING Y ESTADÍSTICAS
// ============================================================================
function getModeId(mode, length) {
  return `${mode}_${length}`;
}

function createDefaultModeStats(mode, length) {
  const dist = {};
  for (let i = 1; i <= 12; i++) dist[i] = 0;
  
  return {
    modeId: getModeId(mode, length),
    gameMode: mode,
    wordLength: parseInt(length, 10),
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    rating: BASE_RATING,
    totalEfficiency: 0,
    letterCounts: {},
    distribution: dist
  };
}

async function getOrInitModeStats(mode, length) {
  const modeId = getModeId(mode, length);
  let modeData = await dbGet("mode_stats", modeId);
  if (!modeData) {
    modeData = createDefaultModeStats(mode, length);
    await dbPut("mode_stats", modeData);
  } else if (typeof modeData.rating === "undefined") {
    modeData.rating = BASE_RATING;
  }
  return modeData;
}

async function calculateGlobalWeightedRating() {
  const allModes = await dbGetAll("mode_stats");
  if (!allModes || allModes.length === 0) return BASE_RATING;

  let totalWeightedRating = 0;
  let totalWeight = 0;

  for (const mode of allModes) {
    if (mode.played > 0) {
      // Ponderar dando mayor peso a modos más jugados (tope en 10 partidas) para estabilizar la media global
      const weight = Math.min(mode.played, 10);
      totalWeightedRating += (mode.rating || BASE_RATING) * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return BASE_RATING;
  return Math.round(Math.min(MAX_RATING, Math.max(1, totalWeightedRating / totalWeight)));
}

function getRatingTier(rating) {
  if (rating >= 4200) return { name: "Leyenda", class: "tier-legend" };
  if (rating >= 3400) return { name: "Maestro", class: "tier-master" };
  if (rating >= 2600) return { name: "Avanzado", class: "tier-diamond" };
  if (rating >= 1900) return { name: "Intermedio", class: "tier-gold" };
  return { name: "Iniciado", class: "tier-silver" };
}

async function updateGlobalHeaderBadge() {
  const globalScore = await calculateGlobalWeightedRating();
  headerGlobalRating.textContent = globalScore;
  const tier = getRatingTier(globalScore);
  headerTierName.textContent = tier.name;
  headerTierName.className = `tier-pill ${tier.class}`;
}

async function recordLettersUsedInMode(guess) {
  const mode = await getOrInitModeStats(currentMode, wordLength);
  if (!mode.letterCounts) mode.letterCounts = {};
  for (const char of guess) {
    mode.letterCounts[char] = (mode.letterCounts[char] || 0) + 1;
  }
  await dbPut("mode_stats", mode);
}

// ============================================================================
// LÓGICA DE DÍAS (MODO DIARIO)
// ============================================================================
function getDailyWordIndex(listLength) {
  const today = new Date();
  const dateString = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) hash = dateString.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % listLength;
}

// ============================================================================
// LÓGICA DE TEMPORIZADOR
// ============================================================================
function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleTimeOut();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${m}:${s}`;
}

async function handleTimeOut() {
  isGameOver = true;
  if (currentMode === 'time') {
    showToast("¡Tiempo agotado!");
    const eff = computeMatchTacticalEfficiency(false, currentRow + 1, matchEvaluationsHistory);
    lastGameEfficiency = eff;
    await saveMatchResults(false, currentRow + 1, eff);
    openStatsModal(true, false);
  } else if (currentMode === 'marathon') {
    showToast("¡Maratón terminado!");
    const avgEff = marathonWords > 0 ? Math.round(totalMarathonEfficiency / marathonWords) : 0;
    lastGameEfficiency = avgEff;
    await saveMatchResults(true, 1, avgEff, marathonWords); 
    openStatsModal(true, true);
  }
}

function computeTimeTrialEfficiency(timeSpent, totalTime, attemptsUsed, wordLength) {
  const gracePeriod = 60; // 60 segundos de gracia para sacar el 100%
  let eff = 100;
  
  // Caída de eficiencia por tiempo
  if (timeSpent > gracePeriod) {
    const overTime = timeSpent - gracePeriod;
    const maxOverTime = totalTime - gracePeriod;
    eff = 100 - (overTime / maxOverTime) * 100;
  }
  
  // Penalización masiva por superar el límite de intentos (Palabra + 1)
  const attemptLimit = wordLength + 1;
  if (attemptsUsed > attemptLimit) {
    const extraAttempts = attemptsUsed - attemptLimit;
    eff -= extraAttempts * 15; // -15% directo de eficiencia por cada intento de sobra
  }
  
  return Math.max(0, Math.min(100, Math.round(eff)));
}

// ============================================================================
// EFICIENCIA TÁCTICA Y CÁLCULO DE PUNTUACIÓN
// ============================================================================
function computeMatchTacticalEfficiency(isWin, attemptsUsed, guessesHistory) {
  if (!isWin) return 0;
  if (attemptsUsed <= 2) return 100;

  let efficiency = 100;
  const knownGreens = {};
  const knownYellows = new Map();
  const knownAbsents = new Set();

  for (let g = 0; g < guessesHistory.length; g++) {
    const { guess, evaluations } = guessesHistory[g];

    if (g > 0) {
      let turnPenalty = 0;
      for (let i = 0; i < guess.length; i++) {
        const char = guess[i];
        if (knownAbsents.has(char)) turnPenalty += 15;
        if (knownYellows.has(char) && knownYellows.get(char).has(i)) turnPenalty += 15;
        if (knownGreens[i] && knownGreens[i] !== char) turnPenalty += 20;
      }
      efficiency -= turnPenalty;
    }

    evaluations.forEach((evalStatus, idx) => {
      const char = guess[idx];
      if (evalStatus === "correct") knownGreens[idx] = char;
      else if (evalStatus === "present") {
        if (!knownYellows.has(char)) knownYellows.set(char, new Set());
        knownYellows.get(char).add(idx);
      } else if (evalStatus === "absent") {
        const isPresentElsewhere = Object.values(knownGreens).includes(char) || knownYellows.has(char);
        if (!isPresentElsewhere) knownAbsents.add(char);
      }
    });
  }

  return Math.max(0, Math.min(100, efficiency));
}

async function saveMatchResults(isWin, attemptsUsed, efficiency, extraWords = null) {
  const now = new Date().toISOString();
  const mode = await getOrInitModeStats(currentMode, wordLength);
  
  let targetScore;
  if (isWin) {
    if (currentMode === 'marathon') {
      // Maratón usa los puntos acumulados por la racha
      targetScore = 1500 + marathonScoreAccumulator;
    } else {
      // Clásico, Contrarreloj (con su eficiencia de tiempo), Diario
      targetScore = 1500 + Math.round(3500 * (efficiency / 100));
    }
  } else {
    targetScore = 500;
  }

  targetScore = Math.min(MAX_RATING, targetScore);

  const BASE_K = 0.15;
  const diffMultiplier = DIFFICULTY_SCORE_MULTIPLIER[currentDifficulty] || 1.0;
  const currentRating = mode.rating || BASE_RATING;
  
  let K;
  if (targetScore > currentRating) {
    K = BASE_K * diffMultiplier;
  } else {
    K = BASE_K / diffMultiplier;
  }

  const newRating = Math.max(1, Math.min(MAX_RATING, Math.round(currentRating + K * (targetScore - currentRating))));

  lastGameScore = targetScore; 
  mode.rating = newRating;
  mode.played++;
  mode.totalEfficiency += efficiency;

  if (isWin) {
    mode.won++;
    mode.currentStreak++;
    mode.maxStreak = Math.max(mode.maxStreak, mode.currentStreak);
    
    let distKey = (currentMode === 'marathon') ? extraWords : attemptsUsed;
    mode.distribution[distKey] = (mode.distribution[distKey] || 0) + 1;
  } else {
    mode.currentStreak = 0;
  }

  const historyEntry = {
    timestamp: Date.now(), dateISO: now, modeId: mode.modeId,
    wordLength, difficulty: currentDifficulty, gameMode: currentMode,
    targetWord: (currentMode === 'marathon') ? `[${extraWords} palabras]` : targetWord,
    guesses: [...currentMatchGuesses], isWin,
    attemptsUsed: isWin ? attemptsUsed : null,
    efficiency, matchPerformanceScore: targetScore, newRating
  };

  await Promise.all([
    dbPut("mode_stats", mode),
    dbPut("game_history", historyEntry)
  ]);
  await updateGlobalHeaderBadge();
}

// ============================================================================
// CONTROL DEL JUEGO
// ============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initDB();
    await updateGlobalHeaderBadge();
  } catch (e) {
    console.error("Error IndexedDB:", e);
  }
  initListeners();
  initResizeObserver();
  startNewGame();
});

function initListeners() {
  modeSelect.addEventListener("change", (e) => handleParameterChange(e, 'mode'));
  lengthSelect.addEventListener("change", (e) => handleParameterChange(e, 'length'));
  difficultySelect.addEventListener("change", (e) => handleParameterChange(e, 'diff'));

  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const headerControls = document.getElementById("header-controls");
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", () => {
      headerControls.classList.toggle("show");
    });
  }

  window.addEventListener("keydown", handlePhysicalKeyboard);
  statsBtn.addEventListener("click", () => openStatsModal(false, false));
  modalCloseBtn.addEventListener("click", () => statsModal.classList.add("hidden"));
  playAgainBtn.addEventListener("click", () => {
    statsModal.classList.add("hidden");
    startNewGame();
  });
  resetDataBtn.addEventListener("click", handleResetAllData);
  statsModal.addEventListener("click", (e) => {
    if (e.target === statsModal) statsModal.classList.add("hidden");
  });

  statsFilterMode.addEventListener("change", async (e) => { statsViewingMode = e.target.value; await updateStatsModalView(); });
  statsFilterLength.addEventListener("change", async (e) => { statsViewingLength = parseInt(e.target.value, 10); await updateStatsModalView(); });
  
  window.addEventListener("resize", () => { window.requestAnimationFrame(adjustTileSizes); });
}

async function handleParameterChange(e, type) {
  const selectEl = e.target;
  const newValue = selectEl.value;
  const oldValue = type === 'mode' ? currentMode : (type === 'length' ? String(wordLength) : currentDifficulty);

  // Si ya hicieron un intento (presionaron Enter) pero no ha acabado
  if (!isGameOver && currentMatchGuesses.length > 0) {
    const confirmLost = await showConfirmDialog("Tienes una partida en curso. Cambiar los parámetros la contará como pérdida. ¿Continuar?");
    if (!confirmLost) {
      selectEl.value = oldValue; // Revertir opción seleccionada
      return;
    }
    
    // Penalizar como derrota
    clearInterval(timerInterval);
    if (currentMode === 'marathon') {
      const avgEff = marathonWords > 0 ? Math.round(totalMarathonEfficiency / marathonWords) : 0;
      await saveMatchResults(true, 1, avgEff, marathonWords);
    } else {
      let eff = computeMatchTacticalEfficiency(false, maxAttempts, matchEvaluationsHistory);
      await saveMatchResults(false, maxAttempts, eff);
    }

    if (currentMode === 'daily') {
      localStorage.setItem(`daily_${new Date().toDateString()}_${wordLength}_${currentDifficulty}`, 'true');
    }
  }

  if (type === 'mode') currentMode = newValue;
  else if (type === 'length') wordLength = parseInt(newValue, 10);
  else if (type === 'diff') currentDifficulty = newValue;

  // Auto cerrar en móvil
  if (window.innerWidth <= 650) {
    const headerControls = document.getElementById("header-controls");
    if(headerControls) headerControls.classList.remove("show");
  }

  resetVolatileGameData();
  startNewGame();
}

function updateDifficultyOptions() {
  const isTimedMode = (currentMode === 'time' || currentMode === 'marathon');
  const labels = isTimedMode
    ? { easy: "Fácil (10m)", normal: "Normal (7m)", hard: "Difícil (5m)", extreme: "Extremo (3m)" }
    : { easy: "Fácil (8)", normal: "Normal (6)", hard: "Difícil (5)", extreme: "Extremo (4)" };

  Array.from(difficultySelect.options).forEach(opt => {
    if (labels[opt.value]) {
      opt.textContent = labels[opt.value];
    }
  });
}

function resetVolatileGameData() {
  lastGameEfficiency = null;
  lastGameScore = null;
  marathonWords = 0;
  marathonStreak = 0;
  marathonScoreAccumulator = 0;
  totalMarathonEfficiency = 0;
}

async function handleResetAllData() {
  const confirmed = await showConfirmDialog("¿Estás seguro de que quieres borrar todos los datos y estadísticas?");
  if (!confirmed) return;

  try {
    await Promise.all([dbClear("mode_stats"), dbClear("game_history")]);
    resetVolatileGameData();
    await updateGlobalHeaderBadge();
    await updateStatsModalView();
    showToast("Datos borrados correctamente");
  } catch (err) {
    showToast("Error al borrar los datos");
  }
}

function initResizeObserver() {
  const container = document.querySelector(".board-container");
  if (window.ResizeObserver && container) {
    new ResizeObserver(() => adjustTileSizes()).observe(container);
  }
}

function loadWords(length) {
  wordList = (typeof getWordList === "function") ? getWordList(length) : getFallbackWords(length);
}

function startNewGame() {
  isGameOver = false;
  isAnimating = false;
  currentRow = 0;
  currentTile = 0;
  currentGuess = "";
  currentMatchGuesses = [];
  matchEvaluationsHistory = [];
  timerStarted = false;
  
  clearInterval(timerInterval);
  gameInfoPanel.classList.add("hidden");
  timerDisplay.classList.add("hidden");
  marathonCounter.classList.add("hidden");

  updateDifficultyOptions();

  loadWords(wordLength);
  if (!wordList || wordList.length === 0) return showToast("Error: No hay palabras");

  if (currentMode === 'daily') {
    const today = new Date().toDateString();
    const dailyKey = `daily_${today}_${wordLength}_${currentDifficulty}`;
    if (localStorage.getItem(dailyKey)) {
      showToast("Ya completaste el reto diario para este modo.");
      isGameOver = true;
      buildBoard();
      buildKeyboard();
      return;
    }
    targetWord = wordList[getDailyWordIndex(wordList.length)].toLowerCase();
  } else {
    targetWord = wordList[Math.floor(Math.random() * wordList.length)].toLowerCase();
  }

  if (currentMode === 'time' || currentMode === 'marathon') {
    timeLeft = TIME_LIMITS[currentDifficulty];
    updateTimerDisplay();
    gameInfoPanel.classList.remove("hidden");
    timerDisplay.classList.remove("hidden");
  }

  if (currentMode === 'marathon') {
    marathonWords = 0;
    marathonStreak = 0;
    marathonScoreAccumulator = 0;
    totalMarathonEfficiency = 0;
    marathonCounter.textContent = `Palabras: 0`;
    marathonCounter.classList.remove("hidden");
  }

  maxAttempts = (currentMode === 'time') ? 6 : DIFFICULTY_ATTEMPTS[currentDifficulty];

  buildBoard();
  adjustTileSizes();
  buildKeyboard();
}

function startMarathonNextWord() {
  currentRow = 0;
  currentTile = 0;
  currentGuess = "";
  currentMatchGuesses = [];
  matchEvaluationsHistory = [];
  targetWord = wordList[Math.floor(Math.random() * wordList.length)].toLowerCase();
  buildBoard();
  adjustTileSizes();
  buildKeyboard();
  isAnimating = false;
}

function addDynamicRow() {
  maxAttempts++;
  const rowEl = document.createElement("div");
  rowEl.className = "row";
  rowEl.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
  for (let c = 0; c < wordLength; c++) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.setAttribute("id", `tile-${maxAttempts - 1}-${c}`);
    rowEl.appendChild(tile);
  }
  boardElement.appendChild(rowEl);
  boardElement.style.gridTemplateRows = `repeat(${maxAttempts}, 1fr)`;
  setTimeout(() => boardElement.parentElement.scrollTo(0, boardElement.scrollHeight), 50);
}

function adjustTileSizes() {
  const container = document.querySelector(".board-container");
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const paddingX = 16; const paddingY = 8;
  const availableWidth = Math.max(100, rect.width - paddingX);
  const availableHeight = Math.max(100, rect.height - paddingY);
  const gap = wordLength >= 7 || maxAttempts >= 8 ? 4 : 6;

  const maxTileW = (availableWidth - (wordLength - 1) * gap) / wordLength;
  const maxTileH = (availableHeight - (maxAttempts - 1) * gap) / Math.max(6, maxAttempts);

  const calculatedSize = Math.floor(Math.min(maxTileW, maxTileH));
  const finalSize = Math.max(26, Math.min(58, calculatedSize));
  const fontSize = Math.max(14, Math.round(finalSize * 0.48));

  document.documentElement.style.setProperty("--tile-size", `${finalSize}px`);
  document.documentElement.style.setProperty("--board-gap", `${gap}px`);
  document.documentElement.style.setProperty("--tile-font-size", `${fontSize}px`);
}

function buildBoard() {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateRows = `repeat(${maxAttempts}, 1fr)`;
  for (let r = 0; r < maxAttempts; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    rowEl.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
    for (let c = 0; c < wordLength; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.setAttribute("id", `tile-${r}-${c}`);
      rowEl.appendChild(tile);
    }
    boardElement.appendChild(rowEl);
  }
}

function buildKeyboard() {
  keyboardElement.innerHTML = "";
  KEYBOARD_LAYOUT.forEach(row => {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";
    row.forEach(key => {
      const keyBtn = document.createElement("button");
      keyBtn.className = "key";
      keyBtn.setAttribute("data-key", key.toLowerCase());
      if (key === "Enter") {
        keyBtn.textContent = "ENTER";
        keyBtn.classList.add("large");
      } else if (key === "Backspace") {
        keyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>`;
        keyBtn.classList.add("large");
      } else {
        keyBtn.textContent = key.toUpperCase();
      }
      keyBtn.addEventListener("click", (e) => { e.preventDefault(); handleInput(key); });
      rowEl.appendChild(keyBtn);
    });
    keyboardElement.appendChild(rowEl);
  });
}

function handlePhysicalKeyboard(e) {
  if (isGameOver || isAnimating || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === "Enter") handleInput("Enter");
  else if (e.key === "Backspace") handleInput("Backspace");
  else if (/^[a-zA-ZñÑ]$/.test(e.key)) handleInput(e.key.toLowerCase());
}

function handleInput(key) {
  if (isGameOver || isAnimating) return;
  if (key === "Backspace") deleteLetter();
  else if (key === "Enter") submitGuess();
  else if (/^[a-zñ]$/i.test(key)) addLetter(key.toLowerCase());
}

function addLetter(letter) {
  if (currentTile < wordLength) {
    if (!timerStarted && (currentMode === 'time' || currentMode === 'marathon')) {
      startTimer();
      timerStarted = true;
    }
    const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
    tile.textContent = letter;
    tile.setAttribute("data-state", "active");
    currentGuess += letter;
    currentTile++;
  }
}

function deleteLetter() {
  if (currentTile > 0) {
    currentTile--;
    const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
    tile.textContent = "";
    tile.removeAttribute("data-state");
    currentGuess = currentGuess.slice(0, -1);
  }
}

async function submitGuess() {
  if (currentGuess.length !== wordLength) { shakeRow(); return showToast("Letras insuficientes"); }
  if (!wordList.includes(currentGuess)) { shakeRow(); return showToast("Palabra no válida"); }

  isAnimating = true;
  currentMatchGuesses.push(currentGuess);
  await recordLettersUsedInMode(currentGuess);

  const evaluations = evaluateGuess(currentGuess, targetWord);
  matchEvaluationsHistory.push({ guess: currentGuess, evaluations });

  for (let i = 0; i < wordLength; i++) {
    const tile = document.getElementById(`tile-${currentRow}-${i}`);
    await flipTile(tile, evaluations[i]);
    updateKeyboardKey(currentGuess[i], evaluations[i]);
  }

  if (currentGuess === targetWord) {
    bounceRow(currentRow);
    const attemptsUsed = currentRow + 1;

    let eff = 0;
    if (currentMode === 'time') {
      const timeSpent = TIME_LIMITS[currentDifficulty] - timeLeft;
      eff = computeTimeTrialEfficiency(timeSpent, TIME_LIMITS[currentDifficulty], attemptsUsed, wordLength);
    } else {
      eff = computeMatchTacticalEfficiency(true, attemptsUsed, matchEvaluationsHistory);
    }

    if (currentMode === 'marathon') {
      marathonWords++;
      marathonStreak++;
      totalMarathonEfficiency += eff;

      const streakMult = [1, 1.5, 2.5, 4.0, 6.0, 8.0, 10.0];
      const mult = streakMult[Math.min(marathonStreak - 1, streakMult.length - 1)];
      
      marathonScoreAccumulator += Math.round(300 * mult * (eff / 100));

      marathonCounter.innerHTML = `Palabras: ${marathonWords} <span style="color:#f39c12; font-size:0.8em; font-weight:900;">(🔥x${marathonStreak})</span>`;
      setTimeout(() => startMarathonNextWord(), 1500);
      return;
    }

    if (currentMode === 'daily') {
      localStorage.setItem(`daily_${new Date().toDateString()}_${wordLength}_${currentDifficulty}`, 'true');
    }

    lastGameEfficiency = eff;
    setTimeout(async () => {
      clearInterval(timerInterval);
      await saveMatchResults(true, attemptsUsed, lastGameEfficiency);
      isGameOver = true;
      isAnimating = false;
      openStatsModal(true, true);
    }, 500);

  } else if (currentRow + 1 >= maxAttempts && currentMode !== 'time') {
    let eff = computeMatchTacticalEfficiency(false, maxAttempts, matchEvaluationsHistory);

    if (currentMode === 'marathon') {
      marathonStreak = 0;
      marathonCounter.innerHTML = `Palabras: ${marathonWords}`;
      setTimeout(() => startMarathonNextWord(), 1500);
      return;
    }

    if (currentMode === 'daily') {
      localStorage.setItem(`daily_${new Date().toDateString()}_${wordLength}_${currentDifficulty}`, 'true');
    }

    lastGameEfficiency = eff;
    setTimeout(async () => {
      clearInterval(timerInterval);
      await saveMatchResults(false, maxAttempts, lastGameEfficiency);
      isGameOver = true;
      isAnimating = false;
      openStatsModal(true, false);
    }, 400);

  } else {
    if (currentMode === 'time' && currentRow + 1 >= maxAttempts) {
      addDynamicRow();
      adjustTileSizes();
    }
    currentRow++;
    currentTile = 0;
    currentGuess = "";
    isAnimating = false;
  }
}

function evaluateGuess(guess, target) {
  const result = Array(wordLength).fill("absent");
  const targetArr = target.split("");
  const guessArr = guess.split("");
  const targetCounts = {};
  for (const letter of targetArr) targetCounts[letter] = (targetCounts[letter] || 0) + 1;
  for (let i = 0; i < wordLength; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i] = "correct";
      targetCounts[guessArr[i]]--;
    }
  }
  for (let i = 0; i < wordLength; i++) {
    if (result[i] !== "correct" && targetCounts[guessArr[i]] > 0) {
      result[i] = "present";
      targetCounts[guessArr[i]]--;
    }
  }
  return result;
}

function flipTile(tile, status) {
  return new Promise((resolve) => {
    if (!tile) return resolve();
    tile.removeAttribute("data-state");

    const safety = setTimeout(() => {
      tile.classList.remove("flip-in", "flip-out");
      tile.classList.add(status);
      if (currentMode === 'invisible') tile.classList.add('invisible-text');
      resolve();
    }, 500);

    tile.addEventListener("animationend", () => {
      tile.classList.remove("flip-in");
      tile.classList.add(status);
      tile.addEventListener("animationend", () => {
        clearTimeout(safety);
        tile.classList.remove("flip-out");
        if (currentMode === 'invisible') tile.classList.add('invisible-text');
        resolve();
      }, { once: true });
      tile.classList.add("flip-out");
    }, { once: true });
    tile.classList.add("flip-in");
  });
}

function updateKeyboardKey(letter, status) {
  const keyBtn = document.querySelector(`.key[data-key="${letter}"]`);
  if (!keyBtn) return;
  const currentClass = keyBtn.className;
  if (status === "correct") {
    keyBtn.classList.remove("present", "absent");
    keyBtn.classList.add("correct");
  } else if (status === "present" && !currentClass.includes("correct")) {
    keyBtn.classList.remove("absent");
    keyBtn.classList.add("present");
  } else if (status === "absent" && !currentClass.includes("correct") && !currentClass.includes("present")) {
    keyBtn.classList.add("absent");
  }
}

function shakeRow() {
  const row = boardElement.children[currentRow];
  if (row) { row.classList.add("shake"); row.addEventListener("animationend", () => row.classList.remove("shake"), { once: true }); }
}

function bounceRow(rowIdx) {
  const row = boardElement.children[rowIdx];
  if (!row) return;
  Array.from(row.children).forEach((tile, i) => setTimeout(() => tile.classList.add("bounce"), i * 70));
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 1800);
}

// ============================================================================
// VISOR DE ESTADÍSTICAS
// ============================================================================
async function openStatsModal(isEndGame = false, isWin = false) {
  isCurrentlyViewingEndGame = isEndGame;
  isCurrentlyViewingWin = isWin;

  statsViewingMode = currentMode;
  statsViewingLength = wordLength;

  statsFilterMode.value = statsViewingMode;
  statsFilterLength.value = String(statsViewingLength);

  await updateStatsModalView();
  statsModal.classList.remove("hidden");
}

function showConfirmDialog(message, showCancel = true) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const textEl = document.getElementById("confirm-modal-message");
    const cancelBtn = document.getElementById("confirm-modal-cancel");
    const okBtn = document.getElementById("confirm-modal-ok");

    textEl.textContent = message;
    cancelBtn.style.display = showCancel ? "inline-block" : "none";
    modal.classList.remove("hidden");

    const cleanUp = (confirmed) => {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(confirmed);
    };

    const onOk = () => cleanUp(true);
    const onCancel = () => cleanUp(false);

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

async function updateStatsModalView() {
  const modeStats = await getOrInitModeStats(statsViewingMode, statsViewingLength);
  const isMatchingActiveGame = (statsViewingMode === currentMode && statsViewingLength === wordLength);

  if (isCurrentlyViewingEndGame && isMatchingActiveGame) {
    modalTitle.textContent = isCurrentlyViewingWin ? "¡FELICITACIONES!" : "FIN DEL JUEGO";
    secretWordReveal.innerHTML = (currentMode === 'marathon') 
      ? `Has conseguido: <span>${marathonWords} PALABRAS</span>`
      : `La palabra era: <span>${targetWord.toUpperCase()}</span>`;
    secretWordReveal.classList.remove("hidden");
  } else {
    modalTitle.textContent = "ESTADÍSTICAS";
    secretWordReveal.classList.add("hidden");
  }

  const globalScore = await calculateGlobalWeightedRating();
  document.getElementById("modal-global-score").textContent = globalScore;
  const tier = getRatingTier(globalScore);
  const badgeEl = document.getElementById("modal-tier-badge");
  badgeEl.textContent = tier.name;
  badgeEl.className = `tier-badge ${tier.class}`;

  document.getElementById("stat-mode-rating").textContent = modeStats.rating || BASE_RATING;
  document.getElementById("stat-game-score").textContent = (isMatchingActiveGame && lastGameScore !== null) ? `${lastGameScore} pts` : "—";
  document.getElementById("stat-played").textContent = modeStats.played;
  
  const winRate = modeStats.played > 0 ? Math.round((modeStats.won / modeStats.played) * 100) : 0;
  document.getElementById("stat-win-pct").textContent = `${winRate}%`;
  document.getElementById("stat-current-streak").textContent = modeStats.currentStreak;
  document.getElementById("stat-max-streak").textContent = modeStats.maxStreak;
  document.getElementById("stat-game-eff").textContent = (isMatchingActiveGame && lastGameEfficiency !== null) ? `${lastGameEfficiency}%` : "—";

  const modeAvgEfficiency = modeStats.played > 0 ? Math.round(modeStats.totalEfficiency / modeStats.played) : 0;
  document.getElementById("stat-total-eff").textContent = `${modeAvgEfficiency}%`;

  renderDistributionChart(modeStats, isMatchingActiveGame);
  renderLettersBarChart(modeStats.letterCounts);
}

function renderDistributionChart(stats, isMatchingActiveGame) {
  const distContainer = document.getElementById("guess-distribution");
  distContainer.innerHTML = "";
  
  let keys = [];
  if (stats.gameMode === 'marathon') {
    keys = Object.keys(stats.distribution || {}).map(Number).sort((a,b)=>a-b);
    if (keys.length === 0) keys = [0];
  } else {
    keys = Object.keys(stats.distribution || {}).map(Number).sort((a,b)=>a-b);
    if (keys.length === 0) keys = [1,2,3,4,5,6];
    else {
      const maxAttempt = Math.max(6, Math.max(...keys));
      keys = [];
      for(let i = 1; i <= maxAttempt; i++) keys.push(i);
    }
  }

  const values = keys.map(k => (stats.distribution && stats.distribution[k]) || 0);
  const maxVal = Math.max(...values, 1);

  keys.forEach((key, idx) => {
    const count = values[idx];
    const pct = Math.max(9, Math.round((count / maxVal) * 100));

    const row = document.createElement("div");
    row.className = "dist-row";

    const label = document.createElement("span");
    label.textContent = key;
    label.className = "dist-label";
    if (stats.gameMode === 'marathon' && String(key).length > 1) label.style.fontSize = "0.6rem";

    const barWrap = document.createElement("div");
    barWrap.className = "dist-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "dist-bar";
    bar.style.width = `${pct}%`;
    bar.textContent = count;

    if (isCurrentlyViewingEndGame && isCurrentlyViewingWin && isMatchingActiveGame) {
      if (stats.gameMode === 'marathon' && marathonWords === key) bar.classList.add("highlight");
      else if (stats.gameMode !== 'marathon' && (currentRow + 1 === key)) bar.classList.add("highlight");
    }

    barWrap.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barWrap);
    distContainer.appendChild(row);
  });
}

function renderLettersBarChart(letterCounts) {
  const container = document.getElementById("letters-bar-chart");
  container.innerHTML = "";

  const entries = Object.entries(letterCounts || {});
  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-hint">Sin datos en este modo todavía.</div>`;
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const topLetters = entries.slice(0, 10);
  const maxVal = topLetters[0][1];
  const totalLettersUsed = entries.reduce((acc, curr) => acc + curr[1], 0);

  topLetters.forEach(([letter, count], index) => {
    const percentOfMax = Math.max(10, Math.round((count / maxVal) * 100));
    const percentOfTotal = Math.round((count / totalLettersUsed) * 100);

    const row = document.createElement("div");
    row.className = "letter-bar-row";

    const letterLabel = document.createElement("div");
    letterLabel.className = "letter-bar-label";
    letterLabel.innerHTML = `<span>#${index + 1}</span><strong>${letter.toUpperCase()}</strong>`;

    const track = document.createElement("div");
    track.className = "letter-bar-track";

    const fill = document.createElement("div");
    fill.className = "letter-bar-fill";
    fill.style.width = `${percentOfMax}%`;

    const valText = document.createElement("span");
    valText.className = "letter-bar-value";
    valText.textContent = `${count} (${percentOfTotal}%)`;

    fill.appendChild(valText);
    track.appendChild(fill);
    row.appendChild(letterLabel);
    row.appendChild(track);
    container.appendChild(row);
  });
}