const socket = io();

const W = 800, H = 500;
const PADDLE_W = 12, PADDLE_H = 90;

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let myId = null;
let mySide = null;
let players = {};       // id -> {name, side, y, score}
let ball = { x: W/2, y: H/2 };
let keys = {};
let rematchShown = false;

// ---------- Lobby ----------
$('btnCreate').onclick = () => {
  const name = $('nameInput').value.trim() || 'Jugador 1';
  socket.emit('createRoom', { name }, (res) => {
    if (!res.ok) return $('lobbyError').textContent = res.error;
    mySide = res.side;
    $('lobby').classList.add('hidden');
    $('waiting').classList.remove('hidden');
    $('showCode').textContent = res.code;
  });
};

$('btnJoin').onclick = () => {
  const name = $('nameInput').value.trim() || 'Jugador 2';
  const code = $('codeInput').value.trim().toUpperCase();
  if (!code) return $('lobbyError').textContent = 'Escribe el código';
  socket.emit('joinRoom', { code, name }, (res) => {
    if (!res.ok) return $('lobbyError').textContent = res.error;
    mySide = res.side;
    $('lobby').classList.add('hidden');
    $('waiting').classList.remove('hidden');
    $('showCode').textContent = code;
  });
};

// ---------- Eventos ----------
socket.on('playerJoined', ({ players: p }) => {
  players = p;
  $('waiting').classList.add('hidden');
  $('game').classList.remove('hidden');
  setupNames();
});

socket.on('gameStart', ({ players: p }) => {
  players = p;
  rematchShown = false;
  $('btnRematch').classList.add('hidden');
  $('statusMsg').textContent = '¡A jugar!';
  setTimeout(() => { if (!$('statusMsg').textContent.includes('ganó')) $('statusMsg').textContent = ''; }, 1500);
  setupNames();
  updateScore();
});

socket.on('state', (s) => {
  ball = s.ball;
  for (const [id, p] of Object.entries(s.players)) {
    if (!players[id]) players[id] = {};
    Object.assign(players[id], p);
  }
  updateScore();
});

socket.on('goal', ({ scorer }) => {
  $('statusMsg').textContent = `⚽ ¡Gol de ${scorer}!`;
  spawnButterfly();
  setTimeout(() => $('statusMsg').textContent = '', 1200);
});

socket.on('gameOver', ({ winner }) => {
  $('statusMsg').textContent = `🏆 ¡${winner} ganó la partida!`;
  $('btnRematch').classList.remove('hidden');
});

socket.on('opponentLeft', ({ name }) => {
  $('statusMsg').textContent = `${name} se desconectó 😢`;
  $('btnRematch').classList.add('hidden');
  setTimeout(() => {
    $('game').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('lobbyError').textContent = 'La sala se cerró. Crea una nueva partida.';
  }, 2500);
});

socket.on('chat', ({ name, msg }) => {
  const log = $('chatLog');
  const div = document.createElement('div');
  div.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(msg)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
});

$('btnRematch').onclick = () => socket.emit('rematch');

function sendChat() {
  const msg = $('chatInput').value.trim();
  if (!msg) return;
  socket.emit('chat', msg);
  $('chatInput').value = '';
}
$('btnChat').onclick = sendChat;
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Nombres y marcador ----------
function setupNames() {
  const list = Object.values(players);
  const left = list.find(p => p.side === 'left');
  const right = list.find(p => p.side === 'right');
  $('p1name').textContent = left?.name || '...';
  $('p2name').textContent = right?.name || '...';
}

function updateScore() {
  const list = Object.values(players);
  const left = list.find(p => p.side === 'left');
  const right = list.find(p => p.side === 'right');
  $('s1').textContent = left?.score ?? 0;
  $('s2').textContent = right?.score ?? 0;
}

// ---------- Entrada ----------
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup','arrowdown',' '].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

// Táctil: arrastrar en el canvas mueve tu paleta
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const y = ((e.touches[0].clientY - rect.top) / rect.height) * H;
  sendPaddle(y);
}, { passive: false });

function sendPaddle(y) {
  socket.emit('paddle', y);
  const me = Object.entries(players).find(([, p]) => p.side === mySide);
  if (me) me[1].y = Math.max(PADDLE_H/2, Math.min(H - PADDLE_H/2, y));
}

// ---------- Mariposas (Fase 6) ----------
const butterflies = [];
function spawnButterfly() {
  butterflies.push({
    x: W/2, y: H/2,
    vx: (Math.random() - 0.5) * 3,
    vy: -2 - Math.random() * 2,
    life: 1,
    hue: 280 + Math.random() * 60,
    flap: Math.random() * 10,
  });
}

// ---------- Dibujo ----------
function draw() {
  requestAnimationFrame(draw);
  ctx.clearRect(0, 0, W, H);

  // Línea central
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Paletas
  ctx.fillStyle = '#7bd88f';
  for (const p of Object.values(players)) {
    const x = p.side === 'left' ? 10 : W - 10 - PADDLE_W;
    ctx.fillRect(x, (p.y || H/2) - PADDLE_H/2, PADDLE_W, PADDLE_H);
  }

  // Pelota
  ctx.fillStyle = '#ffd97b';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
  ctx.fill();

  // Mariposas
  for (let i = butterflies.length - 1; i >= 0; i--) {
    const b = butterflies[i];
    b.x += b.vx + Math.sin(b.flap) * 1.5;
    b.y += b.vy;
    b.vy += 0.02;
    b.flap += 0.35;
    b.life -= 0.008;
    if (b.life <= 0) { butterflies.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = b.life;
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.sin(b.flap) * 0.4);
    ctx.fillStyle = `hsl(${b.hue}, 80%, 70%)`;
    const w = 6 * Math.abs(Math.sin(b.flap * 2)) + 2;
    ctx.beginPath();
    ctx.ellipse(-w/2, 0, w, 4, -0.5, 0, Math.PI * 2);
    ctx.ellipse(w/2, 0, w, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
draw();

// ---------- Loop de entrada local (tu paleta) ----------
setInterval(() => {
  if (!mySide) return;
  const me = Object.values(players).find(p => p.side === mySide);
  if (!me) return;
  let moved = false;
  if (keys['w'] || keys['arrowup']) { me.y -= 6; moved = true; }
  if (keys['s'] || keys['arrowdown']) { me.y += 6; moved = true; }
  if (moved) {
    me.y = Math.max(PADDLE_H/2, Math.min(H - PADDLE_H/2, me.y));
    socket.emit('paddle', me.y);
  }
}, 1000 / 60);
