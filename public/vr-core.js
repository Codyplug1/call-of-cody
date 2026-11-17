/* ============================================================
 * VR (fase 5, Meta Quest 3) - pure hulpfuncties zonder Three.js/DOM.
 * Gebruikt door public/vr.js en getest met `node tools/test_vr.mjs`.
 *
 * Richtingen volgen game.js: yaw 0 = kijken naar +Z, vooruit = (sin yaw, cos yaw),
 * rechts = (-cos yaw, sin yaw).
 * ============================================================ */

// ------------------------------------------------------------ teksten

export const VR_TEXT = {
  nl: {
    enter: 'VR STARTEN', lobby: 'LOBBY', code: 'CODE', startA: 'Druk op A om te starten',
    waitHost: 'Wachten tot de host start…', menu: 'Geen spel - zet de bril af en maak/zoek een spel',
    takeA: '[A]', snapOn: 'Draaien: stapjes ({a}°)', snapOff: 'Draaien: vloeiend',
    vigOn: 'Comfort-vignet: aan', vigOff: 'Comfort-vignet: uit', protected: 'BESCHERMD',
    help: 'Y lang = menu · X = springen · loopstick indrukken = liggen · B = draaien · Y = vignet · Meta = VR verlaten', hp: 'HP', eliminated: 'UITGESCHAKELD',
    menuBtn: 'MENU', twoOn: 'Twee handen', twoOff: 'Eén hand',
  },
  en: {
    enter: 'ENTER VR', lobby: 'LOBBY', code: 'CODE', startA: 'Press A to start',
    waitHost: 'Waiting for the host…', menu: 'No game - take off the headset and create/join a game',
    takeA: '[A]', snapOn: 'Turning: snap ({a}°)', snapOff: 'Turning: smooth',
    vigOn: 'Comfort vignette: on', vigOff: 'Comfort vignette: off', protected: 'PROTECTED',
    help: 'Hold Y = menu · X = jump · click move stick = prone · B = turn mode · Y = vignette · Meta = exit VR', hp: 'HP', eliminated: 'ELIMINATED',
    menuBtn: 'MENU', twoOn: 'Two hands', twoOff: 'One hand',
  },
};

export function vrText(lang, key, vars) {
  let s = (VR_TEXT[lang] && VR_TEXT[lang][key]) || VR_TEXT.en[key] || key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

// ------------------------------------------------------------ besturing

export const SNAP_ANGLE = Math.PI / 6;     // 30 graden
export const SMOOTH_TURN_SPEED = 2.4;      // rad/s bij volle uitslag
const DEAD = 0.15;
const SNAP_ON = 0.7, SNAP_OFF = 0.35;

// Dode zone met herschaling zodat de uitslag net buiten de zone bij 0 begint.
export function deadzone(v, dz = DEAD) {
  if (!Number.isFinite(v)) return 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

// Duimstick volgens het 'xr-standard' gamepad-profiel: assen 2/3, anders 0/1.
export function stickOf(pad) {
  if (!pad || !pad.axes) return { x: 0, y: 0 };
  const ax = pad.axes;
  const x = ax.length >= 4 ? ax[2] : (ax[0] || 0);
  const y = ax.length >= 4 ? ax[3] : (ax[1] || 0);
  return { x: x || 0, y: y || 0 };
}

function pressed(pad, i) {
  const b = pad && pad.buttons && pad.buttons[i];
  return !!(b && (b.pressed || b.value > 0.5));
}

// xr-standard knopindexen: 0 trekker, 1 grip (knijpen), 3 duimstick-klik, 4 A/X, 5 B/Y.
// (De menuknop van de linkercontroller is op de Quest van het systeem: niet bruikbaar.)
export const BTN = { trigger: 0, squeeze: 1, stick: 3, lower: 4, upper: 5 };

function trig(pad) {
  const b = pad && pad.buttons && pad.buttons[BTN.trigger];
  return !!(b && (b.pressed || b.value > 0.6));
}

export const LONG_PRESS = 0.6;   // s: Y lang ingedrukt = menu

/**
 * Kort/lang drukken op één knop. prev = vorige toestand (of null), down = nu ingedrukt, dt in s.
 * long komt één keer zodra de knop longS vastgehouden is (nog tijdens het indrukken);
 * short komt bij het loslaten als er geen long was. edge = net ingedrukt.
 */
export function pressHold(prev, down, dt, longS = LONG_PRESS) {
  const p = prev || { down: false, t: 0, fired: false };
  let t = 0, fired = false, short = false, long = false;
  if (down) {
    t = p.down ? p.t + (dt || 0) : 0;
    fired = p.down ? p.fired : false;
    if (!fired && t >= longS) { long = true; fired = true; }
  } else if (p.down && !p.fired) {
    short = true;
  }
  return { state: { down: !!down, t, fired }, short, long, edge: !!down && !p.down };
}

export function initialPadState() {
  return { snapArmed: true, a: false, b: false, x: false, y: false, ls: false, yHold: null, trigL: false, trigR: false, gripL: false, gripR: false };
}

// Echte hoofdhoogte (m boven de vloer) waaronder je in VR als gehurkt telt (hitbox/server).
// Let op: geef hier de hoogte MET de zit-/hoogte-correctie (headLocal.y + rigLift(settings)),
// anders telt een zittende speler altijd als gehurkt.
export const VR_CROUCH_HEAD = 1.2;
export function vrCrouching(headY, wasCrouching) {
  // kleine marge tegen heen-en-weer springen rond de grens
  return wasCrouching ? headY < VR_CROUCH_HEAD + 0.08 : headY < VR_CROUCH_HEAD;
}

/**
 * Zet de ruwe controllerstand om in spelinvoer.
 * left/right: { axes: number[], buttons: {pressed, value}[] } of null (gamepad van de XRInputSource).
 * prev: toestand van de vorige frame (initialPadState()), wordt niet aangepast.
 * opts: { snap: boolean, snapAngle (rad), smoothSpeed (rad/s), leftHanded: boolean, yHold: boolean } ; dt in s.
 *   leftHanded: lopen met de rechterstick, draaien met de linkerstick, vuren met de linkertrekker
 *   (de knoppen A/B/X/Y blijven op hun plek).
 *   yHold: Y kort = toggleVignette (bij loslaten), Y lang (LONG_PRESS) = openMenu.
 *   Zonder yHold is toggleVignette gewoon de rand van Y (oud gedrag).
 * Resultaat: moveX/moveY (game.js input.jx/jy: rechts / vooruit), turn (rad, + = linksom),
 * fire, randen (eenmalig): takeover (A), toggleTurn (B), toggleVignette (Y), openMenu, start (A),
 * jump (X), toggleProne (de loopstick indrukken: links, of rechts bij linkshandig),
 * trekkers/grips per hand (trigL/trigR/gripL/gripR + ...Edge = net ingedrukt) en state.
 */
export function mapControllers(left, right, prev, opts, dt) {
  const p = prev || initialPadState();
  const o = opts || {};
  const lefty = o.leftHanded === true;
  const moveSt = stickOf(lefty ? right : left), turnSt = stickOf(lefty ? left : right);
  let mx = deadzone(moveSt.x), my = -deadzone(moveSt.y);           // stick naar voren = negatieve y
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  const snapAngle = o.snapAngle > 0 ? o.snapAngle : SNAP_ANGLE;
  const smoothSpeed = o.smoothSpeed > 0 ? o.smoothSpeed : SMOOTH_TURN_SPEED;
  const rx = turnSt.x || 0;
  let turn = 0;
  let snapArmed = p.snapArmed;
  if (o.snap === false) {
    turn = -deadzone(rx, 0.2) * smoothSpeed * (dt || 0);
    snapArmed = true;
  } else if (snapArmed && Math.abs(rx) > SNAP_ON) {
    turn = rx > 0 ? -snapAngle : snapAngle;              // stick naar rechts = rechtsom draaien
    snapArmed = false;
  } else if (!snapArmed && Math.abs(rx) < SNAP_OFF) {
    snapArmed = true;
  }

  const a = pressed(right, BTN.lower), b = pressed(right, BTN.upper);
  const x = pressed(left, BTN.lower), y = pressed(left, BTN.upper);
  const trigL = trig(left), trigR = trig(right);
  const gripL = pressed(left, BTN.squeeze), gripR = pressed(right, BTN.squeeze);
  const lsc = pressed(lefty ? right : left, BTN.stick);     // loopstick indrukken = liggen aan/uit
  const fire = lefty ? trigL : trigR;
  let toggleVignette = y && !p.y, openMenu = false, yHold = null;
  if (o.yHold) {
    const h = pressHold(p.yHold, y, dt);
    yHold = h.state;
    toggleVignette = h.short;
    openMenu = h.long;
  }
  return {
    moveX: mx, moveY: my, turn, fire,
    takeover: a && !p.a, start: a && !p.a,
    toggleTurn: b && !p.b, toggleVignette, openMenu,
    jump: x && !p.x, toggleProne: lsc && !p.ls,             // X = springen, loopstick indrukken = liggen aan/uit
    trigL, trigR, trigLEdge: trigL && !p.trigL, trigREdge: trigR && !p.trigR,
    gripL, gripR, gripLEdge: gripL && !p.gripL, gripREdge: gripR && !p.gripR,
    moving: Math.hypot(mx, my) > 0.05,
    state: { snapArmed, a, b, x, y, ls: lsc, yHold, trigL, trigR, gripL, gripR },
  };
}

// ------------------------------------------------------------ VR-instellingen (fase VR2)
// Bewaard in cc_settings.vr (settings.js); hier alleen controleren/begrenzen.

export const SNAP_CHOICES = [15, 30, 45];
export const SMOOTH_MIN = 45, SMOOTH_MAX = 240, SMOOTH_STEP = 15;
export const HEIGHT_MIN = -30, HEIGHT_MAX = 60, HEIGHT_STEP = 10;   // cm
export const SEATED_LIFT = 0.45;                                      // m extra bij zittend spelen
export const GRIP_MODES = ['hold', 'toggle', 'off'];
export const VR_DEFAULTS = Object.freeze({
  snap: true, snapDeg: 30, smoothDeg: 135, vignette: true, hand: 'right', grip: 'hold', seated: false, heightCm: 0,
});

/**
 * Maak van een (mogelijk kapot/oud) object geldige VR-instellingen.
 * legacy: { snap, vignette } uit de oude losse sleutels vrSnap/vrVignette (alleen als raw ze mist).
 */
export function sanitizeVrSettings(raw, legacy) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const l = legacy && typeof legacy === 'object' ? legacy : {};
  const bool = (v, lv, def) => (typeof v === 'boolean' ? v : typeof lv === 'boolean' ? lv : def);
  const num = (v, lo, hi, step, def) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, Math.round(n / step) * step));
  };
  return {
    snap: bool(r.snap, l.snap, VR_DEFAULTS.snap),
    snapDeg: SNAP_CHOICES.includes(Number(r.snapDeg)) ? Number(r.snapDeg) : VR_DEFAULTS.snapDeg,
    smoothDeg: num(r.smoothDeg, SMOOTH_MIN, SMOOTH_MAX, SMOOTH_STEP, VR_DEFAULTS.smoothDeg),
    vignette: bool(r.vignette, l.vignette, VR_DEFAULTS.vignette),
    hand: r.hand === 'left' ? 'left' : 'right',
    grip: GRIP_MODES.includes(r.grip) ? r.grip : VR_DEFAULTS.grip,
    seated: r.seated === true,
    heightCm: num(r.heightCm, HEIGHT_MIN, HEIGHT_MAX, HEIGHT_STEP, VR_DEFAULTS.heightCm),
  };
}

// Extra hoogte van de rig (m): zittend spelen + hoogte-instelling.
export function rigLift(vr) {
  if (!vr) return 0;
  return (vr.seated ? SEATED_LIFT : 0) + (Number(vr.heightCm) || 0) / 100;
}

// Opties voor mapControllers uit de VR-instellingen.
export function padOptions(vr) {
  const v = vr || VR_DEFAULTS;
  return {
    snap: v.snap !== false,
    snapAngle: (v.snapDeg || 30) * Math.PI / 180,
    smoothSpeed: (v.smoothDeg || 135) * Math.PI / 180,
    leftHanded: v.hand === 'left',
    yHold: true,
  };
}

// ------------------------------------------------------------ twee handen aan het geweer (fase VR2)
// Assen: hand-frame = target-ray van de controller (-Z = vooruit, +Y = boven). Het geweer hangt
// daarin met GUN_HOLDER_OFFSET en 180° gedraaid (geweermodellen: oorsprong = pistoolgreep, loop langs +Z).

export const GUN_HOLDER_OFFSET = Object.freeze({ x: 0, y: -0.045, z: 0.03 });
// Steunpunt voor de andere hand (voorhout/pomp/voorgreep) in geweer-coördinaten [x, y, z] (m),
// afgeleid uit tools/build_models.py en tools/build_weapons.py.
export const SUPPORT_GRIPS = Object.freeze({
  rifle: [0, 0.06, 0.40],     // achtkantige handbescherming (z 0.28..0.64)
  shotgun: [0, 0.038, 0.385], // pomp (z 0.29..0.48)
  smg: [0, -0.03, 0.29],      // verticale voorgreep
  lmg: [0, 0.02, 0.36],       // voorhout onder de loopmantel
  dmr: [0, 0.065, 0.36],      // houten handbescherming
  sniper: [0, 0.035, 0.32],   // voorhout van de schacht
});
export const GRAB_RADIUS = 0.14;   // m: zo dicht moet de steunhand bij het steunpunt zijn om te pakken
export const HINT_RADIUS = 0.24;   // m: oplichten van het steunpunt
export const MIN_HANDS = 0.1, MAX_HANDS = 0.9;   // m: daarbuiten laat de steunhand automatisch los
export const GRIP_BLEND_TIME = 0.08;             // s: overgang een-/tweehandig
export const TWO_HAND_TAU = 0.04;                // s: lichte demping van de richting met twee handen
export const TWO_HAND_SPREAD = 0.85;             // server: spreiding x0.85 met twee handen

export function supportGripGun(weaponId) {
  const g = SUPPORT_GRIPS[weaponId] || SUPPORT_GRIPS.rifle;
  return { x: g[0], y: g[1], z: g[2] };
}

// Geweer-coördinaten -> hand-frame (target-ray).
export function gunToHand(p) {
  return { x: -p.x + GUN_HOLDER_OFFSET.x, y: p.y + GUN_HOLDER_OFFSET.y, z: -p.z + GUN_HOLDER_OFFSET.z };
}

// Vector v draaien met quaternion q ({x, y, z, w}).
export function quatRotate(v, q) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

// Steunpunt van het wapen (zelfde ruimte als handPos) voor een hand-frame met positie/quaternion.
export function gripPointFor(handPos, handQuat, weaponId) {
  const l = quatRotate(gunToHand(supportGripGun(weaponId)), handQuat);
  return { x: handPos.x + l.x, y: handPos.y + l.y, z: handPos.z + l.z };
}

export function dist3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

/**
 * Quaternion van een frame met -Z = fwd en +Y = up (beide genormaliseerd en loodrecht).
 * Zelfde formule als THREE.Quaternion.setFromRotationMatrix.
 */
export function quatFromBasis(fwd, up) {
  const zx = -fwd.x, zy = -fwd.y, zz = -fwd.z;                         // +Z = achteruit
  const xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;   // X = Y x Z
  const m00 = xx, m01 = up.x, m02 = zx, m10 = xy, m11 = up.y, m12 = zy, m20 = xz, m21 = up.z, m22 = zz;
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  return { x, y, z, w };
}

/**
 * Tweehandig richten: het geweer blijft in de schiethand, de loop wijst van de schiethand
 * (domPos) naar de steunhand (supPos); de rol komt van de 'boven'-as van de schiethand (domUp).
 * Geeft { fwd, up, quat } of null als de handen (bijna) op dezelfde plek zitten.
 */
export function twoHandAim(domPos, supPos, domUp) {
  const dx = supPos.x - domPos.x, dy = supPos.y - domPos.y, dz = supPos.z - domPos.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-4)) return null;
  const f = { x: dx / len, y: dy / len, z: dz / len };
  const ortho = (u) => {
    const d = u.x * f.x + u.y * f.y + u.z * f.z;
    const v = { x: u.x - f.x * d, y: u.y - f.y * d, z: u.z - f.z * d };
    const l = Math.hypot(v.x, v.y, v.z);
    return l > 0.05 ? { x: v.x / l, y: v.y / l, z: v.z / l } : null;
  };
  const up = ortho(domUp || { x: 0, y: 1, z: 0 }) || ortho({ x: 0, y: 1, z: 0 }) || ortho({ x: 0, y: 0, z: 1 });
  return { fwd: f, up, quat: quatFromBasis(f, up) };
}

export function initialGrip() { return { held: false, squeeze: false }; }

/**
 * Toestandsmachine van de steunhand.
 * inp: { mode: 'hold'|'toggle'|'off', squeeze: boolean (grip van de steunhand), near: boolean
 *        (steunhand binnen GRAB_RADIUS van het steunpunt), hands: afstand tussen de handen (m),
 *        allowed: false = geen geweer (dood/menu) -> loslaten }
 * Geeft { state, event: 'grab'|'release'|null }.
 */
export function updateGrip(prev, inp) {
  const p = prev || initialGrip();
  const squeeze = !!inp.squeeze;
  const edge = squeeze && !p.squeeze;
  let held = p.held;
  const ok = inp.allowed !== false && inp.mode !== 'off' && GRIP_MODES.includes(inp.mode);
  const handsOk = !(Number.isFinite(inp.hands)) || (inp.hands >= MIN_HANDS && inp.hands <= MAX_HANDS);
  if (!ok) held = false;
  else if (inp.mode === 'hold') {
    if (!squeeze) held = false;
    else if (!held && inp.near) held = true;           // knijpen bij het voorhout (ook al knijpend erheen)
  } else if (edge) {                                    // toggle: elke kneep wisselt
    if (held) held = false;
    else if (inp.near) held = true;
  }
  if (held && !handsOk) held = false;
  const event = held && !p.held ? 'grab' : !held && p.held ? 'release' : null;
  return { state: { held, squeeze }, event };
}

// Lineair naar target in 'time' seconden (overgang een-/tweehandig).
export function approach(cur, target, dt, time = GRIP_BLEND_TIME) {
  const step = time > 0 ? (dt || 0) / time : 1;
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

// Factor voor exponentiële demping (1 = geen demping).
export function smoothK(dt, tau) {
  if (!(tau > 0)) return 1;
  return 1 - Math.exp(-Math.max(0, dt || 0) / tau);
}

// Extra velden voor het 'shoot'-bericht bij tweehandig vasthouden. Wapens met een kijker
// (hipSpread, de sniper) tellen dan als 'door de kijker' (z:1), want VR heeft geen zoom.
export function shotFlags(held, blend, weapon) {
  if (!held || !(blend > 0.5)) return null;
  const f = { two: 1 };
  if (weapon && weapon.hipSpread !== undefined) f.z = 1;
  return f;
}

// ------------------------------------------------------------ geometrie

// Yaw (game.js-conventie) van de kijkrichting van een quaternion: vooruit = lokale -Z.
export function yawFromQuaternion(q) {
  const { x, y, z, w } = q;
  // -Z as na rotatie: (-(2(xz + wy)), -(2(yz - wx)), -(1 - 2(xx + yy)))
  const fx = -2 * (x * z + w * y);
  const fz = -(1 - 2 * (x * x + y * y));
  if (Math.abs(fx) < 1e-9 && Math.abs(fz) < 1e-9) return 0;
  return Math.atan2(fx, fz);
}

// Draai (x, z) over yaw rond de Y-as (zelfde als THREE Object3D.rotation.y).
export function rotateXZ(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Rig-positie zodat het hoofd (lokaal in de rig: headLocal) precies boven (px, pz) staat
 * en de vloer van de speelruimte op hoogte groundY ligt.
 */
export function rigPositionFor(px, groundY, pz, headLocal, rigYaw) {
  const o = rotateXZ(headLocal.x, headLocal.z, rigYaw);
  return { x: px - o.x, y: groundY, z: pz - o.z };
}

// Wereldpositie van het hoofd bij een gegeven rig.
export function headWorldFor(rigPos, rigYaw, headLocal) {
  const o = rotateXZ(headLocal.x, headLocal.z, rigYaw);
  return { x: rigPos.x + o.x, y: rigPos.y + headLocal.y, z: rigPos.z + o.z };
}

// Rig-yaw zodat het hoofd (lokale yaw headYawLocal) in wereldrichting wantYaw kijkt.
export function rigYawFor(wantYaw, headYawLocal) {
  return wrapAngle(wantYaw - headYawLocal);
}

/**
 * De server (server.js 'shoot') accepteert de oorsprong van een schot alleen binnen 4 m
 * horizontaal van de speler en tussen grond-1 en grond+6. Houd hem veilig binnen maxDist.
 */
export function clampOrigin(o, px, groundY, pz, maxDist = 3) {
  let x = o.x, z = o.z, y = o.y;
  const dx = x - px, dz = z - pz;
  const d = Math.hypot(dx, dz);
  if (d > maxDist) { x = px + (dx / d) * maxDist; z = pz + (dz / d) * maxDist; }
  y = Math.max(groundY - 0.5, Math.min(groundY + 4, y));
  return { x, y, z };
}

/**
 * Vaste meekijkplek bij een speler (geen meebewegende camera = geen bewegingsziekte).
 * heightAt(x, z) -> grondhoogte; blocked(from, to) -> true als er dekking tussen zit.
 * Probeert achter de speler en dan een paar andere hoeken. Geeft { x, y, z, yaw } van de
 * vloer van de rig en de kijkrichting naar de speler.
 */
export function spectatorAnchor(target, heightAt, blocked, dist = 7, lift = 1.2) {
  const tries = [Math.PI, Math.PI * 0.65, -Math.PI * 0.65, Math.PI * 0.35, -Math.PI * 0.35, 0];
  const ty = heightAt(target.x, target.z);
  let best = null;
  for (const off of tries) {
    const a = (target.yaw || 0) + off;
    const x = target.x + Math.sin(a) * dist, z = target.z + Math.cos(a) * dist;
    const gy = heightAt(x, z);
    const y = Math.max(gy, ty) + lift;
    const cand = { x, y, z, yaw: Math.atan2(target.x - x, target.z - z) };
    if (!best) best = cand;
    if (!blocked || !blocked({ x, y: y + 1.6, z }, { x: target.x, y: ty + 1.4, z: target.z })) return cand;
  }
  return best;
}

/**
 * Zit er een boomkruin op de lijn a -> b? (De schietlijn-test in shared.js kent alleen stammen;
 * voor het uitzicht tellen ook de brede dennenkruinen.) trees: [{ x, z, scale }].
 * Het laatste stuk bij de speler (endSkip m) telt niet mee.
 */
export function crownsBlock(a, b, trees, crown = 1.9, endSkip = 1.2) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (!trees || len2 < 1e-6) return false;
  const len = Math.sqrt(len2);
  const tMax = Math.max(0, 1 - endSkip / len);
  for (const tr of trees) {
    let t = ((tr.x - a.x) * dx + (tr.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(tMax, t));
    const px = a.x + dx * t, pz = a.z + dz * t;
    if (Math.hypot(tr.x - px, tr.z - pz) < crown * (tr.scale || 1)) return true;
  }
  return false;
}

// ------------------------------------------------------------ overgangen (zwart in-/uitfaden)

export const FADE_OUT = 0.35, FADE_IN = 0.45;

export function newFade() { return { a: 0, state: 'idle', pending: null }; }

// Faden naar zwart, dan pending() uitvoeren, dan weer terug.
export function fadeTo(f, pending) {
  f.pending = pending || null;
  if (f.state !== 'out') f.state = 'out';
  return f;
}

// Direct zwart en dan rustig infaden (voor teleports zoals een nieuwe ronde).
export function blink(f) {
  f.a = 1; f.state = 'in'; f.pending = null;
  return f;
}

export function fadeStep(f, dt) {
  if (f.state === 'out') {
    f.a = Math.min(1, f.a + dt / FADE_OUT);
    if (f.a >= 1) {
      const p = f.pending;
      f.pending = null;
      f.state = 'in';
      if (p) p();
    }
  } else if (f.state === 'in') {
    f.a = Math.max(0, f.a - dt / FADE_IN);
    if (f.a <= 0) f.state = 'idle';
  }
  return f.a;
}

// ------------------------------------------------------------ HUD tekenen (canvas 2D)

export const WRIST_W = 512, WRIST_H = 256;
export const BANNER_W = 1024, BANNER_H = 512;

const FONT = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';
const C = {
  panel: 'rgba(14,18,15,0.86)', line: 'rgba(196,202,170,0.45)', text: '#e7e6dc',
  muted: '#9a9c8b', accent: '#ff9a1f', danger: '#ff4b3a', ok: '#4cd964', blue: '#6fd3ff',
};

export function hpColor(hp) { return hp > 50 ? C.ok : hp > 25 ? '#ff9500' : '#ff3b30'; }

function panel(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = C.panel;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = C.line;
  g.lineWidth = 4;
  g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = C.accent;
  g.fillRect(0, 0, w, 6);
}

function text(g, s, x, y, size, color, align, weight, maxW) {
  g.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  g.fillStyle = color || C.text;
  g.textAlign = align || 'left';
  g.textBaseline = 'alphabetic';
  if (maxW) g.fillText(String(s), x, y, maxW); else g.fillText(String(s), x, y);
}

/**
 * Bepaal of het grote (banner)paneel iets te tonen heeft.
 */
export function bannerHasContent(st) {
  if (!st) return false;
  return !!(st.mode === 'lobby' || st.mode === 'menu' || st.matchEnd || (st.banner && (st.banner[0] || st.banner[1])) ||
    st.kill || st.spectate || st.takeover || st.toast);
}

// Sleutel om alleen opnieuw te tekenen als er iets veranderd is.
export function hudKey(st, layout) {
  if (!st) return layout + ':none';
  if (layout === 'wrist') {
    return 'w|' + [Math.round(st.hp || 0), st.alive, st.level, st.target, st.protect ? 1 : 0, (st.feed || []).join('/')].join('|');
  }
  return 'b|' + JSON.stringify([st.mode, st.banner, st.kill, st.spectate, st.takeover, st.toast, st.matchEnd, st.lobby, st.lang]);
}

/**
 * Teken een HUD-paneel. g = CanvasRenderingContext2D (of mock), st = toestand, layout = 'wrist' | 'banner'.
 * st: { lang, mode: 'game'|'lobby'|'menu', hp, alive, level, target, protect, feed[], banner: [main, sub],
 *       kill, spectate, takeover, toast, matchEnd: { tag, title, rows: [[place, name, wins, kills]], back },
 *       lobby: { code, players: [], host: boolean, msg } }
 */
export function drawHud(g, st, layout) {
  const lang = (st && st.lang) || 'en';
  if (layout === 'wrist') {
    const W = WRIST_W, H = WRIST_H;
    panel(g, W, H);
    const hp = Math.max(0, Math.min(100, Math.round((st && st.hp) || 0)));
    text(g, vrText(lang, 'hp'), 24, 66, 34, C.muted, 'left', 600);
    text(g, String(hp), 488, 70, 64, hpColor(hp), 'right', 800);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(24, 86, W - 48, 26);
    g.fillStyle = hpColor(hp);
    g.fillRect(28, 90, (W - 56) * hp / 100, 18);
    text(g, (st && st.alive) || '', 24, 152, 34, C.text, 'left', 700, 220);
    text(g, (st && st.target) || '', 488, 152, 30, C.accent, 'right', 700, 230);
    text(g, (st && st.level) || '', 24, 192, 28, C.muted, 'left', 600, W - 48);
    if (st && st.protect) text(g, vrText(lang, 'protected'), 488, 192, 28, C.blue, 'right', 800);
    const feed = ((st && st.feed) || []).slice(-1);
    if (feed.length) text(g, feed[0], 24, 236, 26, C.text, 'left', 500, W - 48);
    return;
  }

  const W = BANNER_W, H = BANNER_H;
  g.clearRect(0, 0, W, H);
  if (!bannerHasContent(st)) return;
  panel(g, W, H);

  if (st.mode === 'menu') {
    text(g, st.menuMsg || vrText(lang, 'menu'), W / 2, H / 2, 44, C.text, 'center', 700, W - 80);
    return;
  }

  if (st.mode === 'lobby') {
    const lb = st.lobby || {};
    text(g, vrText(lang, 'lobby'), 40, 80, 64, C.text, 'left', 800);
    text(g, vrText(lang, 'code') + ' ' + (lb.code || ''), W - 40, 80, 64, C.accent, 'right', 800);
    const pl = (lb.players || []).slice(0, 8);
    pl.forEach((name, i) => {
      const col = i < 4 ? 0 : 1, row = i % 4;
      text(g, name, 60 + col * 480, 160 + row * 56, 40, C.text, 'left', 600, 440);
    });
    text(g, lb.host ? vrText(lang, 'startA') : vrText(lang, 'waitHost'), W / 2, 420, 48, lb.host ? C.accent : C.muted, 'center', 800);
    text(g, vrText(lang, 'help'), W / 2, 480, 28, C.muted, 'center', 500, W - 60);
    return;
  }

  if (st.matchEnd) {
    const me = st.matchEnd;
    text(g, me.tag || '', W / 2, 62, 34, C.muted, 'center', 600);
    text(g, me.title || '', W / 2, 128, 68, C.accent, 'center', 800, W - 60);
    (me.rows || []).slice(0, 5).forEach((r, i) => {
      const y = 196 + i * 50;
      text(g, r[0], 90, y, 38, C.muted, 'right', 700);
      text(g, r[1], 120, y, 38, C.text, 'left', 700, 560);
      text(g, r[2], 780, y, 38, C.text, 'right', 700);
      text(g, r[3], 930, y, 38, C.muted, 'right', 600);
    });
    text(g, me.back || '', W / 2, 480, 30, C.muted, 'center', 500);
    return;
  }

  let y = 40;
  const main = st.banner && st.banner[0];
  const sub = st.banner && st.banner[1];
  if (main) {
    const big = String(main).length <= 4 ? 170 : 72;   // aftellen / "GO!" groot
    y += big;
    text(g, main, W / 2, y, big, C.text, 'center', 800, W - 60);
  }
  if (sub) {
    for (const line of String(sub).split('\n').slice(0, 3)) {
      y += 46;
      text(g, line, W / 2, y, 36, C.muted, 'center', 600, W - 60);
    }
  }
  if (st.kill) {
    y += 64;
    text(g, vrText(lang, 'eliminated') + ' · ' + st.kill, W / 2, y, 48, C.danger, 'center', 800, W - 60);
  }
  if (st.spectate) {
    y += 60;
    text(g, st.spectate, W / 2, y, 44, C.text, 'center', 600, W - 60);
  }
  if (st.takeover) {
    y += 84;
    g.fillStyle = C.accent;
    g.fillRect(60, y - 58, W - 120, 78);
    text(g, vrText(lang, 'takeA') + ' ' + st.takeover, W / 2, y - 2, 52, '#14110a', 'center', 800, W - 160);
  }
  if (st.toast) {
    text(g, st.toast, W / 2, H - 30, 34, C.blue, 'center', 700, W - 60);
  }
}
