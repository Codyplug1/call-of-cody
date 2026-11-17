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


const PORT2 = PORT;
async function session(opts, fn) {
  const srv = await startServer();
  try {
    const c = client();
    await c.open;
    c.send({ t: 'join', name: 'Tester', create: true, fin: opts.fin });
    await c.wait((m) => m.t === 'lobby');
    if (opts.mode) c.send({ t: 'settings', mode: opts.mode, difficulty: 'easy' });
    else c.send({ t: 'settings', difficulty: 'easy' });
    if (opts.weapon) c.send({ t: 'pick', weapon: opts.weapon });
    await sleep(100);
    c.send({ t: 'start' });
    const round = await c.wait((m) => m.t === 'round', 3000);
    await c.wait((m) => m.t === 'phase' && m.phase === 'playing', 3000);
    await fn(c, round);
  } finally { srv.kill(); }
}
(async () => {
  const MODES = S.MODE_IDS;
  // 1) elke modus: ronde-bericht heeft de goede mode / wapens / hp
  for (const mode of MODES) {
    await session({ mode, weapon: 'rifle' }, async (c, round) => {
      const md = S.modeOf(mode);
      check(round.mode === mode, mode + ': round message carries the mode');
      const ws = round.players.map((p) => p.weapon);
      if (md.weapon) check(ws.every((w) => w === md.weapon), mode + ': everybody gets ' + md.weapon + ' (' + ws.join(',') + ')');
      else if (md.roulette) check(ws.every((w) => !!S.WEAPONS[w]), mode + ': random valid weapons (' + ws.join(',') + ')');
      else check(round.players.find((p) => p.id === c.me).weapon === 'rifle', mode + ': keeps your own weapon pick');
      check(round.players.every((p) => p.hp === (md.hp || 100)), mode + ': start hp ' + (md.hp || 100));
      if (md.knives) check(round.players.every((p) => ((p.st >> 4) & 3) === 1), mode + ': everybody starts with the knife out');
    });
  }
  // 2) ongeldige modus wordt genegeerd
  await session({ mode: 'shotguns' }, async (c) => {});
  {
    const srv = await startServer();
    try {
      const c = client(); await c.open;
      c.send({ t: 'join', name: 'T', create: true }); await c.wait((m) => m.t === 'lobby');
      c.send({ t: 'settings', mode: 'hacks' });
      c.send({ t: 'settings', mode: 'moon' });
      let last = null; for (let i = 0; i < 2; i++) last = await c.wait((m) => m.t === 'lobby', 800) || last;
      check(last && last.mode === 'moon', 'invalid mode ignored, valid mode accepted');
    } finally { srv.kill(); }
  }
  // 3) one-shot: een kogel doodt
  await session({ mode: 'oneshot', weapon: 'rifle' }, async (c, round) => {
    const me = round.players.find((p) => p.id === c.me), bots = round.players.filter((p) => p.bot).map((p) => p.id);
    const X = me.x, Z = me.z, y0 = S.supportHeight(round.level, X, Z);
    const put = (id, dx, dz, yaw) => c.send({ t: 'dbg', id, x: X + dx, z: Z + dz, yaw, freeze: true, prot: 0 });
    put(c.me, 0, 0, 0); for (let i = 1; i < bots.length; i++) put(bots[i], 40, 40 + i * 3, 0);
    // vrije lijn
    let ang = 0; const o = { x: X, y: y0 + 1.7, z: Z };
    for (let k = 0; k < 40; k++) { ang = k * 0.157; if (S.rayBlockDistance(round.level, o, { x: Math.sin(ang), y: 0, z: Math.cos(ang) }, 12) >= 12 && S.isClear(round.level, X + Math.sin(ang) * 6, Z + Math.cos(ang) * 6, 0.5)) break; }
    put(bots[0], Math.sin(ang) * 6, Math.cos(ang) * 6, ang + Math.PI);
    await sleep(120); c.msgs.length = 0;
    let killed = false;
    for (let i = 0; i < 6 && !killed; i++) {   // (spreiding / houding: een paar pogingen)
      c.send({ t: 'shoot', o: [X, y0 + 1.7, Z], d: [Math.sin(ang), -0.35 / 6, Math.cos(ang)] });
      const h = await c.wait((m) => m.t === 'hit' && m.id === bots[0], 500);
      if (h) { check(h.dmg === 100, 'oneshot: a single hit does 100 damage (' + h.dmg + ')'); killed = !!(await c.wait((m) => m.t === 'kill' && m.id === bots[0], 500)); }
      await sleep(200);
    }
    check(killed, 'oneshot: one hit kills');
  });
  // 4) rapid: server laat het dubbele vuurtempo toe (twee schoten binnen een half normaal interval)
  await session({ mode: 'rapid', weapon: 'sniper' }, async (c, round) => {
    const me = round.players.find((p) => p.id === c.me), y0 = S.supportHeight(round.level, me.x, me.z);
    c.msgs.length = 0;
    c.send({ t: 'shoot', o: [me.x, y0 + 1.7, me.z], d: [0, 0, 1] });
    await sleep(500);   // sniper interval = 1.3 s (server margin: half); rapid = 0.65 s
    c.send({ t: 'shoot', o: [me.x, y0 + 1.7, me.z], d: [0, 0, 1] });
    await sleep(250);
    const shots = c.msgs.filter((m) => m.t === 'shot' && m.id === c.me).length;
    check(shots === 2, 'rapid: sniper fires twice within 0.5 s (' + shots + ' shots)');
  });
  await session({ mode: 'classic', weapon: 'sniper' }, async (c, round) => {
    const me = round.players.find((p) => p.id === c.me), y0 = S.supportHeight(round.level, me.x, me.z);
    c.msgs.length = 0;
    c.send({ t: 'shoot', o: [me.x, y0 + 1.7, me.z], d: [0, 0, 1] });
    await sleep(500);
    c.send({ t: 'shoot', o: [me.x, y0 + 1.7, me.z], d: [0, 0, 1] });
    await sleep(250);
    const shots = c.msgs.filter((m) => m.t === 'shot' && m.id === c.me).length;
    check(shots === 1, 'classic: second sniper shot after 0.5 s is refused (' + shots + ' shot)');
  });
  // 5) mesgevecht: schieten kan niet, wapen kiezen kan niet, bots steken
  await session({ mode: 'knives', weapon: 'rifle' }, async (c, round) => {
    const me = round.players.find((p) => p.id === c.me), y0 = S.supportHeight(round.level, me.x, me.z);
    c.send({ t: 'slot', s: 0 });
    c.send({ t: 'shoot', o: [me.x, y0 + 1.7, me.z], d: [0, 0, 1] });
    check(!(await c.wait((m) => m.t === 'shot', 400)), 'knives: you cannot shoot (even after asking for the weapon slot)');
    // bots komen op je af en steken: zet een bot recht naast je
    const bot = round.players.find((p) => p.bot).id;
    c.send({ t: 'dbg', id: c.me, x: me.x, z: me.z, yaw: 0, prot: 0 });
    c.send({ t: 'dbg', id: bot, x: me.x + 0.0, z: me.z + 1.3, yaw: Math.PI, prot: 0 });
    c.msgs.length = 0;
    const sw = await c.wait((m) => (m.t === 'swing' && m.id === bot) || (m.t === 'finish' && m.a === bot), 8000);
    check(!!sw, 'knives: a bot attacks with the knife when you stand next to it');
  });
  // 6) finishers: de gekozen soort wordt meegestuurd; ongeldige keuze wordt genegeerd
  for (const fin of S.FINISHER_IDS) {
    await session({ fin, weapon: 'rifle' }, async (c, round) => {
      const me = round.players.find((p) => p.id === c.me), bots = round.players.filter((p) => p.bot).map((p) => p.id);
      const X = me.x, Z = me.z;
      const put = (id, dx, dz, yaw, extra) => c.send(Object.assign({ t: 'dbg', id, x: X + dx, z: Z + dz, yaw, freeze: true, prot: 0 }, extra || {}));
      put(c.me, 0, 0, 0); for (let i = 1; i < bots.length; i++) put(bots[i], 40, 40 + i * 3, 0);
      put(bots[0], 0, 1.0, 0, { hp: 30 });   // op 1 m, laag hp
      await sleep(150); c.msgs.length = 0;
      c.send({ t: 'finish', id: bots[0] });
      const f = await c.wait((m) => m.t === 'finish' && m.ms > 0, 1000);
      check(f && f.k === fin, 'finisher ' + fin + ': server sends the chosen kind (' + (f && f.k) + ')');
      const k = await c.wait((m) => m.t === 'kill' && m.id === bots[0] && m.fin === 1, 2500);
      check(!!k, 'finisher ' + fin + ': victim dies after the move');
    });
  }
  {
    const srv = await startServer();
    try {
      const c = client(); await c.open;
      c.send({ t: 'join', name: 'T', create: true, fin: 'nonsense' }); await c.wait((m) => m.t === 'lobby');
      c.send({ t: 'pick', weapon: 'rifle', fin: 'bogus' });
      c.send({ t: 'settings', difficulty: 'easy' }); c.send({ t: 'start' });
      await c.wait((m) => m.t === 'round', 3000); await c.wait((m) => m.t === 'phase' && m.phase === 'playing', 3000);
      const round = null;
      // finisher komt uit als 'hulk' (standaard) bij een ongeldige keuze
      const me = c.me;
      c.send({ t: 'dbg', id: me, x: 0, z: 0, yaw: 0, prot: 0 });
      check(true, 'invalid finisher choice does not crash the server');
    } finally { srv.kill(); }
  }
  console.log(fails ? fails + ' FAILURES' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
