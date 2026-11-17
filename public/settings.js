import * as THREE from 'three';

/* ============================================================
 * Arena Shooter - afwerking / pc-versie (fase 4)
 * Instellingen, pauzemenu, besturingshulp, laadscherm, volledig scherm,
 * automatische grafische kwaliteit, FPS-teller en kleine extra's
 * (voetstappen, hartslag + rode rand bij weinig HP, "klik om te richten").
 *
 * game.js roept alleen een paar haakjes aan (zoek in game.js op "[polish]"):
 *   init(api)              - eenmalig bij de start, vóór applyLang()
 *   attachAudio(actx)      - na het maken van de AudioContext (master-volume)
 *   lookMul('mouse'|'touch') - gevoeligheid + Y omkeren voor muis/touch-kijken
 *   isPaused()             - toetsenbord-invoer negeren tijdens het pauzemenu
 *   openPause()            - menuknop in de HUD
 *   fxCount(n)             - aantal deeltjes volgens de effectdichtheid
 *   onFrame(now, dt, me, mySpeed) - elke frame tijdens het spel
 * ============================================================ */

window.__ccBoot = true;   // het laadscherm in index.html weet zo dat de scripts draaien
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ teksten (NL/EN)

const STR = {
  nl: {
    menuSettings: 'Instellingen', menuControls: 'Besturing', fullscreen: 'Volledig scherm', exitFullscreen: 'Venster',
    pauseTag: 'Tactisch menu', paused: 'Pauze', pauseNote: 'Het spel loopt door voor de anderen - je bent niet beschermd.',
    resume: 'Verder spelen', leaveGame: 'Spel verlaten', back: 'Terug', reset: 'Standaard',
    secControls: 'Besturing', secDisplay: 'Beeld', secAudioLang: 'Geluid & taal', secLang: 'Taal',
    mouseSens: 'Muisgevoeligheid', touchSens: 'Touch-kijken', invertY: 'Y-as omkeren',
    fov: 'Gezichtsveld', quality: 'Graphics', showFps: 'FPS-teller', volume: 'Volume',
    qLow: 'Laag', qMedium: 'Middel', qHigh: 'Hoog', qAuto: 'Auto',
    qAutoNow: 'Auto past zich aan je apparaat aan. Nu: {q}.', qFixed: 'Lager = soepeler op oudere apparaten.',
    on: 'Aan', off: 'Uit',
    qualityDown: 'Graphics verlaagd naar {q} voor een soepeler spel',
    ctrlKb: 'Toetsenbord & muis', ctrlTouch: 'Telefoon & tablet',
    cMove: 'Lopen', cAim: 'Richten / kijken', cFire: 'Vuren', cTake: 'Bot overnemen (als je uit bent)',
    cDoor: 'Deur open / dicht (sta ervoor en kijk ernaar)', tDoorBtn: 'DEUR-knop', tDoor: 'Deur open / dicht - verschijnt als je bij een deur staat',
    cMenu: 'Pauzemenu', cLock: 'Klik in beeld om de muis te vangen',
    kArrows: 'of pijltjes', kMouse: 'Muis', kClick: 'Klik', kSpace: 'Spatie', kE: 'E',
    tLeft: 'Linkerduim', tRight: 'Rechterduim', tFireBtn: 'Rode knop', tTakeBtn: 'Knop', tMenuBtn: 'Menuknop',
    tMove: 'Lopen - de joystick verschijnt waar je drukt', tAim: 'Vegen om te kijken en te richten',
    tTake: '"Neem … over" als je uit bent', ctrlNote: 'Gevoeligheid en Y-as stel je in bij Instellingen.',
    cViewZoom: 'Scope: K inzoomen · L uitzoomen', cJump: 'Springen (op kisten, over de borstwering)', cCrouch: 'Hurken aan/uit', cProne: 'Liggen aan/uit',
    cLadder: 'Ladder op / af (naar de ladder toe lopen)',
    tStance: 'Springen, hurken en liggen (knoppen naast VUUR)', tLadder: 'Joystick naar de ladder = klimmen',
    cSlots: 'Wapen / mes / medkit kiezen (klik = schieten / steken / verbinden)', cQuick: 'Snelle messteek (van achteren = meteen uit)',
    cMedkit: 'Medkit gebruiken (+60 hp, 1 per ronde)', cFinish: 'Finisher (dichtbij een vijand met weinig hp of van achteren)',
    tSlots: 'Vakjes boven de levensbalk: wapen / mes / medkit', tFinishBtn: 'FINISH-knop', tFinish: 'Finisher - verschijnt dichtbij een zwakke vijand of van achteren',
    hintDesktop: 'Klik om te richten en te vuren · WASD lopen · Spatie springen · C hurken · Z liggen · Esc menu',
    hintTouch: 'Linkerduim = lopen · rechterduim = kijken · rode knop = vuur · SPRING/BUK/LIG · ☰ = menu',
    clickToAim: 'Klik om te richten',
    loading: 'Laden', loadingModels: 'Modellen laden… {p}%', loadReady: 'Klaar!',
    loadFallback: 'Niet alle modellen zijn geladen - we gebruiken eenvoudige vormen.',
    connLost: 'Verbinding verbroken. Controleer je internet en druk op Meedoen om terug te gaan naar spel {code}.',
    menuBtn: 'Menu',
  },
  en: {
    menuSettings: 'Settings', menuControls: 'Controls', fullscreen: 'Fullscreen', exitFullscreen: 'Windowed',
    pauseTag: 'Tactical menu', paused: 'Paused', pauseNote: 'The game keeps running for the others - you are not protected.',
    resume: 'Resume', leaveGame: 'Leave game', back: 'Back', reset: 'Defaults',
    secControls: 'Controls', secDisplay: 'Display', secAudioLang: 'Audio & language', secLang: 'Language',
    mouseSens: 'Mouse sensitivity', touchSens: 'Touch look', invertY: 'Invert Y axis',
    fov: 'Field of view', quality: 'Graphics', showFps: 'FPS counter', volume: 'Volume',
    qLow: 'Low', qMedium: 'Medium', qHigh: 'High', qAuto: 'Auto',
    qAutoNow: 'Auto adapts to your device. Now: {q}.', qFixed: 'Lower = smoother on older devices.',
    on: 'On', off: 'Off',
    qualityDown: 'Graphics lowered to {q} for smoother play',
    ctrlKb: 'Keyboard & mouse', ctrlTouch: 'Phone & tablet',
    cMove: 'Move', cAim: 'Aim / look', cFire: 'Fire', cTake: 'Take over a bot (when you are out)',
    cDoor: 'Open / close a door (stand at it and look at it)', tDoorBtn: 'DOOR button', tDoor: 'Open / close a door - appears when you stand at a door',
    cMenu: 'Pause menu', cLock: 'Click the screen to capture the mouse',
    kArrows: 'or arrows', kMouse: 'Mouse', kClick: 'Click', kSpace: 'Space', kE: 'E',
    tLeft: 'Left thumb', tRight: 'Right thumb', tFireBtn: 'Red button', tTakeBtn: 'Button', tMenuBtn: 'Menu button',
    tMove: 'Move - the joystick appears where you touch', tAim: 'Swipe to look and aim',
    tTake: '"Take over …" when you are out', ctrlNote: 'Set sensitivity and Y axis in Settings.',
    cViewZoom: 'Scope: K zoom in · L zoom out', cJump: 'Jump (onto crates, over the railing)', cCrouch: 'Crouch on/off', cProne: 'Prone on/off',
    cLadder: 'Ladder up / down (walk towards the ladder)',
    tStance: 'Jump, crouch and prone (buttons next to FIRE)', tLadder: 'Joystick towards the ladder = climb',
    cSlots: 'Choose weapon / knife / medkit (click = shoot / stab / heal)', cQuick: 'Quick knife stab (from behind = instant kill)',
    cMedkit: 'Use medkit (+60 hp, 1 per round)', cFinish: 'Finisher (close to an enemy with low hp or from behind)',
    tSlots: 'Slots above the health bar: weapon / knife / medkit', tFinishBtn: 'FINISH button', tFinish: 'Finisher - appears near a weak enemy or from behind',
    hintDesktop: 'Click to aim and fire · WASD move · Space jump · C crouch · Z prone · Esc menu',
    hintTouch: 'Left thumb = move · right thumb = look · red button = fire · JUMP/CROUCH/PRONE · ☰ = menu',
    clickToAim: 'Click to aim',
    loading: 'Loading', loadingModels: 'Loading models… {p}%', loadReady: 'Ready!',
    loadFallback: 'Not all models loaded - using simple shapes.',
    connLost: 'Connection lost. Check your internet and press Join to return to game {code}.',
    menuBtn: 'Menu',
  },
};

// ------------------------------------------------------------ instellingen (localStorage)

const KEY = 'cc_settings';
const QUALITIES = ['low', 'medium', 'high', 'auto'];
const DEFAULTS = { mouseSens: 1, touchSens: 1, invertY: false, fov: 70, quality: 'auto', volume: 100, showFps: false, camera: 'third' }; // [FPS] camera

function clampNum(v, lo, hi, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
}
function loadSettings() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
  o = o && typeof o === 'object' ? o : {};
  return {
    mouseSens: clampNum(o.mouseSens, 0.2, 3, DEFAULTS.mouseSens),
    touchSens: clampNum(o.touchSens, 0.2, 3, DEFAULTS.touchSens),
    invertY: o.invertY === true,
    fov: Math.round(clampNum(o.fov, 55, 100, DEFAULTS.fov)),
    quality: QUALITIES.includes(o.quality) ? o.quality : DEFAULTS.quality,
    volume: Math.round(clampNum(o.volume, 0, 100, DEFAULTS.volume)),
    showFps: o.showFps === true,
    camera: o.camera === 'first' ? 'first' : 'third',   // [FPS] 'third' (standaard) | 'first' - zie public/fps.js
    // [VR2] VR-instellingen (draaien, schiethand, twee handen, zittend...). Alleen bewaard; vr-core.js
    // sanitizeVrSettings controleert de inhoud. Pc-'Standaard' laat dit ongemoeid.
    vr: o.vr && typeof o.vr === 'object' && !Array.isArray(o.vr) ? o.vr : {},
  };
}
export const settings = loadSettings();
function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }
function flag(k) { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } }
function setFlag(k) { try { localStorage.setItem(k, '1'); } catch (e) { /* ignore */ } }

let api = null;
const tr = (k, vars) => (api ? api.t(k, vars) : ((STR.en[k] || k)));
const COARSE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const FINE = !!(window.matchMedia && window.matchMedia('(any-pointer: fine)').matches);
let touchUsed = COARSE;
const desktopMode = () => FINE && !touchUsed;

// ------------------------------------------------------------ laadscherm (vóór game.js start)
// GLTFLoader gebruikt standaard THREE.DefaultLoadingManager: daar lezen we de voortgang uit.

const loadState = { pct: 0, done: false };
{
  const mgr = THREE.DefaultLoadingManager;
  const prev = mgr.onProgress;
  mgr.onProgress = (url, loaded, total) => {
    if (prev) prev(url, loaded, total);
    if (total > 0) loadState.pct = Math.max(loadState.pct, Math.round((loaded / total) * 100));
    renderLoading();
  };
}
function renderLoading() {
  if (loadState.done) return;
  const fill = $('loadFill'), msg = $('loadMsg'), lab = $('loadLabel');
  if (fill) fill.style.transform = 'scaleX(' + (Math.max(4, loadState.pct) / 100).toFixed(3) + ')';
  if (api) {
    if (lab) lab.textContent = tr('loading');
    if (msg) msg.textContent = tr('loadingModels', { p: loadState.pct });
  }
}
function finishLoading() {
  if (loadState.done) return;
  const missing = api.modelNames ? api.modelNames.filter((n) => !api.models[n]) : [];
  loadState.pct = 100;
  renderLoading();
  loadState.done = true;
  const msg = $('loadMsg');
  if (msg) msg.textContent = missing.length ? tr('loadFallback') : tr('loadReady');
  setTimeout(() => {
    const el = $('loading');
    if (!el) return;
    el.classList.add('fade');
    setTimeout(() => el.classList.add('hidden'), 400);
    const ni = $('nameInput');
    if (ni && !COARSE && !ni.value) { try { ni.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }, missing.length ? 1800 : 250);
}

// ------------------------------------------------------------ geluid: master-volume, voetstappen, hartslag

const audio = { ctx: null, master: null, noise: null };
export function attachAudio(ctx) {
  if (!ctx || audio.ctx === ctx) return;
  audio.ctx = ctx;
  try {
    const g = ctx.createGain();
    g.connect(ctx.destination);
    audio.master = g;
    applyVolume();
    // Alle bestaande (en toekomstige) geluiden in game.js verbinden met actx.destination.
    // Door 'destination' op deze ene context naar de master-gain te laten wijzen
    // volgt elk geluid automatisch de volume-instelling.
    Object.defineProperty(ctx, 'destination', { value: g, configurable: true });
  } catch (e) { audio.master = null; }
}
function applyVolume() {
  if (!audio.master) return;
  const v = settings.volume / 100;
  audio.master.gain.value = v * v;     // kwadratisch voelt natuurlijker aan
}
function noiseBuffer() {
  if (!audio.noise) {
    const n = Math.floor(audio.ctx.sampleRate * 0.12);
    const b = audio.ctx.createBuffer(1, n, audio.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    audio.noise = b;
  }
  return audio.noise;
}
function footstep(vol) {
  const c = audio.ctx;
  if (!c || !audio.master || c.state !== 'running') return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 420 + Math.random() * 220;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(audio.master);
  src.start();
}
function heartbeat(vol) {
  const c = audio.ctx;
  if (!c || !audio.master || c.state !== 'running') return;
  const thump = (at, v) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.14);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    o.connect(g); g.connect(audio.master);
    o.start(at); o.stop(at + 0.2);
  };
  const t0 = c.currentTime + 0.01;
  thump(t0, vol);
  thump(t0 + 0.22, vol * 0.7);
}

// ------------------------------------------------------------ grafische kwaliteit

const QUALITY = {
  low: { pr: 1, shadows: false, map: 1024, fx: 0.34, flash: false },
  medium: { pr: 1.5, shadows: true, map: 1024, fx: 0.67, flash: true },
  high: { pr: 2, shadows: true, map: 2048, fx: 1, flash: true },
};
const LADDER = ['low', 'medium', 'high'];
let effective = 'high';     // het niveau dat nu echt gebruikt wordt
let lowScale = 1;           // Auto mag op 'laag' nog verder terug in pixeldichtheid
let fxDensity = 1;

function startQuality() {
  if (settings.quality !== 'auto') return settings.quality;
  return api && api.LOW ? 'medium' : 'high';
}
function markMaterialsDirty() {
  api.scene.traverse((o) => {
    if (!o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) m.needsUpdate = true;
  });
}
function applyQuality() {
  if (!api) return;
  const q = QUALITY[effective];
  const r = api.renderer;
  const dpr = window.devicePixelRatio || 1;
  let pr = Math.min(dpr, q.pr);
  if (effective === 'low') pr = Math.max(0.6, pr * lowScale);
  if (Math.abs(r.getPixelRatio() - pr) > 0.001) r.setPixelRatio(pr);
  let dirty = false;
  if (r.shadowMap.enabled !== q.shadows) { r.shadowMap.enabled = q.shadows; dirty = true; }
  const sh = api.sun && api.sun.shadow;
  if (sh && sh.mapSize.x !== q.map) {
    sh.mapSize.set(q.map, q.map);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
  if (api.flashLight && api.flashLight.visible !== q.flash) { api.flashLight.visible = q.flash; dirty = true; }
  if (dirty) markMaterialsDirty();
  const filter = effective === 'high' || (effective === 'medium' && !api.LOW);
  api.canvas.style.filter = filter ? 'saturate(0.9) contrast(1.06)' : '';
  fxDensity = q.fx;
  renderSettings();
}
function setQualitySetting(q) {
  settings.quality = q;
  saveSettings();
  effective = startQuality();
  lowScale = 1;
  perf.strikes = 0; perf.cooldownUntil = performance.now() + 4000;
  applyQuality();
}

// Automatisch: meet de frametijd tijdens het spel; is die een tijd te hoog, dan een stap omlaag.
const perf = { last: 0, t0: 0, frames: 0, sum: 0, strikes: 0, cooldownUntil: 0, fpsT0: 0, fpsN: 0 };
function perfReset(now) { perf.t0 = now; perf.frames = 0; perf.sum = 0; }
function autoQualityTick(now) {
  const ft = now - perf.last;
  perf.last = now;
  if (!(ft > 0) || ft > 250 || document.hidden) { perfReset(now); return; }  // haperingen/achtergrond tellen niet
  perf.frames++; perf.sum += ft;
  if (now - perf.t0 < 2500) return;
  const avg = perf.sum / Math.max(1, perf.frames);
  perfReset(now);
  if (settings.quality !== 'auto' || now < perf.cooldownUntil) return;
  if (avg > 23) perf.strikes++;              // langzamer dan ~43 fps
  else perf.strikes = Math.max(0, perf.strikes - 1);
  if (perf.strikes < 2) return;
  perf.strikes = 0;
  perf.cooldownUntil = now + 5000;
  const i = LADDER.indexOf(effective);
  if (i > 0) effective = LADDER[i - 1];
  else if (lowScale > 0.75) lowScale = 0.75;
  else return;                                // al op het laagste niveau
  applyQuality();
  toast(tr('qualityDown', { q: tr(qKey(effective)) }));
}
function qKey(q) { return { low: 'qLow', medium: 'qMedium', high: 'qHigh', auto: 'qAuto' }[q]; }

function applyFov() {
  if (!api) return;
  api.camera.fov = settings.fov;
  api.camera.updateProjectionMatrix();
}

// ------------------------------------------------------------ haakjes voor game.js

const mulMouse = { x: 1, y: 1 }, mulTouch = { x: 1, y: 1 };
export function lookMul(kind) {
  const m = kind === 'touch' ? mulTouch : mulMouse;
  const s = kind === 'touch' ? settings.touchSens : settings.mouseSens;
  m.x = s;
  m.y = settings.invertY ? -s : s;
  return m;
}
export function fxCount(n) { return Math.max(1, Math.round(n * fxDensity)); }
// [FPS] camerastand (eerste/derde persoon): toets V, camera-knop en Instellingen > Camera (public/fps.js leest settings.camera)
export function setCamera(v) {
  settings.camera = v === 'first' ? 'first' : 'third';
  saveSettings();
  renderSettings();
}

let paused = false;
export function isPaused() { return paused; }

// ------------------------------------------------------------ [VR2] koppeling voor het VR-menu (public/vr-menu.js)
// Zelfde opslag (cc_settings) en dezelfde apply-functies als het pc-menu, zodat er maar één
// plek is die instellingen bewaart en toepast.
export const vrBridge = {
  get quality() { return settings.quality; },
  get effectiveQuality() { return effective; },
  get volume() { return settings.volume; },
  get lang() { return api ? api.getLang() : 'en'; },
  setQuality(q) { if (QUALITIES.includes(q)) setQualitySetting(q); },
  setVolume(v) {
    settings.volume = Math.round(clampNum(v, 0, 100, settings.volume));
    saveSettings(); applyVolume(); renderSettings();
  },
  setLang(l) { if (api && (l === 'nl' || l === 'en')) api.setLang(l); },
  getVr() { return settings.vr; },
  setVr(v) { settings.vr = { ...v }; saveSettings(); },
  leaveGame() { closePause(false); if (api) api.leaveGame(); },
};

// ------------------------------------------------------------ overlays: pauze, instellingen, besturing

const inGame = () => !!api && api.getScreen() === 'hud';
const isOpen = (id) => { const el = $(id); return !!el && !el.classList.contains('hidden'); };
let lastUnlockAt = -1e9;
const panelReturn = {};

function showPanel(id, opener) {
  const el = $(id);
  if (!el) return;
  panelReturn[id] = opener || document.activeElement;
  el.classList.remove('hidden');
  el.scrollTop = 0;
  const first = el.querySelector('button, input');
  if (first && !COARSE) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
}
function hidePanel(id) {
  const el = $(id);
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('hidden');
  const back = panelReturn[id];
  panelReturn[id] = null;
  if (back && document.contains(back) && back.offsetParent !== null) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
}

export function openPause() {
  if (!inGame() || paused) return;
  paused = true;
  api.clearInput();
  try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ }
  hideFirstHint();
  renderFsButtons();
  showPanel('pause');
  updateAimPrompt();
}
function closePause(relock) {
  if (!paused) return;
  paused = false;
  hidePanel('settingsPanel');
  hidePanel('controlsPanel');
  hidePanel('pause');
  if (relock && desktopMode() && inGame() && api.hud.requestPointerLock) {
    try { const p = api.hud.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
  updateAimPrompt();
}

function openSettings(opener) { renderSettings(); showPanel('settingsPanel', opener); }
function openControls(opener) {
  const el = $('controlsPanel');
  if (el) el.classList.toggle('touchFirst', !desktopMode());
  showPanel('controlsPanel', opener);
}

// ------------------------------------------------------------ volledig scherm

const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
async function toggleFullscreen() {
  try {
    if (isFs()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    if (COARSE && window.screen && window.screen.orientation && window.screen.orientation.lock) {
      await window.screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) { /* niet toegestaan / niet ondersteund */ }
}
function renderFsButtons() {
  const ok = fsSupported();
  document.querySelectorAll('.fsBtn').forEach((b) => {
    b.classList.toggle('hidden', !ok);
    b.textContent = tr(isFs() ? 'exitFullscreen' : 'fullscreen');
  });
}

// ------------------------------------------------------------ instellingenscherm

function segButtons(el, options, current, onPick) {
  if (!el) return;
  const hadFocus = el.contains(document.activeElement);
  el.textContent = '';
  for (const [val, label] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick' + (val === current ? ' active' : '');
    b.textContent = label;
    b.setAttribute('aria-pressed', String(val === current));
    b.onclick = () => onPick(val);
    el.appendChild(b);
    if (hadFocus && val === current) b.focus({ preventScroll: true });
  }
}
function setRange(id, value, text, lo, hi) {
  const inp = $(id), out = $(id + 'V');
  if (!inp) return;
  if (document.activeElement !== inp || Number(inp.value) !== value) inp.value = String(value);
  inp.style.setProperty('--p', (((value - lo) / (hi - lo)) * 100).toFixed(1) + '%');
  if (out) out.textContent = text;
}
function renderSettings() {
  if (!api || !$('settingsPanel')) return;
  setRange('cfgMouse', settings.mouseSens, settings.mouseSens.toFixed(2) + '×', 0.2, 3);
  setRange('cfgTouch', settings.touchSens, settings.touchSens.toFixed(2) + '×', 0.2, 3);
  setRange('cfgFov', settings.fov, settings.fov + '°', 55, 100);
  setRange('cfgVol', settings.volume, settings.volume + '%', 0, 100);
  const onOff = [[false, tr('off')], [true, tr('on')]];
  segButtons($('cfgInvert'), onOff, settings.invertY, (v) => { settings.invertY = v; saveSettings(); renderSettings(); });
  segButtons($('cfgFps'), onOff, settings.showFps, (v) => { settings.showFps = v; saveSettings(); renderSettings(); updateFpsVisibility(); });
  segButtons($('cfgQuality'), QUALITIES.map((q) => [q, tr(qKey(q))]), settings.quality, setQualitySetting);
  segButtons($('cfgLang'), [['nl', 'NL'], ['en', 'EN']], api.getLang(), (l) => api.setLang(l));
  segButtons($('cfgCamera'), [['third', tr('camThird')], ['first', tr('camFirst')]], settings.camera, setCamera); // [FPS]
  const note = $('cfgQualNote');
  if (note) note.textContent = settings.quality === 'auto' ? tr('qAutoNow', { q: tr(qKey(effective)) }) : tr('qFixed');
}
function bindRange(id, key, lo, hi, after) {
  const inp = $(id);
  if (!inp) return;
  inp.addEventListener('input', () => {
    settings[key] = clampNum(inp.value, lo, hi, DEFAULTS[key]);
    saveSettings();
    if (after) after();
    renderSettings();
  });
}

// ------------------------------------------------------------ HUD-extra's

let hudEls = null;
function makeHudEls() {
  const hud = api.hud;
  const mk = (id, cls) => {
    let el = $(id);
    if (!el) { el = document.createElement('div'); el.id = id; if (cls) el.className = cls; hud.appendChild(el); }
    return el;
  };
  hudEls = {
    fps: mk('fpsMeter', 'hidden'),
    lowHp: mk('lowHp'),
    aim: mk('aimPrompt', 'hidden'),
    hint: mk('firstHint', 'hidden'),
  };
  hudEls.aim.textContent = tr('clickToAim');
  let tst = $('toast');
  if (!tst) { tst = document.createElement('div'); tst.id = 'toast'; tst.setAttribute('role', 'status'); document.body.appendChild(tst); }
  hudEls.toast = tst;
}
let toastTimer = null;
function toast(text) {
  if (!hudEls) return;
  hudEls.toast.textContent = text;
  hudEls.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hudEls.toast.classList.remove('show'), 3200);
}
function updateFpsVisibility() {
  if (hudEls) hudEls.fps.classList.toggle('hidden', !settings.showFps);
}
let aimShown = false;
function updateAimPrompt() {
  if (!hudEls) return;
  const me = $('matchEnd');
  const want = inGame() && desktopMode() && !paused && !document.pointerLockElement &&
    !(me && !me.classList.contains('hidden')) && !isOpen('settingsPanel') && !isOpen('controlsPanel');
  if (want !== aimShown) { aimShown = want; hudEls.aim.classList.toggle('hidden', !want); }
}
let hintTimer = null;
function maybeFirstHint() {
  if (!hudEls || flag('cc_hintSeen')) return;
  setFlag('cc_hintSeen');
  hudEls.hint.textContent = tr(desktopMode() ? 'hintDesktop' : 'hintTouch');
  hudEls.hint.classList.remove('hidden');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideFirstHint, 9000);
}
function hideFirstHint() {
  clearTimeout(hintTimer);
  if (hudEls) hudEls.hint.classList.add('hidden');
}

// Elke frame tijdens het spel (game.js: vlak voor renderer.render).
let stepDist = 0, nextBeat = 0, lowOn = false;
export function onFrame(now, dt, me, mySpeed) {
  if (!api) return;
  autoQualityTick(now);
  // FPS-teller
  perf.fpsN++;
  if (now - perf.fpsT0 >= 500) {
    if (settings.showFps && hudEls) {
      const fps = Math.round((perf.fpsN * 1000) / (now - perf.fpsT0));
      hudEls.fps.textContent = fps + ' FPS';
      hudEls.fps.classList.toggle('bad', fps < 40);
    }
    perf.fpsN = 0; perf.fpsT0 = now;
  }
  const phase = api.getPhase();
  const alive = !!me && me.alive;
  // voetstappen
  if (alive && mySpeed > 1.5) {
    stepDist += mySpeed * dt;
    if (stepDist > 2.1) { stepDist = 0; footstep(0.07); }
  } else stepDist = 1.6;   // eerste stap komt snel na het starten met lopen
  // weinig HP: rode rand + hartslag
  const low = alive && me.hp > 0 && me.hp <= 30 && phase === 'playing';
  if (low !== lowOn) { lowOn = low; hudEls.lowHp.classList.toggle('on', low); }
  if (low) {
    hudEls.lowHp.classList.toggle('crit', me.hp <= 15);
    if (now >= nextBeat) { heartbeat(me.hp <= 15 ? 0.32 : 0.22); nextBeat = now + (me.hp <= 15 ? 620 : 900); }
  }
  updateAimPrompt();
}

// ------------------------------------------------------------ start

function onLang() {
  renderFsButtons();
  renderSettings();
  renderLoading();
  if (hudEls) hudEls.aim.textContent = tr('clickToAim');
  if (hudEls && !hudEls.hint.classList.contains('hidden')) hudEls.hint.textContent = tr(desktopMode() ? 'hintDesktop' : 'hintTouch');
}

export function init(a) {
  api = a;
  // eigen teksten toevoegen aan de I18N-tabel van game.js
  for (const l of Object.keys(STR)) api.I18N[l] = Object.assign(api.I18N[l] || {}, STR[l]);

  makeHudEls();
  effective = startQuality();
  applyQuality();
  applyFov();
  updateFpsVisibility();
  renderLoading();

  // laadscherm weg zodra de modellen klaar zijn (game.js wacht max. 12 s en valt dan terug)
  Promise.resolve(api.ready).then(finishLoading, finishLoading);

  // knoppen
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  on('btnSettings', (e) => openSettings(e.currentTarget));
  on('btnControls', (e) => openControls(e.currentTarget));
  on('btnResume', () => closePause(true));
  on('btnPauseSettings', (e) => openSettings(e.currentTarget));
  on('btnPauseControls', (e) => openControls(e.currentTarget));
  on('btnPauseLeave', () => { closePause(false); api.leaveGame(); });
  on('cfgBack', () => hidePanel('settingsPanel'));
  on('ctrlBack', () => hidePanel('controlsPanel'));
  on('cfgReset', () => {
    Object.assign(settings, DEFAULTS);
    applyFov(); applyVolume(); updateFpsVisibility();
    setQualitySetting(settings.quality);   // slaat ook op en tekent opnieuw
  });
  document.querySelectorAll('.fsBtn').forEach((b) => b.addEventListener('click', toggleFullscreen));
  // klik op de donkere achtergrond van een paneel = terug
  ['settingsPanel', 'controlsPanel'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('click', (e) => { if (e.target === el) hidePanel(id); });
  });
  bindRange('cfgMouse', 'mouseSens', 0.2, 3);
  bindRange('cfgTouch', 'touchSens', 0.2, 3);
  bindRange('cfgFov', 'fov', 55, 100, () => { settings.fov = Math.round(settings.fov); applyFov(); });
  bindRange('cfgVol', 'volume', 0, 100, () => { settings.volume = Math.round(settings.volume); applyVolume(); });

  document.addEventListener('fullscreenchange', renderFsButtons);
  document.addEventListener('webkitfullscreenchange', renderFsButtons);

  // touch gebruikt? dan blijft de vuurknop zichtbaar en tonen we touch-hints
  const markTouch = (e) => {
    if (e.pointerType === 'touch' && !touchUsed) { touchUsed = true; document.body.classList.add('touch-used'); updateAimPrompt(); }
  };
  document.addEventListener('pointerdown', markTouch, true);
  if (touchUsed) document.body.classList.add('touch-used');

  // muis losgelaten (Esc, alt-tab) tijdens het spel = pauzemenu
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { hideFirstHint(); updateAimPrompt(); return; }
    lastUnlockAt = performance.now();
    const me = $('matchEnd');
    if (inGame() && !paused && !(me && !me.classList.contains('hidden'))) openPause();
    updateAimPrompt();
  });

  // Esc: bovenste paneel sluiten, of het pauzemenu openen/sluiten
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    if (isOpen('controlsPanel')) { hidePanel('controlsPanel'); e.preventDefault(); return; }
    if (isOpen('settingsPanel')) { hidePanel('settingsPanel'); e.preventDefault(); return; }
    if (!inGame() || document.pointerLockElement) return;   // de browser laat de muis los -> pointerlockchange
    if (performance.now() - lastUnlockAt < 400) return;     // dezelfde Esc die net de muis losliet
    e.preventDefault();
    if (paused) closePause(true); else openPause();
  });

  // HUD zichtbaar/verborgen (ronde start, terug naar lobby/menu)
  new MutationObserver(() => {
    if (inGame()) { maybeFirstHint(); }
    else { closePause(false); hideFirstHint(); lowOn = false; hudEls.lowHp.classList.remove('on'); }
    updateAimPrompt();
  }).observe(api.hud, { attributes: true, attributeFilter: ['class'] });

  // taalwissel (applyLang in game.js zet <html lang>)
  new MutationObserver(onLang).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  // terug naar de lobby/eindscherm: aim-prompt bijwerken
  const meEl = $('matchEnd');
  if (meEl) new MutationObserver(updateAimPrompt).observe(meEl, { attributes: true, attributeFilter: ['class'] });

  renderFsButtons();
  renderSettings();

  // Alleen lokaal: koppeling voor automatische tests.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.__settings = { settings, get quality() { return effective; }, get paused() { return paused; } };
  }
}
