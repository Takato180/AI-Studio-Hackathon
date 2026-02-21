// main.js -- Game controller / entry point
import './style.css';
import { STAGES } from './stages.js';
import { initMap, flyToLandmark, addLandmarkMarker, clearMarkers, setClearSkyWeather } from './map.js';
import { initGameSession, generatePuzzle, evaluateAnswer, requestHint, generateNarration, generateEndingStory } from './gemini.js';
import { setupBuildingInteraction, clearHighlights } from './buildings.js';
import { speak, speakAndWait, stopSpeaking, toggleTTS } from './tts.js';

// ----- Game State -----
const state = {
  currentStage: 0,
  hintsUsed: 0,
  hintLevel: 0,
  totalHintsUsed: 0,
  timerStart: null,
  timerInterval: null,
  elapsedSeconds: 0,
  isProcessing: false,
  gameStarted: false,
  viewer: null,
  mapInitPromise: null,
};

// ----- DOM References -----
const screens = {
  title: document.getElementById('title-screen'),
  boot: document.getElementById('boot-screen'),
  game: document.getElementById('game-screen'),
  ending: document.getElementById('ending-screen'),
};

const dom = {
  startBtn: document.getElementById('start-btn'),
  restartBtn: document.getElementById('restart-btn'),
  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  chatSend: document.getElementById('chat-send'),
  chatToggle: document.getElementById('chat-toggle'),
  chatPanel: document.getElementById('chat-panel'),
  stageNumber: document.getElementById('stage-number'),
  stageName: document.getElementById('stage-name'),
  timer: document.getElementById('timer'),
  stageTransition: document.getElementById('stage-transition'),
  transitionStage: document.querySelector('.transition-stage'),
  finalTime: document.getElementById('final-time'),
  finalHints: document.getElementById('final-hints'),
  finalRank: document.getElementById('final-rank'),
  progressNodes: document.querySelectorAll('.progress-node'),
  bootLines: document.getElementById('boot-lines'),
  skyLocation: document.getElementById('sky-location'),
};

// ----- Screen Management -----
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ----- Timer -----
function startTimer() {
  state.timerStart = Date.now();
  state.timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  state.elapsedSeconds = Math.floor((Date.now() - state.timerStart) / 1000);
  const min = String(Math.floor(state.elapsedSeconds / 60)).padStart(2, '0');
  const sec = String(state.elapsedSeconds % 60).padStart(2, '0');
  dom.timer.textContent = `${min}:${sec}`;
}

function stopTimer() { clearInterval(state.timerInterval); }

function getFormattedTime() {
  const min = String(Math.floor(state.elapsedSeconds / 60)).padStart(2, '0');
  const sec = String(state.elapsedSeconds % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

// ----- Sound Effects (Web Audio API) -----
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'correct') {
    osc.frequency.setValueAtTime(523, audioCtx.currentTime);
    osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);
  } else if (type === 'wrong') {
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.setValueAtTime(150, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
  } else if (type === 'hint') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.2);
  } else if (type === 'stage') {
    osc.frequency.setValueAtTime(392, audioCtx.currentTime);
    osc.frequency.setValueAtTime(523, audioCtx.currentTime + 0.15);
    osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.3);
    osc.frequency.setValueAtTime(784, audioCtx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.8);
  } else if (type === 'boot') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.05);
  }
}

// ----- Boot Sequence -----
const BOOT_MESSAGES = [
  // Phase 1: 意識の混濁
  { text: '', delay: 800 },
  { text: '> ...', delay: 600 },
  { text: '> ERROR: MEMORY CORRUPTION DETECTED - 94.7%', delay: 400 },
  { text: '> ERROR: IDENTITY MODULE ... UNREADABLE', delay: 300 },
  { text: '> ATTEMPTING NEURAL RECOVERY ...', delay: 500 },
  { text: '', delay: 400 },

  // Phase 2: システム起動
  { text: '> AXIOM SYSTEM v9.1.3 ... ONLINE', delay: 300 },
  { text: '> SUBJECT STATUS: CONSCIOUS', delay: 200 },
  { text: '> DESIGNATION: RUNNER #[REDACTED]', delay: 300 },
  { text: '', delay: 400 },

  // Phase 3: 状況説明
  { text: '> [AXIOM] お前の記憶は消去された。', delay: 600 },
  { text: '> [AXIOM] お前が誰だったかは、もう意味を持たない。', delay: 500 },
  { text: '> [AXIOM] これはテストだ。', delay: 400 },
  { text: '', delay: 300 },
  { text: '> [AXIOM] お前は今、都市管理AIの仮想空間にいる。', delay: 500 },
  { text: '> [AXIOM] 東京のデータ構造体。5つのセクターで構成される監獄。', delay: 500 },
  { text: '', delay: 300 },

  // Phase 4: ミッション提示
  { text: '> URBAN DATA STREAM ... LOADING', delay: 400 },
  { text: '> SECTOR MAP: MINATO / CHUO / SHIBUYA / CHIYODA / SHINJUKU', delay: 300 },
  { text: '> BUILDING SCAN MODULE ... READY', delay: 200 },
  { text: '', delay: 300 },
  { text: '> [AXIOM] 各セクターには暗号がある。解け。', delay: 500 },
  { text: '> [AXIOM] 全ての暗号を解読すれば、出口が開く。', delay: 500 },
  { text: '> [AXIOM] 失敗すれば、お前の意識は永久にここに閉じ込められる。', delay: 600 },
  { text: '', delay: 400 },

  // Phase 5: 操作説明（簡潔に）
  { text: '> CONTROLS: WASD = 移動 / Q,E = 上下 / MOUSE = 視点', delay: 300 },
  { text: '> CLICK BUILDINGS = データスキャン', delay: 300 },
  { text: '', delay: 300 },

  // Phase 6: 開始
  { text: '> [AXIOM] テストを開始する。', delay: 500 },
  { text: '> LOADING SECTOR 1: BABEL-01 ...', delay: 400 },
  { text: '> 生き延びろ、ランナー。', delay: 500 },
];

async function playBootSequence() {
  showScreen('boot');
  dom.bootLines.innerHTML = '';

  // Start map preload in background
  state.mapInitPromise = initMap().catch(err => {
    console.error('Map preload error:', err);
  });

  // Init AI session in background (store promise to await later)
  state.aiInitPromise = initGameSession();

  for (const msg of BOOT_MESSAGES) {
    await new Promise(r => setTimeout(r, msg.delay));
    if (msg.text) {
      const line = document.createElement('div');
      line.className = 'boot-line';
      line.textContent = msg.text;
      dom.bootLines.appendChild(line);
      dom.bootLines.scrollTop = dom.bootLines.scrollHeight;
      playSound('boot');
    }
  }

  // Wait for both map AND AI to be ready before proceeding
  await Promise.all([
    state.mapInitPromise,
    state.aiInitPromise
  ]);
  await new Promise(r => setTimeout(r, 500));
}

// ----- Keyboard Camera Controls -----
function setupKeyboardControls(viewer) {
  const moveRate = 50;
  const keysDown = {};

  document.addEventListener('keydown', (e) => {
    if (e.target === dom.chatInput) return;
    keysDown[e.key.toLowerCase()] = true;
  });

  document.addEventListener('keyup', (e) => {
    keysDown[e.key.toLowerCase()] = false;
  });

  viewer.clock.onTick.addEventListener(() => {
    const camera = viewer.camera;
    if (keysDown['w'] || keysDown['arrowup']) camera.moveForward(moveRate);
    if (keysDown['s'] || keysDown['arrowdown']) camera.moveBackward(moveRate);
    if (keysDown['a'] || keysDown['arrowleft']) camera.moveLeft(moveRate);
    if (keysDown['d'] || keysDown['arrowright']) camera.moveRight(moveRate);
    if (keysDown['q']) camera.moveUp(moveRate);
    if (keysDown['e']) camera.moveDown(moveRate);
  });
}

// ----- Chat Messages -----
function addMessage(text, type = 'ai') {
  const msg = document.createElement('div');
  msg.className = `message ${type}`;

  let displayText = text
    .replace(/^\[CORRECT\]\s*/i, '')
    .replace(/^\[WRONG\]\s*/i, '')
    .replace(/^\[PUZZLE\]\s*/i, '')
    .replace(/^\[HINT\]\s*/i, '');

  displayText = displayText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  displayText = displayText.replace(/\n/g, '<br>');

  msg.innerHTML = displayText;
  dom.chatMessages.appendChild(msg);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

  // Speak AI messages with Cloud TTS
  if (type === 'ai') {
    speak(displayText.replace(/<br>/g, '。').replace(/<[^>]+>/g, ''));
  }

  return msg;
}

function addSystemMessage(text) {
  addMessage(text, 'system');
}

function addTypingIndicator() {
  const msg = document.createElement('div');
  msg.className = 'message ai';
  msg.id = 'typing-indicator';
  msg.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  dom.chatMessages.appendChild(msg);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ----- Stage Management -----
function updateStageUI(stage) {
  dom.stageNumber.textContent = stage.id;
  dom.stageName.textContent = `-- ${stage.name}`;

  if (dom.skyLocation) {
    dom.skyLocation.textContent = `SECTOR ${stage.id}: ${stage.nameEn.toUpperCase()}`;
  }

  dom.progressNodes.forEach(node => {
    const nodeStage = parseInt(node.dataset.stage);
    node.classList.remove('active', 'cleared');
    if (nodeStage < stage.id) node.classList.add('cleared');
    else if (nodeStage === stage.id) node.classList.add('active');
  });
}

async function showStageTransition(text) {
  dom.transitionStage.textContent = text;
  dom.stageTransition.classList.remove('hidden');
  playSound('stage');

  return new Promise(resolve => {
    setTimeout(() => {
      dom.stageTransition.classList.add('hidden');
      resolve();
    }, 2500);
  });
}

// ----- Core Game Flow -----
async function startGame() {
  state.currentStage = 0;
  state.hintsUsed = 0;
  state.totalHintsUsed = 0;
  state.hintLevel = 0;
  state.elapsedSeconds = 0;
  state.gameStarted = true;

  await playBootSequence();
  showScreen('game');
  dom.chatMessages.innerHTML = '';

  let hintBtn = document.getElementById('hint-btn');
  if (!hintBtn) {
    hintBtn = document.createElement('button');
    hintBtn.id = 'hint-btn';
    hintBtn.textContent = 'HINT';
    const inputArea = document.getElementById('chat-input-area');
    inputArea.insertBefore(hintBtn, inputArea.firstChild);
    hintBtn.addEventListener('click', onHintRequest);
  }

  state.viewer = await initMap();
  setupKeyboardControls(state.viewer);

  setupBuildingInteraction(state.viewer, (buildingInfo) => {
    if (buildingInfo.height) {
      addSystemMessage(`[SCAN] Height: ${buildingInfo.height.toFixed(1)}m${buildingInfo.floors ? ' / Floors: ' + buildingInfo.floors + 'F' : ''}${buildingInfo.usage ? ' / Use: ' + buildingInfo.usage : ''}`);
      playSound('boot');
    }
  });


  addSystemMessage('NEURAL LINK ESTABLISHED');

  startTimer();
  await loadStage(STAGES[0]);
}

async function loadStage(stage) {
  state.hintLevel = 0;
  updateStageUI(stage);
  clearHighlights();

  // Phase 1: Show stage introduction (AXIOM message)
  addMessage(stage.description, 'system');
  await speakAndWait(stage.description);

  // Phase 2: Camera flies to landmark
  flyToLandmark(stage);
  addLandmarkMarker(stage);

  // Wait for camera to arrive
  await new Promise(r => setTimeout(r, 3500));

  // Phase 3: Generate and show puzzle
  addTypingIndicator();
  const puzzleText = await generatePuzzle(stage);
  removeTypingIndicator();

  // Show puzzle text (without auto-speak from addMessage)
  const puzzleMsg = document.createElement('div');
  puzzleMsg.className = 'message ai';
  puzzleMsg.innerHTML = puzzleText
    .replace(/^\[PUZZLE\]\s*/i, '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  dom.chatMessages.appendChild(puzzleMsg);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

  // Speak puzzle and wait for completion
  await speakAndWait(puzzleText);
}

async function advanceStage() {
  state.currentStage++;

  if (state.currentStage >= STAGES.length) {
    await endGame();
    return;
  }

  const prevStage = STAGES[state.currentStage - 1];
  const nextStage = STAGES[state.currentStage];

  // Stop any playing audio before transition
  stopSpeaking();
  await showStageTransition(`SECTOR ${prevStage.id} UNLOCKED`);

  // Generate narration based on player performance
  addTypingIndicator();
  const narration = await generateNarration(prevStage, nextStage, {
    hintsUsed: state.totalHintsUsed,
    elapsedTime: state.elapsedSeconds
  });
  removeTypingIndicator();
  addSystemMessage(narration);

  // Wait for narration to finish reading BEFORE showing next stage
  await speakAndWait(narration);

  await showStageTransition(`SECTOR ${nextStage.id}: ${nextStage.name}`);
  await loadStage(nextStage);
}

async function endGame() {
  stopTimer();
  stopSpeaking();

  await showStageTransition('ALL SECTORS UNLOCKED');

  // Auto-collapse chat panel to show full sky view
  dom.chatPanel.classList.add('minimized');
  dom.chatToggle.textContent = '+';

  // Start clearing sky animation (runs in background)
  const skyPromise = setClearSkyWeather();

  // Generate ending while sky clears
  const rank = calculateRank();
  const endingStory = await generateEndingStory(getFormattedTime(), state.totalHintsUsed, STAGES.length);

  dom.finalTime.textContent = getFormattedTime();
  dom.finalHints.textContent = state.totalHintsUsed;
  dom.finalRank.textContent = rank;

  let storyEl = document.getElementById('ending-story');
  if (!storyEl) {
    storyEl = document.createElement('p');
    storyEl.id = 'ending-story';
    storyEl.style.cssText = 'max-width:600px;margin:0 auto 2rem;font-size:0.9rem;line-height:1.8;color:#e0e0ff;text-align:center;font-style:italic;';
    const stats = document.getElementById('ending-stats');
    stats.parentNode.insertBefore(storyEl, stats.nextSibling);
  }
  storyEl.textContent = endingStory;

  // Wait for sky to finish clearing, then show ending
  await skyPromise;

  speak(endingStory);
  showScreen('ending');
}

function calculateRank() {
  const time = state.elapsedSeconds;
  const hints = state.totalHintsUsed;
  if (hints === 0 && time < 300) return 'S';
  if (hints <= 2 && time < 600) return 'A';
  if (hints <= 5 && time < 900) return 'B';
  if (time < 1200) return 'C';
  return 'D';
}

// ----- Input Handling -----
async function onSendAnswer() {
  const answer = dom.chatInput.value.trim();
  if (!answer || state.isProcessing) return;

  if (answer === '/skip') {
    dom.chatInput.value = '';
    // Dev command: skip everything immediately
    stopSpeaking();
    removeTypingIndicator();
    state.isProcessing = false;
    addSystemMessage('DEBUG: STAGE SKIP');
    await advanceStage();
    return;
  }

  if (answer === '/end') {
    dom.chatInput.value = '';
    // Dev command: jump directly to ending
    stopSpeaking();
    removeTypingIndicator();
    state.isProcessing = false;
    addSystemMessage('DEBUG: JUMP TO ENDING');
    await endGame();
    return;
  }

  state.isProcessing = true;
  dom.chatSend.disabled = true;
  dom.chatInput.value = '';

  addMessage(answer, 'user');

  addTypingIndicator();
  const response = await evaluateAnswer(answer);
  removeTypingIndicator();

  if (response.startsWith('[CORRECT]') || response.includes('[CORRECT]')) {
    playSound('correct');
    // Show message but don't auto-speak (we'll use speakAndWait)
    const msg = document.createElement('div');
    msg.className = 'message ai';
    msg.innerHTML = response
      .replace(/^\[CORRECT\]\s*/i, '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    dom.chatMessages.appendChild(msg);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

    // Wait for response to be fully spoken before advancing
    await speakAndWait(response);

    addSystemMessage('ACCESS GRANTED -- SECTOR UNLOCKED');
    state.isProcessing = false;
    dom.chatSend.disabled = false;
    await advanceStage();
  } else {
    playSound('wrong');
    addMessage(response, 'ai');
    state.isProcessing = false;
    dom.chatSend.disabled = false;
  }
}

async function onHintRequest() {
  if (state.isProcessing) return;

  state.hintLevel = Math.min(state.hintLevel + 1, 3);
  state.totalHintsUsed++;
  state.isProcessing = true;

  playSound('hint');
  addSystemMessage(`HINT DECRYPT -- LEVEL ${state.hintLevel}/3`);
  addTypingIndicator();
  const hint = await requestHint(state.hintLevel);
  removeTypingIndicator();
  addMessage(hint, 'ai');

  state.isProcessing = false;
}

// ----- Event Listeners -----
dom.startBtn.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startGame();
});

dom.restartBtn.addEventListener('click', () => {
  stopSpeaking();
  showScreen('title');
  clearMarkers();
  clearHighlights();
  stopTimer();
});

dom.chatSend.addEventListener('click', onSendAnswer);
dom.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onSendAnswer();
  }
});

dom.chatToggle.addEventListener('click', () => {
  dom.chatPanel.classList.toggle('minimized');
  dom.chatToggle.textContent = dom.chatPanel.classList.contains('minimized') ? '+' : '_';
});

// Voice skip button
document.getElementById('voice-skip-btn').addEventListener('click', () => {
  stopSpeaking();
});

// Voice toggle
document.getElementById('audio-indicator').addEventListener('click', () => {
  const enabled = toggleTTS();
  const btn = document.getElementById('audio-indicator');
  btn.textContent = enabled ? 'VOICE' : 'MUTE';
  btn.classList.toggle('muted', !enabled);
});

// ----- Initialize -----
showScreen('title');
