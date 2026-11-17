/* ============================================================
 * [FPS] Eerste-persoonscamera - pure hulpfuncties zonder Three.js/DOM.
 * Gebruikt door public/fps.js en getest met `node tools/test_fps.mjs`.
 *
 * Viewmodel-ruimte = camera-ruimte: +X rechts, +Y omhoog, -Z vooruit (de kijkrichting).
 * Een pose is de plek van de pistoolgreep van het wapen t.o.v. het oog (m) plus een
 * kleine draaiing (rad): rx = loop omhoog, ry = loop naar links (naar het midden), rz = kantelen.
 * ============================================================ */

// ------------------------------------------------------------ teksten (worden aan I18N van game.js toegevoegd)

export const FPS_TEXT = {
  nl: {
    camMode: 'Camera', camThird: 'Derde persoon', camFirst: 'Eerste persoon',
    cCamera: 'Camera: eerste / derde persoon', tCamera: 'Camera wisselen (eerste / derde persoon)',
    camBtn: 'Camera wisselen',
  },
  en: {
    camMode: 'Camera', camThird: 'Third person', camFirst: 'First person',
    cCamera: 'Camera: first / third person', tCamera: 'Switch camera (first / third person)',
    camBtn: 'Switch camera',
  },
};

// ------------------------------------------------------------ camerastand

export const MODES = ['third', 'first'];
export function parseMode(v) { return v === 'first' ? 'first' : 'third'; }   // onbekend -> derde persoon (standaard)
export function nextMode(v) { return parseMode(v) === 'first' ? 'third' : 'first'; }

// Eerste persoon alleen voor de eigen, levende speler en nooit in VR (VR is zelf al eerste persoon).
// Uitgeschakeld/meekijken -> de bestaande derde-persoons-meekijkcamera.
export function wantFirstPerson(o) {
  return !!o && parseMode(o.mode) === 'first' && !o.vr && !!o.me && !!o.me.alive && o.focus === o.me;
}

// Ooghoogte boven de voeten (zelfde regel als de derde-persoonscamera: op een ladder sta je).
export function eyeHeight(EYE, stance, onLadder, alive) {
  return EYE[alive && !onLadder ? stance : 0] || EYE[0];
}

// Treden (kist op, randje af) geven in Ã©Ã©n frame een sprong in y. In eerste persoon zie je dat als
// een schok; daarom schuift de camera die sprong zacht bij. Springen/vallen/klimmen volgt y exact.
// state = { lastY, lastGround, off } -> geeft de nieuwe state terug.
export const STEP_SNAP = 0.08;     // m per frame: groter dan dit op de grond = trede
export function stepSmooth(state, y, ground, dt) {
  const s = state && Number.isFinite(state.lastY) ? state : { lastY: y, lastGround: ground, off: 0 };
  let off = s.off || 0;
  const dy = y - s.lastY;
  if (ground && s.lastGround && Math.abs(dy) > STEP_SNAP && Math.abs(dy) < 1.5) off -= dy;
  else if (Math.abs(dy) >= 1.5) off = 0;               // teleport (nieuwe ronde, bot overnemen)
  off *= Math.exp(-Math.max(0, dt) * 14);
  if (Math.abs(off) < 1e-4) off = 0;
  return { lastY: y, lastGround: !!ground, off };
}

// ------------------------------------------------------------ viewmodel-poses

// Heuppositie per wapen (greep t.o.v. het oog).
export const HIP = {
  rifle: { x: 0.19, y: -0.235, z: -0.42, rx: 0.02, ry: 0.05, rz: -0.02 },
  shotgun: { x: 0.19, y: -0.235, z: -0.42, rx: 0.02, ry: 0.05, rz: -0.02 },
  smg: { x: 0.18, y: -0.215, z: -0.38, rx: 0.02, ry: 0.05, rz: -0.03 },
  lmg: { x: 0.2, y: -0.255, z: -0.42, rx: 0.03, ry: 0.05, rz: -0.02 },
  dmr: { x: 0.19, y: -0.24, z: -0.44, rx: 0.02, ry: 0.045, rz: -0.02 },
  sniper: { x: 0.19, y: -0.245, z: -0.44, rx: 0.02, ry: 0.045, rz: -0.02 },
};
// Richten door het vizier (alleen wapens met zoom): gecentreerd, de kijker net onder het kruisje.
export const ADS = {
  dmr: { x: 0, y: -0.2, z: -0.34, rx: 0, ry: 0, rz: 0 },
  sniper: { x: 0, y: -0.21, z: -0.34, rx: 0, ry: 0, rz: 0 },
};
// Kleine verschuiving per houding (gehurkt / liggend) en op de ladder (geweer omlaag).
export const STANCE_OFF = [
  { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
  { x: -0.005, y: -0.008, z: 0.005, rx: 0, ry: 0, rz: 0.03 },
  { x: -0.02, y: 0.012, z: 0.03, rx: -0.02, ry: 0.01, rz: 0.07 },
];
export const LADDER_OFF = { x: 0.03, y: -0.3, z: 0.14, rx: -0.95, ry: 0.15, rz: 0.2 };
// Kleine landscape-schermen (telefoon): iets kleiner en meer naar het midden, zodat het wapen
// niet helemaal onder de duimknoppen rechtsonder verdwijnt.
export const COMPACT = { dx: -0.025, dy: 0.012, scale: 0.88 };
export const VM_FOV = 55;           // vaste FOV van het viewmodel (los van gezichtsveld/zoom)
export const VM_FOV_COMPACT = 60;

const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
export function addPose(a, b, k) {
  const m = k === undefined ? 1 : k;
  const o = {};
  for (const key of KEYS) o[key] = (a[key] || 0) + (b[key] || 0) * m;
  return o;
}
export function lerpPose(a, b, k) {
  const t = Math.max(0, Math.min(1, k));
  const o = {};
  for (const key of KEYS) o[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * t;
  return o;
}

// opts: { stanceK: [c, p] (0..1, zacht), ladder: 0..1, ads: 0..1, compact: bool }
export function viewmodelPose(weaponId, opts) {
  const o = opts || {};
  let p = { ...(HIP[weaponId] || HIP.rifle) };
  const sk = o.stanceK || [0, 0];
  p = addPose(p, STANCE_OFF[1], sk[0] || 0);
  p = addPose(p, STANCE_OFF[2], sk[1] || 0);
  if (o.compact) { p.x += COMPACT.dx; p.y += COMPACT.dy; }
  const ads = ADS[weaponId];
  if (ads && o.ads > 0) p = lerpPose(p, ads, o.ads);
  if (o.ladder > 0) p = addPose(p, LADDER_OFF, Math.min(1, o.ladder));
  p.scale = o.compact ? COMPACT.scale : 1;
  return p;
}

// ------------------------------------------------------------ lopen (bob), naslingeren (sway), terugslag

export const BOB_RATE = 1.25;      // rad per gelopen meter (~1.4 stappenparen per seconde bij 7 m/s)
export const BOB_STANCE = [1, 0.7, 0.45];
export function advanceBob(phase, speed, dt) {
  const p = phase + Math.max(0, speed) * Math.max(0, dt) * BOB_RATE;
  return p > 1e4 ? p % (Math.PI * 2) : p;
}
export function bobAmp(speed, stance, air, zoomK) {
  if (air) return 0;
  const s = Math.max(0, Math.min(1, speed / 7));
  return s * (BOB_STANCE[stance] || 1) * (1 - 0.85 * Math.max(0, Math.min(1, zoomK || 0)));
}
// Mild: hooguit ~1 cm opzij en ~1.4 cm op en neer.
export function bobOffset(phase, amp) {
  const a = Math.max(0, amp);
  return {
    x: Math.sin(phase) * 0.011 * a,
    y: (0.007 - Math.abs(Math.cos(phase)) * 0.014) * a,
    rz: Math.sin(phase) * 0.012 * a,
  };
}

// Draaien laat het wapen iets achterblijven (links draaien -> wapen naar rechts).
export const SWAY_MAX = { x: 0.025, y: 0.02 };
export function swayTarget(dYaw, dPitch, dt) {
  const k = 1 / Math.max(dt, 1e-3);
  const cl = (v, m) => Math.max(-m, Math.min(m, v));
  return { x: cl(dYaw * k * 0.006, SWAY_MAX.x), y: cl(-dPitch * k * 0.006, SWAY_MAX.y) };
}

export const RECOIL = { rifle: 0.35, shotgun: 1.0, smg: 0.22, lmg: 0.3, dmr: 0.7, sniper: 1.0 };
export const RECOIL_MAX = 1.6;
export function kickRecoil(r, weaponId) { return Math.min(RECOIL_MAX, (r || 0) + (RECOIL[weaponId] || 0.35)); }
export function decayRecoil(r, dt) { const v = (r || 0) * Math.exp(-Math.max(0, dt) * 14); return v < 1e-4 ? 0 : v; }
// Terugslag: wapen naar achteren en de loop omhoog.
export function recoilOffset(r) { return { z: 0.045 * r, y: 0.008 * r, rx: 0.07 * r }; }

// ------------------------------------------------------------ handen

// Steunpunt voor de linkerhand (voorhout/pomp/voorgreep) in geweer-coÃ¶rdinaten [x, y, z];
// dezelfde waarden als SUPPORT_GRIPS in vr-core.js (test_fps.mjs controleert dat).
export const SUPPORT_GRIPS = {
  rifle: [0, 0.06, 0.40],
  shotgun: [0, 0.038, 0.385],
  smg: [0, -0.03, 0.29],
  lmg: [0, 0.02, 0.36],
  dmr: [0, 0.065, 0.36],
  sniper: [0, 0.035, 0.32],
};
// Geweer-coÃ¶rdinaten (loop langs +Z, +X = links) -> viewmodel-ruimte (loop langs -Z, +X = rechts).
export function gunToView(p) { return { x: -p[0], y: p[1], z: -p[2] }; }
export function supportHandView(weaponId) { return gunToView(SUPPORT_GRIPS[weaponId] || SUPPORT_GRIPS.rifle); }
