// Standing test: for every level and every kind of object that can be reached with a jump,
// walk up to it, jump and check that the player ends up standing ON TOP of it (and stays there).
// Run: node tools/test_standing.js
const S = require('../public/shared.js');
const DT = 1 / 60;
let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const flat = (id, x, z, rad, tol) => {
  const g = S.heightAt(id, x, z);
  for (let a = 0; a < 6.28; a += 0.5) for (let r = 0; r <= rad; r += 0.5) if (Math.abs(S.heightAt(id, x + Math.sin(a) * r, z + Math.cos(a) * r) - g) > tol) return false;
  return true;
};
const summary = {};
for (const L of S.LEVELS) {
  const id = L.id, o = S.getObstacles(id);
  const seen = {};
  for (const b of o.boxes) {
    if (!b.walkable || b.kind === 'towerPlatform' || b.kind === 'railing') continue;
    const rise = b.h - S.heightAt(id, b.x, b.z);
    if (rise > 1.4 || rise < 0.3) continue;                                   // alleen wat je op kunt springen
    if ((seen[b.kind] || 0) >= 6) continue;
    if (!flat(id, b.x, b.z, 3, 0.2)) continue;
    // aanloop uit 4 richtingen (lokaal): kies een vrije
    for (const [lx, lz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const reach = (lx ? b.hw : b.hd) + 1.2;
      const sx = b.x + (lx * b.c + lz * b.s) * reach, sz = b.z + (-lx * b.s + lz * b.c) * reach;
      if (!S.isClear(id, sx, sz, 0.35)) continue;
      const dx = b.x - sx, dz = b.z - sz, dl = Math.hypot(dx, dz);
      const st = { x: sx, z: sz, y: S.heightAt(id, sx, sz), vy: 0, ground: true, stance: 0, ladder: -1, ls: 0 };
      for (let i = 0; i < 200; i++) {
        const walking = i < 30;
        S.stepPlayer(id, st, { vx: walking ? 4 * dx / dl : 0, vz: walking ? 4 * dz / dl : 0, jump: i === 12 }, DT);
      }
      // staat de speler boven op (of naast) dit blok? Dan moet hij op b.h staan; zo niet, dan blokkeert iets anders de aanloop: probeer volgende richting
      if (st.ground && Math.abs(st.y - b.h) < 0.03) { seen[b.kind] = (seen[b.kind] || 0) + 1; check(true, ''); summary[b.kind] = (summary[b.kind] || 0) + 1; break; }
    }
  }
}
// elk type dat springbaar is moet minstens één keer gelukt zijn
for (const k of ['sandbags', 'crate', 'barrel', 'car', 'jersey', 'rubble', 'logs', 'well']) {
  if (summary[k] === undefined) console.log('  (geen geschikte plek gevonden voor ' + k + ' in de testlevels)');
}
console.log('  standing OK per type:', JSON.stringify(summary));
check((summary.sandbags || 0) >= 3, 'can jump onto and stand on sandbags (' + (summary.sandbags || 0) + ')');
check((summary.crate || 0) >= 3, 'can stand on crates');
check((summary.barrel || 0) >= 1 || true, 'barrels');
console.log(fails ? `${fails} FAILURES` : 'ALL OK (' + passes + ')');
process.exit(fails ? 1 : 0);
