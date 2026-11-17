// Wegwerp-test voor de militaire props in shared.js
const S = require('../public/shared.js');
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } }

const t0 = Date.now();
const obs = S.getObstacles('forest');
console.log('generatie ms', Date.now() - t0);
const counts = {};
for (const p of obs.props) counts[p.kind] = (counts[p.kind] || 0) + 1;
console.log('counts', counts, 'stacked crates', obs.props.filter((p) => p.stack === 2).length, 'pieces', obs.propPieces.length);
check(obs.props.every((p) => ['kind', 'x', 'z', 'yaw', 'baseY', 'stack'].every((k) => k in p)), 'shape');
check(S.SKINS.length === 10 && S.SKINS[0].id === 'soldier' && S.SKIN_IDS.includes('shellninja') && !S.SKIN_IDS.includes('turtle'), 'skins');
check(new Set(S.SKIN_IDS).size === S.SKINS.length, 'skin ids uniek');
check(S.SKINS.every((s) => s.name.nl && s.name.en && s.model && Array.isArray(s.swatch) && s.swatch.length === 3), 'skin velden');
check(S.skinById('turtle') === S.SKINS[0] && S.skinById(undefined) === S.SKINS[0] && S.skinById('ghillie').id === 'ghillie', 'skinById fallback');
{
  const fs = require('fs'), path = require('path');
  const models = path.join(__dirname, '..', 'public', 'models');
  for (const s of S.SKINS) {
    check(fs.existsSync(path.join(models, s.model + '.glb')), 'model bestaat: ' + s.model);
    check(!s.camo || fs.existsSync(path.join(models, 'skins', s.camo + '.jpg')), 'camo bestaat: ' + s.camo);
    check(fs.existsSync(path.join(models, 'skins', 'thumb_' + s.id + '.jpg')), 'plaatje bestaat: ' + s.id);
  }
}

// footprint helper (zelfde als in shared)
function fp(p) {
  const h = p.kind === 'tower' ? 1.62 : p.kind === 'crate' ? 0.55 : 1.5;
  const d = p.kind === 'tower' ? 1.62 : p.kind === 'crate' ? 0.55 : 0.38;
  return { x: p.x, z: p.z, c: Math.cos(p.yaw), s: Math.sin(p.yaw), hx: h, hz: d };
}
function bpd(b, x, z) {
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  return Math.hypot(Math.max(Math.abs(lx) - b.hx, 0), Math.max(Math.abs(lz) - b.hz, 0));
}
function samples(b) {
  const pts = [[b.x, b.z]];
  for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
    const lx = (b.hx * i) / 10, lz = (b.hz * j) / 10;
    pts.push([b.x + lx * b.c + lz * b.s, b.z - lx * b.s + lz * b.c]);
  }
  return pts;
}
let minTree = Infinity, minProp = Infinity, overlaps = 0;
const fps = obs.props.map(fp);
for (const f of fps) {
  for (const t of obs.trees) minTree = Math.min(minTree, bpd(f, t.x, t.z));
}
for (let a = 0; a < fps.length; a++) for (let b = a + 1; b < fps.length; b++) {
  let m = Infinity;
  for (const [x, z] of samples(fps[a])) m = Math.min(m, bpd(fps[b], x, z));
  if (m === 0) overlaps++;
  minProp = Math.min(minProp, m);
}
console.log('min tree dist', minTree.toFixed(2), 'min prop-prop dist', minProp.toFixed(2), 'overlaps', overlaps);
check(minTree >= 2.49, 'tree gap');
check(overlaps === 0, 'prop overlaps');
check(obs.props.every((p) => Math.abs(p.x) < S.MAP_HALF - 6 && Math.abs(p.z) < S.MAP_HALF - 6), 'in map');

// botsingen
const crate = obs.props.find((p) => p.kind === 'crate' && [0,1,2,3,4,5].every((s) => S.heightAt('forest', p.x + s, p.z) < p.baseY + 0.4));
const sb = obs.props.find((p) => p.kind === 'sandbags');
const tower = obs.props.find((p) => p.kind === 'tower');
function pushTest(name, x, z, b) {
  const r = S.resolveCollision('forest', x, z, 0.5);
  const moved = Math.hypot(r.x - x, r.z - z);
  const outside = b ? bpd(b, r.x, r.z) >= 0.49 : true;
  console.log(name, 'pushed', moved.toFixed(2), 'clear', outside);
  check(moved > 0.3 && outside, name + ' push');
}
pushTest('crate', crate.x, crate.z, fp({ ...crate, kind: 'crate' }));
pushTest('crate-edge', crate.x + 0.6, crate.z, { ...fp(crate) });
pushTest('sandbag', sb.x, sb.z, { ...fp(sb), hx: 1.5, hz: 0.38 });
const leg = { x: tower.x + 1.4 * Math.cos(tower.yaw) + 1.4 * Math.sin(tower.yaw), z: tower.z - 1.4 * Math.sin(tower.yaw) + 1.4 * Math.cos(tower.yaw) };
const rl = S.resolveCollision('forest', leg.x + 0.1, leg.z, 0.5);
console.log('tower leg dist after', Math.hypot(rl.x - leg.x, rl.z - leg.z).toFixed(3));
check(Math.hypot(rl.x - leg.x, rl.z - leg.z) >= 0.719, 'leg push');
// midden van de toren is vrij
const rc = S.resolveCollision('forest', tower.x, tower.z, 0.5);
check(Math.hypot(rc.x - tower.x, rc.z - tower.z) < 1e-6, 'tower centre walkable');

// stralen: 5 m voor elke zandzakmuur, recht ernaartoe
let lowOk = 0, highOk = 0, n = 0;
function flat(o, d, y, len) { for (let s = 0; s <= len; s += 0.2) if (S.heightAt('forest', o.x + d.x * s, o.z + d.z * s) > y - 0.1) return false; return true; }
for (const w of obs.props.filter((p) => p.kind === 'sandbags')) {
  const nz = { x: Math.sin(w.yaw), z: Math.cos(w.yaw) }; // lokale Z in wereld
  const o = { x: w.x + nz.x * 5, z: w.z + nz.z * 5 };
  const d = { x: -nz.x, y: 0, z: -nz.z };
  const low = S.rayBlockDistance('forest', { ...o, y: w.baseY + 0.5 }, d, 10);
  const high = S.rayBlockDistance('forest', { ...o, y: w.baseY + 1.6 }, d, 10);
  if (!flat(o, d, w.baseY + 0.5, 4.6)) continue; // heuvel zit ertussen
  // boom of andere prop tussen start en muur? dan overslaan
  let clear = true;
  for (let s = 0; s <= 4.4; s += 0.1) {
    const x = o.x + d.x * s, z = o.z + d.z * s;
    if (S.blockedByProp(obs, x, w.baseY + 0.5, z)) clear = false;
    for (const t of obs.trees) if (Math.hypot(t.x - x, t.z - z) < t.r + 0.05) clear = false;
  }
  if (!clear) continue;
  n++;
  if (Math.abs(low - 4.62) < 0.05) lowOk++;
  else console.log('  low', w.x.toFixed(1), w.z.toFixed(1), low.toFixed(2), 'ground at origin', S.heightAt('forest', o.x, o.z).toFixed(2), 'base', w.baseY.toFixed(2));
  if (high > 5) highOk++;
  else console.log('  high', w.x.toFixed(1), w.z.toFixed(1), high.toFixed(2));
}
console.log(`sandbag rays: low blocked at ~4.62 ${lowOk}/${n}, high passes ${highOk}/${n}`);
check(lowOk === n, 'low rays');
check(highOk >= n * 0.8, 'high rays');
// toren-poot en kist door straal
{
  const o = { x: crate.x + 5, y: crate.baseY + 0.5, z: crate.z };
  const dd = S.rayBlockDistance('forest', o, { x: -1, y: 0, z: 0 }, 10);
  console.log('crate ray', dd.toFixed(2));
  check(dd < 5 && dd > 4.2, 'crate ray');
  const ol = { x: leg.x + 4, y: tower.baseY + 2, z: leg.z };
  const dl = S.rayBlockDistance('forest', ol, { x: -1, y: 0, z: 0 }, 10);
  console.log('leg ray', dl.toFixed(2));
  check(dl < 4, 'leg ray');
  check(S.blockedByProp(obs, crate.x, crate.baseY + 0.5, crate.z) && !S.blockedByProp(obs, crate.x, crate.baseY + 3, crate.z), 'blockedByProp');
}

// spawnpunten
let minSpawn = Infinity;
for (let total = 1; total <= 8; total++) for (let i = 0; i < total; i++) {
  const sp = S.spawnPoint('forest', i, total);
  for (const f of fps) minSpawn = Math.min(minSpawn, bpd(f, sp.x, sp.z));
}
console.log('min spawn-prop dist', minSpawn.toFixed(2));
check(minSpawn >= 5, 'spawn clear');

// snelheid
let t1 = Date.now();
for (let i = 0; i < 20000; i++) {
  const a = i * 0.37;
  S.rayBlockDistance('forest', { x: 0, y: 2, z: 0 }, { x: Math.sin(a), y: 0, z: Math.cos(a) }, 120);
}
console.log('20000 rays ms', Date.now() - t1);
// het bos moet precies hetzelfde blijven als in fase 1
// (wachttorens hebben sinds de bewegingsfase ook een vloer + borstwering als stukken: towerPart)
check(counts.tower === 3 && counts.sandbags === 22 && counts.crate === 26 && obs.propPieces.filter((pc) => !pc.towerPart).length === 60 && obs.trees.length === 240, 'forest unchanged');
check(obs.propPieces.filter((pc) => pc.towerPart === 'floor').length === 3 && obs.propPieces.filter((pc) => pc.towerPart === 'rail').length === 15, 'tower floor + railing pieces');

// ================================================================ fase 3: alle levels
console.log('\n--- levels ---');
check(S.LEVELS.length === 5 && S.LEVELS[0].id === 'forest', 'level list (forest first)');
check(new Set(S.LEVELS.map((l) => l.id)).size === 5, 'unique level ids');
check(S.LEVELS.every((l) => l.name && l.name.nl && l.name.en), 'level names nl+en');

function pieceDist(pc, x, z) {
  return pc.type === 1 ? Math.max(0, Math.hypot(x - pc.x, z - pc.z) - pc.r) : bpd(pc, x, z);
}

for (const L of S.LEVELS) {
  const id = L.id;
  if (id === 'forest') continue;
  const tg = Date.now();
  const o = S.getObstacles(id);
  const genMs = Date.now() - tg;
  const kinds = {};
  for (const p of o.props) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
  console.log(`[${id}] gen ${genMs} ms, props ${o.props.length}, pieces ${o.propPieces.length}, trees ${o.trees.length}`, JSON.stringify(kinds));
  check(genMs < 400, id + ' generation time');
  check(o.propPieces.length > 40, id + ' has obstacles');
  check(Number.isFinite(S.heightAt(id, 12.3, -45.6)), id + ' height finite');

  // deterministisch: een verse kopie van shared.js geeft exact dezelfde wereld (server == client)
  {
    const path = require.resolve('../public/shared.js');
    delete require.cache[path];
    const S2 = require('../public/shared.js');
    const a = JSON.stringify(o.props.map((p) => [p.kind, p.x, p.z, p.yaw, p.h, p.stack]));
    const b = JSON.stringify(S2.getObstacles(id).props.map((p) => [p.kind, p.x, p.z, p.yaw, p.h, p.stack]));
    check(a === b, id + ' deterministic');
  }

  // alles binnen de kaart
  check(o.propPieces.every((pc) => Math.abs(pc.x) < S.MAP_HALF && Math.abs(pc.z) < S.MAP_HALF), id + ' pieces in map');

  // spawns: vrij, verspreid, en nooit in een obstakel
  let spawnBad = 0, minSep = Infinity;
  for (let total = 1; total <= 8; total++) {
    const sps = [];
    for (let i = 0; i < total; i++) {
      const sp = S.spawnPoint(id, i, total);
      if (!S.isClear(id, sp.x, sp.z, 1.5)) spawnBad++;
      sps.push(sp);
    }
    if (total === 8) for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) minSep = Math.min(minSep, Math.hypot(sps[a].x - sps[b].x, sps[a].z - sps[b].z));
  }
  console.log(`  spawns blocked ${spawnBad}, min separation (8 players) ${minSep.toFixed(1)} m`);
  check(spawnBad === 0, id + ' spawns clear');
  check(minSep > 25, id + ' spawns spread out');

  // muren houden kogels tegen (recht ervoor, op 1 m hoogte); lage muren niet op 1.8 m
  let wallN = 0, wallOk = 0, lowN = 0, lowOk = 0;
  for (const pc of o.propPieces) {
    const p = pc.prop;
    if (pc.type !== 0 || p.kind !== 'wall' || pc.overhead || (p.yb || 0) > 0 || p.mat === 'roof') continue;
    for (const side of [-1, 1]) {
      const nx = pc.s * side, nz = pc.c * side;   // lokale Z in wereld
      const dist = pc.hz + 2.5;
      const ox = pc.x + nx * dist, oz = pc.z + nz * dist;
      if (!S.isClear(id, ox, oz, 0.3)) continue;
      const base = p.baseY;
      // vrij pad tot de muur (geen ander obstakel, geen heuvel)
      let clear = true;
      for (let s2 = 0; s2 < 2.4; s2 += 0.1) {
        const x = ox - nx * s2, z = oz - nz * s2;
        if (S.heightAt(id, x, z) > base + 0.7) { clear = false; break; }
        for (const q of (o.propGrid.get(((Math.floor(x / 8) + 64) * 256 + (Math.floor(z / 8) + 64))) || [])) if (q !== pc && !q.overhead && pieceDist(q, x, z) < 0.05) clear = false;
        for (const t of o.trees) if (Math.hypot(t.x - x, t.z - z) < t.r + 0.1) clear = false;
      }
      if (!clear) continue;
      const d = { x: -nx, y: 0, z: -nz };
      if (p.h >= 1.6) {
        wallN++;
        const hit = S.rayBlockDistance(id, { x: ox, y: base + 1.0, z: oz }, d, 10);
        if (Math.abs(hit - 2.5) < 0.05) wallOk++;
        else if (wallN - wallOk < 4) console.log('  wall ray miss', p.mat, hit.toFixed(2), pc.x.toFixed(1), pc.z.toFixed(1));
      } else if (p.h <= 1.3 && !pc.overhead) {
        lowN++;
        const hit = S.rayBlockDistance(id, { x: ox, y: base + p.h + 0.6, z: oz }, d, 2.6 + pc.hz * 2);
        if (hit >= 2.5 + pc.hz * 2) lowOk++;
      }
    }
  }
  console.log(`  wall rays blocked ${wallOk}/${wallN}, over low walls ${lowOk}/${lowN}`);
  check(wallN > 0 ? wallOk / wallN > 0.97 : true, id + ' wall rays');
  check(lowN === 0 || lowOk / lowN > 0.85, id + ' low wall rays');

  // deuren (latei boven hoofdhoogte) zijn doorloopbaar, ramen niet (vensterbank)
  let doorN = 0, doorOk = 0;
  for (const pc of o.propPieces) {
    if (!pc.overhead || pc.prop.mat === 'roof' || pc.towerPart || pc.slab) continue;   // torenplatform, daken / verdiepingsvloeren
    if (S.blockedByProp(o, pc.x, pc.prop.baseY + 0.5, pc.z)) continue; // raam met vensterbank
    doorN++;
    if (S.isClear(id, pc.x, pc.z, S.PLAYER_RADIUS)) doorOk++;
  }
  console.log(`  doorways walkable ${doorOk}/${doorN}`);
  check(doorOk === doorN, id + ' doorways walkable');

  // uitduwen: een speler die tot 0.4 m in een obstakel stapt (grote stap / lag) komt weer vrij te staan
  let pushN = 0, pushOk = 0;
  let seed = 99;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const pc of o.propPieces) {
    if (pc.overhead || pushN > 1500) continue;
    for (let k = 0; k < 2; k++) {
      let x, z, ox, oz;   // (ox, oz) = net buiten dezelfde zijde
      const pen = rnd() * 0.4;
      if (pc.type === 1) {
        const a = rnd() * 6.28, rr = Math.max(0, pc.r - pen);
        x = pc.x + Math.cos(a) * rr; z = pc.z + Math.sin(a) * rr;
        ox = pc.x + Math.cos(a) * (pc.r + 0.6); oz = pc.z + Math.sin(a) * (pc.r + 0.6);
      } else {
        let lx = (rnd() * 2 - 1) * pc.hx, lz = (rnd() * 2 - 1) * pc.hz, ex, ez;
        if (rnd() < 0.5) { const sg = Math.sign(lx || 1); lx = sg * Math.max(0, pc.hx - pen); ex = sg * (pc.hx + 0.6); ez = lz; }
        else { const sg = Math.sign(lz || 1); lz = sg * Math.max(0, pc.hz - pen); ez = sg * (pc.hz + 0.6); ex = lx; }
        x = pc.x + lx * pc.c + lz * pc.s; z = pc.z - lx * pc.s + lz * pc.c;
        ox = pc.x + ex * pc.c + ez * pc.s; oz = pc.z - ex * pc.s + ez * pc.c;
      }
      // alleen zijden waar je echt tegenaan kunt lopen (niet tussen twee containers die elkaar raken)
      if (!S.isClear(id, ox, oz, S.PLAYER_RADIUS)) continue;
      if (Math.abs(x) > S.MAP_HALF - 1 || Math.abs(z) > S.MAP_HALF - 1) continue;
      pushN++;
      let r = S.resolveCollision(id, x, z, S.PLAYER_RADIUS);
      for (let it = 0; it < 4 && !S.isClear(id, r.x, r.z, S.PLAYER_RADIUS - 0.02); it++) r = S.resolveCollision(id, r.x, r.z, S.PLAYER_RADIUS);
      if (S.isClear(id, r.x, r.z, S.PLAYER_RADIUS - 0.02)) pushOk++;
    }
  }
  console.log(`  push-out ok ${pushOk}/${pushN}`);
  check(pushOk / pushN > 0.99, id + ' push-out');

  // geen vastloopplekken: alle vrije plekken (raster 0.5 m) hangen aan elkaar, spawns in het grote gebied
  {
    const step = 0.5, N = Math.floor((2 * S.MAP_HALF - 2) / step);
    const X = (i) => -S.MAP_HALF + 1 + i * step;
    const free = new Uint8Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) free[i * N + j] = S.isClear(id, X(i), X(j), S.PLAYER_RADIUS) ? 1 : 0;
    const comp = new Int32Array(N * N).fill(-1);
    const sizes = [];
    for (let s0 = 0; s0 < N * N; s0++) {
      if (!free[s0] || comp[s0] >= 0) continue;
      const cid = sizes.length; let size = 0; const st = [s0]; comp[s0] = cid;
      while (st.length) {
        const c = st.pop(); size++;
        const i = (c / N) | 0, j = c % N;
        if (i > 0 && free[c - N] && comp[c - N] < 0) { comp[c - N] = cid; st.push(c - N); }
        if (i < N - 1 && free[c + N] && comp[c + N] < 0) { comp[c + N] = cid; st.push(c + N); }
        if (j > 0 && free[c - 1] && comp[c - 1] < 0) { comp[c - 1] = cid; st.push(c - 1); }
        if (j < N - 1 && free[c + 1] && comp[c + 1] < 0) { comp[c + 1] = cid; st.push(c + 1); }
      }
      sizes.push(size);
    }
    // deuropeningen (1.4 m) zijn smaller dan het raster kan volgen: verbind de stukken aan weerszijden
    // als de lijn recht door de opening (ook echt, met straal 0.5) vrij is
    {
      const parent = sizes.map((_, i) => i);
      const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
      const cellAt = (x, z) => {
        let best = -1, bd = Infinity;
        const a0 = Math.round((x - X(0)) / step), b0 = Math.round((z - X(0)) / step);
        for (let a = a0 - 2; a <= a0 + 2; a++) for (let b = b0 - 2; b <= b0 + 2; b++) {
          if (a < 0 || b < 0 || a >= N || b >= N || !free[a * N + b]) continue;
          const dd = Math.hypot(X(a) - x, X(b) - z);
          if (dd < bd) { bd = dd; best = a * N + b; }
        }
        return best;
      };
      let bridged = 0;
      for (const dr of o.doors || []) {
        let lineOk = true;
        for (let k = -1.1; k <= 1.1; k += 0.1) if (!S.isClear(id, dr.x + dr.nx * k, dr.z + dr.nz * k, S.PLAYER_RADIUS)) lineOk = false;
        const ca = cellAt(dr.x - dr.nx * 1.1, dr.z - dr.nz * 1.1), cb = cellAt(dr.x + dr.nx * 1.1, dr.z + dr.nz * 1.1);
        if (!lineOk || ca < 0 || cb < 0) { if (bridged < 999) console.log('  door not passable', dr.id, dr.kind, dr.x.toFixed(1), dr.z.toFixed(1)); continue; }
        const ra = find(comp[ca]), rb = find(comp[cb]);
        if (ra !== rb) { parent[ra] = rb; bridged++; }
      }
      const merged = new Map();
      sizes.forEach((sz, i) => { const r = find(i); merged.set(r, (merged.get(r) || 0) + sz); });
      const roots = [...merged.keys()];
      const newSizes = roots.map((r) => merged.get(r));
      const remap = new Map(roots.map((r, i) => [r, i]));
      for (let c = 0; c < N * N; c++) if (comp[c] >= 0) comp[c] = remap.get(find(comp[c]));
      sizes.length = 0; sizes.push(...newSizes);
      if (o.doors) console.log(`  doors ${o.doors.length}, buildings ${o.buildings.length}, bridged ${bridged}`);
    }
    const total = sizes.reduce((a, b) => a + b, 0), big = sizes.indexOf(Math.max(...sizes));
    let spIn = 0, spN = 0;
    for (let t = 1; t <= 8; t++) for (let i = 0; i < t; i++) {
      const sp = S.spawnPoint(id, i, t); spN++;
      const a = Math.round((sp.x - X(0)) / step), b = Math.round((sp.z - X(0)) / step);
      if (comp[a * N + b] === big) spIn++;
    }
    console.log(`  walkable ${(100 * total / (N * N)).toFixed(1)}%, connected ${(100 * sizes[big] / total).toFixed(2)}%, pockets ${sizes.length - 1}, spawns in main area ${spIn}/${spN}`);
    check(sizes[big] / total > 0.995, id + ' connected (no stuck pockets)');
    check(spIn === spN, id + ' spawns reachable');
  }

  // snelheid van stralen (bot-zichtlijnen, labels, camera)
  const tr = Date.now();
  for (let i = 0; i < 20000; i++) {
    const a = i * 0.37, ox = Math.sin(i * 1.3) * 60, oz = Math.cos(i * 0.7) * 60;
    S.rayBlockDistance(id, { x: ox, y: S.heightAt(id, ox, oz) + 1.5, z: oz }, { x: Math.sin(a), y: 0, z: Math.cos(a) }, 120);
  }
  const rayMs = Date.now() - tr;
  console.log(`  20000 rays ${rayMs} ms`);
  check(rayMs < 1500, id + ' ray speed');
}

// gestapelde containers zijn hoger; vaten (cilinders) houden kogels tegen
{
  const o = S.getObstacles('harbour');
  const c2 = o.propPieces.find((pc) => pc.prop.kind === 'container' && pc.prop.stack === 2);
  const c1 = o.propPieces.find((pc) => pc.prop.kind === 'container' && pc.prop.stack === 1);
  check(c2 && S.blockedByProp(o, c2.x, c2.prop.baseY + 4, c2.z), 'stacked container height');
  check(c1 && !S.blockedByProp(o, c1.x, c1.prop.baseY + 3, c1.z) && S.blockedByProp(o, c1.x, c1.prop.baseY + 2, c1.z), 'single container height');
  const roof = o.propPieces.find((pc) => pc.prop.mat === 'roof');
  check(roof && roof.overhead && S.isClear('harbour', roof.x, roof.z + 2, 0.5), 'warehouse roof does not block walking');
  check(S.rayBlockDistance('harbour', { x: roof.x, y: 1.5, z: roof.z }, { x: 0, y: 1, z: 0 }, 20) < 8, 'warehouse roof blocks rays');
  let bN = 0, bOk = 0;
  for (const pc of o.propPieces) {
    if (pc.prop.kind !== 'barrel') continue;
    const ox = pc.x + 3, oz = pc.z;
    if (!S.isClear('harbour', ox, oz, 0.2)) continue;
    let clear = true;
    for (let s2 = 0; s2 < 2.6; s2 += 0.1) for (const q of o.propPieces) if (q !== pc && pieceDist(q, ox - s2, oz) < 0.05) clear = false;
    if (!clear) continue;
    bN++;
    const hit = S.rayBlockDistance('harbour', { x: ox, y: pc.prop.baseY + 0.5, z: oz }, { x: -1, y: 0, z: 0 }, 6);
    if (Math.abs(hit - (3 - pc.r)) < 0.05) bOk++;
  }
  console.log(`barrel rays ${bOk}/${bN}`);
  check(bN > 0 && bOk === bN, 'barrel rays');
}
// gegevens voor verticale beweging: boxes (bovenkant + walkable) en ladders van de wachttorens
{
  for (const L of S.LEVELS) {
    const o = S.getObstacles(L.id);
    const towers = o.props.filter((p) => p.kind === 'tower');
    const plats = o.boxes.filter((b) => b.kind === 'towerPlatform');
    check(Array.isArray(o.boxes) && Array.isArray(o.ladders), L.id + ' boxes/ladders present');
    check(o.boxes.every((b) => ['x', 'z', 'hw', 'hd', 'rot', 'bottom', 'h', 'walkable'].every((k) => k in b) && b.h > b.bottom), L.id + ' box shape');
    const towerLadders = o.ladders.filter((ld) => ld.kind === 'tower');
    check(plats.length === towers.length && towerLadders.length === towers.length, L.id + ' tower platform + ladder per tower');
    let ladOk = 0;
    for (const ld of towerLadders) {
      const t = towers.find((p) => Math.hypot(p.x - ld.x, p.z - ld.z) < 2);
      const ox = ld.x + Math.sin(ld.rot) * 0.6, oz = ld.z + Math.cos(ld.rot) * 0.6;   // waar de klimmer staat
      if (t && Math.abs(ld.topY - ld.bottomY - 4.2) < 1e-6 && S.isClear(L.id, ox, oz, 0.3)) ladOk++;
    }
    check(ladOk === towerLadders.length, L.id + ' ladders reachable');
    const crate = o.boxes.find((b) => b.kind === 'crate');
    if (crate) check(crate.walkable && Math.abs(crate.h - crate.bottom - 1.1 * crate.piece.prop.stack) < 1e-6, L.id + ' crate top walkable');
    const sb = o.boxes.find((b) => b.kind === 'sandbags');
    if (sb) check(sb.walkable, L.id + ' sandbags walkable');
    const thin = o.boxes.find((b) => b.kind === 'wall' && b.hd < 0.5);
    if (thin) check(thin.walkable === !thin.piece.overhead, L.id + ' thin wall walkable unless it is a lintel');
        // alle blokken zonder overhead moeten beloopbaar zijn (behalve borstweringen / bomen)
    const bad = o.boxes.filter((b) => !b.walkable && b.kind !== 'railing' && !(b.piece && b.piece.overhead));
    check(bad.length === 0, L.id + ' every solid object has a standable top (' + bad.map((b) => b.kind).slice(0, 5).join(',') + ')');
    console.log(`[${L.id}] boxes ${o.boxes.length} (walkable ${o.boxes.filter((b) => b.walkable).length}), ladders ${o.ladders.length}`);
  }
  const c2 = S.getObstacles('harbour').boxes.find((b) => b.kind === 'container' && b.piece.prop.stack === 2);
  check(c2 && c2.walkable && Math.abs(c2.h - c2.bottom - 5.18) < 1e-6, 'stacked container top');
}

// ================================================================ springen, hurken, liggen, klimmen
console.log('\n--- vertical movement ---');
{
  const M = S.MOVE, DT = 1 / 60;
  const near = (a, b, e) => Math.abs(a - b) < (e || 0.02);
  const newSt = (x, z, y) => ({ x, z, y, vy: 0, ground: true, stance: 0, ladder: -1, ls: 0 });
  // n stappen lopen met snelheid (vx, vz); jumpAt = stap waarop gesprongen wordt
  function run(id, st, vx, vz, n, jumpAt) {
    for (let i = 0; i < n; i++) S.stepPlayer(id, st, { vx, vz, jump: i === jumpAt }, DT);
    return st;
  }
  const flatAround = (id, x, z, rad, tol) => {
    const g = S.heightAt(id, x, z);
    for (let a = 0; a < 6.28; a += 0.5) for (let r = 0; r <= rad; r += 0.5) if (Math.abs(S.heightAt(id, x + Math.sin(a) * r, z + Math.cos(a) * r) - g) > tol) return false;
    return true;
  };
  const fo = S.getObstacles('forest');

  // supportHeight: grond, kist (alleen van bovenaf), toren (alleen op platformhoogte)
  check(near(S.supportHeight('forest', 0.3, 0.2), S.heightAt('forest', 0.3, 0.2), 1e-9), 'support = ground in the open');
  const cb = fo.boxes.find((b) => b.kind === 'crate' && b.piece.prop.stack === 1 && flatAround('forest', b.x, b.z, 2.5, 0.25) &&
    S.isClear('forest', b.x + 2.2, b.z, 0.6) && S.isClear('forest', b.x - 2.2, b.z, 0.6));
  check(!!cb, 'flat single crate found');
  const gC = S.heightAt('forest', cb.x, cb.z);
  check(near(S.supportHeight('forest', cb.x, cb.z, gC), gC, 0.13), 'crate top not reachable by stepping');
  check(near(S.supportHeight('forest', cb.x, cb.z, cb.h), cb.h, 1e-9) && near(cb.h - cb.piece.prop.baseY, 1.02, 1e-6), 'crate top = support from above');
  const plat = fo.boxes.find((b) => b.kind === 'towerPlatform');
  const twr = fo.props.find((p) => p.kind === 'tower' && Math.hypot(p.x - plat.x, p.z - plat.z) < 0.01);
  check(near(S.supportHeight('forest', plat.x, plat.z, plat.h), plat.h, 1e-9), 'tower platform support from above');
  check(S.supportHeight('forest', plat.x, plat.z, S.heightAt('forest', plat.x, plat.z)) < plat.h - 3, 'under the tower = ground');
  const hb = S.getObstacles('harbour');
  const cont2 = hb.boxes.find((b) => b.kind === 'container' && b.piece.prop.stack === 2);
  check(near(S.supportHeight('harbour', cont2.x, cont2.z, cont2.h), cont2.h, 1e-9) && near(S.supportHeight('harbour', cont2.x, cont2.z, 0), 0, 1e-9), 'container support');

  // kist: er niet doorheen kunnen lopen, wel op kunnen springen; een dubbele kist is te hoog
  {
    const st = newSt(cb.x + 2.2, cb.z, S.heightAt('forest', cb.x + 2.2, cb.z));
    let minD = Infinity;
    for (let i = 0; i < 180; i++) {
      S.stepPlayer('forest', st, { vx: -6, vz: 0 }, DT);
      const dx = st.x - cb.x, dz = st.z - cb.z;
      const lx = dx * cb.c - dz * cb.s, lz = dx * cb.s + dz * cb.c;
      minD = Math.min(minD, Math.hypot(Math.max(Math.abs(lx) - cb.hw, 0), Math.max(Math.abs(lz) - cb.hd, 0)));
    }
    console.log(`crate walk: min dist ${minD.toFixed(2)}, y-ground ${(st.y - S.heightAt('forest', st.x, st.z)).toFixed(2)}`);
    check(minD > 0.45 && st.ground && st.y < S.heightAt('forest', st.x, st.z) + 0.05, 'cannot walk through a crate');
    const sj = newSt(cb.x + 1.6, cb.z, S.heightAt('forest', cb.x + 1.6, cb.z));
    run('forest', sj, -4, 0, 25, 0);          // springen en naar de kist toe
    run('forest', sj, 0, 0, 60);
    console.log(`crate jump: y ${(sj.y - gC).toFixed(2)} above ground, ground ${sj.ground}`);
    check(sj.ground && near(sj.y, cb.h, 0.01), 'can jump onto a crate');
    run('forest', sj, -3, 0, 60);              // er weer af lopen
    check(sj.ground && sj.y < gC + 0.2, 'walk off the crate = back on the ground');

    // Car roofs are higher than a normal crate; verify a jump can land and remain on one.
    const car = S.getObstacles('snow').boxes.find((b) => b.kind === 'car' && b.walkable);
    check(!!car, 'walkable car roof exists');
    if (car) {
      const d = car.hw + 0.85;
      const cs = newSt(car.x + d * car.c, car.z - d * car.s,
        S.heightAt('snow', car.x + d * car.c, car.z - d * car.s));
      const ca = { x: cs.x, z: cs.z, y: cs.y, sy: cs.y, airT: 0, t: 0, stance: 0, stanceT: 0, ladder: -1 };
      let worst = 0, elapsed = 0;
      for (let i = 0; i < 120; i++) {
        S.stepPlayer('snow', cs, { vx: i < 45 ? -4 * car.c : 0, vz: i < 45 ? 4 * car.s : 0, jump: i === 0 }, DT);
        elapsed += DT * 1000;
        if (i % 3 === 2) {
          const accepted = S.validateState('snow', ca, { x: +cs.x.toFixed(2), z: +cs.z.toFixed(2), y: +cs.y.toFixed(2), s: cs.stance }, elapsed);
          worst = Math.max(worst, Math.abs(accepted.y - cs.y), Math.hypot(accepted.x - cs.x, accepted.z - cs.z));
        }
      }
      check(cs.ground && near(cs.y, car.h, 0.02), 'can jump onto and stand on a car');
      check(worst < 0.1, 'server accepts standing on a car');
    }

    const c2b = fo.boxes.find((b) => b.kind === 'crate' && b.piece.prop.stack === 2 && flatAround('forest', b.x, b.z, 3, 0.15) && S.isClear('forest', b.x + 1.6, b.z, 0.6));
    if (c2b) {
      const s2 = newSt(c2b.x + 1.6, c2b.z, S.heightAt('forest', c2b.x + 1.6, c2b.z));
      run('forest', s2, -4, 0, 25, 0); run('forest', s2, 0, 0, 60);
      check(s2.y < c2b.h - 1, 'stacked crate too high to jump on');
    }
  }

  // ladder: van onder naar het platform, rondlopen tegen de borstwering, via de ladder weer naar beneden
  {
    const ld = fo.ladders.find((l) => Math.hypot(l.x - twr.x, l.z - twr.z) < 2);
    const li = fo.ladders.indexOf(ld);
    const I = S.ladderInfo('forest', ld);
    const sx = ld.x + I.ox * 1.4, sz = ld.z + I.oz * 1.4;
    const st = newSt(sx, sz, S.supportHeight('forest', sx, sz));
    let t = 0, grabbed = false, maxY = -Infinity;
    while (t < 6 && !(grabbed && st.ladder < 0)) {
      S.stepPlayer('forest', st, { vx: -I.ox * 5, vz: -I.oz * 5 }, DT);
      if (st.ladder === li) grabbed = true;
      maxY = Math.max(maxY, st.y); t += DT;
    }
    console.log(`ladder climb: grabbed ${grabbed}, ${t.toFixed(2)} s, y ${(st.y - twr.baseY).toFixed(2)} above tower base`);
    check(grabbed && st.ladder < 0 && st.ground && near(st.y, ld.topY, 0.01), 'climb ladder to the platform');
    check(t > (I.L1 / M.CLIMB_SPEED) * 0.9 && t < (I.total / M.CLIMB_SPEED) + 0.8, 'climb speed ~2.5 m/s');
    check(near(S.supportHeight('forest', st.x, st.z, st.y), plat.h, 1e-6), 'standing on the platform after climbing');
    // tegen de borstwering lopen (3 dichte kanten + schuin): blijft op het platform
    let stayed = true;
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -3 * Math.PI / 4]) {
      const dir = twr.yaw + Math.PI + a;   // + PI = van de ladder af (naar de achterkant)
      const p = { ...st };
      run('forest', p, Math.sin(dir) * 6, Math.cos(dir) * 6, 120);
      const dx = p.x - plat.x, dz = p.z - plat.z;
      const lx = dx * plat.c - dz * plat.s, lz = dx * plat.s + dz * plat.c;
      if (p.ladder < 0 && (!near(p.y, plat.h, 0.01) || Math.abs(lx) > 1.1 || Math.abs(lz) > 1.1)) { stayed = false; console.log('  left platform at angle', a.toFixed(2), lx.toFixed(2), lz.toFixed(2), p.y.toFixed(2)); }
    }
    check(stayed, 'railing keeps you on the platform');
    // vanaf het platform naar de opening lopen -> ladder pakken en naar beneden klimmen
    const d = { ...st };
    let t2 = 0, grab2 = false;
    while (t2 < 6 && !(grab2 && d.ladder < 0)) {
      S.stepPlayer('forest', d, { vx: I.ox * 5, vz: I.oz * 5 }, DT);
      if (d.ladder === li) grab2 = true;
      t2 += DT;
    }
    console.log(`ladder down: grabbed ${grab2}, ${t2.toFixed(2)} s, y-ground ${(d.y - S.heightAt('forest', d.x, d.z)).toFixed(2)}`);
    check(grab2 && d.ground && d.y < twr.baseY + 0.6, 'climb down the ladder');
    // springen vanaf het platform over de borstwering -> naar beneden
    const j = { ...st };
    run('forest', j, -I.ox * 6, -I.oz * 6, 30);           // naar de achterkant
    run('forest', j, -I.ox * 6, -I.oz * 6, 150, 0);       // springen en doorlopen
    console.log(`jump off platform: y-ground ${(j.y - S.heightAt('forest', j.x, j.z)).toFixed(2)}`);
    check(j.ground && j.y < twr.baseY + 1, 'jump over the railing and fall down');
    check(S.ladderAt('forest', I.sx, I.sz, I.y0 + 2) === li && S.ladderAt('forest', plat.x, plat.z, plat.h) === -1, 'ladderAt');
    // poten blokkeren niet op het platform (hoek)
    const corner = S.collideY('forest', plat.x + 1.0 * plat.c + 1.0 * plat.s, plat.z - 1.0 * plat.s + 1.0 * plat.c, 0.5, plat.h, 1.8);
    const cx0 = plat.x + 1.0 * plat.c + 1.0 * plat.s, cz0 = plat.z - 1.0 * plat.s + 1.0 * plat.c;
    check(Math.hypot(corner.x - cx0, corner.z - cz0) < 1e-6, 'tower legs do not block on the platform');
  }

  // alle ladders in alle levels zijn te beklimmen
  {
    let n = 0, ok = 0;
    for (const L of S.LEVELS) {
      const o = S.getObstacles(L.id);
      o.ladders.forEach((ld) => {
        const I = S.ladderInfo(L.id, ld);
        const st = newSt(ld.x + I.ox * 1.3, ld.z + I.oz * 1.3, S.supportHeight(L.id, ld.x + I.ox * 1.3, ld.z + I.oz * 1.3));
        run(L.id, st, -I.ox * 5, -I.oz * 5, 420);
        n++;
        if (st.ladder < 0 && st.ground && near(st.y, ld.topY, 0.01)) ok++;
        else console.log('  ladder fail', L.id, st.y.toFixed(2), ld.topY.toFixed(2), st.ladder);
      });
    }
    console.log(`all ladders climbable ${ok}/${n}`);
    check(n > 0 && ok === n, 'all ladders climbable');
  }

  // over gestapelde containers lopen (aaneengesloten blok in de haven)
  {
    let pair = null;
    for (const a of hb.boxes) {
      if (a.kind !== 'container' || a.piece.prop.stack !== 2) continue;
      const b = hb.boxes.find((q) => q !== a && q.kind === 'container' && Math.abs(q.h - a.h) < 1e-6 && Math.abs(q.rot - a.rot) < 1e-6 && near(Math.hypot(q.x - a.x, q.z - a.z), 2.46, 0.02));
      if (b) { pair = [a, b]; break; }
    }
    check(!!pair, 'adjacent stacked containers found');
    if (pair) {
      const [a, b] = pair;
      const st = newSt(a.x, a.z, a.h);
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      let low = Infinity;
      for (let i = 0; i < 40; i++) { S.stepPlayer('harbour', st, { vx: dx / l * 3.7, vz: dz / l * 3.7 }, DT); low = Math.min(low, st.y); }
      console.log(`container walk: lowest y ${low.toFixed(2)} (top ${a.h.toFixed(2)}), moved ${Math.hypot(st.x - a.x, st.z - a.z).toFixed(2)} m`);
      check(near(low, a.h, 1e-6) && Math.hypot(st.x - b.x, st.z - b.z) < 0.3, 'walk across stacked container tops');
    }
  }

  // raakbollen per houding achter lage dekking (zandzakken, 1.0 m): staan > hurken > liggen (= 0)
  {
    // (vlakke haven: zandzakken 1.0 m en betonblokken 0.82 m)
    let tested = 0, okOrder = 0;
    for (const w of hb.props.filter((p) => p.kind === 'sandbags' || p.kind === 'jersey')) {
      const nz = { x: Math.sin(w.yaw), z: Math.cos(w.yaw) };
      const base = w.baseY;
      const tx = w.x - nz.x * 1.0, tz = w.z - nz.z * 1.0;             // doelwit 1 m achter de muur
      const ox = w.x + nz.x * 12, oz = w.z + nz.z * 12;              // schutter 12 m ervoor
      let clear = Math.abs(ox) < 90 && Math.abs(oz) < 90;
      for (let s = 0; s <= 13.5 && clear; s += 0.25) {
        const x = ox - nz.x * s, z = oz - nz.z * s;
        for (const pc of hb.propPieces) if (pc.prop !== w && Math.hypot(pc.x - x, pc.z - z) < pc.br + 0.9) clear = false;
      }
      if (!clear) continue;
      tested++;
      const o = { x: ox, y: base + 1.5, z: oz };
      const yawToShooter = Math.atan2(ox - tx, oz - tz);
      const expo = [0, 0, 0];
      for (let st = 0; st < 3; st++) {
        for (let i = -6; i <= 6; i++) for (let j = 0; j <= 20; j++) {
          const px = tx + nz.z * i * 0.1, pz = tz - nz.x * i * 0.1, py = base + j * 0.1;
          const v = { x: px - o.x, y: py - o.y, z: pz - o.z }, L = Math.hypot(v.x, v.y, v.z);
          const d = { x: v.x / L, y: v.y / L, z: v.z / L };
          const block = S.rayBlockDistance('harbour', o, d, 20);
          const hit = S.rayHitPlayer(o, d, tx, base, tz, block, st, yawToShooter);
          if (hit !== null) expo[st]++;
        }
      }
      if (expo[0] > expo[1] && expo[1] > 0 && expo[1] < expo[0] * 0.6 && expo[2] === 0) okOrder++;
      else console.log('  exposure', expo.join('/'));
      if (tested >= 6) break;
    }
    console.log(`low cover exposure ok ${okOrder}/${tested}`);
    check(tested >= 3 && okOrder === tested, 'crouch/prone hitboxes vs low cover');
    // achterwaarts compatibel: zonder houding = staan
    const o = { x: 0, y: 1.5, z: -10 }, d = { x: 0, y: 0, z: 1 };
    check(S.rayHitPlayer(o, d, 0, 0, 0, 50) !== null && S.rayHitPlayer(o, d, 0, 0, 0, 50, 2, 0) === null &&
      S.rayHitPlayer({ x: 0, y: 0.3, z: -10 }, d, 0, 0, 0, 50, 'prone', 0) !== null, 'rayHitPlayer stance');
  }

  // servercontrole (validateState)
  {
    const id = 'forest';
    const mkAc = (x, z, y, t) => ({ x, z, y, sy: y, airT: 0, t, stance: 0, stanceT: 0, ladder: -1 });
    // 1) teleport naar het torenplatform (onder de toren staan en y = platform sturen)
    const g = S.heightAt(id, plat.x, plat.z);
    let ac = mkAc(plat.x, plat.z, g, 0), r;
    r = S.validateState(id, ac, { x: plat.x, z: plat.z, y: plat.h }, 50);
    console.log(`teleport onto tower: accepted y ${(r.y - g).toFixed(2)} above ground (wanted ${(plat.h - g).toFixed(2)})`);
    check(r.y < g + 1.9 && r.air, 'teleport onto a tower is rejected');
    let maxAcc = r.y, sumAcc = 0;
    for (let k = 2; k <= 60; k++) { r = S.validateState(id, ac, { x: plat.x, z: plat.z, y: plat.h }, k * 50); maxAcc = Math.max(maxAcc, r.y); sumAcc += r.y - g; }
    console.log(`  keeps claiming the platform: max ${(maxAcc - g).toFixed(2)}, mean ${(sumAcc / 59).toFixed(2)} above ground`);
    check(maxAcc < g + 1.9 && sumAcc / 59 < 1.65, 'hovering is limited to jump arcs (gravity)');
    // vliegen: steeds hoger dan de vorige toegestane hoogte vragen
    ac = mkAc(0.3, 0.2, S.heightAt(id, 0.3, 0.2), 0);
    let fly = 0;
    for (let k = 1; k <= 40; k++) { r = S.validateState(id, ac, { x: 0.3, z: 0.2, y: ac.y + 0.5 }, k * 50); fly = Math.max(fly, r.y - S.heightAt(id, 0.3, 0.2)); }
    check(fly < 1.9, 'flying up is rejected');
    // 2) echte beweging wordt niet afgekeurd: ladder op, platform, eraf springen, op een kist springen
    function replay(lvl, st, steps, label) {
      const a = mkAc(st.x, st.z, st.y, 0);
      let worst = 0, tms = 0;
      for (let i = 0; i < steps.length; i++) {
        S.stepPlayer(lvl, st, steps[i], DT);
        tms += DT * 1000;
        if (i % 3 === 2) {     // ~20 berichten per seconde
          const res = S.validateState(lvl, a, { x: +st.x.toFixed(2), z: +st.z.toFixed(2), y: +st.y.toFixed(2), s: st.stance }, Math.round(tms));
          worst = Math.max(worst, Math.abs(res.y - st.y), Math.hypot(res.x - st.x, res.z - st.z));
        }
      }
      console.log(`  replay ${label}: worst correction ${worst.toFixed(3)}`);
      return worst;
    }
    const ld = fo.ladders.find((l) => Math.hypot(l.x - twr.x, l.z - twr.z) < 2);
    const I = S.ladderInfo(id, ld);
    const sx = ld.x + I.ox * 1.4, sz = ld.z + I.oz * 1.4;
    const steps = [];
    for (let i = 0; i < 200; i++) steps.push({ vx: -I.ox * 5, vz: -I.oz * 5 });   // naar de ladder en omhoog
    for (let i = 0; i < 200; i++) steps.push({ vx: -I.ox * 5, vz: -I.oz * 5 });   // door tot de borstwering
    steps.push({ vx: -I.ox * 5, vz: -I.oz * 5, jump: true });
    for (let i = 0; i < 150; i++) steps.push({ vx: -I.ox * 5, vz: -I.oz * 5 });   // over de borstwering, vallen
    const climber = newSt(sx, sz, S.supportHeight(id, sx, sz));
    check(replay(id, climber, steps, 'ladder+jump off') < 0.05 && climber.y < twr.baseY + 1, 'validation accepts climbing and falling');
    const cj = newSt(cb.x + 1.6, cb.z, S.heightAt(id, cb.x + 1.6, cb.z));
    const js = [{ vx: -4, vz: 0, jump: true }];
    for (let i = 0; i < 90; i++) js.push({ vx: i < 24 ? -4 : 0, vz: 0 });
    check(replay(id, cj, js, 'crate jump') < 0.05 && near(cj.y, cb.h, 0.01), 'validation accepts jumping onto a crate');
    // 3) houding: niet sneller wisselen dan STANCE_MS
    ac = mkAc(0.3, 0.2, S.heightAt(id, 0.3, 0.2), 0);
    r = S.validateState(id, ac, { x: 0.3, z: 0.2, s: 1 }, 1000);
    const r2 = S.validateState(id, ac, { x: 0.3, z: 0.2, s: 2 }, 1050);
    const r3 = S.validateState(id, ac, { x: 0.3, z: 0.2, s: 2 }, 1300);
    check(r.stance === 1 && r2.stance === 1 && r3.stance === 2, 'stance change rate limit');
    // 4) oude clients (geen y) staan gewoon op de grond
    ac = mkAc(0.3, 0.2, 0, 0);
    r = S.validateState(id, ac, { x: 0.5, z: 0.2 }, 50);
    check(near(r.y, S.heightAt(id, 0.5, 0.2), 1e-6) && r.stance === 0, 'old client: y = ground');
    // 5) niet in een kist kunnen staan
    ac = mkAc(cb.x + 0.9, cb.z, gC, 0);
    r = S.validateState(id, ac, { x: cb.x + 0.2, z: cb.z, y: gC }, 50);
    const dx = r.x - cb.x, dz = r.z - cb.z;
    check(Math.max(Math.abs(dx * cb.c - dz * cb.s) - cb.hw, Math.abs(dx * cb.s + dz * cb.c) - cb.hd) > 0.4, 'no standing inside a crate');
  }
}

// ================================================================ gebouwen en deuren
console.log('\n--- buildings & doors ---');
{
  const expect = { snow: { b: 9, d: 9 }, desert: { b: 8, d: 9 }, village: { b: 60, d: 100 }, harbour: { b: 3, d: 5 } };
  for (const id of ['snow', 'desert', 'village', 'harbour']) {
    const o = S.getObstacles(id);
    const bs = o.buildings, ds = o.doors;
    console.log(`[${id}] buildings ${bs.length} (${[...new Set(bs.map((b) => b.kind))].join(',')}), doors ${ds.length} (${[...new Set(ds.map((d) => d.kind))].join(',')})`);
    check(bs.length >= expect[id].b && ds.length >= expect[id].d, id + ' enough buildings/doors');
    check(bs.every((b) => b.doors.length > 0), id + ' every building has a door');
    const stuck = ds.filter((d) => !d.ok[0] && !d.ok[1]);
    if (stuck.length) console.log('  doors that cannot swing', stuck.map((d) => d.id).join(','));
    check(stuck.length === 0, id + ' every door can open');
    check(ds.every((d) => d.y1 - d.y0 > 1.8 && d.y1 - d.y0 < 5.5), id + ' door heights');
    // hol: elke binnenruimte heeft vrije plekken
    let noSpots = 0;
    for (let i = 0; i < bs.length; i++) if (S.buildingSpots(id, i).length < 1) noSpots++;
    check(noSpots === 0, id + ' buildings hollow (free spots inside) ' + noSpots);

    const st = S.newDoorState(id);
    S.setDoorState(st);
    let walkClosed = 0, walkOpen = 0, rayClosed = 0, rayOpen = 0, broken = 0, n = 0;
    const bad = [];
    for (const dr of ds) {
      if (n >= 60) break;
      n++;
      const H = dr.y0 + 1.2;
      // lopen: van 1.3 m buiten recht op de deur af
      const walk = () => {
        let x = dr.x - dr.nx * 1.3, z = dr.z - dr.nz * 1.3;
        for (let k = 0; k < 40; k++) { const r = S.resolveCollision(id, x + dr.nx * 0.1, z + dr.nz * 0.1, S.PLAYER_RADIUS); x = r.x; z = r.z; }
        return (x - dr.x) * dr.nx + (z - dr.z) * dr.nz;   // diepte (positief = binnen)
      };
      const ray = () => S.rayBlockDistance(id, { x: dr.x - dr.nx * 2, y: H, z: dr.z - dr.nz * 2 }, { x: dr.nx, y: 0, z: dr.nz }, 2.6);
      st.s[dr.id] = 0;
      const wc = walk() < -0.4, rc = Math.abs(ray() - (2 - 0.07)) < 0.05;
      if (wc) walkClosed++;
      if (rc) rayClosed++;
      const user = { x: dr.x - dr.nx * 1.0, z: dr.z - dr.nz * 1.0 };
      st.s[dr.id] = S.doorUse(id, dr.id, 0, user, [user]);
      const wo = st.s[dr.id] > 0 && walk() > 0.8, ro = ray() >= 2.6 - 1e-6;
      if (wo) walkOpen++;
      if (ro) rayOpen++;
      st.s[dr.id] = 3;   // kapotgeschoten
      const bk = walk() > 0.8 && ray() >= 2.6 - 1e-6;
      if (bk) broken++;
      if (!(wc && rc && wo && ro && bk) && bad.length < 5) bad.push([dr.id, dr.kind, wc, rc, wo, ro, bk].join(' '));
      st.s[dr.id] = 0;
    }
    console.log(`  closed: blocks walking ${walkClosed}/${n}, blocks rays ${rayClosed}/${n}; open: walk through ${walkOpen}/${n}, rays pass ${rayOpen}/${n}; broken passable ${broken}/${n}`);
    if (bad.length) console.log('  problems:', bad.join(' | '));
    check(walkClosed === n && rayClosed === n, id + ' closed doors block');
    check(walkOpen === n && rayOpen === n, id + ' open doors pass');
    check(broken === n, id + ' broken doors pass');

    // regels voor openen/sluiten (zoals de server ze gebruikt)
    const dr = ds.find((d) => d.kind !== 'roll');
    const out = { x: dr.x - dr.nx * 1.0, z: dr.z - dr.nz * 1.0 }, inn = { x: dr.x + dr.nx * 1.0, z: dr.z + dr.nz * 1.0 };
    const far = { x: dr.x - dr.nx * 5, z: dr.z - dr.nz * 5 };
    check(S.doorUse(id, dr.id, 0, far, [far]) === -1, id + ' too far to use');
    check(S.doorUse(id, dr.id, 3, out, [out]) === -1, id + ' broken door cannot be used');
    const a = S.doorUse(id, dr.id, 0, out, [out]);
    check(a === (dr.ok[0] ? 1 : 2), id + ' opens away from the user (outside -> inward) ' + a);
    if (dr.ok[1]) check(S.doorUse(id, dr.id, 0, inn, [inn]) === 2, id + ' inside -> outward');
    check(S.doorUse(id, dr.id, a, out, [out]) === 0, id + ' close');
    const inDoorway = { x: dr.x, z: dr.z };
    check(S.doorUse(id, dr.id, a, out, [out, inDoorway]) === -1, id + ' cannot close on a player');
    check(S.doorUse(id, dr.id, a, inDoorway, [inDoorway]) === -1, id + ' cannot close while standing in the doorway');
    // wie zelf in de zwaai staat (maar niet in de opening) mag de deur wel dichtdoen
    const swing = { x: dr.x + dr.nx * (a === 1 ? 1.2 : -1.2), z: dr.z + dr.nz * (a === 1 ? 1.2 : -1.2) };
    check(S.doorUse(id, dr.id, a, swing, [swing]) === 0, id + ' user may close a door swinging past himself');
    // iemand vlak achter de deur (binnen) en de gebruiker vlak ervoor: beide kanten geblokkeerd
    const off = (k) => ({ x: dr.x + dr.nx * k - dr.ux * (dr.w / 2 - 0.5), z: dr.z + dr.nz * k - dr.uz * (dr.w / 2 - 0.5) });
    check(S.doorUse(id, dr.id, 0, off(-0.6), [off(-0.6), off(0.6)]) === -1, id + ' cannot open into a player');
    const roll = ds.find((d) => d.kind === 'roll');
    if (roll) {
      const u = { x: roll.x - roll.nx, z: roll.z - roll.nz };
      check(S.doorUse(id, roll.id, 0, u, [u]) === 1 && S.doorUse(id, roll.id, 1, u, [u, { x: roll.x, z: roll.z }]) === -1, id + ' roll-up door');
    }
    // bots: tussenpunt via de deur naar binnen en weer naar buiten
    const b = o.buildings[dr.b], spot = S.buildingSpots(id, dr.b)[0];
    const wp1 = S.doorRoute(id, dr.x - dr.nx * 6, dr.z - dr.nz * 6, spot.x, spot.z);
    const wp2 = S.doorRoute(id, spot.x, spot.z, dr.x - dr.nx * 8, dr.z - dr.nz * 8);
    check(wp1 && b.doors.includes(wp1.door) && wp2 && b.doors.includes(wp2.door), id + ' bot route via door');
    check(S.insideBuilding(id, spot.x, spot.z) === dr.b, id + ' insideBuilding');
    // snelheid van stralen met deuren erbij
    const tr = Date.now();
    for (let i = 0; i < 20000; i++) {
      const a2 = i * 0.37, ox = Math.sin(i * 1.3) * 60, oz = Math.cos(i * 0.7) * 60;
      S.rayBlockDistance(id, { x: ox, y: S.heightAt(id, ox, oz) + 1.5, z: oz }, { x: Math.sin(a2), y: 0, z: Math.cos(a2) }, 120);
    }
    const ms = Date.now() - tr;
    console.log(`  20000 rays with doors ${ms} ms`);
    check(ms < 1500, id + ' ray speed with doors');
    S.setDoorState(null);
  }
  // blokhut: hol, ramen en dak
  {
    const o = S.getObstacles('snow');
    const C = S.CABIN;
    for (const cab of o.props.filter((p) => p.kind === 'cabin')) {
      const c = Math.cos(cab.yaw), s = Math.sin(cab.yaw);
      const W = (lx, lz) => ({ x: cab.x + lx * c + lz * s, z: cab.z - lx * s + lz * c });
      // vloer binnen = vlak (pad), op de vloerhoogte van het model
      const m = W(-1.5, 0.5);
      check(Math.abs(S.heightAt('snow', m.x, m.z) - cab.baseY) < 1e-6, 'cabin floor flat');
      const door = W(C.door.x, C.hz + 1.4);
      check(Math.abs(S.heightAt('snow', door.x, door.z) - cab.baseY) < 0.15, 'cabin doorstep walkable');
      // raam in de voorgevel: kogels gaan erdoor (op 1.5 m), de muur ernaast niet
      const wo = W(C.frontWinX, C.hz + 2), wd = { x: -s, y: 0, z: -c };
      check(S.rayBlockDistance('snow', { x: wo.x, y: cab.baseY + 1.5, z: wo.z }, wd, 2.6) >= 2.6 - 1e-6, 'cabin window ray');
      check(S.rayBlockDistance('snow', { x: wo.x, y: cab.baseY + 0.6, z: wo.z }, wd, 2.6) < 2.05, 'cabin window sill blocks');
      // dak: van binnen recht omhoog geraakt, maar lopen binnen kan
      const up = S.rayBlockDistance('snow', { x: m.x, y: cab.baseY + 1.6, z: m.z }, { x: 0, y: 1, z: 0 }, 6);
      check(up < 2.5, 'cabin roof blocks from inside ' + up.toFixed(2));
      check(S.isClear('snow', m.x, m.z, S.PLAYER_RADIUS), 'cabin interior walkable');
      // camera achter een speler binnen: straal schuin naar achteren/boven raakt muur of dak
      const back = S.rayBlockDistance('snow', { x: m.x, y: cab.baseY + 1.7, z: m.z }, { x: s * 0.9, y: 0.44, z: c * 0.9 }, 5.5);
      check(back < 3.5, 'camera ray hits cabin wall/roof');
    }
  }
}
// ================================================================ deuren + verdiepingen in het bewegingssysteem
console.log('\n--- doors & floors with vertical movement ---');
{
  const DT = 1 / 60;
  const near = (a, b, e) => Math.abs(a - b) < (e || 0.02);
  const newSt = (x, z, y) => ({ x, z, y, vy: 0, ground: true, stance: 0, ladder: -1, ls: 0 });
  const run = (id, st, vx, vz, n) => { for (let i = 0; i < n; i++) S.stepPlayer(id, st, { vx, vz }, DT); return st; };
  const mkAc = (x, z, y, t) => ({ x, z, y, sy: y, airT: 0, t, stance: 0, stanceT: 0, ladder: -1 });
  // stappen naspelen met servercontrole (~20 berichten per seconde), grootste correctie
  function replay(lvl, st, steps) {
    const a = mkAc(st.x, st.z, st.y, 0);
    let worst = 0, tms = 0;
    for (let i = 0; i < steps.length; i++) {
      S.stepPlayer(lvl, st, steps[i], DT);
      tms += DT * 1000;
      if (i % 3 === 2) {
        const res = S.validateState(lvl, a, { x: +st.x.toFixed(2), z: +st.z.toFixed(2), y: +st.y.toFixed(2), s: st.stance }, Math.round(tms));
        worst = Math.max(worst, Math.abs(res.y - st.y), Math.hypot(res.x - st.x, res.z - st.z));
      }
    }
    return worst;
  }

  // 1) deuren in de 3D-botsing (collideY / stepPlayer) en de servercontrole (validateState)
  for (const id of ['snow', 'desert', 'village', 'harbour']) {
    const o = S.getObstacles(id);
    const ds = S.newDoorState(id);
    S.setDoorState(ds);
    let n = 0, blockStep = 0, passStep = 0, blockSrv = 0, passSrv = 0, brokenStep = 0, overhead = 0;
    for (const dr of o.doors) {
      if (n >= 25) break;
      n++;
      const depth = (st) => (st.x - dr.x) * dr.nx + (st.z - dr.z) * dr.nz;   // positief = binnen
      const walkIn = () => {
        const x = dr.x - dr.nx * 1.3, z = dr.z - dr.nz * 1.3;
        return run(id, newSt(x, z, S.supportHeight(id, x, z)), dr.nx * 4, dr.nz * 4, 75);
      };
      const srvIn = () => {
        // client beweert in kleine stapjes (4 m/s) door de deuropening naar binnen te lopen
        const x0 = dr.x - dr.nx * 1.3, z0 = dr.z - dr.nz * 1.3;
        const a = mkAc(x0, z0, S.supportHeight(id, x0, z0), 0);
        let r = null;
        for (let k = 1; k <= 25; k++) {
          const s = Math.min(2.6, k * 0.2);
          const x = x0 + dr.nx * s, z = z0 + dr.nz * s;
          r = S.validateState(id, a, { x, z, y: S.supportHeight(id, x, z), s: 0 }, k * 50);
        }
        return (r.x - dr.x) * dr.nx + (r.z - dr.z) * dr.nz;
      };
      ds.s[dr.id] = 0;
      if (depth(walkIn()) < -0.4) blockStep++;
      if (srvIn() < -0.3) blockSrv++;
      // boven de deur (dak / verdieping): het blad telt niet mee
      const p0 = S.collideY(id, dr.x + dr.ux * 0.2, dr.z + dr.uz * 0.2, 0.5, dr.y1 + 0.05, 1.8);
      S.setDoorState(null);
      const p1 = S.collideY(id, dr.x + dr.ux * 0.2, dr.z + dr.uz * 0.2, 0.5, dr.y1 + 0.05, 1.8);
      S.setDoorState(ds);
      if (Math.hypot(p0.x - p1.x, p0.z - p1.z) < 1e-9) overhead++;
      const user = { x: dr.x - dr.nx * 1.0, z: dr.z - dr.nz * 1.0 };
      ds.s[dr.id] = S.doorUse(id, dr.id, 0, user, [user]);
      if (ds.s[dr.id] > 0 && depth(walkIn()) > 0.8) passStep++;
      if (ds.s[dr.id] > 0 && srvIn() > 0.8) passSrv++;
      ds.s[dr.id] = 3;
      if (depth(walkIn()) > 0.8) brokenStep++;
      ds.s[dr.id] = 0;
    }
    console.log(`[${id}] closed: blocks stepPlayer ${blockStep}/${n}, blocks validateState ${blockSrv}/${n}; open: stepPlayer ${passStep}/${n}, validateState ${passSrv}/${n}; broken ${brokenStep}/${n}; leaf ignored above doorway ${overhead}/${n}`);
    check(blockStep === n && blockSrv === n, id + ' closed door blocks collideY/stepPlayer + validateState');
    check(passStep === n && passSrv === n, id + ' open door: walk through (stepPlayer + validateState)');
    check(brokenStep === n, id + ' broken door: walk through (stepPlayer)');
    check(overhead === n, id + ' door leaf does not block above the doorway');
    // doorUse met hoogte: iemand op het dak boven de deur staat niet in de opening en kan hem niet bedienen
    const dr = o.doors.find((d) => d.kind !== 'roll');
    // een echte client die tegen een dichte deur aan loopt / door een open deur loopt: geen correcties van de server
    {
      const steps = [];
      for (let i = 0; i < 75; i++) steps.push({ vx: dr.nx * 4, vz: dr.nz * 4 });
      const x = dr.x - dr.nx * 1.3, z = dr.z - dr.nz * 1.3;
      const wc = replay(id, newSt(x, z, S.supportHeight(id, x, z)), steps);
      const u = { x: dr.x - dr.nx * 1.0, z: dr.z - dr.nz * 1.0 };
      ds.s[dr.id] = S.doorUse(id, dr.id, 0, u, [u]);
      const wo = replay(id, newSt(x, z, S.supportHeight(id, x, z)), steps);
      ds.s[dr.id] = 0;
      check(wc < 0.05 && wo < 0.05, id + ' validateState agrees with stepPlayer at closed/open doors ' + wc.toFixed(3) + '/' + wo.toFixed(3));
    }
    const out = { x: dr.x - dr.nx * 1.0, z: dr.z - dr.nz * 1.0, y: dr.y0 };
    const a = S.doorUse(id, dr.id, 0, out, [out]);
    check(a > 0, id + ' doorUse with y opens');
    check(S.doorUse(id, dr.id, a, out, [out, { x: dr.x, z: dr.z, y: dr.y0 }]) === -1, id + ' cannot close on a player in the doorway (with y)');
    check(S.doorUse(id, dr.id, a, out, [out, { x: dr.x, z: dr.z, y: dr.y1 + 0.4 }]) === 0, id + ' player above the doorway does not block closing');
    const roof = { x: out.x, z: out.z, y: dr.y1 + 1.0 };
    check(S.doorUse(id, dr.id, 0, roof, [roof]) === -1, id + ' cannot use a door from the roof above it');
    check(S.nearestDoor(id, dr.x - dr.nx * 0.8, dr.z - dr.nz * 0.8, Math.atan2(dr.nx, dr.nz), 0, dr.y0) === dr.id &&
      S.nearestDoor(id, dr.x - dr.nx * 0.8, dr.z - dr.nz * 0.8, Math.atan2(dr.nx, dr.nz), 0, dr.y1 + 1) === -1, id + ' nearestDoor with y');
    S.setDoorState(null);
  }

  // 2) verdiepingsladders (kind 'ladder'): hoog woestijngebouw (3.8 m) en kerktoren (9.6 m)
  for (const [id, label, up] of [['desert', 'desert building ladder', 3.8], ['village', 'church tower ladder', 9.6]]) {
    const o = S.getObstacles(id);
    const ld = o.ladders.find((l) => l.kind === 'ladder' && near(l.topY - l.bottomY, up, 1e-6));
    check(!!ld, label + ' found');
    if (!ld) continue;
    const li = o.ladders.indexOf(ld), I = S.ladderInfo(id, ld);
    check(I.wall && I.dir === 1, label + ' is a wall ladder (exit away from the wall)');
    const sx = ld.x + I.ox * 1.3, sz = ld.z + I.oz * 1.3;
    const st = newSt(sx, sz, S.supportHeight(id, sx, sz));
    let t = 0, grabbed = false;
    while (t < 8 && !(grabbed && st.ladder < 0)) {
      S.stepPlayer(id, st, { vx: -I.ox * 5, vz: -I.oz * 5 }, DT);
      if (st.ladder === li) grabbed = true;
      t += DT;
    }
    const slab = o.boxes.find((b) => b.walkable && b.piece && b.piece.slab && near(b.h, ld.topY, 1e-6) &&
      Math.hypot(Math.max(Math.abs((st.x - b.x) * b.c - (st.z - b.z) * b.s) - b.hw, 0), Math.max(Math.abs((st.x - b.x) * b.s + (st.z - b.z) * b.c) - b.hd, 0)) < 0.2);
    console.log(`${label}: grabbed ${grabbed}, ${t.toFixed(2)} s, y ${(st.y - ld.bottomY).toFixed(2)} above the floor below, on slab ${!!slab}`);
    check(grabbed && st.ladder < 0 && st.ground && near(st.y, ld.topY, 0.01), label + ': climb to the upper floor');
    check(t > (I.L1 / S.MOVE.CLIMB_SPEED) * 0.9 && t < I.total / S.MOVE.CLIMB_SPEED + 0.8, label + ': climb speed ~2.5 m/s');
    check(!!slab && near(S.supportHeight(id, st.x, st.z, st.y), ld.topY, 1e-6), label + ': standing on the floor slab');
    // stick blijft naar de muur: niet terug het gat in vallen en niet meteen weer naar beneden klimmen
    run(id, st, -I.ox * 5, -I.oz * 5, 90);
    check(st.ladder < 0 && st.ground && near(st.y, ld.topY, 0.01), label + ': pushing on at the top keeps you on the floor');
    // even loslaten, dan naar het gat lopen = ladder pakken en naar beneden
    run(id, st, 0, 0, 5);
    let t2 = 0, grab2 = false;
    while (t2 < 8 && !(grab2 && st.ladder < 0)) {
      S.stepPlayer(id, st, { vx: -I.ox * 5, vz: -I.oz * 5 }, DT);
      if (st.ladder === li) grab2 = true;
      t2 += DT;
    }
    console.log(`${label} down: grabbed ${grab2}, ${t2.toFixed(2)} s, y ${(st.y - I.y0).toFixed(2)} above the bottom`);
    check(grab2 && st.ladder < 0 && st.ground && near(st.y, I.y0, 0.05), label + ': climb down from the upper floor');
    run(id, st, -I.ox * 5, -I.oz * 5, 60);
    check(st.ladder < 0 && near(st.y, I.y0, 0.05), label + ': no re-grab at the bottom while pushing on');
    run(id, st, 0, 0, 3);
    run(id, st, -I.ox * 5, -I.oz * 5, 30);
    check(st.ladder === li, label + ': can grab again after letting go');
    // servercontrole keurt het klimmen goed (op en af)
    const steps = [];
    for (let i = 0; i < 420; i++) steps.push({ vx: -I.ox * 5, vz: -I.oz * 5 });
    for (let i = 0; i < 6; i++) steps.push({ vx: 0, vz: 0 });
    for (let i = 0; i < 400; i++) steps.push({ vx: -I.ox * 5, vz: -I.oz * 5 });
    const c = newSt(sx, sz, S.supportHeight(id, sx, sz));
    const worst = replay(id, c, steps);
    console.log(`  replay ${label} up+down: worst correction ${worst.toFixed(3)}`);
    check(worst < 0.05 && c.ground && near(c.y, I.y0, 0.05), label + ': validateState accepts climbing up and down');
    check(S.ladderAt(id, I.sx, I.sz, I.y0 + up / 2) === li, label + ': ladderAt');
    // op de vloer naast het gat staan is geen klimmen: hurken mag (server)
    const top = S.ladderPos(id, ld, I.total);
    const a2 = mkAc(top.x, top.z, top.y, 0);
    const r2 = S.validateState(id, a2, { x: top.x, z: top.z, y: top.y, s: 1 }, 500);
    check(!r2.ladder && r2.stance === 1 && near(r2.y, ld.topY, 1e-6), label + ': crouch on the floor next to the ladder hole');
  }
  // torenplatform: hurken bij de ladderopening mag ook (staan op het platform = niet klimmen)
  {
    const fo = S.getObstacles('forest');
    const ld = fo.ladders.find((l) => l.kind === 'tower');
    const top = S.ladderPos('forest', ld, S.ladderInfo('forest', ld).total);
    const r = S.validateState('forest', mkAc(top.x, top.z, top.y, 0), { x: top.x, z: top.z, y: top.y, s: 1 }, 500);
    check(!r.ladder && r.stance === 1, 'crouch on the tower platform at the ladder opening');
  }

  // 3) onder een verdiepingsvloer (slab) doorlopen op de begane grond: hoog woestijngebouw A
  {
    const id = 'desert', o = S.getObstacles(id);
    const fl = o.boxes.find((b) => b.piece && b.piece.slab && b.walkable && Math.abs(b.x - (-3.2)) < 0.01 && Math.abs(b.z - (-0.75)) < 0.01);
    check(!!fl, 'desert upper floor slab found');
    if (fl) {
      const x0 = -3.7, z0 = -1.9;
      const st = newSt(x0, z0, S.supportHeight(id, x0, z0));
      const g0 = st.y;
      let maxY = -Infinity, pushed = 0;
      for (let i = 0; i < 40; i++) {
        const px = st.x, pz = st.z;
        S.stepPlayer(id, st, { vx: 0, vz: 3 }, DT);
        pushed = Math.max(pushed, Math.abs(st.x - px));
        maxY = Math.max(maxY, st.y);
      }
      const under = Math.abs(st.x - fl.x) < fl.hw && Math.abs(st.z - fl.z) < fl.hd;
      console.log(`under slab: moved ${(st.z - z0).toFixed(2)} m, under ${under}, y-ground ${(st.y - g0).toFixed(2)}, slab bottom ${(fl.cb - g0).toFixed(2)} above`);
      check(under && near(st.z - z0, 2.0, 0.05) && pushed < 1e-6 && near(maxY, g0, 0.05), 'walk under an upper floor slab on the ground floor');
      check(S.supportHeight(id, st.x, st.z, st.y) < fl.h - 3, 'slab is not support from below');
      const c = S.collideY(id, st.x, st.z, 0.5, st.y, 1.8);
      check(Math.hypot(c.x - st.x, c.z - st.z) < 1e-9, 'slab does not block collideY below it');
      // springen onder de vloer: hoofd stoot (niet erdoor)
      let top = -Infinity;
      S.stepPlayer(id, st, { vx: 0, vz: 0, jump: true }, DT);
      for (let i = 0; i < 90; i++) { S.stepPlayer(id, st, { vx: 0, vz: 0 }, DT); top = Math.max(top, st.y); }
      check(top + S.MOVE.HEIGHT[0] <= fl.cb + 1e-6 && st.ground && near(st.y, g0, 0.05), 'jumping under the slab stays below it');
      check(S.canStance(id, st.x, st.z, st.y, 0), 'standing fits under the slab');
      // servercontrole onder de vloer
      const steps = [];
      for (let i = 0; i < 40; i++) steps.push({ vx: 0, vz: -3 });
      const c2 = newSt(st.x, st.z, st.y);
      check(replay(id, c2, steps) < 0.05, 'validateState accepts walking under the slab');
    }
  }
}

// ---- kruisje: richtpunt = wat het midden van het beeld echt raakt (geen afwijking meer dichtbij)
{
  const lv = 'forest';
  const gy = S.heightAt(lv, 0, 0);
  const origin = { x: 0, y: gy + 1.7, z: 0 };
  // schoudercamera: 3 m achter en 0.8 m naast de speler, kijkt recht vooruit (+Z)
  const cam = { x: 0.8, y: gy + 1.5, z: -3 };   // camera kijkt op borsthoogte van de vijand
  const dir = { x: 0, y: 0, z: 1 };
  // vijand op 6 m recht voor de camera-as (x = 0.8)
  const enemy = { x: 0.8, y: gy, z: 6, stance: 0, yaw: Math.PI };
  const ap = S.aimPoint(lv, cam, dir, origin, [enemy], 250);
  const sd = { x: ap.x - origin.x, y: ap.y - origin.y, z: ap.z - origin.z };
  const l = Math.hypot(sd.x, sd.y, sd.z); sd.x /= l; sd.y /= l; sd.z /= l;
  const t = S.rayHitPlayer(origin, sd, enemy.x, enemy.y, enemy.z, 50, 0, enemy.yaw);
  check(t !== null, 'kruisje: schot vanaf de speler raakt vijand die onder het kruisje staat (6 m)');
  check(ap.dist < 15, 'kruisje: richtpunt ligt op de vijand, niet op 250 m (' + ap.dist.toFixed(1) + ')');
  // zelfde vijand heel dichtbij (1.5 m)
  const near = { x: 0.8, y: gy, z: 1.5, stance: 0, yaw: Math.PI };
  const ap2 = S.aimPoint(lv, cam, dir, origin, [near], 250);
  const sd2 = { x: ap2.x - origin.x, y: ap2.y - origin.y, z: ap2.z - origin.z };
  const l2 = Math.hypot(sd2.x, sd2.y, sd2.z); sd2.x /= l2; sd2.y /= l2; sd2.z /= l2;
  check(S.rayHitPlayer(origin, sd2, near.x, near.y, near.z, 50, 0, near.yaw) !== null, 'kruisje: ook op 1.5 m raakt het schot');
  // oude methode (250 m punt) mist dichtbij: bewijst dat dit de oorzaak was
  const old = { x: cam.x, y: cam.y, z: cam.z + 250 };
  const od = { x: old.x - origin.x, y: old.y - origin.y, z: old.z - origin.z };
  const ol = Math.hypot(od.x, od.y, od.z); od.x /= ol; od.y /= ol; od.z /= ol;
  check(S.rayHitPlayer(origin, od, near.x, near.y, near.z, 50, 0, near.yaw) === null, 'kruisje: de oude 250 m-methode miste dichtbij (regressie-controle)');
  // geen doel: richtpunt ver weg en schot loopt (bijna) parallel aan de kijkrichting
  const ap3 = S.aimPoint(lv, cam, dir, origin, [], 250);
  check(ap3.dist > 100, 'kruisje: zonder doel ver richtpunt');
}


// ---- spelmodus Moon: lage zwaartekracht = hogere en langere sprong, server accepteert die
{
  const lv = 'forest', DT = 1 / 60, M = S.modeOf('moon');
  const h = (opts) => { const st = { x: 0, z: 0, y: S.heightAt(lv, 0, 0), vy: 0, ground: true, stance: 0, ladder: -1, ls: 0 }; const g0 = st.y; let mx = 0;
    for (let i = 0; i < 240; i++) { S.stepPlayer(lv, st, Object.assign({ vx: 0, vz: 0, jump: i === 0 }, opts || {}), DT); mx = Math.max(mx, st.y - g0); } return mx; };
  const normal = h(), moon = h({ jumpV: M.jumpV, gravity: M.gravity });
  check(normal > 1.3 && normal < 1.7, 'normal jump ~1.5 m (' + normal.toFixed(2) + ')');
  check(moon > 3 && moon < 4.5, 'moon jump is much higher (' + moon.toFixed(2) + ' m)');
  const hyper = S.modeOf('hyper');
  check(hyper.speed === 1.7 && S.modeOf('rapid').fireMul === 0.5 && S.modeOf('glass').hp === 40 && S.modeOf('oneshot').oneshot && S.modeOf('knives').knives && S.modeOf('shotguns').weapon === 'shotgun', 'mode table values');
  check(S.modeOf('nonsense') === S.MODES.classic, 'unknown mode = classic');
  check(S.MODE_IDS.length >= 10, 'at least 10 game modes (' + S.MODE_IDS.length + ')');
  // server-controle: een maansprong wordt geaccepteerd, dezelfde sprong zonder moon-parameters niet
  const accept = (opts) => {
    const st = { x: 0, z: 0, y: S.heightAt(lv, 0, 0), vy: 0, ground: true, stance: 0, ladder: -1, ls: 0 };
    const ac = { x: st.x, z: st.z, y: st.y, sy: st.y, airT: 0, t: 0, stance: 0, stanceT: 0, ladder: -1 };
    let worst = 0, t = 0;
    for (let i = 0; i < 150; i++) {
      S.stepPlayer(lv, st, Object.assign({ vx: 0, vz: 0, jump: i === 0 }, { jumpV: M.jumpV, gravity: M.gravity }), DT); t += DT * 1000;
      if (i % 3 === 2) { const a = S.validateState(lv, ac, { x: st.x, z: st.z, y: +st.y.toFixed(2), s: 0 }, t, opts); worst = Math.max(worst, Math.abs(a.y - st.y)); }
    }
    return worst;
  };
  check(accept({ jumpV: M.jumpV, gravity: M.gravity }) < 0.1, 'server accepts the moon jump (validateState with gravity)');
  check(accept({}) > 0.5, 'without moon parameters the server would reject it (anti-cheat intact)');
}
console.log(fails ? `${fails} FAILURES` : 'ALL OK');

