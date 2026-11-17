/* ============================================================
 * VR-menu (fase VR2) - pure functies zonder Three.js/DOM:
 * teksten, opbouw (layout) van het menupaneel, tekenen op een canvas, raak-test van de
 * laser, plaatsing voor het hoofd en het toepassen van een keuze op de VR-instellingen.
 * Gebruikt door public/vr-menu.js en getest met `node tools/test_vr.mjs`.
 * ============================================================ */

import {
  sanitizeVrSettings, SNAP_CHOICES, SMOOTH_STEP, HEIGHT_STEP, SMOOTH_MIN, SMOOTH_MAX, HEIGHT_MIN, HEIGHT_MAX,
} from './vr-core.js';

// ------------------------------------------------------------ teksten (NL/EN)

export const MENU_TEXT = {
  nl: {
    title: 'TACTISCH MENU', running: 'Het spel loopt door - je bent niet beschermd',
    tabComfort: 'COMFORT', tabWeapon: 'WAPEN', tabGfx: 'BEELD & GELUID', tabHelp: 'BESTURING',
    turning: 'Draaien', snap: 'Stapjes', smooth: 'Vloeiend', snapAngle: 'Stapgrootte', smoothSpeed: 'Draaisnelheid',
    vignette: 'Comfort-vignet', on: 'Aan', off: 'Uit', seated: 'Zittend spelen', height: 'Hoogte',
    hand: 'Schiethand', left: 'Links', right: 'Rechts', grip: 'Twee handen',
    gripHold: 'Vasthouden', gripToggle: 'Aan/uit', gripOff: 'Uit',
    gripHelp: [
      'Pak met je andere hand de voorkant van het geweer en knijp',
      'de grip-knop in: de loop wijst dan van hand naar hand.',
      'Vasthouden = zolang je knijpt · Aan/uit = knijp om te pakken/los te laten.',
      'Twee handen = iets stabieler en preciezer (sniper: als door de kijker).',
    ],
    quality: 'Graphics', qLow: 'Laag', qMedium: 'Middel', qHigh: 'Hoog', qAuto: 'Auto', qNow: 'Auto past zich aan. Nu: {q}.',
    volume: 'Volume', language: 'Taal',
    resume: 'VERDER', exitVr: 'VR VERLATEN', leave: 'SPEL VERLATEN',
    confirmTitle: 'Spel verlaten?', confirmSub: 'Je gaat terug naar het hoofdmenu.', confirmYes: 'JA, VERLATEN', confirmNo: 'ANNULEREN',
    hLeftStick: 'Linkerstick', hRightStick: 'Rechterstick', hTrigger: 'Trekker', hTriggerR: 'Rechtertrekker', hTriggerL: 'Linkertrekker',
    hGrip: 'Grip andere hand', hMove: 'Lopen (kijkrichting)', hTurn: 'Draaien', hFire: 'Vuren (richten met het geweer)',
    hTwo: 'Geweer met twee handen (bij het voorhout)', hA: 'Start (host) / bot overnemen', hB: 'Draaien: stapjes / vloeiend',
    hYShort: 'Y kort', hYLong: 'Y lang / pols-MENU', hVig: 'Comfort-vignet aan/uit', hMenu: 'Dit menu openen/sluiten',
    hMeta: 'Meta-knop', hExit: 'VR verlaten', hClick: 'Menu: richten + trekker (beide handen)',
  },
  en: {
    title: 'TACTICAL MENU', running: 'The game keeps running - you are not protected',
    tabComfort: 'COMFORT', tabWeapon: 'WEAPON', tabGfx: 'GRAPHICS & AUDIO', tabHelp: 'CONTROLS',
    turning: 'Turning', snap: 'Snap', smooth: 'Smooth', snapAngle: 'Snap angle', smoothSpeed: 'Turn speed',
    vignette: 'Comfort vignette', on: 'On', off: 'Off', seated: 'Seated mode', height: 'Height',
    hand: 'Shooting hand', left: 'Left', right: 'Right', grip: 'Two hands',
    gripHold: 'Hold grip', gripToggle: 'Toggle', gripOff: 'Off',
    gripHelp: [
      'Grab the front of the gun with your other hand and squeeze',
      'the grip button: the barrel then points from hand to hand.',
      'Hold grip = while squeezing · Toggle = squeeze to grab/release.',
      'Two hands = slightly steadier and more accurate (sniper: like scoped).',
    ],
    quality: 'Graphics', qLow: 'Low', qMedium: 'Medium', qHigh: 'High', qAuto: 'Auto', qNow: 'Auto adapts. Now: {q}.',
    volume: 'Volume', language: 'Language',
    resume: 'RESUME', exitVr: 'EXIT VR', leave: 'LEAVE GAME',
    confirmTitle: 'Leave the game?', confirmSub: 'You go back to the main menu.', confirmYes: 'YES, LEAVE', confirmNo: 'CANCEL',
    hLeftStick: 'Left stick', hRightStick: 'Right stick', hTrigger: 'Trigger', hTriggerR: 'Right trigger', hTriggerL: 'Left trigger',
    hGrip: 'Grip other hand', hMove: 'Move (where you look)', hTurn: 'Turn', hFire: 'Fire (aim with the gun)',
    hTwo: 'Two-handed grip (at the handguard)', hA: 'Start (host) / take over a bot', hB: 'Turning: snap / smooth',
    hYShort: 'Y short', hYLong: 'Hold Y / wrist MENU', hVig: 'Comfort vignette on/off', hMenu: 'Open/close this menu',
    hMeta: 'Meta button', hExit: 'Exit VR', hClick: 'Menu: point + trigger (either hand)',
  },
};

export function menuText(lang, key, vars) {
  let s = (MENU_TEXT[lang] && MENU_TEXT[lang][key]) || MENU_TEXT.en[key] || key;
  if (vars && typeof s === 'string') for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

// ------------------------------------------------------------ opbouw

export const MENU_W = 1024, MENU_H = 1024;     // canvas (px)
export const MENU_M = 0.9;                       // breedte/hoogte van het paneel in de wereld (m)
export const TABS = ['comfort', 'weapon', 'gfx', 'help'];
const TAB_KEY = { comfort: 'tabComfort', weapon: 'tabWeapon', gfx: 'tabGfx', help: 'tabHelp' };
const QUALITIES = ['low', 'medium', 'high', 'auto'];
const Q_KEY = { low: 'qLow', medium: 'qMedium', high: 'qHigh', auto: 'qAuto' };

const C = {
  panel: 'rgba(12,16,13,0.92)', line: 'rgba(196,202,170,0.45)', text: '#ecebe2', muted: '#a3a592',
  accent: '#ff9a1f', accentDark: '#14110a', btn: 'rgba(48,56,44,0.95)', btnHover: 'rgba(92,104,74,0.98)',
  danger: '#ff5a46', ok: '#4cd964',
};
export const MENU_COLORS = C;

/**
 * Bouw het menu op. view: { lang, tab, confirm, vr (VR-instellingen), quality, effectiveQuality, volume }.
 * Geeft { items, texts }: items met { id, kind, x, y, w, h, label, active, primary, danger, action },
 * texts met { s, x, y, size, color, align, weight, maxW }.
 */
export function buildMenu(view) {
  const v = view || {};
  const lang = v.lang || 'en';
  const T = (k, vars) => menuText(lang, k, vars);
  const vr = sanitizeVrSettings(v.vr);
  const items = [], texts = [];
  const txt = (s, x, y, size, color, align, weight, maxW) => texts.push({ s: String(s), x, y, size, color: color || C.text, align: align || 'left', weight: weight || 700, maxW });

  texts.push({ s: T('title'), x: 40, y: 72, size: 60, color: C.accent, align: 'left', weight: 800 });
  txt(T('running'), MENU_W - 40, 66, 26, C.muted, 'right', 600, 520);

  if (v.confirm) {
    txt(T('confirmTitle'), MENU_W / 2, 400, 76, C.text, 'center', 800, MENU_W - 80);
    txt(T('confirmSub'), MENU_W / 2, 470, 36, C.muted, 'center', 600, MENU_W - 80);
    items.push({ id: 'confirm:yes', kind: 'btn', x: 120, y: 560, w: 360, h: 120, label: T('confirmYes'), danger: true, action: { type: 'confirmLeave' } });
    items.push({ id: 'confirm:no', kind: 'btn', x: 544, y: 560, w: 360, h: 120, label: T('confirmNo'), primary: true, action: { type: 'cancel' } });
    return { items, texts };
  }

  const tab = TABS.includes(v.tab) ? v.tab : 'comfort';
  TABS.forEach((id, i) => {
    items.push({ id: 'tab:' + id, kind: 'tab', x: 24 + i * 246, y: 112, w: 238, h: 84, label: T(TAB_KEY[id]), active: id === tab, action: { type: 'tab', tab: id } });
  });

  // rij met label links en bediening rechts
  const RX = 452, RW = MENU_W - 40 - RX;
  let row = 0;
  const rowY = () => 222 + row * 98;
  const seg = (key, label, options, current, make) => {
    const y = rowY();
    txt(label, 40, y + 58, 40, C.text, 'left', 700, RX - 60);
    const gap = 10, w = (RW - gap * (options.length - 1)) / options.length;
    options.forEach(([val, lab], i) => {
      items.push({ id: key + ':' + val, kind: 'seg', x: RX + i * (w + gap), y, w, h: 86, label: lab, active: val === current, action: make(val) });
    });
    row++;
  };
  const step = (key, label, valueText, actMinus, actPlus, slider) => {
    const y = rowY();
    txt(label, 40, y + 58, 40, C.text, 'left', 700, RX - 60);
    items.push({ id: key + ':-', kind: 'btn', x: RX, y, w: 96, h: 86, label: '−', action: actMinus });
    items.push({ id: key + ':+', kind: 'btn', x: RX + RW - 96, y, w: 96, h: 86, label: '+', action: actPlus });
    if (slider) {
      items.push({ id: key + ':bar', kind: 'slider', x: RX + 110, y: y + 8, w: RW - 220, h: 70, label: valueText,
        min: slider.min, max: slider.max, step: slider.step, value: slider.value, action: { type: slider.type } });
    } else {
      txt(valueText, RX + RW / 2, y + 60, 44, C.accent, 'center', 800);
    }
    row++;
  };

  if (tab === 'comfort') {
    seg('vr:snap', T('turning'), [[true, T('snap')], [false, T('smooth')]], vr.snap, (val) => ({ type: 'vr', key: 'snap', value: val }));
    seg('vr:snapDeg', T('snapAngle'), SNAP_CHOICES.map((d) => [d, d + '°']), vr.snapDeg, (val) => ({ type: 'vr', key: 'snapDeg', value: val }));
    step('vr:smoothDeg', T('smoothSpeed'), vr.smoothDeg + '°/s',
      { type: 'vrStep', key: 'smoothDeg', delta: -SMOOTH_STEP }, { type: 'vrStep', key: 'smoothDeg', delta: SMOOTH_STEP });
    seg('vr:vignette', T('vignette'), [[true, T('on')], [false, T('off')]], vr.vignette, (val) => ({ type: 'vr', key: 'vignette', value: val }));
    seg('vr:seated', T('seated'), [[true, T('on')], [false, T('off')]], vr.seated, (val) => ({ type: 'vr', key: 'seated', value: val }));
    step('vr:heightCm', T('height'), (vr.heightCm > 0 ? '+' : '') + vr.heightCm + ' cm',
      { type: 'vrStep', key: 'heightCm', delta: -HEIGHT_STEP }, { type: 'vrStep', key: 'heightCm', delta: HEIGHT_STEP });
  } else if (tab === 'weapon') {
    seg('vr:hand', T('hand'), [['left', T('left')], ['right', T('right')]], vr.hand, (val) => ({ type: 'vr', key: 'hand', value: val }));
    seg('vr:grip', T('grip'), [['hold', T('gripHold')], ['toggle', T('gripToggle')], ['off', T('gripOff')]], vr.grip, (val) => ({ type: 'vr', key: 'grip', value: val }));
    const lines = menuText(lang, 'gripHelp');
    (Array.isArray(lines) ? lines : []).forEach((s, i) => txt(s, 40, 470 + i * 56, 34, i === 3 ? C.accent : C.muted, 'left', 600, MENU_W - 80));
  } else if (tab === 'gfx') {
    seg('quality', T('quality'), QUALITIES.map((q) => [q, T(Q_KEY[q])]), v.quality || 'auto', (val) => ({ type: 'quality', value: val }));
    if ((v.quality || 'auto') === 'auto') txt(T('qNow', { q: T(Q_KEY[v.effectiveQuality] || 'qHigh') }), RX, rowY() + 30, 30, C.muted, 'left', 600, RW);
    row += 0.5;
    const vol = Math.max(0, Math.min(100, Math.round(Number(v.volume) || 0)));
    step('volume', T('volume'), vol + '%', { type: 'volStep', delta: -10 }, { type: 'volStep', delta: 10 },
      { min: 0, max: 100, step: 5, value: vol, type: 'volume' });
    seg('lang', T('language'), [['nl', 'NL'], ['en', 'EN']], lang, (val) => ({ type: 'lang', value: val }));
  } else {
    const lefty = vr.hand === 'left';
    const rows = [
      [T(lefty ? 'hRightStick' : 'hLeftStick'), T('hMove')],
      [T(lefty ? 'hLeftStick' : 'hRightStick'), T('hTurn')],
      [T(lefty ? 'hTriggerL' : 'hTriggerR'), T('hFire')],
      [T('hGrip'), T('hTwo')],
      ['A', T('hA')],
      ['B', T('hB')],
      [T('hYShort'), T('hVig')],
      [T('hYLong'), T('hMenu')],
      [T('hMeta'), T('hExit')],
    ];
    rows.forEach(([k, a], i) => {
      const y = 262 + i * 62;
      txt(k, 40, y, 34, C.accent, 'left', 800, 330);
      txt(a, 390, y, 34, C.text, 'left', 600, MENU_W - 430);
    });
    txt(T('hClick'), MENU_W / 2, 262 + rows.length * 62 + 8, 28, C.muted, 'center', 600, MENU_W - 80);
  }

  // onderbalk
  items.push({ id: 'act:resume', kind: 'btn', x: 24, y: 868, w: 312, h: 120, label: T('resume'), primary: true, action: { type: 'resume' } });
  items.push({ id: 'act:exitvr', kind: 'btn', x: 356, y: 868, w: 312, h: 120, label: T('exitVr'), action: { type: 'exitvr' } });
  items.push({ id: 'act:leave', kind: 'btn', x: 688, y: 868, w: 312, h: 120, label: T('leave'), danger: true, action: { type: 'leave' } });
  return { items, texts };
}

// Sleutel om alleen opnieuw te tekenen als er iets veranderd is.
export function menuKey(view, hover) {
  const h = hover ? [...hover].sort().join(',') : '';
  return JSON.stringify([view && view.lang, view && view.tab, view && view.confirm, view && view.vr, view && view.quality,
    view && view.effectiveQuality, view && view.volume, h]);
}

// ------------------------------------------------------------ raak-test

// Het item (met actie) onder canvas-punt (px, py), of null.
export function hitTest(menu, px, py) {
  if (!menu || !Number.isFinite(px) || !Number.isFinite(py)) return null;
  for (let i = menu.items.length - 1; i >= 0; i--) {
    const it = menu.items[i];
    if (it.action && px >= it.x && px <= it.x + it.w && py >= it.y && py <= it.y + it.h) return it;
  }
  return null;
}

// Waarde van een schuifbalk op canvas-x px (afgerond op item.step, begrensd).
export function sliderValueAt(item, px) {
  const f = Math.max(0, Math.min(1, (px - item.x) / Math.max(1, item.w)));
  const raw = item.min + f * (item.max - item.min);
  const st = item.step || 1;
  return Math.max(item.min, Math.min(item.max, Math.round(raw / st) * st));
}

/**
 * Snijpunt van een straal met een rechthoekig paneel.
 * o/d: oorsprong en (genormaliseerde) richting; center/normal/right/up: paneel in dezelfde ruimte
 * (right/up genormaliseerd), halfW/halfH in meters. Alleen de voorkant (normal wijst naar de straal).
 * Geeft { t, u, v } (u 0..1 links->rechts, v 0..1 boven->onder) of null.
 */
export function rayPanelHit(o, d, center, normal, right, up, halfW, halfH, maxT = 10) {
  const den = d.x * normal.x + d.y * normal.y + d.z * normal.z;
  if (den > -1e-6) return null;                                    // evenwijdig of achterkant
  const t = ((center.x - o.x) * normal.x + (center.y - o.y) * normal.y + (center.z - o.z) * normal.z) / den;
  if (!(t > 0) || t > maxT) return null;
  const px = o.x + d.x * t - center.x, py = o.y + d.y * t - center.y, pz = o.z + d.z * t - center.z;
  const lx = px * right.x + py * right.y + pz * right.z;
  const ly = px * up.x + py * up.y + pz * up.z;
  if (Math.abs(lx) > halfW || Math.abs(ly) > halfH) return null;
  return { t, u: (lx + halfW) / (2 * halfW), v: (halfH - ly) / (2 * halfH) };
}

/**
 * Plek van het menu (in de rig, zelfde ruimte als headLocal): dist m voor je in de kijkrichting
 * (yaw in game.js-conventie: vooruit = (sin, cos)), drop m onder ooghoogte (borsthoogte), minimaal minY.
 */
export function menuPlacement(headLocal, headYaw, dist = 1.0, drop = 0.3, minY = 0.5) {
  return {
    x: headLocal.x + Math.sin(headYaw) * dist,
    y: Math.max(minY, headLocal.y - drop),
    z: headLocal.z + Math.cos(headYaw) * dist,
  };
}

// ------------------------------------------------------------ keuzes toepassen

/**
 * Pas een menu-actie toe op de VR-instellingen. Geeft nieuwe (gecontroleerde) instellingen,
 * of null als de actie niet over VR-instellingen gaat.
 */
export function applyVrAction(vr, action) {
  if (!action) return null;
  const cur = sanitizeVrSettings(vr);
  if (action.type === 'vr') return sanitizeVrSettings({ ...cur, [action.key]: action.value });
  if (action.type === 'vrStep') {
    const lim = action.key === 'smoothDeg' ? [SMOOTH_MIN, SMOOTH_MAX] : action.key === 'heightCm' ? [HEIGHT_MIN, HEIGHT_MAX] : null;
    if (!lim) return cur;
    const n = Math.max(lim[0], Math.min(lim[1], (Number(cur[action.key]) || 0) + (Number(action.delta) || 0)));
    return sanitizeVrSettings({ ...cur, [action.key]: n });
  }
  return null;
}

export function stepVolume(vol, delta) {
  const v = Math.round((Number(vol) || 0) + (Number(delta) || 0));
  return Math.max(0, Math.min(100, v));
}

// ------------------------------------------------------------ tekenen

const FONT = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';

function fillText(g, t) {
  g.font = (t.weight || 700) + ' ' + t.size + 'px ' + FONT;
  g.fillStyle = t.color || C.text;
  g.textAlign = t.align || 'left';
  g.textBaseline = 'alphabetic';
  if (t.maxW) g.fillText(t.s, t.x, t.y, t.maxW); else g.fillText(t.s, t.x, t.y);
}

/**
 * Teken het menu op canvas-context g (of een mock). hover: Set met item-id's onder een laser.
 */
export function drawMenu(g, menu, hover) {
  const W = MENU_W, H = MENU_H;
  g.clearRect(0, 0, W, H);
  g.fillStyle = C.panel;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = C.line;
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
  g.fillStyle = C.accent;
  g.fillRect(0, 0, W, 8);
  g.fillRect(24, 96, W - 48, 3);
  // hoekjes (militaire stijl)
  g.fillRect(0, H - 8, 120, 8); g.fillRect(W - 120, H - 8, 120, 8);
  for (const t of menu.texts) fillText(g, t);
  for (const it of menu.items) {
    const hov = !!(hover && hover.has(it.id));
    if (it.kind === 'slider') {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(it.x, it.y + 22, it.w, 26);
      const f = (it.value - it.min) / Math.max(1e-9, it.max - it.min);
      g.fillStyle = C.accent;
      g.fillRect(it.x + 3, it.y + 25, Math.max(0, (it.w - 6) * f), 20);
      g.fillStyle = hov ? '#ffffff' : C.text;
      g.fillRect(it.x + 3 + (it.w - 6) * f - 6, it.y + 6, 12, 58);
      fillText(g, { s: it.label, x: it.x + it.w / 2, y: it.y + it.h + 12, size: 26, color: C.muted, align: 'center', weight: 700 });
      continue;
    }
    const on = it.active || it.primary;
    g.fillStyle = on ? C.accent : hov ? C.btnHover : C.btn;
    if (on && hov) g.fillStyle = '#ffb455';
    g.fillRect(it.x, it.y, it.w, it.h);
    g.strokeStyle = hov ? '#ffffff' : it.danger ? C.danger : C.line;
    g.lineWidth = hov ? 6 : 3;
    g.strokeRect(it.x + 1.5, it.y + 1.5, it.w - 3, it.h - 3);
    const size = it.kind === 'tab' ? 34 : it.label.length <= 2 ? 60 : 38;
    fillText(g, {
      s: it.label, x: it.x + it.w / 2, y: it.y + it.h / 2 + size * 0.36, size,
      color: on ? C.accentDark : it.danger ? C.danger : C.text, align: 'center', weight: 800, maxW: it.w - 16,
    });
  }
}

// Kleine knop boven het polspaneel.
export const WBTN_W = 256, WBTN_H = 96;
export function drawWristButton(g, label, hover) {
  g.clearRect(0, 0, WBTN_W, WBTN_H);
  g.fillStyle = hover ? C.accent : 'rgba(14,18,15,0.88)';
  g.fillRect(0, 0, WBTN_W, WBTN_H);
  g.strokeStyle = hover ? '#ffffff' : C.accent;
  g.lineWidth = 6;
  g.strokeRect(3, 3, WBTN_W - 6, WBTN_H - 6);
  // ☰-icoon
  g.fillStyle = hover ? C.accentDark : C.accent;
  for (let i = 0; i < 3; i++) g.fillRect(24, 28 + i * 16, 40, 8);
  fillText(g, { s: label, x: 160, y: 66, size: 50, color: hover ? C.accentDark : C.text, align: 'center', weight: 800, maxW: 170 });
}
