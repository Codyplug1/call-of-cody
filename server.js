'use strict';
/*
 * Arena Shooter server (fase 1).
 * Geen externe packages nodig: statische bestanden + een eigen kleine WebSocket-server.
 * Server bepaalt: schade, hits, bots, rondes en levelwissels.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Shared = require('./public/shared.js');

const PORT = +process.env.PORT || 3000;
const TICK_MS = 50;
const COUNTDOWN_MS = +process.env.COUNTDOWN_MS || 3000;
const ROUND_PAUSE_MS = +process.env.ROUND_PAUSE_MS || 6000;
const SOLO_BOTS = process.env.SOLO_BOTS !== undefined ? +process.env.SOLO_BOTS : 5;
const MATCHEND_DELAY_MS = +process.env.MATCHEND_DELAY_MS || 3000; // roundEnd(matchOver) -> matchEnd
const LOBBY_DELAY_MS = +process.env.LOBBY_DELAY_MS || 8000;       // matchEnd -> terug naar lobby
const START_LEVEL = +process.env.START_LEVEL || 0;                 // (testen) met welk level een wedstrijd begint
const DEBUG_DOORS = !!process.env.DEBUG_DOORS;                     // (testen) bots + deuren loggen
const PROTECT_MS = 2000;     // spawnbescherming na start van een ronde
const TAKEOVER_PROTECT_MS = 1000; // korte bescherming na het overnemen van een bot
const CLIENT_SPEED = 7;      // loopsnelheid van de client (game.js SPEED)
const MAX_SPEED_FACTOR = 1.6;
const MOVE_TOLERANCE = 0.75; // extra eenheden per bericht voor latency-pieken
const TARGETS = [3, 5, 7];
// Botinstellingen per moeilijkheid.
const DIFFICULTY = {
  easy: { spread: 0.07, fireMin: 2.6, fireMax: 4, turn: 2.0, react: 900, view: 45, retreat: true },
  normal: { spread: 0.04, fireMin: 1.6, fireMax: 3, turn: 3.2, react: 550, view: 60, retreat: true },
  hard: { spread: 0.022, fireMin: 1.2, fireMax: 2, turn: 4.5, react: 300, view: 75, retreat: false },
};
const MAX_PLAYERS = Shared.MAX_PLAYERS;
const MAX_FRAME = 16384;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------- HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    rel = decodeURIComponent(url.pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ---------------------------------------------------------------- WebSocket (RFC 6455, minimaal)

function parseFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const fin = (b0 & 0x80) !== 0;
  const op = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(MAX_FRAME)) throw new Error('frame too large');
    len = Number(big);
    off = 10;
  }
  if (len > MAX_FRAME) throw new Error('frame too large');
  let mask = null;
  if (masked) {
    if (buf.length < off + 4) return null;
    mask = buf.subarray(off, off + 4);
    off += 4;
  }
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.subarray(off, off + len));
  if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
  return { fin, op, payload, total: off + len };
}

function encodeFrame(op, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | op, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | op; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | op; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class Client {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragOp = 0;
    this.fragSize = 0;
    this.closed = false;
    this.player = null;
    this.room = null;
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => this.onClose());
  }

  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    try {
      for (;;) {
        const f = parseFrame(this.buf);
        if (!f) break;
        this.buf = this.buf.subarray(f.total);
        this.handleFrame(f);
        if (this.closed) return;
      }
    } catch (e) {
      console.error('verbinding verbroken (ongeldig frame):', e.message);
      this.destroy();
    }
  }

  handleFrame(f) {
    if (f.op === 8) { // close
      try { this.socket.write(encodeFrame(8, Buffer.alloc(0))); } catch (e) { /* ignore */ }
      return this.destroy();
    }
    if (f.op === 9) { // ping -> pong
      try { this.socket.write(encodeFrame(10, f.payload)); } catch (e) { /* ignore */ }
      return;
    }
    if (f.op === 10) return; // pong
    if (f.op === 1 || f.op === 2) {
      this.fragOp = f.op;
      this.frags = [f.payload];
      this.fragSize = f.payload.length;
    } else if (f.op === 0) {
      this.frags.push(f.payload);
      this.fragSize += f.payload.length;
      if (this.fragSize > MAX_FRAME) return this.destroy();
    } else {
      return;
    }
    if (f.fin) {
      const msg = Buffer.concat(this.frags);
      this.frags = [];
      this.fragSize = 0;
      if (this.fragOp === 1) this.onText(msg.toString('utf8'));
    }
  }

  onText(text) {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    try { handleMessage(this, msg); } catch (e) { console.error('handler error', e); }
  }

  send(str) {
    if (this.closed) return;
    try {
      if (this.socket.writableLength > 1 << 20) {
        console.error('verbinding verbroken (client loopt te ver achter)');
        return this.destroy();
      }
      this.socket.write(encodeFrame(1, Buffer.from(str)));
    } catch (e) { this.destroy(); }
  }

  destroy() {
    try { this.socket.destroy(); } catch (e) { /* ignore */ }
    this.onClose();
  }

  onClose() {
    if (this.closed) return;
    this.closed = true;
    if (this.player && this.room) removePlayer(this.room, this.player);
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if ((req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);
  new Client(socket);
});

// ---------------------------------------------------------------- Spel

const rooms = new Map();
let nextPlayerId = 1;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function r2(v) { return Math.round(v * 100) / 100; }
function r1(v) { return Math.round(v * 10) / 10; }
function num(v) { return typeof v === 'number' && Number.isFinite(v); }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function sanitizeName(n) {
  return String(n == null ? '' : n).replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
}
function cleanCode(c) {
  return String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}

function makeRoom(code) {
  return {
    code, players: new Map(), state: 'lobby', levelIndex: START_LEVEL, round: 0,
    hostId: null, timer: null, phaseEnd: 0,
    difficulty: 'normal', target: 5, mode: 'classic',
    doors: null,   // { level, s: [toestand per deur], hp: [...] } (Shared.newDoorState), nieuw bij elke ronde
  };
}

// ---------------------------------------------------------------- deuren (server-gezag)
// Toestand per deur: 0 = dicht, 1 = open naar binnen, 2 = open naar buiten, 3 = kapot (rest van de ronde weg).
// Shared.resolveCollision / rayBlockDistance kijken naar de deuren van de kamer die met useDoors() actief is gezet.
function useDoors(room) {
  Shared.setDoorState(room && room.doors && room.doors.level === currentLevel(room).id ? room.doors : null);
}

function doorMsg(room, id, extra) {
  return Object.assign({ t: 'door', id, s: room.doors.s[id], hp: room.doors.hp[id] }, extra || {});
}

// Speler (of bot) p wil deur id open/dicht doen. Geeft true als het gelukt is.
function toggleDoor(room, p, id) {
  const d = room.doors;
  if (!d || !Number.isInteger(id) || id < 0 || id >= d.s.length || !p.alive) return false;
  const now = Date.now();
  if (now < (p.doorAt || 0)) return false;   // niet spammen
  p.doorAt = now + 250;
  // (met y: wie op een dak / verdieping boven de deur staat, staat niet in de deuropening)
  const others = [...room.players.values()].filter((q) => q.alive && q !== p).map((q) => ({ x: q.x, z: q.z, y: q.y }));
  const user = { x: p.x, z: p.z, y: p.y };
  others.push(user);
  const ns = Shared.doorUse(currentLevel(room).id, id, d.s[id], user, others);
  if (ns < 0) {
    if (d.s[id] !== 3) sendTo(p, doorMsg(room, id, { deny: 1 }));
    return false;
  }
  d.s[id] = ns;
  if (DEBUG_DOORS) console.log('[door]', p.name, 'door', id, '->', ns);
  broadcast(room, doorMsg(room, id, { by: p.id }));
  return true;
}

// Schade aan een deur (kogels); bij 0 hp is de deur kapot.
function damageDoor(room, id, dmg, point) {
  const d = room.doors;
  if (!d || d.s[id] === 3) return;
  d.hp[id] = Math.max(0, d.hp[id] - dmg);
  if (d.hp[id] <= 0) d.s[id] = 3;
  broadcast(room, doorMsg(room, id, { p: point }));
}

function currentLevel(room) {
  return Shared.LEVELS[room.levelIndex % Shared.LEVELS.length];
}

function freeTint(room) {
  const used = new Set([...room.players.values()].map((p) => p.tint));
  for (let i = 0; i < Shared.TINTS.length; i++) if (!used.has(i)) return i;
  return 0;
}

function newPlayer(room, name, skin, weapon, isBot) {
  return {
    id: nextPlayerId++, name, skin, weapon, baseWeapon: weapon, fin: 'hulk', isBot: !!isBot, client: null,
    tint: freeTint(room), x: 0, z: 0, yaw: 0, hp: 100, alive: false,
    wins: 0, kills: 0, lastShot: 0, nextShot: 0, strafe: Math.random() * 10,
    protectedUntil: 0,
    slot: 0, medkits: 1, healUntil: 0, lastMelee: 0, lock: null,
    cheats: { speedBoost: false, superJump: false, godMode: false, infiniteAmmo: true },   // inventaris (0 wapen / 1 mes / 2 medkit), medkit, finisher
    // verticale toestand: y = voeten (wereld), stance 0 staan / 1 hurken / 2 liggen, air = in de lucht
    y: 0, stance: 0, air: false, onLadder: false,
    vy: 0, ground: true, ladder: -1, ls: 0,          // (bots: Shared.stepPlayer)
    // anti-cheat: laatst geaccepteerde toestand (Shared.validateState)
    ac: { x: 0, z: 0, y: 0, sy: 0, airT: 0, t: 0, stance: 0, stanceT: 0, ladder: -1 },
    // bot-AI
    targetId: null, visible: false, lastSeen: 0, reactAt: 0, nextThink: 0,
    goal: null, thinkX: 0, thinkZ: 0, stanceUntil: 0, stuckT: 0,
  };
}

// Speler neerzetten (spawn, overnemen): verticale toestand + anti-cheat opnieuw.
function placePlayer(room, p, x, z, y, now) {
  const level = currentLevel(room);
  p.x = x; p.z = z;
  p.y = y === undefined ? Shared.supportHeight(level.id, x, z) : y;
  p.stance = 0; p.air = false; p.onLadder = false;
  p.vy = 0; p.ground = true; p.ladder = -1; p.ls = 0;
  p.ac = { x: p.x, z: p.z, y: p.y, sy: p.y, airT: 0, t: now, stance: 0, stanceT: 0, ladder: -1 };
}
// + slot (bits 16/32: 0 wapen, 1 mes, 2 medkit), 64 = medkit aan het gebruiken, 128 = in een finisher
function stFlags(p) { return p.stance | (p.air ? 4 : 0) | (p.onLadder ? 8 : 0) | ((p.slot | 0) << 4) | (p.healUntil ? 64 : 0) | (p.lock ? 128 : 0); }

function addBot(room) {
  // laagste vrije nummer, zodat namen uniek blijven (ook nadat een speler een bot heeft overgenomen)
  const used = new Set([...room.players.values()].filter((p) => p.isBot).map((p) => p.name));
  let n = 1;
  while (used.has('Bot ' + n)) n++;
  const weapon = Shared.WEAPON_IDS[Math.floor(Math.random() * Shared.WEAPON_IDS.length)];
  const skin = Shared.SKINS[Math.floor(Math.random() * Shared.SKINS.length)].id;   // willekeurige skin voor afwisseling
  const b = newPlayer(room, 'Bot ' + n, skin, weapon, true);
  b.fin = Shared.FINISHER_IDS[Math.floor(Math.random() * Shared.FINISHER_IDS.length)];
  room.players.set(b.id, b);
  return b;
}

function info(p, base) {   // base = de gekozen lobby-keuze (anders het wapen dat de spelmodus geeft)
  return { id: p.id, name: p.name, skin: p.skin, weapon: base ? p.baseWeapon : p.weapon, tint: p.tint, bot: p.isBot, wins: p.wins, fin: p.fin };
}

function lobbyMsg(room) {
  return {
    t: 'lobby', code: room.code, state: room.state, hostId: room.hostId,
    difficulty: room.difficulty, target: room.target, mode: room.mode,
    players: [...room.players.values()].map((p) => info(p, true)),
  };
}

function resetAI(p) {
  p.targetId = null; p.visible = false; p.lastSeen = 0; p.reactAt = 0;
  p.nextThink = 0; p.goal = null; p.thinkX = p.x; p.thinkZ = p.z;
  p.holdUntil = 0; p.doorShot = null; p.nearDoor = false;
}

function roundMsg(room) {
  const level = currentLevel(room);
  return {
    t: 'round', round: room.round, level: level.id, levelIndex: room.levelIndex,
    target: room.target, mode: room.mode,
    countdown: Math.max(0, room.phaseEnd - Date.now()),
    players: [...room.players.values()].map((p) => Object.assign(info(p), {
      x: r2(p.x), z: r2(p.z), yaw: r2(p.yaw), hp: p.hp, alive: p.alive, y: r2(p.y), st: stFlags(p),
    })),
    // deuren: [toestand, hp] per deur (volgorde = Shared.getObstacles(level).doors)
    doors: room.doors && room.doors.level === level.id ? room.doors.s.map((s, i) => [s, room.doors.hp[i]]) : [],
  };
}

function sendTo(p, obj) { if (p.client) p.client.send(JSON.stringify(obj)); }
function broadcast(room, obj) {
  const s = JSON.stringify(obj);
  for (const p of room.players.values()) if (p.client) p.client.send(s);
}

function handleJoin(client, msg) {
  if (client.player) return;
  const name = sanitizeName(msg.name) || 'Player';
  let room;
  if (msg.create) {
    room = makeRoom(randomCode());
    rooms.set(room.code, room);
  } else {
    room = rooms.get(cleanCode(msg.room));
    if (!room) return client.send(JSON.stringify({ t: 'error', code: 'noroom' }));
  }
  if (room.players.size >= MAX_PLAYERS) {
    const bot = [...room.players.values()].find((p) => p.isBot);
    if (bot) room.players.delete(bot.id);
    else return client.send(JSON.stringify({ t: 'error', code: 'full' }));
  }
  const skin = Shared.SKINS.some((s) => s.id === msg.skin) ? msg.skin : Shared.SKINS[0].id;
  const weapon = Shared.WEAPONS[msg.weapon] ? msg.weapon : 'rifle';
  const p = newPlayer(room, name, skin, weapon, false);
  if (Shared.FINISHERS[msg.fin]) p.fin = msg.fin;
  p.client = client;
  client.player = p;
  client.room = room;
  room.players.set(p.id, p);
  if (room.hostId === null) room.hostId = p.id;
  client.send(JSON.stringify({ t: 'welcome', id: p.id, room: room.code }));
  if (room.state === 'lobby') {
    broadcast(room, lobbyMsg(room));
  } else {
    // Er loopt al een spel: kijk mee tot de volgende ronde.
    p.alive = false;
    sendTo(p, roundMsg(room));
    sendTo(p, { t: 'phase', phase: room.state });
  }
}

function removePlayer(room, p) {
  room.players.delete(p.id);
  const humans = [...room.players.values()].filter((x) => !x.isBot);
  if (humans.length === 0) {
    clearTimeout(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === p.id) room.hostId = humans[0].id;
  if (room.state === 'lobby') broadcast(room, lobbyMsg(room));
  else broadcast(room, { t: 'left', id: p.id, hostId: room.hostId });
}

function startRound(room) {
  clearTimeout(room.timer);
  const all = [...room.players.values()];
  const humans = all.filter((p) => !p.isBot);
  const bots = all.filter((p) => p.isBot);
  if (humans.length > 1) {
    for (const b of bots) room.players.delete(b.id);
  } else {
    const want = Math.max(0, Math.min(SOLO_BOTS, MAX_PLAYERS - humans.length));
    while (bots.length > want) room.players.delete(bots.pop().id);
    while (bots.length < want) bots.push(addBot(room));
  }
  room.round++;
  const level = currentLevel(room);
  room.doors = Shared.newDoorState(level.id);   // alle deuren weer dicht en heel
  useDoors(room);
  const list = [...room.players.values()];
  const now = Date.now();
  const mode = Shared.modeOf(room.mode);
  list.forEach((p, i) => {
    const sp = Shared.spawnPoint(level.id, i, list.length);
    p.yaw = sp.yaw;
    p.hp = mode.hp || 100; p.alive = true; p.lastShot = 0;
    // spelmodus: wapen (voor iedereen / roulette) en mes-modus
    const base = p.baseWeapon || p.weapon;
    p.weapon = mode.weapon || (mode.roulette ? Shared.WEAPON_IDS[Math.floor(Math.random() * Shared.WEAPON_IDS.length)] : base);
    p.nextShot = now + COUNTDOWN_MS + 600 + Math.random() * 1200;
    p.protectedUntil = 0;
    p.slot = mode.knives ? 1 : 0; p.medkits = 1; p.healUntil = 0; p.lock = null;
    // positie, hoogte, houding en anti-cheat tracker opnieuw op de spawnplek
    placePlayer(room, p, sp.x, sp.z, undefined, now);
    resetAI(p);
  });
  room.state = 'countdown';
  room.phaseEnd = now + COUNTDOWN_MS;
  broadcast(room, roundMsg(room));
  room.timer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.state = 'playing';
    const t = Date.now();
    for (const p of room.players.values()) {
      p.protectedUntil = t + PROTECT_MS;
      p.ac.x = p.x; p.ac.z = p.z; p.ac.t = t;
    }
    broadcast(room, { t: 'phase', phase: 'playing', protectMs: PROTECT_MS });
  }, COUNTDOWN_MS);
}

function matchRanking(room) {
  return [...room.players.values()]
    .map((p) => ({ id: p.id, name: p.name, wins: p.wins, kills: p.kills, bot: p.isBot }))
    .sort((a, b) => b.wins - a.wins || b.kills - a.kills);
}

function checkRoundEnd(room) {
  const alive = [...room.players.values()].filter((p) => p.alive);
  if (alive.length > 1) return;
  room.state = 'between';
  const w = alive[0] || null;
  if (w) w.wins++;
  const matchOver = [...room.players.values()].some((p) => p.wins >= room.target);
  broadcast(room, {
    t: 'roundEnd',
    winnerId: w ? w.id : null,
    winnerName: w ? w.name : null,
    scores: [...room.players.values()].map((p) => ({ id: p.id, wins: p.wins })),
    next: ROUND_PAUSE_MS,
    matchOver,
  });
  room.levelIndex++; // volgende speelveld
  if (!matchOver) {
    room.timer = setTimeout(() => {
      if (rooms.has(room.code)) startRound(room);
    }, ROUND_PAUSE_MS);
    return;
  }
  // Wedstrijd voorbij: eindstand tonen, daarna terug naar de lobby.
  room.timer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    const ranking = matchRanking(room);
    const top = ranking[0] || null;
    broadcast(room, {
      t: 'matchEnd',
      winnerId: top ? top.id : null,
      winnerName: top ? top.name : null,
      ranking,
    });
    room.timer = setTimeout(() => {
      if (rooms.has(room.code)) backToLobby(room);
    }, LOBBY_DELAY_MS);
  }, MATCHEND_DELAY_MS);
}

function backToLobby(room) {
  clearTimeout(room.timer);
  for (const p of [...room.players.values()]) {
    if (p.isBot) { room.players.delete(p.id); continue; }
    p.wins = 0; p.kills = 0; p.alive = false; p.hp = 100; p.protectedUntil = 0;
  }
  room.state = 'lobby';
  room.round = 0;
  room.levelIndex = START_LEVEL; // elke wedstrijd begint weer bij het bos
  broadcast(room, lobbyMsg(room));
}

// ---------------------------------------------------------------- schieten

function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  if (!l) return null;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function perturb(d, spread) {
  if (!spread) return d;
  const v = {
    x: d.x + (Math.random() * 2 - 1) * spread,
    y: d.y + (Math.random() * 2 - 1) * spread,
    z: d.z + (Math.random() * 2 - 1) * spread,
  };
  return normalize(v) || d;
}

// VR: geweer met twee handen vast = iets minder spreiding (klein voordeel, net als richten).
const TWO_HAND_SPREAD = 0.85;

function fire(room, shooter, o, d0, extraSpread, zoomed, twoHand) {
  const w = Shared.WEAPONS[shooter.weapon] || Shared.WEAPONS.rifle;
  const level = currentLevel(room);
  const d = normalize(d0);
  if (!d) return;
  // Wapens met een kijker (sniper) zijn zonder inzoomen onnauwkeurig.
  // Houding: gehurkt/liggend nauwkeuriger, in de lucht (springen/vallen) onnauwkeuriger.
  const M = Shared.MOVE;
  const stanceMul = (M.SPREAD[shooter.stance] || 1) * (shooter.air ? M.AIR_SPREAD : 1);
  // VR met twee handen: iets minder spreiding (alleen op de wapenspreiding, niet op de bot-extra)
  const spread = ((w.hipSpread !== undefined && !zoomed) ? w.hipSpread : w.spread) * (twoHand ? TWO_HAND_SPREAD : 1) + (extraSpread || 0);
  const hits = new Map();
  const oneshot = Shared.modeOf(room.mode).oneshot;
  const doorHits = new Map();   // deur-id -> { dmg, p: eerste inslagpunt }
  const pellets = [];
  for (let i = 0; i < w.pellets; i++) {
    const dir = perturb(d, spread * stanceMul);
    let bestT = Shared.rayBlockDistance(level.id, o, dir, w.range);   // (deurbladen houden de kogel ook tegen)
    let bestP = null;
    for (const p of room.players.values()) {
      if (p === shooter || !p.alive) continue;
      const t = Shared.rayHitPlayer(o, dir, p.x, p.y, p.z, bestT, p.stance, p.yaw);
      if (t !== null && t < bestT) { bestT = t; bestP = p; }
    }
    if (bestP) hits.set(bestP.id, (hits.get(bestP.id) || 0) + (oneshot ? 100 : Shared.pelletDamage(w, bestT)));
    else {
      // DEUR-HOOK: was een deurblad het eerste wat de kogel raakte? Dan krijgt de deur de schade.
      const dh = Shared.rayDoorHit(level.id, o, dir, bestT + 0.01);
      if (dh) {
        const e = doorHits.get(dh.id) || { dmg: 0, p: [r2(o.x + dir.x * dh.t), r2(o.y + dir.y * dh.t), r2(o.z + dir.z * dh.t)] };
        e.dmg += w.damage;
        doorHits.set(dh.id, e);
      }
    }
    pellets.push([+dir.x.toFixed(5), +dir.y.toFixed(5), +dir.z.toFixed(5), r1(bestT)]);
  }
  broadcast(room, { t: 'shot', id: shooter.id, w: w.id, o: [r2(o.x), r2(o.y), r2(o.z)], p: pellets });
  for (const [id, e] of doorHits) damageDoor(room, id, e.dmg, e.p);
  const now = Date.now();
  for (const [id, dmg] of hits) {
    const v = room.players.get(id);
    if (v) applyDamage(room, shooter, v, Math.round(dmg), now);
  }
}

// Schade toepassen (kogels, mes): spawnbescherming, hit/kill-berichten, finisher afbreken als de aanvaller sterft.
function applyDamage(room, by, v, dmg, now, extra) {
  if (!v.alive || v.cheats?.godMode || now < v.protectedUntil) return false; // god mode / spawnbescherming
  // Een geraakte bot weet ongeveer waar de schutter staat.
  if (v.isBot && !v.visible) v.goal = { x: by.x, z: by.z };
  v.hp = Math.max(0, v.hp - dmg);
  broadcast(room, Object.assign({ t: 'hit', id: v.id, by: by.id, dmg, hp: v.hp }, extra || {}));
  if (v.hp <= 0) killPlayer(room, by, v, extra && extra.m ? { m: 1 } : null);
  return true;
}
function killPlayer(room, by, v, extra) {
  v.alive = false; v.healUntil = 0;
  by.kills++;
  // in een finisher? aanvaller dood = slachtoffer leeft verder; slachtoffer dood = finisher voorbij
  if (v.lock) endFinisher(room, v.lock, false);
  broadcast(room, Object.assign({ t: 'kill', id: v.id, by: by.id }, extra || {}));
}

// ---------------------------------------------------------------- mes, medkit, finisher
function meleeAttack(room, p, yaw, now) {
  if (now - p.lastMelee < Shared.MELEE.COOLDOWN * 1000 - 80) return;
  p.lastMelee = now;
  cancelHeal(room, p);
  broadcast(room, { t: 'swing', id: p.id });
  const hit = Shared.meleeTarget(currentLevel(room).id, p, yaw, [...room.players.values()]);
  if (hit) {
    applyDamage(room, p, hit.v, hit.dmg, now, hit.back ? { m: 1, bs: 1 } : { m: 1 });
    return;
  }
  // geen speler: een dichte deur vlak voor je krijgt een beetje schade
  if (!room.doors) return;
  const o = { x: p.x, y: p.y + Shared.MOVE.CHEST[p.stance], z: p.z };
  const dir = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  const dh = Shared.rayDoorHit(currentLevel(room).id, o, dir, Shared.MELEE.RANGE);
  if (dh) damageDoor(room, dh.id, Shared.MELEE.DOOR_DMG, [r2(o.x + dir.x * dh.t), r2(o.y), r2(o.z + dir.z * dh.t)]);
}

function startHeal(room, p, now) {
  if (!p.alive || p.lock || p.healUntil || p.medkits <= 0 || p.hp >= 100) return false;
  p.healUntil = now + Shared.MEDKIT.MS;
  broadcast(room, { t: 'heal', id: p.id, ms: Shared.MEDKIT.MS });
  return true;
}
function cancelHeal(room, p) {
  if (!p.healUntil) return;
  p.healUntil = 0;
  broadcast(room, { t: 'heal', id: p.id, ms: 0 });
}

function startFinisher(room, a, v, now) {
  if (!a.alive || !v || !v.alive || a.lock || v.lock || now < v.protectedUntil) return false;
  if (!Shared.canFinish(a, v)) return false;
  // vrije lijn (muur/deur ertussen = niet)
  const o = { x: a.x, y: a.y + 1.0, z: a.z };
  const dx = v.x - a.x, dy = v.y - a.y, dz = v.z - a.z, d = Math.hypot(dx, dy, dz);
  if (d > 0.3 && Shared.rayBlockDistance(currentLevel(room).id, o, { x: dx / d, y: dy / d, z: dz / d }, d) < d - 0.25) return false;
  const yaw = Math.atan2(dx, dz);
  a.yaw = yaw; v.yaw = yaw;          // slachtoffer kijkt van de aanvaller af (steek in de rug)
  a.healUntil = 0; v.healUntil = 0;
  const fin = { a: a.id, v: v.id, end: now + Shared.FINISH.MS };
  a.lock = fin; v.lock = fin;
  broadcast(room, { t: 'finish', a: a.id, v: v.id, ms: Shared.FINISH.MS, yaw: r2(yaw), k: a.fin || 'hulk' });
  return true;
}
// Finisher klaar (done = slachtoffer sterft) of afgebroken.
function endFinisher(room, fin, done) {
  const a = room.players.get(fin.a), v = room.players.get(fin.v);
  if (a && a.lock === fin) a.lock = null;
  if (v && v.lock === fin) v.lock = null;
  if (done && a && v && a.alive && v.alive) {
    v.hp = 0;
    broadcast(room, { t: 'hit', id: v.id, by: a.id, dmg: 0, hp: 0, m: 1 });
    killPlayer(room, a, v, { fin: 1 });
    a.hp = Math.min(100, a.hp + Shared.FINISH.HEAL);
  } else if (!done) {
    broadcast(room, { t: 'finish', a: fin.a, v: fin.v, ms: 0 });
  }
}

// Per tick: medkits afronden, finishers afronden.
function tickInventory(room, now) {
  for (const p of room.players.values()) {
    if (p.healUntil && now >= p.healUntil) {
      p.healUntil = 0;
      if (p.alive && p.medkits > 0) {
        p.medkits--;
        p.hp = Math.min(100, p.hp + Shared.MEDKIT.HEAL);
        broadcast(room, { t: 'healed', id: p.id, hp: p.hp, n: p.medkits });
      }
    }
    if (p.lock && p.lock.a === p.id && now >= p.lock.end) endFinisher(room, p.lock, true);
  }
}

// ---------------------------------------------------------------- bots

// Zichtlijn van de ooghoogte van de bot naar de bovenkant van de romp van het doel (per houding).
function botEye(b) { return b.y + Shared.MOVE.BOT_EYE[b.stance]; }
function aimY(p) { return p.y + Shared.MOVE.CHEST[p.stance]; }
function canSee(level, b, p, maxDist) {
  const dh = Math.hypot(p.x - b.x, p.z - b.z);
  if (dh > maxDist) return false;
  const o = { x: b.x, y: botEye(b), z: b.z };
  const ty = aimY(p) + 0.2;
  const v = { x: p.x - o.x, y: ty - o.y, z: p.z - o.z };
  const d = Math.hypot(v.x, v.y, v.z);
  if (d < 0.01) return true;
  const dir = { x: v.x / d, y: v.y / d, z: v.z / d };
  return Shared.rayBlockDistance(level.id, o, dir, d + 0.5) >= d - 0.3;
}

function randomGoal() {
  const h = Shared.MAP_HALF * 0.7;
  return { x: (Math.random() * 2 - 1) * h, z: (Math.random() * 2 - 1) * h };
}

// Ongeveer 3x per seconde: doel kiezen op basis van wat de bot echt ziet.
function botThink(room, b, now, level, cfg) {
  b.nextThink = now + 300 + Math.random() * 70;
  // vastgelopen? (nauwelijks bewogen sinds vorige denkstap) -> nieuw doel
  const moved = Math.hypot(b.x - b.thinkX, b.z - b.thinkZ);
  b.thinkX = b.x; b.thinkZ = b.z;
  if (moved >= 0.3) b.triedJump = false;

  let best = null, bd = Infinity, nearest = null, nd = Infinity;
  const cur = b.visible ? room.players.get(b.targetId) : null;
  for (const p of room.players.values()) {
    if (p === b || !p.alive) continue;
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d < nd) { nd = d; nearest = p; }
    if (d >= bd) continue;
    // gezichtsveld: vooraan ~110 graden naar elke kant, dichtbij altijd (gehoor),
    // het huidige doel blijft gevolgd zolang het zichtbaar is.
    const ang = Math.abs(angDiff(Math.atan2(p.x - b.x, p.z - b.z), b.yaw));
    if (p !== cur && ang > 1.9 && d > 15) continue;
    if (canSee(level, b, p, cfg.view)) { bd = d; best = p; }
  }

  if (best) {
    // nieuw doel (of lang niet gezien) -> reactietijd voor het eerste schot
    if (best.id !== b.targetId || !b.visible && now - b.lastSeen > 1500) {
      b.reactAt = now + cfg.react * (0.8 + Math.random() * 0.5);
    }
    b.targetId = best.id;
    b.visible = true;
    b.lastSeen = now;
    // DEUR-HOOK: gewond (normaal/moeilijk)? dan een gebouw in de buurt in vluchten, anders laatst bekende positie onthouden
    const fleeing = b.goal && b.goal.cover && b.hp < 50;
    if (!fleeing && b.hp < 50 && cfg !== DIFFICULTY.easy && Math.random() < 0.35) {
      const cs = coverSpot(level, b, 22);
      if (cs) { b.goal = cs; b.holdUntil = 0; if (DEBUG_DOORS) console.log('[bot]', b.name, 'flees to cover b' + cs.b, 'hp', b.hp); return; }
    }
    if (!fleeing) {
      b.goal = { x: best.x, z: best.z }; // laatst bekende positie
      botStance(room, b, best, now, level, bd);   // hurken achter lage dekking / liggend sluipschutten
    }
    return;
  }

  const wasVisible = b.visible;
  b.visible = false;
  // geen doel in zicht: weer opstaan om te lopen (behalve gehurkt in dekking binnen, zie holdUntil)
  if (b.stance !== 0 && now >= b.stanceUntil && Shared.canStance(level.id, b.x, b.z, b.y, 0)) b.stance = 0;
  // DEUR-HOOK: bots in dekking binnen blijven even zitten (kijkend naar de deur)
  if (b.holdUntil && now < b.holdUntil) return;
  const coverGoal = b.goal && b.goal.cover;
  const reached = b.goal && Math.hypot(b.goal.x - b.x, b.goal.z - b.z) < (coverGoal ? 1.0 : 3);
  if (reached && coverGoal && !b.holdUntil) {
    b.holdUntil = now + 4000 + Math.random() * 6000;
    // gehurkt wachten (normaal/moeilijk), als dat hier past
    if (b.ground && b.ladder < 0 && room.difficulty !== 'easy' && Shared.canStance(level.id, b.x, b.z, b.y, 1)) {
      b.stance = 1; b.stanceUntil = b.holdUntil;
    }
    return;
  }
  b.holdUntil = 0;
  // vijand vlakbij achter een dichte deur: deur stukschieten (normaal/moeilijk) of er gewoon heen lopen (route via de deur)
  b.doorShot = null;
  if (nearest && nd < 24 && cfg !== DIFFICULTY.easy) {
    const dh = doorBetween(room, level, b, nearest);
    if (dh && dh.t > 3 && Math.random() < 0.55) {
      b.doorShot = { id: dh.id, x: dh.x, y: dh.y, z: dh.z, until: now + 2500 };
      if (now >= b.reactAt) b.reactAt = now + cfg.react * 0.6;
    }
  }
  const stuck = !wasVisible && b.goal && !reached && moved < 0.3 && b.stance === 0;
  if (!b.goal || reached || stuck) {
    // (hoog op een toren en vast tegen de borstwering: eroverheen springen)
    const high = b.y > Shared.heightAt(level.id, b.x, b.z) + 3;
    const cover = !stuck && cfg !== DIFFICULTY.easy && Math.random() < (b.hp < 60 ? 0.6 : 0.2) ? coverSpot(level, b) : null;
    if (DEBUG_DOORS) console.log('[bot]', b.name, 'new goal', cover ? 'cover b' + cover.b : stuck ? 'stuck' : 'other', 'hp', b.hp);
    if (stuck && b.ground && !b.triedJump && (high || jumpableAhead(level, b, Math.sin(b.yaw), Math.cos(b.yaw)))) {
      b.jumpReq = true;      // vast voor een kist: eerst proberen erop te springen
      b.triedJump = true;
    } else if (cover) {
      b.goal = cover;   // dekking zoeken in een gebouw in de buurt
    } else if (stuck) {
      b.triedJump = false;
      b.goal = randomGoal(); // vast achter een boom/prop: ergens anders heen
    } else if (nearest && Math.random() < 0.6) {
      // vaag idee waar de dichtstbijzijnde vijand zit (geluid), niet exact
      b.goal = {
        x: clamp(nearest.x + (Math.random() * 2 - 1) * 14, -Shared.MAP_HALF, Shared.MAP_HALF),
        z: clamp(nearest.z + (Math.random() * 2 - 1) * 14, -Shared.MAP_HALF, Shared.MAP_HALF),
      };
    } else {
      b.goal = randomGoal();
    }
  }
}

// Kan de bot hier op iets springen (kist, laag dak) in richting (ux, uz)?
function jumpableAhead(level, b, ux, uz) {
  for (const d of [0.8, 1.2]) {
    const px = b.x + ux * d, pz = b.z + uz * d;
    const sup = Shared.supportHeight(level.id, px, pz, b.y + Shared.MOVE.MAX_JUMP - 0.45);
    const rise = sup - b.y;
    if (rise > 0.3 && rise <= 1.45 && Shared.canStance(level.id, px, pz, sup, 0)) return true;
  }
  return false;
}

// Gehurkt achter lage dekking (normaal/moeilijk) of liggend op afstand met een sniper/precisiegeweer.
function botStance(room, b, target, now, level, dist) {
  if (now < b.stanceUntil || !b.ground || b.ladder >= 0) return;
  const M = Shared.MOVE;
  let want = 0, hold = 700 + Math.random() * 600;
  if (room.difficulty !== 'easy') {
    const w = Shared.WEAPONS[b.weapon];
    const ty = aimY(target);
    const ray = (eye, maxD) => {
      const o = { x: b.x, y: b.y + eye, z: b.z };
      const v = { x: target.x - o.x, y: ty - o.y, z: target.z - o.z };
      const d = Math.hypot(v.x, v.y, v.z);
      if (d < 0.5) return Infinity;
      const dir = { x: v.x / d, y: v.y / d, z: v.z / d };
      return Shared.rayBlockDistance(level.id, o, dir, Math.min(maxD, d));
    };
    if ((w.id === 'sniper' || w.id === 'dmr') && dist > 30 && Math.random() < 0.3 && ray(M.BOT_EYE[2], 999) >= dist - 1) {
      want = 2; hold = 3000 + Math.random() * 3000;       // liggend sluipschutten
    } else if (Math.random() < 0.6 && ray(0.6, 2.5) < 2.5 && ray(M.BOT_EYE[1], 999) >= dist - 1) {
      want = 1; hold = 1800 + Math.random() * 2200;       // lage dekking vlak voor de bot: hurken
    }
  }
  if (want !== b.stance && (want > b.stance || Shared.canStance(level.id, b.x, b.z, b.y, want))) b.stance = want;
  b.stanceUntil = now + hold;
}

// ---- bots en gebouwen (DEUR-HOOK)
// Dichte deur tussen bot en speler p (zichtlijn ooghoogte -> romp)? { id, t, x, y, z } of null.
function doorBetween(room, level, b, p) {
  if (!room.doors) return null;
  // (ooghoogte en richtpunt volgen hoogte en houding, zoals canSee)
  const o = { x: b.x, y: botEye(b), z: b.z };
  const v = { x: p.x - o.x, y: aimY(p) + 0.1 - o.y, z: p.z - o.z };
  const dist = Math.hypot(v.x, v.y, v.z);
  if (dist < 0.5) return null;
  const d = { x: v.x / dist, y: v.y / dist, z: v.z / dist };
  const block = Shared.rayBlockDistance(level.id, o, d, dist + 0.5);
  const dh = Shared.rayDoorHit(level.id, o, d, block + 0.01);
  if (!dh || room.doors.s[dh.id] !== 0) return null;
  return { id: dh.id, t: dh.t, x: o.x + d.x * dh.t, y: o.y + d.y * dh.t, z: o.z + d.z * dh.t };
}
// Vrije plek binnen in een gebouw in de buurt (dekking), of null.
function coverSpot(level, b, maxD) {
  const bs = Shared.getObstacles(level.id).buildings || [];
  const near = [];
  for (let i = 0; i < bs.length; i++) {
    const d = Math.hypot(bs[i].x - b.x, bs[i].z - b.z);
    if (d < (maxD || 35) && bs[i].roof !== false) near.push([d, i]);
  }
  if (!near.length) for (let i = 0; i < bs.length; i++) { const d = Math.hypot(bs[i].x - b.x, bs[i].z - b.z); if (d < (maxD || 30)) near.push([d, i]); }
  if (!near.length) return null;
  near.sort((a, c) => a[0] - c[0]);
  const bi = near[Math.floor(Math.random() * Math.min(3, near.length))][1];
  const spots = Shared.buildingSpots(level.id, bi);
  if (!spots.length) return null;
  const s = spots[Math.floor(Math.random() * spots.length)];
  return { x: s.x, z: s.z, cover: true, b: bi };
}
// Waar loopt de bot nu naartoe: rechtstreeks naar het doel, of eerst via een deur (in/uit een gebouw).
// Staat de bot voor een dichte deur op zijn route, dan doet hij die open.
function botNav(room, b, level) {
  const g = b.goal;
  b.nearDoor = false;
  const wp = Shared.doorRoute(level.id, b.x, b.z, g.x, g.z);
  if (!wp) return g;
  const dr = Shared.getObstacles(level.id).doors[wp.door];
  const dd = Math.hypot(dr.x - b.x, dr.z - b.z);
  b.nearDoor = dd < 2.8;
  if (room.doors && room.doors.s[wp.door] === 0 && dd < 1.9) toggleDoor(room, b, wp.door);
  return wp;
}

// Muur, container of boom vlak voor de bot? Dan een vrije richting ernaast kiezen
// (en die kant even aanhouden, zodat de bot niet heen en weer blijft twijfelen).
const STEER_ANGLES = [0.5, 1.0, 1.5, 2.1];
function steerAround(level, b, mx, mz) {
  const ml = Math.hypot(mx, mz);
  if (ml < 0.05) return { mx, mz };
  const h = Shared.MOVE.HEIGHT[b.stance];
  const free = (dx, dz) => {
    const px = b.x + dx * 1.6, pz = b.z + dz * 1.6;
    const r = Shared.collideY(level.id, px, pz, Shared.PLAYER_RADIUS, b.y, h);
    return Math.hypot(r.x - px, r.z - pz) < 0.25;
  };
  const ux = mx / ml, uz = mz / ml;
  if (free(ux, uz)) return { mx, mz };
  const side = b.steerSide || (Math.random() < 0.5 ? 1 : -1);
  for (const sgn of [side, -side]) {
    for (const a of STEER_ANGLES) {
      const c = Math.cos(a * sgn), s = Math.sin(a * sgn);
      const dx = ux * c - uz * s, dz = ux * s + uz * c;
      if (free(dx, dz)) { b.steerSide = sgn; return { mx: dx * ml, mz: dz * ml }; }
    }
  }
  return { mx, mz };
}

function updateBot(room, b, dt, now, level) {
  if (!b.alive || b.lock || b.frozen) return;   // in een finisher: niets doen
  const cfg = DIFFICULTY[room.difficulty] || DIFFICULTY.normal;
  let target = b.visible ? room.players.get(b.targetId) : null;
  if (b.visible && (!target || !target.alive)) { b.visible = false; b.nextThink = 0; target = null; }
  if (now >= b.nextThink) {
    botThink(room, b, now, level, cfg);
    target = b.visible ? room.players.get(b.targetId) : null;
  }

  const w = Shared.WEAPONS[b.weapon];
  const md0 = Shared.modeOf(room.mode);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  let mx = 0, mz = 0, desired = b.yaw, bd = Infinity;
  b.strafe += dt;
  b.nearDoor = false;

  if (target) {
    bd = Math.hypot(target.x - b.x, target.z - b.z);
    desired = Math.atan2(target.x - b.x, target.z - b.z);
    const preferred = md0.knives ? 1.2 : (w.botRange || (w.id === 'shotgun' ? 9 : 22));
    const g = b.goal;
    const toCover = g && g.cover && b.hp < 50;
    if (toCover) {
      // DEUR-HOOK: op weg naar dekking in een gebouw (blijft ondertussen schieten); daar aangekomen: blijven staan
      if (Math.hypot(g.x - b.x, g.z - b.z) > 0.8) {
        const nav = botNav(room, b, level);
        const vx = nav.x - b.x, vz = nav.z - b.z, vl = Math.hypot(vx, vz) || 1;
        mx += (vx / vl) * 0.95; mz += (vz / vl) * 0.95;
      }
    } else {
      if (b.hp < 40 && cfg.retreat) { mx -= fx; mz -= fz; } // gewond: terugtrekken
      else if (bd > preferred && b.stance === 0) { mx += fx; mz += fz; }
      else if (bd < preferred * 0.6) { mx -= fx; mz -= fz; }
      // gehurkt achter dekking: nauwelijks zijwaarts; liggend: blijven liggen
      const s = Math.sin(b.strafe * 1.3 + b.id) * (b.stance === 0 ? 0.8 : b.stance === 1 ? 0.15 : 0);
      mx += -Math.cos(b.yaw) * s;
      mz += Math.sin(b.yaw) * s;
      if (b.stance === 2) { mx = 0; mz = 0; }
    }
    // te dichtbij, gewond en vluchtend of op weg naar dekking: weer opstaan
    if (b.stance !== 0 && (bd < 8 || (b.hp < 40 && cfg.retreat) || toCover) && Shared.canStance(level.id, b.x, b.z, b.y, 0)) {
      b.stance = 0; b.stanceUntil = now + 1500;
    }
  } else if (b.doorShot && now < b.doorShot.until && room.doors && room.doors.s[b.doorShot.id] === 0) {
    // DEUR-HOOK: dichte deur stukschieten (er zit iemand achter)
    desired = Math.atan2(b.doorShot.x - b.x, b.doorShot.z - b.z);
  } else if (b.holdUntil && now < b.holdUntil) {
    // DEUR-HOOK: in dekking binnen: stil blijven staan (of zitten), naar de deur kijken
    const bs = Shared.getObstacles(level.id).buildings;
    const bd0 = b.goal && b.goal.b !== undefined && bs[b.goal.b];
    const dr = bd0 && bd0.doors.length ? Shared.getObstacles(level.id).doors[bd0.doors[0]] : null;
    if (dr) desired = Math.atan2(dr.x - b.x, dr.z - b.z);
  } else if (b.goal) {
    const nav = botNav(room, b, level);   // DEUR-HOOK: via de deur een gebouw in/uit
    desired = Math.atan2(nav.x - b.x, nav.z - b.z);
    // pas lopen als de bot ongeveer de goede kant op kijkt
    const f = Math.abs(angDiff(desired, b.yaw)) < 1.2 ? 0.85 : 0.2;
    mx += fx * f; mz += fz * f;
    const s = b.nearDoor ? 0 : Math.sin(b.strafe * 0.9 + b.id) * 0.25;   // niet zigzaggen in een deuropening
    mx += -Math.cos(b.yaw) * s;
    mz += Math.sin(b.yaw) * s;
  }
  const turn = cfg.turn * dt;
  b.yaw += clamp(angDiff(desired, b.yaw), -turn, turn);

  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  if (!b.nearDoor) ({ mx, mz } = steerAround(level, b, mx, mz));   // in een deuropening: recht door (geen uitwijken)
  const md = Shared.modeOf(room.mode);
  const speed = 5.5 * (w.speed || 1) * Shared.MOVE.SPEED[b.stance] * (md.speed || 1);
  // zelfde beweging als spelers (springen, op kisten staan, vallen, eventueel een ladder; dichte deuren botsen via collideY)
  const px = b.x, pz = b.z;
  Shared.stepPlayer(level.id, b, { vx: mx * speed, vz: mz * speed, jump: !!b.jumpReq, jumpV: md.jumpV, gravity: md.gravity }, dt);
  b.jumpReq = false;
  b.air = !b.ground && b.ladder < 0;
  b.onLadder = b.ladder >= 0;
  // tegen een kist aan blijven lopen: erop springen (als dat kan)
  const want = Math.hypot(mx, mz) * speed * dt;
  if (want > 0.05 && Math.hypot(b.x - px, b.z - pz) < want * 0.3) b.stuckT += dt;
  else b.stuckT = Math.max(0, b.stuckT - dt);
  if (b.stuckT > 0.35 && b.ground) {
    const ml2 = Math.hypot(mx, mz) || 1;
    if (jumpableAhead(level, b, mx / ml2, mz / ml2)) b.jumpReq = true;
    b.stuckT = 0;
  }

  // DEUR-HOOK: op een dichte deur schieten waar een vijand achter zit
  const ds = b.doorShot;
  if (!md0.knives && !target && ds && now < ds.until && room.doors && room.doors.s[ds.id] === 0 && now >= b.reactAt && now >= b.nextShot) {
    if (Math.abs(angDiff(Math.atan2(ds.x - b.x, ds.z - b.z), b.yaw)) < 0.25) {
      const o = { x: b.x, y: botEye(b), z: b.z };
      const dir = normalize({ x: ds.x - o.x, y: ds.y - o.y, z: ds.z - o.z });
      if (dir) fire(room, b, o, dir, cfg.spread, true);
      b.nextShot = now + w.interval * 1000 * (cfg.fireMin + Math.random() * (cfg.fireMax - cfg.fireMin)) * 0.7;
    }
    return;
  }
  if (md0.knives) {   // mesgevecht: dichtbij steken (of een finisher doen als dat kan)
    if (target && now >= b.reactAt && now >= (b.lastMelee || 0) + 600 && now >= target.protectedUntil && bd < 2.0 && Math.abs(angDiff(desired, b.yaw)) < 0.5) {
      if (!startFinisher(room, b, target, now)) meleeAttack(room, b, b.yaw, now);
    }
    return;
  }
  if (!target || now < b.reactAt || now < b.nextShot) return;
  if (now < target.protectedUntil) return; // niet op beschermde spelers schieten
  if (Math.abs(angDiff(desired, b.yaw)) >= 0.25 || bd >= w.range * 0.8) return;
  // ooghoogte en richtpunt volgen houding en hoogte (toren, container, liggend doel)
  const o = { x: b.x, y: botEye(b), z: b.z };
  const v = { x: target.x - o.x, y: aimY(target) - o.y, z: target.z - o.z };
  const d3 = Math.hypot(v.x, v.y, v.z);
  const dir = normalize(v);
  if (dir && Shared.rayBlockDistance(level.id, o, dir, d3 + 1) >= d3 - 0.3) {
    fire(room, b, o, dir, cfg.spread, true); // bots richten altijd "ingezoomd"
  }
  b.nextShot = now + w.interval * 1000 * (cfg.fireMin + Math.random() * (cfg.fireMax - cfg.fireMin));
}

// ---------------------------------------------------------------- berichten

function handleMessage(client, msg) {
  if (msg.t === 'join') return handleJoin(client, msg);
  const p = client.player, room = client.room;
  if (!p || !room) return;
  useDoors(room);   // DEUR-HOOK: botsing/stralen met de deuren van deze kamer

  switch (msg.t) {
    case 'pick': {
      if (room.state !== 'lobby') return;
      if (Shared.WEAPONS[msg.weapon]) { p.weapon = msg.weapon; p.baseWeapon = msg.weapon; }
      if (Shared.FINISHERS[msg.fin]) p.fin = msg.fin;
      if (Shared.SKINS.some((s) => s.id === msg.skin)) p.skin = msg.skin;
      broadcast(room, lobbyMsg(room));
      return;
    }
    case 'start': {
      if (room.state !== 'lobby' || room.hostId !== p.id) return;
      startRound(room);
      return;
    }
    case 'settings': {
      if (room.state !== 'lobby' || room.hostId !== p.id) return;
      const okDiff = msg.difficulty === undefined || Object.prototype.hasOwnProperty.call(DIFFICULTY, msg.difficulty);
      const okTarget = msg.target === undefined || TARGETS.includes(msg.target);
      const okMode = msg.mode === undefined || Shared.MODES[msg.mode] !== undefined;
      if (!okDiff || !okTarget || !okMode) return;
      if (msg.difficulty !== undefined) room.difficulty = msg.difficulty;
      if (msg.target !== undefined) room.target = msg.target;
      if (msg.mode !== undefined) room.mode = msg.mode;
      broadcast(room, lobbyMsg(room));
      return;
    }
    case 'state': {
      if (!p.alive || room.state === 'lobby' || room.state === 'countdown') return;
      if (p.lock) return;   // finisher: beide spelers staan vast
      if (!num(msg.x) || !num(msg.z) || !num(msg.yaw)) return;
      // Anti-cheat (Shared.validateState): niet sneller dan ~1.6x de loopsnelheid (+ marge voor latency),
      // niet in bomen/props, hoogte alleen op een ondergrond / ladder / binnen een sprongboog,
      // houding hooguit elke 200 ms wisselen. Oude clients zonder y/s: op de grond, staand.
      const md = Shared.modeOf(room.mode);
      const v = Shared.validateState(currentLevel(room).id, p.ac, {
        x: msg.x, z: msg.z, y: num(msg.y) ? msg.y : undefined, s: msg.s,
      }, Date.now(), { speed: CLIENT_SPEED, factor: (p.cheats?.speedBoost ? MAX_SPEED_FACTOR * 1.8 : MAX_SPEED_FACTOR) * (md.speed || 1), tol: MOVE_TOLERANCE, jumpV: p.cheats?.superJump ? 12 : md.jumpV, gravity: md.gravity });
      p.x = v.x; p.z = v.z; p.y = v.y;
      p.stance = v.stance; p.air = v.air; p.onLadder = v.ladder;
      p.yaw = msg.yaw;
      return;
    }
    case 'takeover': {
      // Uitgeschakelde speler neemt het lichaam van een levende bot over en speelt verder.
      if (room.state !== 'playing' || p.alive || p.isBot) return;
      const b = room.players.get(msg.id);
      if (!b || !b.isBot || !b.alive || b.lock) return;
      const now = Date.now();
      p.yaw = b.yaw; p.hp = b.hp; p.alive = true;
      p.slot = 0; p.healUntil = 0; p.lock = null; p.medkits = b.medkits;
      // (staand overnemen, op de plek van de bot; van een ladder af: op de grond eronder)
      placePlayer(room, p, b.x, b.z, b.ladder >= 0 ? undefined : b.y, now);
      p.lastShot = 0;
      p.protectedUntil = now + TAKEOVER_PROTECT_MS; // even adem halen tijdens het wisselen
      room.players.delete(b.id);
      broadcast(room, {
        t: 'takeover', id: p.id, bot: b.id, botName: b.name,
        x: r2(p.x), z: r2(p.z), y: r2(p.y), yaw: r2(p.yaw), hp: p.hp, protectMs: TAKEOVER_PROTECT_MS, mk: p.medkits,
      });
      return;
    }
    case 'door': {
      // deur open/dicht: alleen levend, tijdens het spel, dichtbij (Shared.doorUse controleert afstand en wie er in de weg staat)
      if ((room.state !== 'playing' && room.state !== 'between') || !p.alive || p.lock) return;
      toggleDoor(room, p, msg.id);
      return;
    }
    case 'slot': {
      // actief vak: 0 = wapen, 1 = mes, 2 = medkit (wisselen breekt een medkit af)
      if (!p.alive || ![0, 1, 2].includes(msg.s)) return;
      if (msg.s === 0 && Shared.modeOf(room.mode).knives) return;   // mesgevecht: geen wapen
      if (msg.s !== 2) cancelHeal(room, p);
      p.slot = msg.s;
      return;
    }
    case 'melee': {
      if (room.state !== 'playing' || !p.alive || p.lock) return;
      const yaw = num(msg.yaw) ? msg.yaw : p.yaw;
      p.yaw = yaw;
      meleeAttack(room, p, yaw, Date.now());
      return;
    }
    case 'heal': {
      if (room.state !== 'playing' && room.state !== 'between') return;
      startHeal(room, p, Date.now());
      return;
    }
    case 'finish': {
      if (room.state !== 'playing') return;
      startFinisher(room, p, room.players.get(msg.id), Date.now());
      return;
    }
    case 'dbg': {
      // alleen met TEST_HOOKS=1 (tests / speltest): hp, plek of kijkrichting van een speler/bot zetten
      if (!process.env.TEST_HOOKS) return;
      const q = room.players.get(msg.id) || p;
      if (num(msg.hp)) q.hp = clamp(msg.hp, 1, 100);
      if (num(msg.x) && num(msg.z)) placePlayer(room, q, msg.x, msg.z, num(msg.y) ? msg.y : undefined, Date.now());
      if (num(msg.yaw)) q.yaw = msg.yaw;
      if (msg.freeze !== undefined) q.frozen = !!msg.freeze;
      if (num(msg.prot)) q.protectedUntil = msg.prot;
      return;
    }
    case 'cheats': {
      // Code is checked server-side; cheats are per-player and never affect other players.
      if (msg.code !== 'Cody' || !msg.cheats || typeof msg.cheats !== 'object') return;
      p.cheats = {
        speedBoost: msg.cheats.speedBoost === true,
        superJump: msg.cheats.superJump === true,
        godMode: msg.cheats.godMode === true,
        infiniteAmmo: true,
      };
      return;
    }
    case 'shoot': {
      if (room.state !== 'playing' || !p.alive || p.lock || p.slot !== 0) return;
      cancelHeal(room, p);
      if (!Array.isArray(msg.o) || !Array.isArray(msg.d)) return;
      if (![...msg.o, ...msg.d].every(num) || msg.o.length !== 3 || msg.d.length !== 3) return;
      const w = Shared.WEAPONS[p.weapon];
      const now = Date.now();
      // Gemiddeld niet sneller dan het wapen; een half interval marge voor netwerk-jitter
      // (belangrijk voor snelle wapens zoals de SMG).
      const iv = w.interval * 1000 * (Shared.modeOf(room.mode).fireMul || 1);
      if (now < (p.shotClock || 0) - iv * 0.5) return;
      p.shotClock = Math.max(p.shotClock || 0, now) + iv;
      p.lastShot = now;
      // Server owns the shot origin: clients cannot move it around a wall to peek.
      // The client aims its direction from this same chest/eye point at the screen-centre ray.
      const o = { x: p.x, y: p.y + Shared.MOVE.EYE[p.stance], z: p.z };
      fire(room, p, o, { x: msg.d[0], y: msg.d[1], z: msg.d[2] }, 0, msg.z === 1, msg.two === 1);
      return;
    }
    default:
  }
}

// ---------------------------------------------------------------- hoofdlus

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.state === 'lobby') continue;
    useDoors(room);   // DEUR-HOOK
    if (room.state === 'playing') {
      const level = currentLevel(room);
      for (const p of [...room.players.values()]) {
        if (p.isBot) updateBot(room, p, TICK_MS / 1000, now, level);
      }
      tickInventory(room, now);   // medkits en finishers afronden
      checkRoundEnd(room);
    }
    broadcast(room, {
      t: 'snap',
      // [id, x, z, yaw, hp, alive, y (voeten, cm), st (houding 0/1/2 + 4 = in de lucht + 8 = op een ladder)]
      p: [...room.players.values()].map((p) => [p.id, r2(p.x), r2(p.z), r2(p.yaw), p.hp, p.alive ? 1 : 0, r2(p.y), stFlags(p)]),
    });
  }
}, TICK_MS);

// Alle levels vooraf genereren (anders hapert de eerste ronde op een nieuw level even).
for (const L of Shared.LEVELS) Shared.getObstacles(L.id);

server.listen(PORT, () => {
  console.log('Arena Shooter draait op poort ' + PORT);
});
