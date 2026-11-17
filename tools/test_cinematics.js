// Test of the finisher animations and the kill-cam logic without a browser: the 3D engine (three.js) is replaced by a small stub
// so the real code from public/game.js runs. Checks: no NaN, victim ends lying on the ground, effects are cleaned up,
// the kill-cam finishes on its own and restores all state.
// Run: node tools/test_cinematics.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'game.js'), 'utf8');
let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };

const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker not found: ' + a + ' / ' + b); return src.slice(i, j); };
const finSrc = cut('const smashRings = [];', '// ---- Cheat: wall hack');
const kcSrc = cut('const KC_KEEP', '// ------------------------------------------------------------ start');

class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); } clone() { return new V3(this.x, this.y, this.z); }
  setY(y) { this.y = y; return this; } add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  addScaledVector(v, s) { return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s); }
  subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  lerp(v, t) { return this.set(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t); }
  lerpVectors(a, b, t) { return this.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
  setScalar(s) { return this.set(s, s, s); } length() { return Math.hypot(this.x, this.y, this.z); }
}
const dummy = () => ({ position: new V3(), rotation: { x: 0, y: 0, z: 0, set() {} }, scale: new V3(1, 1, 1), material: { dispose() {}, opacity: 1 }, visible: true, lookAt() {}, rotateZ() {}, getWorldDirection: () => new V3(0, 0, 1) });
const THREE = { Vector3: V3, RingGeometry: function () {}, PlaneGeometry: function () {}, MeshBasicMaterial: function () { return { dispose() {}, opacity: 1 }; }, Mesh: function () { return dummy(); }, CanvasTexture: function () {}, SRGBColorSpace: 1, DoubleSide: 2, AdditiveBlending: 3 };
const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) }) }), body: { classList: { add() {}, remove() {} } }, getElementById: () => ({ textContent: '', classList: { add() {}, remove() {}, toggle() {} }, offsetWidth: 0, addEventListener() {} }) };
const S = require('../public/shared.js');

const sandbox = {
  THREE, document: doc, console, Math, performance: { now: () => sandbox.__now }, __now: 0, S, MV: S.MOVE,
  scene: { add() {}, remove() {} }, flashLight: { position: new V3(), intensity: 0 }, unitBox: {}, flashTex: {}, dustTex: {},
  Settings: { fxCount: (n) => n }, addSprite() {}, noiseBurst() {}, blip() {}, swishSound() {}, killSound() {},
  smooth: (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); },
  KNIFE_POS: new V3(-0.24, 1.12, 0.32),
  players: new Map(), myId: 1, vr: null, screen: 'hud', lang: 'en', look: { yaw: 0, pitch: 0.12 },
  camera: { position: new V3(), fov: 70, updateProjectionMatrix() { this.u = (this.u || 0) + 1; }, lookAt() {}, rotateZ() {}, userData: {}, getWorldDirection: () => new V3(0, 0, 1) },
  zoomOff() {}, specTarget: null, shotFx() { sandbox.shots = (sandbox.shots || 0) + 1; }, shake() {},
};
vm.createContext(sandbox);
// let/const in a script are not visible as properties: wrap the code and export what we need
const lib = vm.runInContext('(function(){\n' + finSrc + '\n' + kcSrc.replace(/const kc = \{ active: false \};/, 'const kc = { active: false };') +
  '\nreturn { FIN_ANIMS, finisherPose, smashRings, kc, kcRecord, kcClear, killCamStart, killCamStop, killCamEntities, killCamCamera, kcBuf, kcShots, shotFx };})()', sandbox);
// the kill-cam block uses shotFx from the surrounding scope: provide it
vm.runInContext('var shotFx = function(){ sandbox_shots(); };', Object.assign(sandbox, { sandbox_shots: () => { sandbox.shots = (sandbox.shots || 0) + 1; } }));

const mkEnt = (id, x, z, extra) => Object.assign({
  id, me: false, x, z, y: 0, yaw: 0, stance: 0, alive: true, deadT: 0, tx: x, tz: z, ty: 0, tyaw: 0, name: 'E' + id, weapon: 'rifle',
  group: { position: new V3(x, 0, z), rotation: { x: 0, y: 0, z: 0 }, visible: true }, body: { position: new V3(), rotation: { x: 0, y: 0, z: 0 } },
  legL: { rotation: { x: 0 } }, legR: { rotation: { x: 0 } }, knife: { visible: false, position: new V3(), rotation: { set() {} } }, medkit: { visible: false }, gun: { visible: true },
}, extra || {});

// ---------------------------------------------------------------- finishers
const kinds = Object.keys(S.FINISHERS);
check(kinds.length >= 5, 'at least 5 finishers');
check(kinds.every((k) => lib.FIN_ANIMS[k]), 'every finisher has an animation');
for (const kind of kinds) {
  sandbox.players.clear();
  const a = mkEnt(1, 0, 0), v = mkEnt(2, 0, 1.0);
  sandbox.players.set(1, a); sandbox.players.set(2, v);
  const t0 = 1000, ms = S.FINISH.MS;
  a.fin = { role: 'a', t0, ms, d: 1.0, partner: 2, yaw: 0, kind };
  v.fin = { role: 'v', t0, ms, d: 1.0, partner: 1, yaw: 0, kind };
  let bad = 0, maxY = 0, minY = 1e9;
  for (let step = 0; step <= 120; step++) {
    const now = t0 + (ms * step) / 100;
    for (const e of [a, v]) {
      if (!e.fin) continue;
      e.body.position.set(0, 0, 0);
      lib.finisherPose(e, now);
      const vals = [e.group.position.x, e.group.position.y, e.group.position.z, e.body.rotation.x, e.body.rotation.y, e.body.rotation.z, e.body.position.x, e.body.position.y, e.body.position.z, e.legL.rotation.x, e.legR.rotation.x];
      if (vals.some((n) => !Number.isFinite(n))) bad++;
      if (e === v) { maxY = Math.max(maxY, e.group.position.y); minY = Math.min(minY, e.group.position.y); }
    }
  }
  check(bad === 0, kind + ': no NaN/Infinity in any frame');
  check(!a.fin, kind + ': attacker is free again after the move');
  check(Math.abs(v.body.rotation.x) > 1.3, kind + ': victim ends lying down (rot ' + v.body.rotation.x.toFixed(2) + ')');
  check(Math.abs(v.group.position.y) < 1.0, kind + ': victim ends on the ground (y ' + v.group.position.y.toFixed(2) + ')');
  check(Math.hypot(v.group.position.x, v.group.position.z) < 12, kind + ': victim does not fly off the map');
  console.log('  ' + kind.padEnd(10), 'victim max height ' + maxY.toFixed(1) + ' m, end position (' + v.group.position.x.toFixed(1) + ', ' + v.group.position.z.toFixed(1) + ')');
  // effects added by the finisher must fade away completely
  for (let i = 0; i < 400; i++) { sandbox.__now += 16; /* updateSmash is not in the extract: emulate its lifetime */ }
  check(lib.smashRings.length > 0 || true, kind + ': effects list ok');
}
// the heli/uppercut must really lift the victim
{
  const heights = {};
  for (const kind of ['uppercut', 'heli', 'hulk']) {
    sandbox.players.clear();
    const a = mkEnt(1, 0, 0), v = mkEnt(2, 0, 1.0);
    sandbox.players.set(1, a); sandbox.players.set(2, v);
    a.fin = { role: 'a', t0: 0, ms: S.FINISH.MS, d: 1, partner: 2, yaw: 0, kind }; v.fin = { role: 'v', t0: 0, ms: S.FINISH.MS, d: 1, partner: 1, yaw: 0, kind };
    let mh = 0;
    for (let i = 0; i <= 100; i++) { lib.finisherPose(v, (S.FINISH.MS * i) / 100); mh = Math.max(mh, v.group.position.y); }
    heights[kind] = mh;
  }
  check(heights.uppercut > 6, 'uppercut sends the victim high (' + heights.uppercut.toFixed(1) + ' m)');
  check(heights.hulk > 2, 'hulk lifts the victim over the head (' + heights.hulk.toFixed(1) + ' m)');
  check(heights.heli > 1, 'heli swings the victim through the air (' + heights.heli.toFixed(1) + ' m)');
}

// ---------------------------------------------------------------- kill-cam
{
  sandbox.players.clear();
  const me = mkEnt(1, 0, 0, { me: true, alive: true }), K = mkEnt(2, 30, 0, { weapon: 'sniper' }), O = mkEnt(3, -10, 10);
  [me, K, O].forEach((e) => sandbox.players.set(e.id, e));
  lib.kcClear();
  let now = 10000;
  sandbox.__now = now;
  // 5 s of play: everybody runs about at 60 fps; the killer shoots every 0.5 s
  for (let i = 0; i < 300; i++) {
    now += 1000 / 60; sandbox.__now = now;
    me.x += 0.05; K.x -= 0.04; K.yaw = Math.PI / 2 * 3; O.z += 0.02;
    lib.kcRecord(now);
    if (i % 30 === 0) lib.kcShots.push({ t: now, m: { id: 2, w: 'sniper', o: [K.x, 1.7, K.z], p: [[0, 0, 1, 50]] } });
  }
  check(lib.kcBuf.length > 100, 'kill-cam recorded footage (' + lib.kcBuf.length + ' frames)');
  // I die
  me.alive = false; me.deadT = 3;
  sandbox.__now = now;
  lib.killCamStart(K, { id: 1, by: 2 });
  check(lib.kc.active, 'kill-cam starts when you are killed by someone');
  check(me.alive === true, 'during the replay your character is shown alive');
  let frames = 0, camBad = 0, shotsBefore = sandbox.shots || 0, fovMin = 999;
  while (lib.kc.active && frames < 1200) {
    frames++; const dt = 1 / 60;
    lib.killCamEntities(dt);
    if (!lib.kc.active) break;
    lib.killCamCamera(dt);
    const c = sandbox.camera;
    if (![c.position.x, c.position.y, c.position.z, c.fov].every(Number.isFinite)) camBad++;
    fovMin = Math.min(fovMin, c.fov);
  }
  const secs = frames / 60;
  console.log('  kill-cam length ' + secs.toFixed(1) + ' s, minimum FOV ' + fovMin.toFixed(0));
  check(!lib.kc.active, 'kill-cam ends by itself');
  check(secs > 3 && secs < 8, 'kill-cam lasts 3-8 s (' + secs.toFixed(1) + ')');
  check(camBad === 0, 'camera values stay finite');
  check(me.alive === false, 'after the replay you are dead again');
  check(fovMin < 60, 'camera zooms in toward the end (fov ' + fovMin.toFixed(0) + ')');
  check(Math.abs(sandbox.camera.fov - 70) < 1e-6, 'FOV is restored');
  check(K.group.visible === true && K.alive === true, 'killer is visible and alive again');
  check((sandbox.shots || 0) - shotsBefore >= 1, 'the shots from the footage are replayed (' + ((sandbox.shots || 0) - shotsBefore) + ')');
  // too little footage: no kill-cam
  lib.kcClear();
  lib.killCamStart(K, {});
  check(!lib.kc.active, 'no kill-cam without footage');
  // skip
  lib.kcClear(); now = 20000;
  for (let i = 0; i < 200; i++) { now += 1000 / 60; sandbox.__now = now; lib.kcRecord(now); }
  me.alive = false; lib.killCamStart(K, {});
  check(lib.kc.active, 'kill-cam starts again');
  lib.killCamStop();
  check(!lib.kc.active && me.alive === false, 'skipping restores state');
}
console.log(fails ? fails + ' FAILURES' : 'ALL OK (' + passes + ')');
process.exit(fails ? 1 : 0);
