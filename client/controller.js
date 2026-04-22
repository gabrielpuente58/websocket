'use strict';

const INPUT_SEND_MS = 50;
const DEAD_ZONE     = 0.15;

const state = {
  ws: null,
  code: null,
  playerId: null,
  dx: 0,
  dy: 0,
  shooting: false,
  _inputTimer: null,
  _joystickTouchId: null,
  _joystickBase: null,
  _joystickRadius: 90,
  _shootTouchId: null,
};

const screens = {
  code: document.getElementById('code-screen'),
  connect: document.getElementById('connect-screen'),
  wait: document.getElementById('wait-screen'),
  play: document.getElementById('play-screen'),
  over: document.getElementById('over-screen'),
};

function show(name) {
  for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
}

const urlParams = new URLSearchParams(window.location.search);
const urlCode = (urlParams.get('code') || '').trim().toUpperCase();

if (urlCode) {
  state.code = urlCode;
  connect();
} else {
  show('code');
  setupCodeEntry();
}

function setupCodeEntry() {
  const input = document.getElementById('code-input');
  const btn   = document.getElementById('code-submit');
  const err   = document.getElementById('code-error');

  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    err.textContent = '';
  });

  const submit = () => {
    const code = input.value.trim();
    if (code.length < 6) { err.textContent = 'Code must be 6 characters'; return; }
    state.code = code;
    connect();
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function connect() {
  show('connect');
  document.getElementById('connect-msg').textContent = `Connecting to ${state.code}…`;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}?role=controller&code=${encodeURIComponent(state.code)}`;

  const ws = new WebSocket(url);
  state.ws = ws;

  ws.onclose = () => {
    stopInputLoop();
    if (!screens.play.classList.contains('hidden')) {
      showGameOver('Disconnected', 0, 0);
    } else if (screens.over.classList.contains('hidden')) {
      show('code');
      setupCodeEntry();
      document.getElementById('code-error').textContent = 'Connection closed.';
    }
  };

  ws.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    handleMessage(msg);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'code_error':
      show('code');
      setupCodeEntry();
      document.getElementById('code-error').textContent = msg.message || 'Bad code';
      break;

    case 'controller_assigned':
      state.playerId = msg.playerId ?? 0;
      show('wait');
      updateWaitBadge();
      break;

    case 'game_start':
      show('play');
      setupPlayControls();
      updatePlayLabel();
      startInputLoop();
      break;

    case 'controller_state':
      renderHUD(msg);
      break;

    case 'game_over':
      stopInputLoop();
      showGameOver(
        msg.result === 'win' ? 'VICTORY' : 'GAME OVER',
        msg.score ?? 0,
        msg.wave ?? 0,
      );
      break;

    case 'wave_start':
      flashStatus(`WAVE ${msg.wave}`, 1600);
      break;

    default:
      break;
  }
}

function updateWaitBadge() {
  const b = document.getElementById('wait-badge');
  b.textContent = `PLAYER ${state.playerId + 1}`;
  b.classList.remove('p1', 'p2');
  b.classList.add(state.playerId === 0 ? 'p1' : 'p2');
}

function updatePlayLabel() {
  const l = document.getElementById('hud-label');
  l.textContent = `P${state.playerId + 1}`;
  l.classList.toggle('p2', state.playerId === 1);
}

function renderHUD(msg) {
  const ratio = Math.max(0, Math.min(1, (msg.hp ?? 0) / (msg.maxHp ?? 100)));
  const fill = document.getElementById('hud-hpfill');
  fill.style.width = (ratio * 100) + '%';
  fill.style.backgroundColor = ratio > 0.6 ? '#00cc55' : ratio > 0.3 ? '#ccaa00' : '#cc2222';

  document.getElementById('hud-score').textContent = msg.score ?? 0;

  const status = document.getElementById('hud-status');
  if (msg.alive === false) {
    const prog = Math.round(msg.reviveProgress ?? 0);
    status.textContent = `DOWNED · ${prog}%`;
    status.style.color = '#ff6600';
  } else if (msg.shield) {
    status.textContent = 'SHIELD';
    status.style.color = '#44aaff';
  } else if (msg.rapidFire) {
    status.textContent = 'RAPID FIRE';
    status.style.color = '#ffdd00';
  } else {
    status.textContent = '';
  }
}

function flashStatus(text, ms) {
  const status = document.getElementById('hud-status');
  const prev = status.textContent;
  const prevColor = status.style.color;
  status.textContent = text;
  status.style.color = '#ffdd00';
  setTimeout(() => {
    if (status.textContent === text) {
      status.textContent = prev;
      status.style.color = prevColor;
    }
  }, ms);
}

function showGameOver(title, score, wave) {
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-score').textContent = `Score: ${score} · Wave: ${wave}`;
  show('over');
  const btn = document.getElementById('over-back');
  btn.onclick = () => {
    if (state.ws) state.ws.close();
    window.location.href = '/play';
  };
}

function setupPlayControls() {
  const joyZone = document.getElementById('joystick-zone');
  const joyBase = document.getElementById('joystick-base');
  const joyKnob = document.getElementById('joystick-knob');
  const shootZone = document.getElementById('shoot-zone');
  const shootBtn  = document.getElementById('shoot-button');

  joyZone.addEventListener('touchstart', (e) => {
    if (state._joystickTouchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    state._joystickTouchId = t.identifier;
    const rect = joyZone.getBoundingClientRect();
    const cx = t.clientX - rect.left;
    const cy = rect.height / 2;
    state._joystickBase = { x: cx, y: cy };
    joyBase.style.left = cx + 'px';
    joyBase.style.top  = cy + 'px';
    joyBase.classList.remove('hidden');
    state._joystickRadius = (joyBase.offsetWidth || 180) / 2;
    joyKnob.style.transform = 'translate(0, 0)';
    e.preventDefault();
  }, { passive: false });

  joyZone.addEventListener('touchmove', (e) => {
    if (state._joystickTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== state._joystickTouchId) continue;
      const rect = joyZone.getBoundingClientRect();
      const px = t.clientX - rect.left - state._joystickBase.x;
      const py = t.clientY - rect.top  - state._joystickBase.y;
      const r  = state._joystickRadius;
      const mag = Math.hypot(px, py);
      const clampedX = mag > r ? px * (r / mag) : px;
      const clampedY = mag > r ? py * (r / mag) : py;
      joyKnob.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
      let dx = clampedX / r;
      let dy = clampedY / r;
      const m = Math.hypot(dx, dy);
      if (m < DEAD_ZONE) { dx = 0; dy = 0; }
      state.dx = dx;
      state.dy = dy;
      e.preventDefault();
      break;
    }
  }, { passive: false });

  const endJoystick = (e) => {
    if (state._joystickTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== state._joystickTouchId) continue;
      state._joystickTouchId = null;
      state.dx = 0;
      state.dy = 0;
      joyBase.classList.add('hidden');
      joyKnob.style.transform = 'translate(0, 0)';
      break;
    }
  };
  joyZone.addEventListener('touchend', endJoystick);
  joyZone.addEventListener('touchcancel', endJoystick);

  shootZone.addEventListener('touchstart', (e) => {
    if (state._shootTouchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    state._shootTouchId = t.identifier;
    state.shooting = true;
    shootBtn.classList.add('active');
    e.preventDefault();
  }, { passive: false });

  const endShoot = (e) => {
    if (state._shootTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== state._shootTouchId) continue;
      state._shootTouchId = null;
      state.shooting = false;
      shootBtn.classList.remove('active');
      break;
    }
  };
  shootZone.addEventListener('touchend', endShoot);
  shootZone.addEventListener('touchcancel', endShoot);
}

function startInputLoop() {
  stopInputLoop();
  state._inputTimer = setInterval(sendInput, INPUT_SEND_MS);
}

function stopInputLoop() {
  if (state._inputTimer) {
    clearInterval(state._inputTimer);
    state._inputTimer = null;
  }
}

function sendInput() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify({
    type: 'input',
    dx: state.dx,
    dy: state.dy,
    shooting: state.shooting,
  }));
}
