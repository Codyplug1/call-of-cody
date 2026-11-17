// Tests voor de pure VR-functies (public/vr-core.js). Draaien: node tools/test_vr.mjs
import * as VC from '../public/vr-core.js';
import * as MC from '../public/vr-menu-core.js';

let fails = 0, passes = 0;
function check(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL', msg); } }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---- deadzone / stick
check(VC.deadzone(0.1) === 0, 'deadzone binnen zone = 0');
check(near(VC.deadzone(1), 1) && near(VC.deadzone(-1), -1), 'deadzone volle uitslag');
check(VC.deadzone(0.5) > 0 && VC.deadzone(0.5) < 0.5, 'deadzone herschaalt');
check(VC.deadzone(NaN) === 0, 'deadzone NaN');
check(VC.stickOf(null).x === 0, 'stickOf null');
check(VC.stickOf({ axes: [0, 0, 0.3, -0.8] }).y === -0.8, 'stickOf xr-standard assen 2/3');
check(VC.stickOf({ axes: [0.4, 0.2] }).x === 0.4, 'stickOf fallback assen 0/1');

// ---- mapControllers
const pad = (axes, pressedIdx = []) => ({
  axes, buttons: Array.from({ length: 6 }, (_, i) => ({ pressed: pressedIdx.includes(i), value: pressedIdx.includes(i) ? 1 : 0 })),
});
let st = VC.initialPadState();
let m = VC.mapControllers(pad([0, 0, 0, -1]), pad([0, 0, 0, 0]), st, { snap: true }, 0.016);
check(near(m.moveY, 1) && near(m.moveX, 0), 'linkerstick naar voren = vooruit (jy=1)');
check(m.moving === true && m.fire === false && m.turn === 0, 'geen vuur/draai');
m = VC.mapControllers(pad([0, 0, 1, 0]), null, st, { snap: true }, 0.016);
check(near(m.moveX, 1), 'linkerstick rechts = jx 1');
m = VC.mapControllers(pad([0, 0, 1, -1]), null, st, { snap: true }, 0.016);
check(near(Math.hypot(m.moveX, m.moveY), 1), 'diagonaal genormaliseerd');
m = VC.mapControllers(null, null, st, { snap: true }, 0.016);
check(m.moveX === 0 && m.moveY === 0 && !m.fire && m.turn === 0, 'geen controllers = niets');

// snap turn: één stap per duw, opnieuw pas na loslaten
st = VC.initialPadState();
m = VC.mapControllers(null, pad([0, 0, 0.9, 0]), st, { snap: true }, 0.016);
check(near(m.turn, -VC.SNAP_ANGLE), 'snap rechts = -30 graden (rechtsom)');
st = m.state;
m = VC.mapControllers(null, pad([0, 0, 0.95, 0]), st, { snap: true }, 0.016);
check(m.turn === 0, 'vasthouden geeft geen tweede stap');
st = m.state;
m = VC.mapControllers(null, pad([0, 0, 0.1, 0]), st, { snap: true }, 0.016);
st = m.state;
m = VC.mapControllers(null, pad([0, 0, -0.9, 0]), st, { snap: true }, 0.016);
check(near(m.turn, VC.SNAP_ANGLE), 'na loslaten: snap links = +30 graden');
// smooth turn
m = VC.mapControllers(null, pad([0, 0, 1, 0]), VC.initialPadState(), { snap: false }, 0.5);
check(near(m.turn, -VC.SMOOTH_TURN_SPEED * 0.5), 'smooth turn schaalt met dt');

// trigger + knoppen (randen)
st = VC.initialPadState();
m = VC.mapControllers(null, pad([0, 0, 0, 0], [0]), st, { snap: true }, 0.016);
check(m.fire === true, 'rechter trigger = vuur');
m = VC.mapControllers(pad([0, 0, 0, 0], [0]), null, st, { snap: true }, 0.016);
check(m.fire === false, 'linker trigger vuurt niet');
m = VC.mapControllers(null, pad([0, 0, 0, 0], [4]), st, { snap: true }, 0.016);
check(m.takeover === true && m.start === true, 'A = overnemen/start (rand)');
m = VC.mapControllers(null, pad([0, 0, 0, 0], [4]), m.state, { snap: true }, 0.016);
check(m.takeover === false, 'A vasthouden = geen herhaling');
m = VC.mapControllers(null, pad([0, 0, 0, 0], [5]), VC.initialPadState(), { snap: true }, 0.016);
check(m.toggleTurn === true, 'B = draaimodus wisselen');
m = VC.mapControllers(pad([0, 0, 0, 0], [5]), null, VC.initialPadState(), { snap: true }, 0.016);
check(m.toggleVignette === true, 'Y = vignet wisselen');
// bewegingsfase: X = springen (rand), linkerstick indrukken = liggen aan/uit (rand), bukken = gehurkt
m = VC.mapControllers(pad([0, 0, 0, 0], [4]), null, VC.initialPadState(), { snap: true }, 0.016);
check(m.jump === true && m.takeover === false, 'X = springen');
m = VC.mapControllers(pad([0, 0, 0, 0], [4]), null, m.state, { snap: true }, 0.016);
check(m.jump === false, 'X vasthouden = één sprong');
m = VC.mapControllers(pad([0, 0, 0, 0], [3]), null, VC.initialPadState(), { snap: true }, 0.016);
check(m.toggleProne === true && m.jump === false, 'linkerstick indrukken = liggen');
m = VC.mapControllers(pad([0, 0, 0, 0], [3]), null, m.state, { snap: true }, 0.016);
check(m.toggleProne === false, 'linkerstick vasthouden = één wissel');
check(VC.mapControllers(null, pad([0, 0, 0, 0], [3, 4]), VC.initialPadState(), {}, 0.016).jump === false, 'rechter knoppen springen niet');
check(VC.vrCrouching(1.0, false) && !VC.vrCrouching(1.5, false) && VC.vrCrouching(1.25, true) && !VC.vrCrouching(1.25, false), 'VR bukken (met marge)');
const half = { axes: [0, 0, 0, 0], buttons: [{ pressed: false, value: 0.7 }] };
check(VC.mapControllers(null, half, VC.initialPadState(), {}, 0.016).fire === true, 'trigger analoog > 0.6 vuurt');

// ---- yaw uit quaternion (game.js-conventie: yaw 0 = +Z)
const qYaw = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });   // rotatie a om Y
check(near(Math.abs(VC.yawFromQuaternion({ x: 0, y: 0, z: 0, w: 1 })), Math.PI), 'identiteit kijkt naar -Z = yaw pi');
check(near(VC.yawFromQuaternion(qYaw(Math.PI)), 0), 'omgedraaid kijkt naar +Z = yaw 0');
check(near(VC.yawFromQuaternion(qYaw(Math.PI / 2)), -Math.PI / 2), '90 linksom kijkt naar -X');
// pitch mag de yaw niet veranderen
const pitchDown = { x: Math.sin(-0.3), y: 0, z: 0, w: Math.cos(-0.3) };
check(near(Math.abs(VC.yawFromQuaternion(pitchDown)), Math.PI), 'pitch verandert yaw niet');

// rotateXZ komt overeen met yaw-optelling
{
  const a = 0.7, r = 1.1;
  const v = VC.rotateXZ(Math.sin(a), Math.cos(a), r);
  check(near(Math.atan2(v.x, v.z), a + r), 'rotateXZ telt yaw op');
}

// ---- rig: hoofd precies boven de speler
{
  const head = { x: 0.4, y: 1.7, z: -0.3 };
  for (const yaw of [0, 1, -2.5, Math.PI]) {
    const rp = VC.rigPositionFor(10, 2, -5, head, yaw);
    const hw = VC.headWorldFor(rp, yaw, head);
    check(near(hw.x, 10) && near(hw.z, -5) && near(hw.y, 3.7), 'hoofd boven speler bij yaw ' + yaw);
  }
  // kijkrichting: rigYaw + hoofdyaw = gewenste yaw
  const ry = VC.rigYawFor(1.2, -0.5);
  check(near(VC.wrapAngle(ry + -0.5), 1.2), 'rigYawFor');
}
check(near(VC.wrapAngle(3 * Math.PI), Math.PI) || near(VC.wrapAngle(3 * Math.PI), -Math.PI), 'wrapAngle');

// ---- schot-oorsprong binnen de servercheck (4 m horizontaal, grond-1..grond+6)
{
  const o = VC.clampOrigin({ x: 10, y: 50, z: 0 }, 0, 1, 0, 3);
  check(near(Math.hypot(o.x, o.z), 3) && o.y <= 1 + 6 && o.y >= 1 - 1, 'clampOrigin ver weg');
  const o2 = VC.clampOrigin({ x: 0.5, y: 2.4, z: 0.3 }, 0, 1, 0, 3);
  check(o2.x === 0.5 && o2.y === 2.4 && o2.z === 0.3, 'clampOrigin dichtbij ongemoeid');
}

// ---- meekijkplek
{
  const flat = () => 0;
  const a = VC.spectatorAnchor({ x: 5, z: 5, yaw: 0 }, flat, null, 7, 1.2);
  check(near(Math.hypot(a.x - 5, a.z - 5), 7) && near(a.y, 1.2), 'anchor op afstand en hoogte');
  check(near(a.z, -2), 'anchor achter de speler (yaw 0 kijkt +Z)');
  check(near(a.yaw, Math.atan2(5 - a.x, 5 - a.z)), 'anchor kijkt naar de speler');
  let calls = 0;
  const b = VC.spectatorAnchor({ x: 0, z: 0, yaw: 0 }, flat, () => (++calls < 3), 7, 1.2);
  check(calls === 3 && !near(b.z, -7), 'geblokkeerde plek wordt overgeslagen');
  const c = VC.spectatorAnchor({ x: 0, z: 0, yaw: 0 }, flat, () => true, 7, 1.2);
  check(near(c.z, -7), 'alles geblokkeerd: eerste kandidaat');
}

// ---- boomkruinen op de zichtlijn
{
  const trees = [{ x: 5, z: 0.5, scale: 1 }];
  check(VC.crownsBlock({ x: 0, z: 0 }, { x: 10, z: 0 }, trees) === true, 'kruin naast de lijn blokkeert');
  check(VC.crownsBlock({ x: 0, z: 5 }, { x: 10, z: 5 }, trees) === false, 'kruin ver van de lijn blokkeert niet');
  check(VC.crownsBlock({ x: 0, z: 0 }, { x: 4, z: 0 }, [{ x: 5, z: 0, scale: 1 }]) === false, 'boom vlak achter de speler (eindstuk) telt niet');
  check(VC.crownsBlock({ x: 0, z: 0 }, { x: 10, z: 0 }, null) === false, 'geen bomen = vrij');
  check(VC.crownsBlock({ x: 0, z: 0 }, { x: 10, z: 0 }, [{ x: 5, z: 2.5, scale: 1.5 }]) === true, 'grote boom heeft bredere kruin');
}

// ---- faden
{
  const f = VC.newFade();
  let done = 0;
  VC.fadeTo(f, () => done++);
  for (let i = 0; i < 10; i++) VC.fadeStep(f, 0.05);
  check(done === 1 && f.state === 'in', 'fadeTo voert pending uit bij zwart');
  for (let i = 0; i < 20; i++) VC.fadeStep(f, 0.05);
  check(f.a === 0 && f.state === 'idle', 'fade terug naar helder');
  VC.blink(f);
  check(f.a === 1 && f.state === 'in', 'blink = direct zwart');
  // nooit abrupt: per stap van 1/90 s maximaal een kleine verandering
  const g = VC.newFade(); VC.fadeTo(g, null);
  let prev = 0, maxStep = 0;
  for (let i = 0; i < 200; i++) { const a = VC.fadeStep(g, 1 / 90); maxStep = Math.max(maxStep, Math.abs(a - prev)); prev = a; }
  check(maxStep < 0.04, 'fade-stappen zijn klein (' + maxStep.toFixed(3) + ')');
}

// ---- HUD tekenen met een nep-canvas
function mockCtx() {
  const calls = [];
  const o = { calls, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: '', textBaseline: '' };
  for (const fn of ['clearRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'beginPath', 'fill', 'stroke', 'save', 'restore']) {
    o[fn] = (...args) => calls.push([fn, ...args]);
  }
  o.measureText = (s) => ({ width: String(s).length * 10 });
  return o;
}
const texts = (g) => g.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));

{
  const g = mockCtx();
  VC.drawHud(g, { lang: 'nl', mode: 'game', hp: 72, alive: 'Over: 4', level: 'Ronde 2 - Bos', target: 'Eerste tot 5', protect: true, feed: ['A schakelt B uit'] }, 'wrist');
  const t = texts(g);
  check(t.includes('72') && t.includes('Over: 4') && t.includes('Eerste tot 5') && t.includes('BESCHERMD'), 'pols-HUD toont HP/over/doel/bescherming');
  check(t.includes('A schakelt B uit'), 'pols-HUD toont laatste feed');
  const bar = g.calls.filter((c) => c[0] === 'fillRect' && c[1] === 28 && c[2] === 90)[0];
  check(bar && near(bar[3], (VC.WRIST_W - 56) * 0.72), 'HP-balk breedte klopt');
  check(g.calls.every((c) => c[0] !== 'fillText' || c.slice(2).every((v) => Number.isFinite(v))), 'geen NaN-coordinaten');
}
{
  const g = mockCtx();
  VC.drawHud(g, { lang: 'en', mode: 'game', hp: -20 }, 'wrist');
  check(texts(g).includes('0'), 'negatieve HP wordt 0');
}
{
  const g = mockCtx();
  VC.drawHud(g, { lang: 'en', mode: 'game', banner: ['', ''] }, 'banner');
  check(texts(g).length === 0 && g.calls.length === 1, 'leeg bannerpaneel tekent niets (alleen wissen)');
  check(!VC.bannerHasContent({ mode: 'game', banner: ['', ''] }), 'bannerHasContent leeg');
}
{
  const g = mockCtx();
  const st = { lang: 'en', mode: 'game', banner: ['3', 'Round 1 - Forest'], spectate: 'You are out', takeover: 'Take over Bot Rex · 80 HP', toast: 'Turning: smooth' };
  check(VC.bannerHasContent(st), 'bannerHasContent met tekst');
  VC.drawHud(g, st, 'banner');
  const t = texts(g);
  check(t.includes('3') && t.includes('Round 1 - Forest') && t.includes('You are out'), 'banner: aftellen + spectate');
  check(t.some((s) => s.startsWith('[A]') && s.includes('Bot Rex')), 'banner: overnemen met [A]');
  check(t.includes('Turning: smooth'), 'banner: toast');
  const big = g.calls.find((c) => c[0] === 'fillText' && c[1] === '3');
  check(big && g.calls.some((c) => c[0] === 'fillRect'), 'banner heeft paneel');
}
{
  const g = mockCtx();
  VC.drawHud(g, { lang: 'nl', mode: 'lobby', lobby: { code: 'ABCD', players: ['Cody ★', 'Bot 1'], host: true } }, 'banner');
  const t = texts(g);
  check(t.some((s) => s.includes('ABCD')) && t.includes('Cody ★') && t.includes('Druk op A om te starten'), 'lobbypaneel (host)');
  const g2 = mockCtx();
  VC.drawHud(g2, { lang: 'en', mode: 'lobby', lobby: { code: 'X', players: [], host: false } }, 'banner');
  check(texts(g2).includes('Waiting for the host…'), 'lobbypaneel (geen host)');
}
{
  const g = mockCtx();
  VC.drawHud(g, { lang: 'en', mode: 'game', matchEnd: { tag: 'Match over', title: 'You win!', rows: [['1', 'Cody', '5', '12']], back: 'Back to lobby… 7' } }, 'banner');
  const t = texts(g);
  check(t.includes('You win!') && t.includes('Cody') && t.includes('12') && t.includes('Back to lobby… 7'), 'eindscherm');
}
{
  const a = { lang: 'en', mode: 'game', hp: 50, alive: 'Left: 3', feed: [] };
  const b = { ...a, hp: 49.9 };
  check(VC.hudKey(a, 'wrist') === VC.hudKey(b, 'wrist'), 'hudKey: afronding voorkomt onnodig hertekenen');
  check(VC.hudKey(a, 'wrist') !== VC.hudKey({ ...a, hp: 30 }, 'wrist'), 'hudKey verandert bij nieuwe HP');
  check(VC.hudKey(a, 'banner') !== VC.hudKey({ ...a, toast: 'x' }, 'banner'), 'hudKey banner');
}
check(VC.vrText('nl', 'enter') === 'VR STARTEN' && VC.vrText('fr', 'enter') === 'ENTER VR' && VC.vrText('en', 'zzz') === 'zzz', 'vrText');
check(VC.hpColor(80) !== VC.hpColor(10), 'hpColor');

// ============================================================ fase VR2
const v3near = (a, b, eps = 1e-6) => near(a.x, b.x, eps) && near(a.y, b.y, eps) && near(a.z, b.z, eps);
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
check(VC.vrText('en', 'snapOn', { a: 45 }) === 'Turning: snap (45°)', 'vrText met variabele');

// ---- kort/lang drukken
{
  let h = VC.pressHold(null, true, 0.016);
  check(h.edge && !h.short && !h.long, 'pressHold: indrukken = rand');
  h = VC.pressHold(h.state, true, 0.2);
  h = VC.pressHold(h.state, false, 0.016);
  check(h.short && !h.long, 'pressHold: kort = short bij loslaten');
  let s = null, longs = 0, shorts = 0;
  for (let i = 0; i < 60; i++) { const r = VC.pressHold(s, true, 1 / 60); s = r.state; if (r.long) longs++; }
  const r = VC.pressHold(s, false, 1 / 60);
  check(longs === 1 && !r.short, 'pressHold: lang = één long, geen short daarna');
  s = null;
  for (let i = 0; i < 30; i++) { const q = VC.pressHold(s, true, 1 / 60); s = q.state; if (q.long) longs++; if (q.short) shorts++; }
  check(longs === 1, 'pressHold: 0.5 s is nog geen long');
}

// ---- mapControllers: Y kort/lang, linkshandig, stapgrootte, grips/trekkers
{
  const opts = { snap: true, yHold: true };
  let s = VC.initialPadState(), m, menu = 0, vig = 0;
  m = VC.mapControllers(pad([0, 0, 0, 0], [5]), null, s, opts, 0.016); s = m.state;
  check(!m.toggleVignette && !m.openMenu, 'yHold: indrukken doet nog niets');
  m = VC.mapControllers(pad([0, 0, 0, 0]), null, s, opts, 0.016); s = m.state;
  check(m.toggleVignette && !m.openMenu, 'yHold: Y kort = vignet');
  s = VC.initialPadState();
  for (let i = 0; i < 50; i++) { m = VC.mapControllers(pad([0, 0, 0, 0], [5]), null, s, opts, 1 / 60); s = m.state; if (m.openMenu) menu++; if (m.toggleVignette) vig++; }
  m = VC.mapControllers(pad([0, 0, 0, 0]), null, s, opts, 1 / 60); if (m.toggleVignette) vig++;
  check(menu === 1 && vig === 0, 'yHold: Y lang = menu (één keer), geen vignet');

  const lo = { snap: true, leftHanded: true };
  m = VC.mapControllers(pad([0, 0, 0, 0]), pad([0, 0, 0, -1]), VC.initialPadState(), lo, 0.016);
  check(near(m.moveY, 1), 'linkshandig: rechterstick = lopen');
  m = VC.mapControllers(pad([0, 0, 0.9, 0]), pad([0, 0, 0, 0]), VC.initialPadState(), lo, 0.016);
  check(near(m.turn, -VC.SNAP_ANGLE) && m.moveX === 0, 'linkshandig: linkerstick = draaien');
  m = VC.mapControllers(pad([0, 0, 0, 0], [0]), null, VC.initialPadState(), lo, 0.016);
  check(m.fire === true, 'linkshandig: linkertrekker vuurt');
  m = VC.mapControllers(null, pad([0, 0, 0, 0], [0]), VC.initialPadState(), lo, 0.016);
  check(m.fire === false, 'linkshandig: rechtertrekker vuurt niet');

  m = VC.mapControllers(null, pad([0, 0, 0.9, 0]), VC.initialPadState(), { snap: true, snapAngle: Math.PI / 4 }, 0.016);
  check(near(m.turn, -Math.PI / 4), 'stapgrootte 45 graden');
  m = VC.mapControllers(null, pad([0, 0, 1, 0]), VC.initialPadState(), { snap: false, smoothSpeed: 1 }, 0.5);
  check(near(m.turn, -0.5), 'eigen draaisnelheid');

  s = VC.initialPadState();
  m = VC.mapControllers(pad([0, 0, 0, 0], [1]), pad([0, 0, 0, 0], [0]), s, {}, 0.016);
  check(m.gripL && m.gripLEdge && !m.gripR && m.trigR && m.trigREdge && !m.trigL, 'grips/trekkers per hand + randen');
  m = VC.mapControllers(pad([0, 0, 0, 0], [1]), pad([0, 0, 0, 0], [0]), m.state, {}, 0.016);
  check(m.gripL && !m.gripLEdge && m.trigR && !m.trigREdge, 'vasthouden = geen nieuwe rand');
}

// ---- VR-instellingen
{
  const d = VC.sanitizeVrSettings(null);
  check(JSON.stringify(d) === JSON.stringify({ ...VC.VR_DEFAULTS }), 'sanitize: standaardwaarden');
  check(VC.sanitizeVrSettings({}, { snap: false, vignette: false }).snap === false &&
    VC.sanitizeVrSettings({}, { snap: false, vignette: false }).vignette === false, 'sanitize: oude sleutels vrSnap/vrVignette');
  check(VC.sanitizeVrSettings({ snap: true }, { snap: false }).snap === true, 'sanitize: nieuwe waarde wint van oude sleutel');
  const bad = VC.sanitizeVrSettings({ snapDeg: 20, smoothDeg: 9999, hand: 'x', grip: 'y', seated: 'ja', heightCm: -1000 });
  check(bad.snapDeg === 30 && bad.smoothDeg === VC.SMOOTH_MAX && bad.hand === 'right' && bad.grip === 'hold' &&
    bad.seated === false && bad.heightCm === VC.HEIGHT_MIN, 'sanitize: ongeldige waarden begrensd');
  check(VC.sanitizeVrSettings({ heightCm: 23 }).heightCm === 20 && VC.sanitizeVrSettings({ smoothDeg: 100 }).smoothDeg === 105, 'sanitize: afronden op stappen');
  check(near(VC.rigLift({ seated: true, heightCm: 10 }), VC.SEATED_LIFT + 0.1) && VC.rigLift(null) === 0, 'rigLift');
  const po = VC.padOptions({ ...VC.VR_DEFAULTS, snapDeg: 15, hand: 'left', smoothDeg: 90 });
  check(near(po.snapAngle, Math.PI / 12) && po.leftHanded && near(po.smoothSpeed, Math.PI / 2) && po.yHold, 'padOptions');
}

// ---- quaternions / basis
{
  const id = { x: 0, y: 0, z: 0, w: 1 };
  check(v3near(VC.quatRotate({ x: 1, y: 2, z: 3 }, id), { x: 1, y: 2, z: 3 }), 'quatRotate identiteit');
  const q90 = qYaw(Math.PI / 2);   // 90 graden linksom om Y
  check(v3near(VC.quatRotate({ x: 0, y: 0, z: -1 }, q90), { x: -1, y: 0, z: 0 }), 'quatRotate 90 graden om Y');
  const qi = VC.quatFromBasis({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
  check(near(Math.abs(qi.w), 1), 'quatFromBasis identiteit');
  for (const f0 of [{ x: 1, y: 0.2, z: -0.5 }, { x: -0.3, y: -0.8, z: 0.4 }, { x: 0, y: 0, z: 1 }, { x: 0.1, y: 0.05, z: 1 }]) {
    const a = VC.twoHandAim({ x: 0, y: 0, z: 0 }, f0, { x: 0, y: 1, z: 0 });
    const f = norm(f0);
    check(v3near(VC.quatRotate({ x: 0, y: 0, z: -1 }, a.quat), f, 1e-6), 'quatFromBasis: -Z = voorwaarts ' + JSON.stringify(f0));
    check(v3near(VC.quatRotate({ x: 0, y: 1, z: 0 }, a.quat), a.up, 1e-6) && near(dot3(a.up, f), 0), 'quatFromBasis: +Y = boven, loodrecht');
    check(near(Math.hypot(a.quat.x, a.quat.y, a.quat.z, a.quat.w), 1), 'quaternion genormaliseerd');
  }
}

// ---- tweehandig richten
{
  const dom = { x: 0.2, y: 1.3, z: -0.2 }, sup = { x: 0.1, y: 1.4, z: -0.6 };
  const a = VC.twoHandAim(dom, sup, { x: 0, y: 1, z: 0 });
  check(v3near(a.fwd, norm({ x: -0.1, y: 0.1, z: -0.4 })), 'twee handen: loop wijst van schiethand naar steunhand');
  check(a.up.y > 0.9, 'twee handen: rol uit de schiethand (rechtop)');
  const tilted = VC.twoHandAim(dom, sup, norm({ x: 1, y: 1, z: 0 }));
  check(tilted.up.x > 0.5 && near(dot3(tilted.up, tilted.fwd), 0), 'twee handen: gekantelde schiethand = gekanteld geweer');
  check(VC.twoHandAim(dom, dom, { x: 0, y: 1, z: 0 }) === null, 'handen op dezelfde plek = null');
  const up = VC.twoHandAim({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 });
  check(up && near(dot3(up.up, up.fwd), 0) && near(Math.hypot(up.up.x, up.up.y, up.up.z), 1), 'loop recht omhoog: geldige rol (terugval)');
}

// ---- steunpunten per wapen
{
  const id = { x: 0, y: 0, z: 0, w: 1 };
  const gp = VC.gripPointFor({ x: 0, y: 0, z: 0 }, id, 'rifle');
  check(v3near(gp, { x: 0, y: 0.06 - 0.045, z: -0.40 + 0.03 }), 'steunpunt rifle in het hand-frame (voor de hand, -Z)');
  for (const w of ['rifle', 'shotgun', 'smg', 'lmg', 'dmr', 'sniper']) {
    const p = VC.gripPointFor({ x: 0, y: 0, z: 0 }, id, w);
    check(-p.z > 0.2 && -p.z < 0.45 && Math.abs(p.y) < 0.1 && near(p.x, 0), 'steunpunt ' + w + ' 0.2-0.45 m voor de hand');
  }
  check(v3near(VC.supportGripGun('zzz'), VC.supportGripGun('rifle')), 'onbekend wapen = rifle-steunpunt');
  const p2 = VC.gripPointFor({ x: 1, y: 2, z: 3 }, qYaw(Math.PI / 2), 'rifle');
  check(near(p2.x, 1 - 0.37) && near(p2.z, 3) && near(p2.y, 2.015), 'steunpunt draait en schuift mee met de hand');
  check(near(VC.dist3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5), 'dist3');
}

// ---- steunhand: vasthouden / aan-uit / uit
{
  const base = { near: true, hands: 0.4, allowed: true };
  let g = VC.initialGrip(), r;
  r = VC.updateGrip(g, { ...base, mode: 'hold', squeeze: true }); g = r.state;
  check(g.held && r.event === 'grab', 'hold: knijpen bij het voorhout = pakken');
  r = VC.updateGrip(g, { ...base, mode: 'hold', squeeze: true, near: false }); g = r.state;
  check(g.held && r.event === null, 'hold: blijft vast als de hand wat verschuift');
  r = VC.updateGrip(g, { ...base, mode: 'hold', squeeze: false }); g = r.state;
  check(!g.held && r.event === 'release', 'hold: loslaten = één hand');
  r = VC.updateGrip(VC.initialGrip(), { ...base, mode: 'hold', squeeze: true, near: false });
  check(!r.state.held, 'hold: knijpen ver van het voorhout = niets');
  r = VC.updateGrip(r.state, { ...base, mode: 'hold', squeeze: true, near: true });
  check(r.state.held, 'hold: knijpend naar het voorhout = pakken');

  g = VC.initialGrip();
  r = VC.updateGrip(g, { ...base, mode: 'toggle', squeeze: true }); g = r.state;
  r = VC.updateGrip(g, { ...base, mode: 'toggle', squeeze: false }); g = r.state;
  check(g.held, 'toggle: na loslaten van de grip nog steeds vast');
  r = VC.updateGrip(g, { ...base, mode: 'toggle', squeeze: true, near: false }); g = r.state;
  check(!g.held && r.event === 'release', 'toggle: volgende kneep = los');
  r = VC.updateGrip(VC.initialGrip(), { ...base, mode: 'off', squeeze: true });
  check(!r.state.held, 'off: nooit twee handen');
  r = VC.updateGrip({ held: true, squeeze: true }, { ...base, mode: 'hold', squeeze: true, hands: 1.5 });
  check(!r.state.held && r.event === 'release', 'handen te ver uit elkaar = los');
  r = VC.updateGrip({ held: true, squeeze: true }, { ...base, mode: 'toggle', squeeze: true, allowed: false });
  check(!r.state.held, 'geen geweer/menu open = los');
}

// ---- overgang / demping / schotvelden
{
  let b = 0;
  for (let i = 0; i < 5; i++) b = VC.approach(b, 1, 0.016);
  check(b > 0.9 && b <= 1, 'overgang ~80 ms (' + b.toFixed(2) + ')');
  b = VC.approach(b, 1, 0.016);
  check(b === 1 && VC.approach(1, 0, 0.04) === 0.5, 'approach begrensd en symmetrisch');
  check(VC.smoothK(0.016, 0) === 1 && VC.smoothK(0.016, 0.04) > 0.2 && VC.smoothK(0.016, 0.04) < 0.5, 'smoothK');
  check(VC.shotFlags(false, 1, {}) === null && VC.shotFlags(true, 0.2, {}) === null, 'shotFlags: één hand = niets');
  const f1 = VC.shotFlags(true, 1, { spread: 0.015 });
  check(f1.two === 1 && f1.z === undefined, 'shotFlags: two:1');
  check(VC.shotFlags(true, 1, { spread: 0.002, hipSpread: 0.05 }).z === 1, 'shotFlags: sniper met twee handen = door de kijker');
  check(VC.TWO_HAND_SPREAD >= 0.85 && VC.TWO_HAND_SPREAD < 1, 'spreidingsbonus maximaal x0.85');
}

// ---- VR-menu (vr-menu-core.js)
{
  const view = { lang: 'nl', tab: 'comfort', vr: VC.VR_DEFAULTS, quality: 'auto', effectiveQuality: 'medium', volume: 80 };
  for (const tab of MC.TABS) {
    const mm = MC.buildMenu({ ...view, tab });
    const ids = mm.items.map((i) => i.id);
    check(ids.includes('act:resume') && ids.includes('act:exitvr') && ids.includes('act:leave'), 'menu ' + tab + ': verder/VR verlaten/spel verlaten');
    check(mm.items.find((i) => i.id === 'tab:' + tab).active, 'menu ' + tab + ': tab actief');
    const inside = mm.items.every((i) => i.x >= 0 && i.y >= 0 && i.x + i.w <= MC.MENU_W && i.y + i.h <= MC.MENU_H);
    check(inside, 'menu ' + tab + ': alles binnen het paneel');
    // geen overlappende knoppen
    let overlap = false;
    for (const a of mm.items) for (const b2 of mm.items) {
      if (a !== b2 && a.x < b2.x + b2.w && b2.x < a.x + a.w && a.y < b2.y + b2.h && b2.y < a.y + a.h) overlap = true;
    }
    check(!overlap, 'menu ' + tab + ': geen overlappende knoppen');
    const g = mockCtx();
    MC.drawMenu(g, mm, new Set(['act:resume']));
    check(g.calls.every((c) => c[0] !== 'fillText' || c.slice(2).every((v) => Number.isFinite(v))), 'menu ' + tab + ': geen NaN bij tekenen');
  }
  const mm = MC.buildMenu(view);
  check(mm.items.find((i) => i.id === 'vr:snap:true').active && !mm.items.find((i) => i.id === 'vr:snap:false').active, 'menu: huidige keuze actief');
  check(texts((() => { const g = mockCtx(); MC.drawMenu(g, mm, null); return g; })()).includes('TACTISCH MENU'), 'menu: NL-titel');
  const it = mm.items.find((i) => i.id === 'vr:snapDeg:45');
  check(MC.hitTest(mm, it.x + it.w / 2, it.y + it.h / 2) === it, 'hitTest: midden van een knop');
  check(MC.hitTest(mm, 5, 5) === null && MC.hitTest(mm, NaN, 3) === null, 'hitTest: buiten knoppen = null');
  check(JSON.stringify(MC.applyVrAction(VC.VR_DEFAULTS, it.action)) === JSON.stringify({ ...VC.VR_DEFAULTS, snapDeg: 45 }), 'applyVrAction: stapgrootte 45');
  const hp = mm.items.find((i) => i.id === 'vr:heightCm:+');
  let vs = { ...VC.VR_DEFAULTS };
  for (let i = 0; i < 20; i++) vs = MC.applyVrAction(vs, hp.action);
  check(vs.heightCm === VC.HEIGHT_MAX, 'applyVrAction: hoogte +10 cm begrensd');
  check(MC.applyVrAction(vs, { type: 'resume' }) === null, 'applyVrAction: geen VR-actie = null');
  const gfx = MC.buildMenu({ ...view, tab: 'gfx' });
  const bar = gfx.items.find((i) => i.kind === 'slider');
  check(bar && MC.sliderValueAt(bar, bar.x) === 0 && MC.sliderValueAt(bar, bar.x + bar.w) === 100 && MC.sliderValueAt(bar, bar.x + bar.w * 0.52) === 50, 'volumeschuif');
  check(MC.stepVolume(95, 10) === 100 && MC.stepVolume(5, -10) === 0 && MC.stepVolume(50, 10) === 60, 'stepVolume');
  check(gfx.items.find((i) => i.id === 'quality:auto').active && gfx.items.find((i) => i.id === 'lang:nl').active, 'gfx: kwaliteit/taal actief');
  const conf = MC.buildMenu({ ...view, confirm: true });
  check(conf.items.length === 2 && conf.items.some((i) => i.action.type === 'confirmLeave'), 'bevestigen voor spel verlaten');
  const help = MC.buildMenu({ ...view, tab: 'help', vr: { ...VC.VR_DEFAULTS, hand: 'left' } });
  check(help.texts.some((t) => t.s === 'Rechterstick') && help.texts.some((t) => t.s === 'Linkertrekker'), 'besturing: linkshandig gespiegeld');
  check(MC.menuKey(view, new Set()) !== MC.menuKey(view, new Set(['act:resume'])) && MC.menuKey(view, null) !== MC.menuKey({ ...view, volume: 70 }, null), 'menuKey');

  // laser op het paneel
  const c = { x: 0, y: 1, z: -1 }, n = { x: 0, y: 0, z: 1 }, rgt = { x: 1, y: 0, z: 0 }, upv = { x: 0, y: 1, z: 0 };
  const h = MC.rayPanelHit({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, c, n, rgt, upv, 0.45, 0.45);
  check(h && near(h.t, 1) && near(h.u, 0.5) && near(h.v, 0.5), 'rayPanelHit: midden');
  const h2 = MC.rayPanelHit({ x: 0.3, y: 1.4, z: 0 }, { x: 0, y: 0, z: -1 }, c, n, rgt, upv, 0.45, 0.45);
  check(h2 && near(h2.u, 0.5 + 0.3 / 0.9) && near(h2.v, 0.5 - 0.4 / 0.9), 'rayPanelHit: rechtsboven');
  check(MC.rayPanelHit({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, c, n, rgt, upv, 0.45, 0.45) === null, 'rayPanelHit: wegwijzen = null');
  check(MC.rayPanelHit({ x: 0, y: 1, z: -2 }, { x: 0, y: 0, z: 1 }, c, n, rgt, upv, 0.45, 0.45) === null, 'rayPanelHit: achterkant = null');
  check(MC.rayPanelHit({ x: 1, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, c, n, rgt, upv, 0.45, 0.45) === null, 'rayPanelHit: naast het paneel = null');
  const pl = MC.menuPlacement({ x: 0.1, y: 1.6, z: 0.2 }, Math.PI, 1, 0.3);
  check(near(pl.x, 0.1) && near(pl.z, -0.8) && near(pl.y, 1.3), 'menuPlacement: 1 m voor je, borsthoogte');
  check(MC.menuPlacement({ x: 0, y: 0.7, z: 0 }, 0).y >= 0.5, 'menuPlacement: zittend niet in de vloer');
  check(MC.menuText('xx', 'resume') === 'RESUME' && MC.menuText('nl', 'resume') === 'VERDER', 'menuText');
  const wg = mockCtx();
  MC.drawWristButton(wg, 'MENU', true);
  check(texts(wg).includes('MENU'), 'polsknop MENU');
}

console.log(fails ? fails + ' FAIL, ' + passes + ' ok' : 'alle ' + passes + ' VR-tests ok');
process.exit(fails ? 1 : 0);
