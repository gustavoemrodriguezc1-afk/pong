const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Constantes del juego ----------
const W = 800, H = 500;
const PADDLE_W = 12, PADDLE_H = 90, PADDLE_SPEED = 6;
const BALL_R = 8;
const WIN_SCORE = 7;

const rooms = new Map(); // code -> room

function makeRoom(code) {
  return {
    code,
    players: {},          // socketId -> { name, side, y, score, ready }
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    state: 'waiting',     // waiting | playing | ended
    interval: null,
    winner: null,
  };
}

function resetBall(room, dir) {
  room.ball.x = W / 2;
  room.ball.y = H / 2;
  room.ball.vx = 4.5 * dir;
  room.ball.vy = (Math.random() * 4 - 2);
}

function startGame(room) {
  room.state = 'playing';
  room.winner = null;
  const ids = Object.keys(room.players);
  room.players[ids[0]].score = 0;
  room.players[ids[1]].score = 0;
  resetBall(room, Math.random() < 0.5 ? 1 : -1);
  io.to(room.code).emit('gameStart', {
    players: publicPlayers(room),
  });
  // Bucle del juego (autoritativo en el servidor, ~60fps)
  room.interval = setInterval(() => tick(room), 1000 / 60);
}

function endGame(room) {
  clearInterval(room.interval);
  room.interval = null;
  room.state = 'ended';
  io.to(room.code).emit('gameOver', { winner: room.winner });
}

function tick(room) {
  if (room.state !== 'playing') return;
  const b = room.ball;
  b.x += b.vx;
  b.y += b.vy;

  // Rebote arriba/abajo
  if (b.y - BALL_R < 0 || b.y + BALL_R > H) {
    b.vy *= -1;
    b.y = Math.max(BALL_R, Math.min(H - BALL_R, b.y));
  }

  const ids = Object.keys(room.players);
  const left = room.players[ids.find(id => room.players[id].side === 'left')];
  const right = room.players[ids.find(id => room.players[id].side === 'right')];

  // Paleta izquierda
  if (b.vx < 0 && b.x - BALL_R < PADDLE_W + 10 &&
      b.y > left.y - PADDLE_H / 2 && b.y < left.y + PADDLE_H / 2) {
    b.vx = Math.abs(b.vx) * 1.05;
    b.vy += (b.y - left.y) * 0.15;
    b.vx = Math.min(b.vx, 12);
  }
  // Paleta derecha
  if (b.vx > 0 && b.x + BALL_R > W - PADDLE_W - 10 &&
      b.y > right.y - PADDLE_H / 2 && b.y < right.y + PADDLE_H / 2) {
    b.vx = -Math.abs(b.vx) * 1.05;
    b.vy += (b.y - right.y) * 0.15;
    b.vx = Math.max(b.vx, -12);
  }

  // Gol
  if (b.x < -BALL_R) {
    right.score++;
    afterGoal(room, right);
  } else if (b.x > W + BALL_R) {
    left.score++;
    afterGoal(room, left);
  } else {
    io.to(room.code).emit('state', snapshot(room));
  }
}

function afterGoal(room, scorer) {
  if (scorer.score >= WIN_SCORE) {
    room.winner = scorer.name;
    io.to(room.code).emit('state', snapshot(room));
    return endGame(room);
  }
  resetBall(room, scorer.side === 'left' ? -1 : 1);
  io.to(room.code).emit('state', snapshot(room));
  io.to(room.code).emit('goal', { scorer: scorer.name, side: scorer.side });
}

function publicPlayers(room) {
  const out = {};
  for (const [id, p] of Object.entries(room.players)) {
    out[id] = { name: p.name, side: p.side, score: p.score };
  }
  return out;
}

function snapshot(room) {
  const players = {};
  for (const [id, p] of Object.entries(room.players)) {
    players[id] = { name: p.name, side: p.side, y: p.y, score: p.score };
  }
  return { ball: { ...room.ball }, players };
}

function roomCode() {
  let code;
  do { code = Math.random().toString(36).substring(2, 6).toUpperCase(); }
  while (rooms.has(code));
  return code;
}

// ---------- Socket.io ----------
io.on('connection', (socket) => {
  let myRoom = null;
  let mySide = null;

  socket.on('createRoom', ({ name }, cb) => {
    const code = roomCode();
    const room = makeRoom(code);
    room.players[socket.id] = { name: name || 'Jugador 1', side: 'left', y: H / 2, score: 0 };
    rooms.set(code, room);
    socket.join(code);
    myRoom = code; mySide = 'left';
    cb({ ok: true, code, side: 'left' });
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Sala no encontrada' });
    if (Object.keys(room.players).length >= 2) return cb({ ok: false, error: 'Sala llena' });
    room.players[socket.id] = { name: name || 'Jugador 2', side: 'right', y: H / 2, score: 0 };
    socket.join(code);
    myRoom = code; mySide = 'right';
    cb({ ok: true, code, side: 'right' });
    io.to(code).emit('playerJoined', { players: publicPlayers(room) });
    // Arranca solo (Fase 2-3): dos jugadores = la partida comienza
    setTimeout(() => { if (rooms.get(code)?.state === 'waiting') startGame(room); }, 800);
  });

  socket.on('paddle', (y) => {
    const room = rooms.get(myRoom);
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].y = Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, y));
  });

  socket.on('chat', (msg) => {
    const room = rooms.get(myRoom);
    if (!room || !room.players[socket.id]) return;
    msg = String(msg).slice(0, 140).trim();
    if (!msg) return;
    io.to(myRoom).emit('chat', { name: room.players[socket.id].name, msg });
  });

  socket.on('rematch', () => {
    const room = rooms.get(myRoom);
    if (!room || room.state !== 'ended') return;
    const ids = Object.keys(room.players);
    if (ids.length === 2) startGame(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(myRoom);
    if (!room) return;
    const pname = room.players[socket.id]?.name || 'Un jugador';
    delete room.players[socket.id];
    if (room.interval) { clearInterval(room.interval); room.interval = null; }
    room.state = 'waiting';
    if (Object.keys(room.players).length === 0) {
      rooms.delete(myRoom);
    } else {
      io.to(myRoom).emit('opponentLeft', { name: pname });
    }
  });
});

server.listen(PORT, () => console.log(`Pong corriendo en http://localhost:${PORT}`));
