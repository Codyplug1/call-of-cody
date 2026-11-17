// Servertest voor deuren: start server.js op een eigen poort en speelt als WebSocket-client.
// Controleert: deurtoestand in 'round', te ver weg = geweigerd, open/dicht, niet dicht met iemand in de opening,
// kogels beschadigen de deur tot hij kapot is. Daarna (informatief) wat bots met deuren en gebouwen doen.
// Gebruik: node tools/test_doors_server.js   (Node 22+, gebruikt de ingebouwde WebSocket)
const { spawn } = require('child_process');
const path = require('path');
const S = require('../public/shared.js');

const PORT = 3118 + Math.floor(Math.random() * 50);
let fails = 0;
function check(c, msg) { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(env) {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), START_LEVEL: '2', COUNTDOWN_MS: '300', ROUND_PAUSE_MS: '60000' }, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (process.env.DEBUG_DOORS) p.stdout.on('data', (d) => process.stdout.write(String(d).split('\n').filter((l) => /\[(bot|door)\]/.test(l)).map((l) => '   ' + l + '\n').join('')));
  p.stderr.on('data', (d) => { const s = String(d); if (!/ExperimentalWarning/.test(s)) console.log('[server]', s.trim()); });
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

// in stapjes (zoals de echte client) naar (x, z) lopen
async function walk(c, pos, x, z) {
  for (let k = 0; k < 400; k++) {
    const dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) break;
    const st = Math.min(d, 0.45);
    const r = S.resolveCollision('snow', pos.x + (dx / d) * st, pos.z + (dz / d) * st, S.PLAYER_RADIUS);
    const moved = Math.hypot(r.x - pos.x, r.z - pos.z);
    pos.x = r.x; pos.z = r.z;
    c.send({ t: 'state', x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), yaw: 0 });
    await sleep(50);
    if (moved < 0.01) break;
  }
}

(async () => {
  // ---------------------------------------------------------------- 1) regels (1 makkelijke bot)
  let srv = await startServer({ SOLO_BOTS: '1' });
  try {
    const c = client();
    await c.open;
    c.send({ t: 'join', name: 'Tester', create: true });
    await c.wait((m) => m.t === 'lobby');
    c.send({ t: 'settings', difficulty: 'easy' });
    c.send({ t: 'start' });
    const round = await c.wait((m) => m.t === 'round');
    const doors = S.getObstacles('snow').doors;
    check(round && round.level === 'snow' && Array.isArray(round.doors) && round.doors.length === doors.length && round.doors.every((d) => d[0] === 0 && d[1] === 60), 'round message carries door states');
    await c.wait((m) => m.t === 'phase' && m.phase === 'playing', 3000);
    S.setDoorState(S.newDoorState('snow'));   // eigen kopie voor de botsing van de testclient
    const meInfo = round.players.find((p) => p.id === c.me);
    const pos = { x: meInfo.x, z: meInfo.z };
    // dichtstbijzijnde deur en een verre deur
    const byDist = doors.slice().sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
    const dr = byDist[0], far = byDist[byDist.length - 1];
    c.send({ t: 'door', id: far.id });
    const deny = await c.wait((m) => m.t === 'door' && m.id === far.id);
    check(deny && deny.deny === 1 && deny.s === 0, 'door too far away is refused');
    await sleep(300);
    // naar 1.2 m voor de deur lopen en openen
    await walk(c, pos, dr.x - dr.nx * 1.2, dr.z - dr.nz * 1.2);
    await sleep(150);
    c.send({ t: 'door', id: dr.id });
    const op = await c.wait((m) => m.t === 'door' && m.id === dr.id && !m.deny);
    check(op && (op.s === 1 || op.s === 2) && op.by === c.me, 'door opened (away from the player) ' + (op && op.s));
    S.setDoorState({ level: 'snow', s: doors.map((d) => (d.id === dr.id ? op.s : 0)), hp: doors.map((d) => d.hp) });
    // in de deuropening gaan staan: dichtdoen wordt geweigerd
    await walk(c, pos, dr.x, dr.z);
    await sleep(300);
    c.send({ t: 'door', id: dr.id });
    const d2 = await c.wait((m) => m.t === 'door' && m.id === dr.id);
    check(d2 && d2.deny === 1, 'cannot close the door while standing in the doorway');
    // weer naar buiten en dichtdoen
    await walk(c, pos, dr.x - dr.nx * 1.4, dr.z - dr.nz * 1.4);
    await sleep(300);
    c.send({ t: 'door', id: dr.id });
    const cl = await c.wait((m) => m.t === 'door' && m.id === dr.id && !m.deny);
    check(cl && cl.s === 0, 'door closed');
    S.setDoorState(S.newDoorState('snow'));
    // stukschieten: geweer (12 schade) op het midden van de deur
    await walk(c, pos, dr.x - dr.nx * 3, dr.z - dr.nz * 3);
    await sleep(200);
    const hps = [];
    for (let i = 0; i < 8; i++) {
      const o = { x: pos.x, y: dr.y0 + 1.5, z: pos.z };
      const v = { x: dr.x - o.x, y: dr.y0 + 1.1 - o.y, z: dr.z - o.z }, l = Math.hypot(v.x, v.y, v.z);
      c.send({ t: 'shoot', o: [o.x, o.y, o.z], d: [v.x / l, v.y / l, v.z / l] });
      const m = await c.wait((q) => q.t === 'door' && q.id === dr.id, 600);
      if (m) hps.push(m.hp + '/' + m.s);
      if (m && m.s === 3) break;
      await sleep(160);
    }
    console.log('     door hp after hits:', hps.join(' '));
    check(hps.length === 5 && hps[hps.length - 1] === '0/3', 'shots damage the door until it breaks (5 rifle hits)');
    c.send({ t: 'door', id: dr.id });
    check(!(await c.wait((m) => m.t === 'door' && m.id === dr.id && !m.deny, 600)), 'broken door cannot be used');
    c.ws.close();
  } finally { srv.kill(); }

  // ---------------------------------------------------------------- 2) bots (informatief)
  // (statistisch: soms is een ronde al na ~15-25 s voorbij voordat een bot een deur nodig had; dan nog eens proberen)
  let botOk = false;
  for (let attempt = 1; attempt <= 4 && !botOk; attempt++) {
  srv = await startServer({ SOLO_BOTS: '7', ROUND_PAUSE_MS: '60000' });
  try {
    const c = client();
    await c.open;
    c.send({ t: 'join', name: 'Watcher', create: true });
    await c.wait((m) => m.t === 'lobby');
    c.send({ t: 'settings', difficulty: 'hard' });
    c.send({ t: 'start' });
    const round = await c.wait((m) => m.t === 'round');
    S.setDoorState(null);
    const doorEvents = { open: 0, damaged: 0, broken: 0 };
    const insideBots = new Set();
    let maxInside = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      await sleep(250);
      for (const m of c.msgs.splice(0)) {
        if (m.t !== 'door' || m.deny) continue;
        if (m.by && m.by !== c.me && (m.s === 1 || m.s === 2)) doorEvents.open++;
        if (m.p) doorEvents.damaged++;
        if (m.s === 3) doorEvents.broken++;
      }
      if (c.snap) {
        let n = 0;
        for (const a of c.snap.p) {
          if (a[0] === c.me || !a[5]) continue;
          if (S.insideBuilding(round.level, a[1], a[2]) >= 0) { n++; insideBots.add(a[0]); }
        }
        maxInside = Math.max(maxInside, n);
        const alive = c.snap.p.filter((a) => a[5]).length;
        if (alive <= 1) { console.log('     round over after', ((Date.now() - t0) / 1000).toFixed(1), 's'); break; }
      }
    }
    console.log(`     bots (hard, 45 s): doors opened by bots ${doorEvents.open}, door hits ${doorEvents.damaged}, broken ${doorEvents.broken}, bots seen inside buildings ${insideBots.size} (max at once ${maxInside})`);
    botOk = doorEvents.open > 0 || insideBots.size > 0;
    if (botOk || attempt === 4) check(botOk, 'bots use doors / go inside buildings' + (attempt > 1 ? ' (attempt ' + attempt + ')' : ''));
    c.ws.close();
  } finally { srv.kill(); }
  if (!botOk) await sleep(800);   // poort vrijgeven
  }
  console.log(fails ? `${fails} FAILURES` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
