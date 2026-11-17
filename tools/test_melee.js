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
    c.send({ t: 'settings', difficulty: 'easy' });
    c.send({ t: 'start' });
    const round = await c.wait((m) => m.t === 'round');
    await c.wait((m) => m.t === 'phase' && m.phase === 'playing', 3000);
    const lvl = round.level;
    const me = round.players.find((p) => p.id === c.me);
    const bots = round.players.filter((p) => p.bot).map((p) => p.id);
    // vrije plek zoeken: spawn van de speler
    const X = me.x, Z = me.z;
    const y0 = S.supportHeight(lvl, X, Z);
    const put = (id, dx, dz, yaw, extra) => c.send(Object.assign({ t: 'dbg', id, x: X + dx, z: Z + dz, yaw, freeze: true, prot: 0 }, extra || {}));
    put(c.me, 0, 0, 0);
    for (let i = 0; i < bots.length; i++) put(bots[i], 30 + i * 3, 30, 0);   // eerst uit de buurt
    await sleep(150);
    c.msgs.length = 0;

    // backstab
    put(bots[0], 0, 1.3, 0);
    await sleep(120);
    c.send({ t: 'melee', yaw: 0 });
    const sw = await c.wait((m) => m.t === 'swing' && m.id === c.me, 1000);
    check(!!sw, 'swing broadcast');
    const h1 = await c.wait((m) => m.t === 'hit' && m.id === bots[0], 1000);
    check(h1 && h1.bs === 1 && h1.dmg === 100 && h1.m === 1, 'server backstab = 100 damage');
    const k1 = await c.wait((m) => m.t === 'kill' && m.id === bots[0], 1000);
    check(!!k1, 'backstab kills');

    // van voren: 55, cooldown
    put(bots[1], 0, 1.3, Math.PI);
    await sleep(500);
    c.send({ t: 'melee', yaw: 0 });
    c.send({ t: 'melee', yaw: 0 });   // te snel: genegeerd
    const h2 = await c.wait((m) => m.t === 'hit' && m.id === bots[1], 1000);
    check(h2 && !h2.bs && h2.dmg === 65 && h2.hp === 35, 'front stab = 65 damage');
    check(!(await c.wait((m) => m.t === 'hit' && m.id === bots[1], 300)), 'melee cooldown respected');

    // te ver weg
    put(bots[1], 0, 2.7, Math.PI);
    await sleep(500);
    c.send({ t: 'melee', yaw: 0 });
    check(!(await c.wait((m) => m.t === 'hit' && m.id === bots[1], 400)), 'out of range: no hit');

    // medkit
    c.send({ t: 'dbg', id: c.me, hp: 30 });
    await sleep(80);
    const t0 = Date.now();
    c.send({ t: 'heal' });
    const hs = await c.wait((m) => m.t === 'heal' && m.id === c.me && m.ms > 0, 1000);
    check(hs && hs.ms === S.MEDKIT.MS, 'heal started (' + (hs && hs.ms) + ' ms)');
    const hd = await c.wait((m) => m.t === 'healed' && m.id === c.me, 3000);
    const dt = Date.now() - t0;
    check(hd && hd.hp === 90 && hd.n === 0 && dt >= S.MEDKIT.MS - 60, 'healed +60 after the channel (' + dt + ' ms)');
    c.send({ t: 'heal' });
    check(!(await c.wait((m) => m.t === 'heal' && m.id === c.me, 400)), 'second medkit refused (1 per round)');

    // finisher geweigerd (vol hp, van voren)
    put(bots[1], 0, 1.2, Math.PI, { hp: 100 });
    await sleep(120);
    c.send({ t: 'finish', id: bots[1] });
    check(!(await c.wait((m) => m.t === 'finish', 400)), 'finisher refused (full hp, front)');
    // finisher van voren bij laag hp
    put(bots[1], 0, 1.2, Math.PI, { hp: 30 });
    await sleep(120);
    c.send({ t: 'finish', id: bots[1] });
    const f = await c.wait((m) => m.t === 'finish' && m.ms > 0, 1000);
    check(f && f.a === c.me && f.v === bots[1] && f.ms === S.FINISH.MS, 'finisher started');
    c.send({ t: 'shoot', o: [X, y0 + 1.5, Z], d: [0, 0, 1] });
    check(!(await c.wait((m) => m.t === 'shot', 300)), 'cannot shoot during a finisher');
    const k2 = await c.wait((m) => m.t === 'kill' && m.id === bots[1], 2500);
    check(k2 && k2.fin === 1 && k2.by === c.me, 'finisher kills the victim (fin:1)');
    c.ws.close();
  } finally { srv.kill(); }
  console.log(fails ? `${fails} FAILURES` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
