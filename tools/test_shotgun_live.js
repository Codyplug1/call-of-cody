// Test mes / medkit / finisher: eerst de gedeelde logica (shared.js), daarna server.js op een eigen poort
// (TEST_HOOKS=1: 'dbg'-bericht om bots neer te zetten / hp te zetten).
// Gebruik: node tools/test_melee.js   (Node 22+, ingebouwde WebSocket)
const { spawn } = require('child_process');
const path = require('path');
const S = require('../public/shared.js');

const PORT = 3170 + Math.floor(Math.random() * 50);
let fails = 0;
function check(c, msg) { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 1) gedeelde logica
const P = (x, z, yaw, o) => Object.assign({ x, z, y: 0, yaw, stance: 0, alive: true, hp: 100 }, o || {});
{
  const a = P(0, 0, 0);
  let r = S.meleeTarget(null, a, 0, [a, P(0, 1.5, 0)]);
  check(r && r.back && r.dmg === 100, 'stab from behind = backstab (100)');
  r = S.meleeTarget(null, a, 0, [a, P(0, 1.5, Math.PI)]);
  check(r && !r.back && r.dmg === 65, 'stab from the front = 65');
  check(!S.meleeTarget(null, a, 0, [a, P(0, 2.4, 0)]), 'out of range (2.4 m) = miss');
  check(!S.meleeTarget(null, a, 0, [a, P(1.5, 0.3, 0)]), 'outside the cone (to the side) = miss');
  check(!S.meleeTarget(null, a, 0, [a, P(0, 1.2, 0, { y: 2.5 })]), 'target high above (roof) = miss');
  check(!!S.meleeTarget(null, a, 0, [a, P(0, 1.3, 0, { stance: 2 })]), 'prone target close by = hit');
  check(!S.meleeTarget(null, a, 0, [a, P(0, 1.2, 0, { alive: false })]), 'dead target ignored');
  check(S.canFinish(a, P(0, 1.2, 0)), 'finisher from behind (full hp) allowed');
  check(!S.canFinish(a, P(0, 1.2, Math.PI)), 'finisher from the front at full hp refused');
  check(S.canFinish(a, P(0, 1.2, Math.PI, { hp: 30 })), 'finisher from the front at low hp allowed');
  check(S.canFinish(a, P(0, 1.0, 0, { hp: 30 })), 'finisher from 1 m allowed');
  check(S.canFinish(a, P(0, 2.1, 0, { hp: 30 })), 'finisher from 2.1 m allowed (range 2.2)');
  check(!S.canFinish(a, P(0, 2.6, 0, { hp: 30 })), 'finisher too far (2.6 m) refused');
  check(!S.canFinish(a, P(0, 1.2, 0, { y: 1 })), 'finisher with height difference refused');
}

// ---------------------------------------------------------------- 2) server
function startServer() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), TEST_HOOKS: '1', SOLO_BOTS: '3', COUNTDOWN_MS: '300', ROUND_PAUSE_MS: '60000' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stderr.on('data', (d) => { const s = String(d); if (!/ExperimentalWarning/.test(s)) { console.log('[server]', s.trim()); fails++; } });
  return new Promise((res) => p.stdout.on('data', (d) => { if (/poort/.test(String(d))) res(p); }));
}
function client() {
  const ws = new WebSocket('ws://localhost:' + PORT);
  const c = { ws, msgs: [], me: null, waiters: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'snap') { c.snap = m; return; }
    if (m.t === 'welcome') c.me = m.id;
    const w = c.waiters.find((x) => x.f(m));
    if (w) { c.waiters = c.waiters.filter((x) => x !== w); w.r(m); } else c.msgs.push(m);
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = (f, ms) => new Promise((r) => {
    const old = c.msgs.find(f);
    if (old) { c.msgs.splice(c.msgs.indexOf(old), 1); return r(old); }
    const w = { f, r }; c.waiters.push(w);
    setTimeout(() => { c.waiters = c.waiters.filter((x) => x !== w); r(null); }, ms || 3000);
  });
  c.open = new Promise((r) => ws.addEventListener('open', r));
  return c;
}

(async () => {
  const srv = await startServer();
  try {
    const c = client();
    await c.open;
    c.send({ t: 'join', name: 'Tester', create: true });
    await c.wait((m) => m.t === 'lobby');
    c.send({ t: 'pick', weapon: 'shotgun' });
    c.send({ t: 'settings', difficulty: 'easy' });
    c.send({ t: 'start' });
    const round = await c.wait((m) => m.t === 'round');
    await c.wait((m) => m.t === 'phase' && m.phase === 'playing', 3000);
    const lvl = round.level;
    const me = round.players.find((p) => p.id === c.me);
    const bot = round.players.find((p) => p.bot).id;
    const others = round.players.filter((p) => p.bot && p.id !== bot).map((p) => p.id);
    const X = me.x, Z = me.z, y0 = S.supportHeight(lvl, X, Z);
    const put = (id, dx, dz, yaw, extra) => c.send(Object.assign({ t: 'dbg', id, x: X + dx, z: Z + dz, yaw, freeze: true, prot: 0 }, extra || {}));
    put(c.me, 0, 0, 0);
    for (let i = 0; i < others.length; i++) put(others[i], 40 + i * 3, 40, 0);
    await sleep(150);
    const dmgs = { near: [], far: [] };
    // kies een richting met vrije lijn (geen boom/muur/prop) tot 17 m
    const o = { x: X, y: y0 + 1.7, z: Z };
    let ang = 0, found = false;
    for (let k = 0; k < 40 && !found; k++) {
      ang = k * 0.157;
      const dir = { x: Math.sin(ang), y: 0, z: Math.cos(ang) };
      const bd = S.rayBlockDistance(lvl, o, dir, 17);
      // ook de bot moet daar vrij kunnen staan op 3 m en op 16 m
      if (bd >= 17 && S.isClear(lvl, X + dir.x * 16, Z + dir.z * 16, 0.5) && S.isClear(lvl, X + dir.x * 3, Z + dir.z * 3, 0.5)) found = true;
    }
    check(found, 'vrije schietlijn gevonden');
    let lastPellets = [];
    async function shootAt(id, dist) {
      const dx = Math.sin(ang), dz = Math.cos(ang);
      put(id, dx * dist, dz * dist, ang + Math.PI, { hp: 100 });
      await sleep(80);
      c.msgs.length = 0;
      c.send({ t: 'shoot', o: [X, y0 + 1.7, Z], d: [dx, -0.3 / dist, dz] });   // op de borst
      const h = await c.wait((m) => m.t === 'hit' && m.id === id, 400);
      lastPellets = c.msgs.filter((m) => m.t === 'shot').flatMap((m) => m.p.map((q) => q[3]));
      if (process.env.DBG) console.log('   shoot', id, dist, JSON.stringify(h), JSON.stringify(c.msgs.filter((m) => m.t === 'shot').map((m) => m.p.map((q) => q[3]))));
      await sleep(850);   // schiet-interval 0.8 s
      return h ? h.dmg : 0;
    }
    // op 12 m (nog ruim binnen de zone zonder bonus is >14 m; kies 16 m): 12 schoten op een bot (max 88 < 100: blijft leven)
    let farTotal = 0, farHits = 0, farOk = true;
    for (let i = 0; i < 12; i++) {
      const d = await shootAt(bot, 16);
      farTotal += d;
      if (d > 0) { farHits++; if (Math.abs(d / 11 - Math.round(d / 11)) > 1e-9) farOk = false; }
    }
    console.log('  shotgun 16 m: ' + farHits + '/12 schoten raakten, gemiddeld ' + (farTotal / 12).toFixed(1) + ' per schot');
    check(farHits >= 6, 'shotgun op 16 m raakt regelmatig');
    check(farOk, 'shotgun op 16 m: schade is een veelvoud van 11 (ongewijzigd, geen bonus)');
    // dichtbij: elke bot krijgt een schot van 3 m
    const nearD = [];
    const nearPellets = [];
    for (const id of [bot, ...others]) { nearD.push(await shootAt(id, 3)); nearPellets.push(lastPellets.filter((t) => t < 6).length); }
    console.log('  shotgun 3 m: schade per schot ' + nearD.map((d) => d.toFixed(0)).join(', '));
    // (bots staan soms gehurkt/liggend en worden dan gemist: alleen treffers tellen)
    const hitsOnly = nearD.filter((d) => d > 0);
    check(hitsOnly.length >= 1, 'shotgun op 3 m raakt');
    check(hitsOnly.every((d) => Math.abs(d / 17.6 - Math.round(d / 17.6)) < 0.06), 'shotgun op 3 m: 17.6 schade per kogeltje (x1.6)');
    check(Math.max(...nearD) >= 88, 'shotgun op 3 m: 5+ kogeltjes = 88+ schade, 6+ = dood (' + nearD.join(',') + ')');
  } finally { srv.kill(); }
  console.log(fails ? fails + ' FAILURES' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
