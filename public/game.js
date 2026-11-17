import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as Settings from './settings.js'; // [polish] instellingen, pauzemenu, laadscherm (fase 4)
import { initDoors } from './doors.js';     // DEUR-HOOK: deuren, ladders en lampen in gebouwen
import { initFps } from './fps.js'; // [FPS] eerste-persoonscamera + viewmodel (toets V / camera-knop / Instellingen)

/* ============================================================
 * Arena Shooter - client (fase 1)
 * Derde persoon, touch-besturing, multiplayer via WebSocket.
 * ============================================================ */

const S = window.Shared;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ taal / language

const I18N = {
  nl: {
    name: 'Jouw naam', create: 'Nieuw spel maken', or: '— of —', code: 'Spelcode', join: 'Meedoen',
    hint: 'Tip: speel liggend (landscape). Alleen? Dan vullen bots het spel aan.',
    lobbyTitle: 'Lobby', roomCode: 'Spelcode', share: 'Deel de code of link met je vrienden (2 t/m 8 spelers).',
    shareBtn: 'Link delen', linkCopied: 'Link gekopieerd!',
    weapon: 'Kies je wapen', skin: 'Kies je skin',
    players: 'Spelers', start: 'Start spel', waitHost: 'Wachten tot de host het spel start…',
    solo: 'Alleen? Dan vullen 5 bots het spel aan.', leave: 'Verlaten', fire: 'VUUR',
    host: 'host', wins: 'winst', connecting: 'Verbinden… (de gratis server kan een minuut slapen)',
    errNoroom: 'Deze spelcode bestaat niet.', errFull: 'Dit spel zit vol.', errConn: 'Geen verbinding met de server.',
    errNoCode: 'Vul eerst een spelcode in.',
    alive: 'Over: {n}', win: '{name} wint de ronde!', draw: 'Gelijkspel!', go: 'GO!',
    roundN: 'Ronde {n} - {level}', next: 'Volgende ronde komt eraan…',
    dead: 'Je bent uitgeschakeld - kijk mee tot de ronde klaar is.', waiting: 'Je doet mee vanaf de volgende ronde.',
    killed: '{a} schakelt {b} uit',
    takeover: 'Neem {name} over', tookOver: '{a} neemt {b} over',
    difficulty: 'Moeilijkheid', diffEasy: 'Makkelijk', diffNormal: 'Normaal', diffHard: 'Moeilijk',
    target: 'Rondes om te winnen', hostOnly: 'Alleen de host kan dit wijzigen.', mode: 'Spelmodus', finisher: 'Finisher (jouw afmaker)', killcam: 'KILLCAM', killedBy: 'UITGESCHAKELD DOOR', skipKc: 'tik / spatie = overslaan',
    firstTo: 'Eerste tot {n}', matchPoint: 'Matchpoint: {name}', finalRound: 'Laatste ronde! De eindstand volgt…',
    matchOver: 'Wedstrijd voorbij', winner: 'Winnaar', youWin: 'Jij wint!',
    backLobby: 'Terug naar de lobby… {n}', colPlace: '#', colName: 'Naam', colWins: 'Winst', colKills: 'Kills',
    bot: 'bot', you: 'jij', protected: 'Beschermd', eliminated: 'Uitgeschakeld',
    statDmg: 'Schade', statRate: 'Tempo', statRange: 'Bereik', zoom: 'ZOOM',
    wMove: 'Snel', wHeavy: 'Zwaar', wScope: 'Kijker',
    jump: 'SPRING', crouch: 'BUK', prone: 'LIG',
    invKnife: 'MES', invMed: 'MEDKIT', healing: 'VERBINDEN…', finishBtn: 'FINISH', finPrompt: 'FINISHER',
    finished: '{a} finisht {b}', backstab: 'IN DE RUG!',
  },
  en: {
    name: 'Your name', create: 'Create new game', or: '— or —', code: 'Game code', join: 'Join',
    hint: 'Tip: play in landscape. Alone? Bots will fill the game.',
    lobbyTitle: 'Lobby', roomCode: 'Game code', share: 'Share the code or link with your friends (2 to 8 players).',
    shareBtn: 'Share link', linkCopied: 'Link copied!',
    weapon: 'Choose your weapon', skin: 'Choose your skin',
    players: 'Players', start: 'Start game', waitHost: 'Waiting for the host to start…',
    solo: 'Alone? 5 bots will fill the game.', leave: 'Leave', fire: 'FIRE',
    host: 'host', wins: 'wins', connecting: 'Connecting… (the free server may need a minute to wake up)',
    errNoroom: 'This game code does not exist.', errFull: 'This game is full.', errConn: 'No connection to the server.',
    errNoCode: 'Enter a game code first.',
    alive: 'Left: {n}', win: '{name} wins the round!', draw: 'Draw!', go: 'GO!',
    roundN: 'Round {n} - {level}', next: 'Next round is coming…',
    dead: 'You are out - spectate until the round ends.', waiting: 'You join from the next round.',
    killed: '{a} eliminated {b}',
    takeover: 'Take over {name}', tookOver: '{a} takes over {b}',
    difficulty: 'Difficulty', diffEasy: 'Easy', diffNormal: 'Normal', diffHard: 'Hard',
    target: 'Rounds to win', hostOnly: 'Only the host can change this.', mode: 'Game mode', finisher: 'Finisher (your finishing move)', killcam: 'KILL CAM', killedBy: 'ELIMINATED BY', skipKc: 'tap / space = skip',
    firstTo: 'First to {n}', matchPoint: 'Match point: {name}', finalRound: 'Final round! Results incoming…',
    matchOver: 'Match over', winner: 'Winner', youWin: 'You win!',
    backLobby: 'Back to lobby… {n}', colPlace: '#', colName: 'Name', colWins: 'Wins', colKills: 'Kills',
    bot: 'bot', you: 'you', protected: 'Protected', eliminated: 'Eliminated',
    statDmg: 'Damage', statRate: 'Rate', statRange: 'Range', zoom: 'ZOOM',
    wMove: 'Fast', wHeavy: 'Heavy', wScope: 'Scope',
    jump: 'JUMP', crouch: 'CROUCH', prone: 'PRONE',
    invKnife: 'KNIFE', invMed: 'MEDKIT', healing: 'HEALING…', finishBtn: 'FINISH', finPrompt: 'FINISHER',
    finished: '{a} finished {b}', backstab: 'BACKSTAB!',
  },
};

function loadPref(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function savePref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

let lang = loadPref('lang') || ((navigator.language || '').toLowerCase().startsWith('nl') ? 'nl' : 'en');

function t(key, vars) {
  let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $('btnLangNl').classList.toggle('active', lang === 'nl');
  $('btnLangEn').classList.toggle('active', lang === 'en');
  savePref('lang', lang);
  renderPicks();
  renderLobby();
  updateHud();
}

// ------------------------------------------------------------ toestand

let screen = 'menu';       // menu | lobby | hud
let ws = null;
let myId = null;
let roomCode = '';
let hostId = null;
let lobbyPlayers = [];
let myWeapon = 'rifle';
let mySkin = S.skinById(loadPref('skin')).id;   // onbekend/leeg -> eerste skin

let phase = 'menu';        // countdown | playing | between
let phaseEnd = 0;
let levelId = null;
let roundNo = 0;
const players = new Map(); // id -> entiteit
let specTarget = null;

// wedstrijd-instellingen (uit het lobby-bericht) en spawnbescherming
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const DIFF_KEYS = { easy: 'diffEasy', normal: 'diffNormal', hard: 'diffHard' };
const TARGETS = [3, 5, 7];
let difficulty = 'normal';
let curMode = 'classic';                       // spelmodus van deze kamer (door de host gekozen)
const modeDef = () => S.modeOf(curMode);
let myFin = S.FINISHERS[loadPref('fin')] ? loadPref('fin') : 'hulk';   // gekozen finisher
const sendPick = () => send({ t: 'pick', weapon: myWeapon, skin: mySkin, fin: myFin });
let matchTarget = 5;
let protectUntil = 0;      // performance.now()-tijd waarop de spawnbescherming stopt
let protectDur = 0;

const look = { yaw: 0, pitch: 0.12 };
const input = { jx: 0, jy: 0, fire: false, mouseFire: false, jumpQ: false };   // jumpQ = springen (eenmalig)
const keys = new Set();
const MV = S.MOVE;           // verticale beweging (shared.js): springen, hurken, liggen, ladders
let lastSentY = 1e9, lastSentS = -1;
let camEye = MV.EYE[0];      // camerahoogte, volgt de houding zacht
let vrCrouch = false;        // VR: echte hoofdhoogte laag = gehurkt

const CAM_DIST = 5.5;
const SPEED = 7;
let nextShotAt = 0;
let lastSend = 0;
let lastSentX = 1e9, lastSentZ = 1e9, lastSentYaw = 1e9;
const camPos = new THREE.Vector3();

function showScreen(s) {
  screen = s;
  $('menu').classList.toggle('hidden', s !== 'menu');
  $('lobby').classList.toggle('hidden', s !== 'lobby');
  $('hud').classList.toggle('hidden', s !== 'hud');
  if (s !== 'hud') hideMatchEnd();
}

function setMenuMsg(text) { $('menuMsg').textContent = text || ''; }

// ------------------------------------------------------------ audio (klein, zelf gemaakt)

let actx = null;
function initAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    Settings.attachAudio(actx); // [polish] master-volume
  }
  if (actx && actx.state === 'suspended') actx.resume();
}
function noiseBurst(dur, vol, freq) {
  if (!actx) return;
  const n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(actx.destination);
  src.start();
}
function blip(freq, dur, vol) {
  if (!actx) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.frequency.value = freq; o.type = 'square';
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
// Lage dreun (sinus die omlaag glijdt) voor zwaardere wapens.
function thump(freq, dur, vol) {
  if (!actx) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  const t0 = actx.currentTime;
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(freq * 0.35, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(t0 + dur);
}
// Geluidsprofiel per wapen (S.WEAPONS[id].sound).
const SHOT_SOUNDS = {
  rifle: (v) => noiseBurst(0.09, v * 0.8, 3200),
  shotgun: (v) => noiseBurst(0.22, v, 1400),
  smg: (v) => noiseBurst(0.05, v * 0.6, 4600),
  lmg: (v) => { noiseBurst(0.1, v * 0.8, 2200); thump(150, 0.08, v * 0.35); },
  dmr: (v) => { noiseBurst(0.15, v * 0.9, 2600); thump(110, 0.12, v * 0.45); },
  sniper: (v) => {
    noiseBurst(0.05, v * 0.7, 7000);          // scherpe knal
    noiseBurst(0.4, v * 0.9, 900);            // zware staart
    thump(75, 0.3, v * 0.6);
    setTimeout(() => noiseBurst(0.5, v * 0.18, 500), 170);   // echo
  },
};
function shotSound(weaponId, vol) {
  const w = S.WEAPONS[weaponId];
  (SHOT_SOUNDS[w && w.sound] || SHOT_SOUNDS.rifle)(vol);
}
// Eigen kill: korte doffe klap + twee oplopende tonen.
function killSound() {
  if (!actx) return;
  noiseBurst(0.12, 0.22, 500);
  blip(740, 0.08, 0.14);
  setTimeout(() => blip(1480, 0.16, 0.12), 70);
}
document.addEventListener('pointerdown', initAudio);

// ------------------------------------------------------------ Three.js scene

// Telefoons en kleine schermen krijgen lichtere instellingen.
const LOW = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
  Math.min(window.innerWidth, window.innerHeight) < 500;

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (!LOW) canvas.style.filter = 'saturate(0.9) contrast(1.06)';

const scene = new THREE.Scene();
const FOG = 0xa3aea9;
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.FogExp2(FOG, 0.0105);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 700);

const hemi = new THREE.HemisphereLight(0xd6e0e6, 0x4a4430, 1.9);
scene.add(hemi);
const SUN_OFF = new THREE.Vector3(-45, 70, -30);
const sun = new THREE.DirectionalLight(0xffe2b5, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
{
  const sc = sun.shadow.camera;
  sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 10; sc.far = 220;
}
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// Lucht: kleurverloop van horizon (= mistkleur) naar boven, met een zachte zon.
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x5d7c99) },
    horizon: { value: new THREE.Color(FOG) },
    sunDir: { value: SUN_OFF.clone().normalize() },
    glow: { value: new THREE.Vector3(1.0, 0.85, 0.6) },   // kleur van de zon/maan (per level)
    stars: { value: 0 },                                   // sterren (nacht-level)
  },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 glow; uniform float stars; varying vec3 vDir;',
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  float h = clamp(d.y, 0.0, 1.0);',
    '  vec3 c = mix(horizon, top, pow(h, 0.6));',
    '  float s = max(dot(d, sunDir), 0.0);',
    '  c += glow * (pow(s, 700.0) * 2.0 + pow(s, 10.0) * 0.15);',
    '  if (stars > 0.0) {',
    '    vec3 q = floor(d * 260.0);',
    '    float n = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
    '    c += vec3(0.8, 0.85, 1.0) * stars * step(0.9965, n) * (0.4 + 0.6 * fract(n * 91.7)) * smoothstep(0.04, 0.35, d.y);',
    '  }',
    '  gl_FragColor = vec4(c, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}',
  ].join('\n'),
}));
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

function resize() {
  // Meet het canvas zelf (= exact het zichtbare scherm), zodat het beeldmidden altijd onder het kruisje ligt.
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---- 3D-modellen (gemaakt in Blender, zie tools/build_models.py)

const MODELS = {};
const MODEL_NAMES = ['soldier', 'rifle', 'shotgun', 'sandbags', 'crate', 'tower', 'pine', 'rock'];
// wapenmodellen uit shared.js (smg, sniper, lmg, dmr; zie tools/build_weapons.py)
for (const id of S.WEAPON_IDS) {
  const n = S.WEAPONS[id].model;
  if (n && !MODEL_NAMES.includes(n)) MODEL_NAMES.push(n);
}
const gltfLoader = new GLTFLoader();
const modelsLoaded = Promise.race([
  Promise.all(MODEL_NAMES.map((n) => gltfLoader.loadAsync('models/' + n + '.glb')
    .then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      MODELS[n] = g.scene;
    })
    .catch((err) => console.warn('Model niet geladen:', n, err)))),
  new Promise((res) => setTimeout(res, 12000)),
]);

// ---- skins: extra modellen (tools/build_skins.py) en camo-texturen voor de soldaat-varianten
const SKIN_MODEL_NAMES = [...new Set(S.SKINS.map((s) => s.model))].filter((n) => n && !MODEL_NAMES.includes(n));
const SKIN_CAMOS = [...new Set(S.SKINS.map((s) => s.camo).filter(Boolean))];
const camoTextures = {};
const skinsLoaded = Promise.race([
  Promise.all([
    ...SKIN_MODEL_NAMES.map((n) => gltfLoader.loadAsync('models/' + n + '.glb')
      .then((g) => {
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        MODELS[n] = g.scene;
      })
      .catch((err) => console.warn('Skin-model niet geladen:', n, err))),
    ...SKIN_CAMOS.map((c) => new THREE.TextureLoader().loadAsync('models/skins/' + c + '.jpg')
      .then((tex) => {
        // zelfde instellingen als glTF-texturen (UV's uit Blender, herhalend)
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        camoTextures[c] = tex;
      })
      .catch((err) => console.warn('Camo niet geladen:', c, err))),
  ]),
  new Promise((res) => setTimeout(res, 15000)),
]);

// Alle meshes van een model samengevoegd met hun eigen positie erin (voor instancing).
function bakedParts(root) {
  const parts = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    parts.push({ geometry: geo, material: o.material, name: o.name + ' ' + (o.parent ? o.parent.name : '') });
  });
  return parts;
}

function rng(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- level

let levelGroup = null;

function disposeGroup(g) {
  g.traverse((o) => {
    // instanced meshes hebben altijd een eigen (gekloonde) geometrie, zie bakedParts()
    if (o.isInstancedMesh) { o.dispose(); if (o.geometry) o.geometry.dispose(); }
    if (o.userData.ownGeo && o.geometry) o.geometry.dispose();
    // eigen materialen (per level gemaakt); gedeelde textures (userData.cached) blijven bestaan
    if ((o.userData.ownMat || o.userData.ownGeo) && o.material) {
      for (const m of [].concat(o.material)) {
        if (m.map && !m.map.userData.cached) m.map.dispose();
        m.dispose();
      }
    }
    if (o.isLight && o.dispose) o.dispose();
  });
}

function buildLevel(id) {
  if (levelId === id && levelGroup) return;
  if (levelGroup) { scene.remove(levelGroup); disposeGroup(levelGroup); }
  levelId = id;
  levelGroup = new THREE.Group();
  levelFx = null;
  applyLevelLook(id);
  if (id === 'forest') { buildForest(levelGroup); doors.build(levelGroup, id, S.getObstacles(id)); }   // (bos: geen gebouwen)
  else buildGeneratedLevel(levelGroup, id);
  scene.add(levelGroup);
}

function makeGroundTexture() {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#56653a';
  g.fillRect(0, 0, s, s);
  const cols = ['#4b5c31', '#66763f', '#6e6944', '#3e4b29', '#7a7250', '#55633a', '#5e5435', '#47512e'];
  const r = rng(99);
  const blob = (x, y, rx, ry, rot) => {
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      if (x + ox < -rx * 2 || x + ox > s + rx * 2 || y + oy < -rx * 2 || y + oy > s + rx * 2) continue;
      g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2); g.fill();
    }
  };
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = cols[i % cols.length];
    g.globalAlpha = 0.2 + r() * 0.35;
    const rad = 1 + r() * (i < 700 ? 16 : 3);
    blob(r() * s, r() * s, rad, rad * (0.4 + r() * 0.6), r() * 3);
  }
  g.lineWidth = 1;
  for (let i = 0; i < 7000; i++) {
    g.globalAlpha = 0.35 + r() * 0.3;
    g.strokeStyle = cols[(i * 3) % cols.length];
    const x = r() * s, y = r() * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5); g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function buildForest(g) {
  // terrein (groter dan het speelveld, zodat de rand in de mist verdwijnt)
  const size = (S.MAP_HALF + 70) * 2;
  const seg = LOW ? 100 : 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const dirt = new THREE.Color(0x8a7356);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = S.heightAt('forest', x, z);
    pos.setY(i, h);
    const v = 0.82 + 0.18 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13);
    c.setRGB(v, v, v);
    const valley = Math.max(0, Math.min(1, (-h - 3) / 5));             // lage stukken: modderig pad
    const path = Math.max(0, 1 - Math.abs(Math.sin(x * 0.035) * 30 - z * 0.3 + 5) / 6) * 0.7;
    c.lerp(dirt, Math.max(valley, path) * 0.6);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = makeGroundTexture();
  tex.repeat.set(size / 7, size / 7);
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true;
  ground.userData.ownGeo = true;
  g.add(ground);

  const r = rng(2024);
  const dummy = new THREE.Object3D();

  // bomen: speelveld (met botsing, uit shared.js) + een sierrand buiten het veld
  const trees = S.getObstacles('forest').trees.slice();
  const deco = [];
  for (let i = 0; i < (LOW ? 140 : 260); i++) {
    const a = r() * Math.PI * 2;
    const d = S.MAP_HALF + 6 + r() * 55;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    deco.push({ x, z, baseY: S.heightAt('forest', x, z), scale: 0.9 + r() * 0.9 });
  }
  const allTrees = trees.concat(deco);
  const pineParts = MODELS.pine ? bakedParts(MODELS.pine) : null;
  if (pineParts) {
    for (const part of pineParts) {
      const inst = new THREE.InstancedMesh(part.geometry, part.material, allTrees.length);
      allTrees.forEach((tr, i) => {
        dummy.position.set(tr.x, tr.baseY - 0.15, tr.z);
        dummy.scale.setScalar(tr.scale * 0.95);
        dummy.rotation.set(0, i * 1.7, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.castShadow = !LOW;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      g.add(inst);
    }
  } else {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 4, 6); trunkGeo.translate(0, 2, 0);
    const crown = new THREE.ConeGeometry(2.0, 6, 7); crown.translate(0, 6.5, 0);
    [[trunkGeo, 0x5a3f28], [crown, 0x2a4a2a]].forEach(([gg, col]) => {
      const inst = new THREE.InstancedMesh(gg, new THREE.MeshStandardMaterial({ color: col, roughness: 1 }), allTrees.length);
      allTrees.forEach((tr, i) => {
        dummy.position.set(tr.x, tr.baseY, tr.z); dummy.scale.setScalar(tr.scale); dummy.rotation.set(0, i, 0);
        dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
      });
      inst.castShadow = !LOW; inst.receiveShadow = true; inst.frustumCulled = false;
      g.add(inst);
    });
  }

  // jonge dennetjes (alleen decoratie)
  if (pineParts) {
    const foliage = pineParts.find((p) => /foliage/i.test(p.name)) || pineParts[pineParts.length - 1];
    const n = LOW ? 90 : 180;
    const inst = new THREE.InstancedMesh(foliage.geometry, foliage.material, n);
    for (let i = 0; i < n; i++) {
      const x = (r() * 2 - 1) * S.MAP_HALF, z = (r() * 2 - 1) * S.MAP_HALF;
      const s = 0.12 + r() * 0.14;
      dummy.position.set(x, S.heightAt('forest', x, z) - 0.25 - s * 2.5, z);
      dummy.scale.set(s * 1.3, s, s * 1.3);
      dummy.rotation.set(0, r() * 6, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.castShadow = !LOW; inst.receiveShadow = true; inst.frustumCulled = false;
    g.add(inst);
  }

  // stenen (alleen decoratie, laag bij de grond)
  if (MODELS.rock) {
    const parts = bakedParts(MODELS.rock);
    const n = LOW ? 80 : 160;
    const mats = [];
    for (let i = 0; i < n; i++) {
      const x = (r() * 2 - 1) * (S.MAP_HALF + 30), z = (r() * 2 - 1) * (S.MAP_HALF + 30);
      const s = 0.35 + r() * 0.8;
      dummy.position.set(x, S.heightAt('forest', x, z) - 0.15 * s, z);
      dummy.scale.set(s, s * (0.6 + r() * 0.5), s);
      dummy.rotation.set(r() * 0.4, r() * 6, r() * 0.4);
      dummy.updateMatrix();
      mats.push(dummy.matrix.clone());
    }
    for (const part of parts) {
      const inst = new THREE.InstancedMesh(part.geometry, part.material, n);
      mats.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.castShadow = !LOW; inst.receiveShadow = true; inst.frustumCulled = false;
      g.add(inst);
    }
  }

  // militaire dekking (zandzakken, kratten, wachttorens) — posities en botsing uit shared.js
  const props = S.getObstacles('forest').props || [];
  for (const p of props) {
    const src = MODELS[p.kind];
    if (!src) continue;
    const stack = p.kind === 'crate' ? Math.max(1, p.stack || 1) : 1;
    for (let k = 0; k < stack; k++) {
      const m = src.clone(true);
      m.position.set(p.x, p.baseY - 0.08 + k * 1.1, p.z);
      m.rotation.y = p.yaw + (k ? 0.25 : 0);
      g.add(m);
    }
  }
}

// ============================================================ extra levels (fase 3)
// Woestijn, bergpas, dorp en haven. Posities en botsing komen uit shared.js (generate),
// hier alleen het uiterlijk. Herhaalde dingen zijn InstancedMesh, muren één samengevoegde mesh per materiaal.

let levelFx = null;   // per-frame effect van het huidige level (sneeuw, rook, lampen)

const LEVEL_MODEL_NAMES = ['container', 'barrel', 'jersey', 'lamp', 'crane', 'cabin', 'snowpine', 'palm', 'rubble', 'car', 'logs', 'ship', 'shrub',
  // gebouwen (tools/build_buildings.py): deuren, meubels, lantaarn
  'door', 'door_metal', 'table', 'shelf', 'bunk', 'stove', 'pew', 'lantern'];
let levelModelsDone = false;
Promise.all(LEVEL_MODEL_NAMES.map((n) => gltfLoader.loadAsync('models/' + n + '.glb')
  .then((g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    MODELS[n] = g.scene;
  })
  .catch((err) => console.warn('Model niet geladen:', n, err)))).then(() => {
  levelModelsDone = true;
  // level al gebouwd voordat alles binnen was? dan opnieuw opbouwen
  if (levelGroup && levelGroup.userData.needsModels && levelId) { const id = levelId; levelId = null; buildLevel(id); }
});

// DEUR-HOOK: deuren / ladders / lantaarns in gebouwen (public/doors.js)
const doors = initDoors({
  THREE, S, scene, camera, MODELS, LOW, I18N, t, send, levelTex, hud: $('hud'),
  getAudio: () => actx, puff: (p) => impactPuff(p),
  getMe: () => players.get(myId), getPhase: () => phase,
});

// Licht, lucht en mist per level.
const LOOKS = {
  forest: { fog: 0xa3aea9, density: 0.0105, top: 0x5d7c99, hemiSky: 0xd6e0e6, hemiGround: 0x4a4430, hemi: 1.9,
    sun: 0xffe2b5, sunI: 2.6, sunOff: [-45, 70, -30], glow: [1.0, 0.85, 0.6], stars: 0 },
  desert: { fog: 0xdcc9a6, density: 0.0062, top: 0x3f7cc4, hemiSky: 0xfff1d8, hemiGround: 0xa07c52, hemi: 1.6,
    sun: 0xfff0d6, sunI: 3.3, sunOff: [-55, 90, 25], glow: [1.0, 0.9, 0.7], stars: 0 },
  snow: { fog: 0xc3cfdb, density: 0.0150, top: 0x7f97b2, hemiSky: 0xe6eefc, hemiGround: 0x7d8a99, hemi: 1.7,
    sun: 0xeef3ff, sunI: 2.0, sunOff: [40, 60, -55], glow: [0.9, 0.95, 1.0], stars: 0 },
  village: { fog: 0x8f9497, density: 0.0125, top: 0x6c7378, hemiSky: 0xc8ccd0, hemiGround: 0x4f4a42, hemi: 2.3,
    sun: 0xe0ddd2, sunI: 1.0, sunOff: [-30, 80, 40], glow: [0.25, 0.25, 0.25], stars: 0 },
  harbour: { fog: 0x111d2b, density: 0.0115, top: 0x03070e, hemiSky: 0x6f8bbd, hemiGround: 0x262a30, hemi: 1.9,
    sun: 0xa9c1ff, sunI: 1.25, sunOff: [50, 75, 60], glow: [0.75, 0.82, 1.0], stars: 1 },
};

function applyLevelLook(id) {
  const L = LOOKS[id] || LOOKS.forest;
  scene.background.setHex(L.fog);
  scene.fog.color.setHex(L.fog);
  scene.fog.density = L.density;
  hemi.color.setHex(L.hemiSky);
  hemi.groundColor.setHex(L.hemiGround);
  hemi.intensity = L.hemi;
  sun.color.setHex(L.sun);
  sun.intensity = L.sunI;
  SUN_OFF.set(L.sunOff[0], L.sunOff[1], L.sunOff[2]);
  const u = sky.material.uniforms;
  u.top.value.setHex(L.top);
  u.horizon.value.setHex(L.fog);
  u.sunDir.value.copy(SUN_OFF).normalize();
  u.glow.value.set(L.glow[0], L.glow[1], L.glow[2]);
  u.stars.value = L.stars;
}

// ---- textures (zelf getekend, één keer per sessie; worden gedeeld tussen levels)

const TEX_CACHE = new Map();
function cachedTex(name, size, draw) {
  let t = TEX_CACHE.get(name);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  draw(g, size, rng(name.length * 7919 + size + name.charCodeAt(0)));
  g.globalAlpha = 1;
  t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.userData.cached = true;
  TEX_CACHE.set(name, t);
  return t;
}
// tegelbaar tekenen: alles wat over de rand valt komt aan de andere kant terug
function blobW(g, s, x, y, rx, ry, rot) {
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
    const px = x + ox, py = y + oy;
    if (px < -rx * 2 || px > s + rx * 2 || py < -rx * 2 || py > s + rx * 2) continue;
    g.beginPath(); g.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); g.fill();
  }
}
function rectW(g, s, x, y, w, h) {
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
    if (x + ox > s || x + ox + w < 0 || y + oy > s || y + oy + h < 0) continue;
    g.fillRect(x + ox, y + oy, w, h);
  }
}
function blobs(g, s, r, n, cols, a0, a1, rmin, rmax, big) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length];
    g.globalAlpha = a0 + r() * (a1 - a0);
    const rad = rmin + r() * (i < (big || 0) ? rmax * 3 : rmax);
    blobW(g, s, r() * s, r() * s, rad, rad * (0.4 + r() * 0.6), r() * 3);
  }
  g.globalAlpha = 1;
}
function specks(g, s, r, n, cols, a) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length];
    g.globalAlpha = a * (0.5 + r() * 0.5);
    g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1, 1);
  }
  g.globalAlpha = 1;
}
function cracks(g, s, r, n, col, a, w) {
  g.strokeStyle = col; g.lineWidth = w;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a * (0.6 + r() * 0.4);
    let x = r() * s, y = r() * s, ang = r() * 6.28;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 14; k++) { ang += (r() - 0.5) * 1.2; x += Math.cos(ang) * 7; y += Math.sin(ang) * 7; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}
function brickPattern(g, s, r, x0, y0, w, h, bw, bh, cols, mortar) {
  g.fillStyle = mortar; g.fillRect(x0, y0, w, h);
  for (let row = 0, y = y0; y < y0 + h; row++, y += bh) {
    for (let x = x0 - (row % 2) * bw / 2; x < x0 + w; x += bw) {
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  }
}

const TEX_DRAW = {
  sand(g, s, r) {
    g.fillStyle = '#cfae7f'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 2200, ['#d9bb8c', '#c3a172', '#e0c69a', '#b9965f', '#d2b081'], 0.12, 0.35, 2, 7, 260);
    g.lineWidth = 2;
    for (let k = 0; k < 30; k++) {
      const y0 = r() * s, amp = 3 + r() * 6, n = 1 + Math.floor(r() * 3), ph = r() * 6.28;
      for (const [col, dy, a] of [['#b08b59', 0, 0.3], ['#e8d0a6', 2.5, 0.25]]) {
        g.strokeStyle = col; g.globalAlpha = a;
        for (const oy of [-s, 0, s]) {
          g.beginPath();
          for (let x = 0; x <= s; x += 8) {
            const y = y0 + dy + oy + amp * Math.sin((x / s) * Math.PI * 2 * n + ph);
            if (x) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.stroke();
        }
      }
    }
    specks(g, s, r, 5000, ['#8f6f45', '#f0dcb5', '#a88457'], 0.6);
  },
  snow(g, s, r) {
    g.fillStyle = '#e8eef5'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 1400, ['#dde6f0', '#f6f9fc', '#cfdae6', '#e3eaf3'], 0.2, 0.45, 4, 14, 200);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = 0.35; const x = r() * s, y = r() * s, l = 6 + r() * 18;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 3); g.stroke();
    }
    specks(g, s, r, 2600, ['#ffffff', '#ffffff', '#b9cde4'], 1);
  },
  dirt(g, s, r) {
    g.fillStyle = '#6a6250'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 6000, ['#5c5544', '#776d57', '#5a5d3f', '#847862', '#4b4839', '#666a45'], 0.2, 0.5, 1, 4, 600);
    for (let i = 0; i < 500; i++) {
      const x = r() * s, y = r() * s, rad = 0.8 + r() * 1.6;
      g.fillStyle = '#3c382e'; g.globalAlpha = 0.4; blobW(g, s, x + 1, y + 1, rad, rad * 0.7, 0);
      g.fillStyle = r() < 0.5 ? '#7f796b' : '#746e61'; g.globalAlpha = 0.7; blobW(g, s, x, y, rad, rad * 0.7, 0);
    }
    g.lineWidth = 1;
    for (let i = 0; i < 2500; i++) {
      g.globalAlpha = 0.45; g.strokeStyle = i % 2 ? '#5f6a3c' : '#737c48';
      const x = r() * s, y = r() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); g.stroke();
    }
    g.globalAlpha = 1;
  },
  asphalt(g, s, r) {
    g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 1500, ['#35373a', '#414347', '#2f3134'], 0.2, 0.4, 3, 12, 150);
    specks(g, s, r, 26000, ['#5a5c60', '#26282a', '#4a4c50'], 0.7);
    cracks(g, s, r, 22, '#1b1c1e', 0.8, 1.4);
    blobs(g, s, r, 40, ['#1d1e20'], 0.15, 0.3, 6, 22);
    g.fillStyle = '#2a2b2d';
    g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s); g.fillRect(0, s / 2, s, 2); g.fillRect(s / 2, 0, 2, s);
  },
  adobe(g, s, r) {
    g.fillStyle = '#c7a47a'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 2600, ['#bf9a6d', '#d0b085', '#b8936a', '#cdaa7f'], 0.15, 0.35, 2, 10, 300);
    g.fillStyle = '#a9875f';
    for (let y = 0, row = 0; y < s; y += 32, row++) {
      g.globalAlpha = 0.22; g.fillRect(0, y, s, 2);
      for (let x = (row % 2) * 32; x < s; x += 64) g.fillRect(x, y, 2, 32);
    }
    cracks(g, s, r, 16, '#7d6244', 0.5, 1.2);
    g.fillStyle = '#a5845d';
    for (let i = 0; i < 60; i++) { g.globalAlpha = 0.12; rectW(g, s, r() * s, r() * s * 0.5, 2 + r() * 6, 40 + r() * 160); }
    specks(g, s, r, 3000, ['#8f7353', '#e0c49c'], 0.5);
  },
  plaster(g, s, r) {
    g.fillStyle = '#c9bea6'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 2400, ['#c2b69c', '#d0c6b0', '#b9ad93', '#d6cdb9', '#aaa088'], 0.15, 0.35, 3, 14, 300);
    // afgebladderd pleister: een paar grote stukken baksteen zichtbaar
    for (let i = 0; i < 2; i++) {
      const cx = 100 + r() * (s - 200), cy = 100 + r() * (s - 200), rad = 40 + r() * 40;
      g.save();
      g.beginPath();
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2, rr = rad * (0.5 + r() * 0.55);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.75;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.clip();
      brickPattern(g, s, r, cx - rad * 1.3, cy - rad, rad * 2.6, rad * 2, 36, 12, ['#7e4a38', '#8a5541', '#704032', '#93604b'], '#7d7466');
      g.restore();
      g.strokeStyle = '#8f8572'; g.lineWidth = 3; g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1;
    }
    // vochtplekken onderaan en roetvegen
    blobs(g, s, r, 60, ['#8e8370', '#6f6758'], 0.08, 0.16, 10, 30);
    for (let i = 0; i < 45; i++) {
      const x = r() * s, y = r() * s, rad = 1.5 + r() * 2;
      g.fillStyle = '#efe8da'; g.globalAlpha = 0.5; blobW(g, s, x, y, rad + 2, rad + 2, 0);
      g.fillStyle = '#3a332a'; g.globalAlpha = 0.9; blobW(g, s, x, y, rad, rad, 0);
    }
    g.fillStyle = '#7b725f';
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.1; rectW(g, s, r() * s, 0, 2 + r() * 8, 30 + r() * 140); }
    specks(g, s, r, 2500, ['#9d937e', '#f2ecdf'], 0.4);
  },
  brick(g, s, r) {
    brickPattern(g, s, r, 0, 0, s, s, 44, 16, ['#8a4a36', '#97553e', '#7a4030', '#a3624a', '#6f3c2e', '#8f5a45'], '#8b8172');
    blobs(g, s, r, 30, ['#2b2522'], 0.08, 0.18, 10, 40);
    specks(g, s, r, 3000, ['#5a3024', '#b77a61'], 0.4);
  },
  stone(g, s, r) {
    g.fillStyle = '#5f5d57'; g.fillRect(0, 0, s, s);
    const cols = ['#8a877e', '#7c786e', '#96928a', '#6f6b62', '#857c6c', '#9a948a'];
    for (let y = 0; y < s; y += 64) {
      let x = -r() * 100;
      while (x < s) {
        const w = 60 + r() * 80;
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        rectW(g, s, x + 3, y + 3, w - 6, 58);
        g.fillStyle = 'rgba(255,255,255,0.06)'; rectW(g, s, x + 3, y + 3, w - 6, 4);
        g.fillStyle = 'rgba(0,0,0,0.1)'; rectW(g, s, x + 3, y + 56, w - 6, 5);
        x += w;
      }
    }
    blobs(g, s, r, 400, ['#4e4c47', '#a8a399'], 0.08, 0.2, 3, 12);
    specks(g, s, r, 4000, ['#3f3d39', '#b5b0a6'], 0.5);
  },
  concrete(g, s, r) {
    g.fillStyle = '#8f8e89'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 900, ['#878681', '#9a9994', '#7f7e7a'], 0.15, 0.35, 2, 10, 80);
    g.fillStyle = '#6f6e6a'; g.fillRect(0, 0, s, 2); g.fillRect(0, s / 2, s, 2);
    g.fillStyle = '#4a4946';
    for (let x = 32; x < s; x += 64) for (let y = 32; y < s; y += 64) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
    g.fillStyle = '#5d5c58';
    for (let i = 0; i < 30; i++) { g.globalAlpha = 0.12; rectW(g, s, r() * s, r() * s, 2 + r() * 5, 20 + r() * 80); }
    specks(g, s, r, 3000, ['#5e5d59', '#b2b1ab'], 0.5);
  },
  metal(g, s, r) {
    for (let x = 0; x < s; x++) {
      const k = 0.5 + 0.5 * Math.sin((x / s) * Math.PI * 2 * 16);
      const c = Math.round(80 + k * 34);
      g.fillStyle = 'rgb(' + Math.round(c * 0.86) + ',' + c + ',' + Math.round(c * 1.08) + ')';
      g.fillRect(x, 0, 1, s);
    }
    g.fillStyle = '#7a4a2e';
    for (let i = 0; i < 34; i++) { g.globalAlpha = 0.2 + r() * 0.15; rectW(g, s, r() * s, r() * s, 1 + r() * 4, 10 + r() * 70); }
    blobs(g, s, r, 200, ['#2a2d30', '#6a5a4a'], 0.08, 0.2, 2, 14);
    g.globalAlpha = 1;
  },
  roofmetal(g, s, r) {
    for (let x = 0; x < s; x++) {
      const k = 0.5 + 0.5 * Math.sin((x / s) * Math.PI * 2 * 12);
      const c = Math.round(44 + k * 22);
      g.fillStyle = 'rgb(' + c + ',' + (c + 3) + ',' + (c + 6) + ')';
      g.fillRect(x, 0, 1, s);
    }
    blobs(g, s, r, 120, ['#5b4436'], 0.1, 0.2, 4, 20);
  },
  wood(g, s, r) {
    const cols = ['#6b4e35', '#5e4430', '#755639', '#634a33'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(i * 32, 0, 32, s);
      g.fillStyle = '#3b2a1c'; g.fillRect(i * 32, 0, 2, s);
    }
    g.strokeStyle = '#4a3624'; g.lineWidth = 1;
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = 0.3; const x = r() * s;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 4, s); g.stroke();
    }
    g.globalAlpha = 1;
  },
  cobble(g, s, r) {
    g.fillStyle = '#45423c'; g.fillRect(0, 0, s, s);
    const cols = ['#5f5b54', '#57534c', '#66615a', '#524e48', '#5c5850', '#6b665e'];
    for (let row = 0, y = 0; y < s; row++, y += 16) {
      let x = (row % 2) * 9 - 18;
      while (x < s) {
        const w = 14 + r() * 10;
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.globalAlpha = 1;
        blobW(g, s, x + w / 2, y + 8, w / 2 - 1.5, 6.2 + r(), (r() - 0.5) * 0.2);
        x += w;
      }
    }
    g.globalAlpha = 1;
    blobs(g, s, r, 220, ['#2f2c28', '#5a5246', '#4b4a40'], 0.1, 0.3, 8, 34, 40);
    specks(g, s, r, 4000, ['#24221f', '#8b857a'], 0.45);
  },
  slush(g, s, r) {
    g.fillStyle = '#b9b8b6'; g.fillRect(0, 0, s, s);
    blobs(g, s, r, 1800, ['#a8a39c', '#cfd3d8', '#9b958c', '#e2e6ea', '#8f897f'], 0.2, 0.45, 3, 14, 220);
    g.lineWidth = 2;
    for (let i = 0; i < 120; i++) {
      g.globalAlpha = 0.25; g.strokeStyle = i % 2 ? '#857f75' : '#f2f5f8';
      const x = r() * s, y = r() * s, l = 20 + r() * 60, a = r() * 6.28;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.globalAlpha = 1;
    specks(g, s, r, 3000, ['#ffffff', '#6f6a62'], 0.6);
  },
  skyline(g, s, r) {
    g.fillStyle = '#07090d'; g.fillRect(0, 0, s, s);
    for (let y = 4; y < s; y += 16) {
      for (let x = 4; x < s; x += 12) {
        const u = r();
        if (u < 0.32) { g.fillStyle = u < 0.22 ? '#ffcf8a' : '#cfe0ff'; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(x, y, 7, 9); }
      }
    }
    g.globalAlpha = 1;
  },
};
function levelTex(name) { return cachedTex(name, name === 'metal' || name === 'roofmetal' || name === 'wood' || name === 'concrete' || name === 'skyline' ? 256 : 512, TEX_DRAW[name]); }
function radialTex(name, inner, mid, outer) {
  return cachedTex(name, 64, (g, s) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner); gr.addColorStop(0.4, mid); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}

// ---- grond

function hash2(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
const GROUND_CFG = {
  desert: {
    tex: 'sand', texM: 9, seg: 150,
    color(x, z, h, rd, c) {
      const v = 0.92 + 0.08 * Math.sin(x * 0.13 + Math.cos(z * 0.11) * 2) * Math.cos(z * 0.09);
      c.setRGB(v, v * 0.985, v * 0.96);
      c.multiplyScalar(1 + Math.max(0, Math.min(1, (h - 1.2) / 3)) * 0.07);
      if (rd <= -1) c.multiplyScalar(0.86).lerp(new THREE.Color(0.84, 0.72, 0.6), 0.35);
      else if (rd < 1.2) c.lerp(new THREE.Color(0.8, 0.68, 0.55), Math.min(1, (1.2 - rd) / 1.6) * 0.55);
    },
  },
  snow: {
    tex: 'snow', texM: 8, seg: 150, rough: 0.85,
    color(x, z, h, rd, c, slope) {
      const v = 0.95 + 0.05 * Math.sin(x * 0.2 + z * 0.13);
      c.setRGB(v, v, v);
      const rock = Math.max(0, Math.min(1, (slope - 0.55) * 2.5)) * (0.6 + 0.4 * hash2(Math.floor(x / 3), Math.floor(z / 3)));
      if (rock > 0) c.lerp(new THREE.Color(0.42, 0.43, 0.46), rock);
      if (rd < 1.5) {
        // weg: platgereden, grijsbruine sneeuw met twee bandensporen
        const k = Math.min(1, (1.5 - rd) / 2);
        const off = rd + 3.2;   // afstand tot het midden van de weg
        const track = Math.abs(off - 1.1) < 0.5 ? 0.3 : 0;
        c.lerp(new THREE.Color(0.62, 0.6, 0.58), k * (0.5 + track));
      }
    },
  },
  village: {
    tex: 'dirt', texM: 7, seg: 190,
    color(x, z, h, rd, c) {
      const n = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.06 + 1);
      c.setRGB(0.95 + n * 0.1, 0.95 + n * 0.12, 0.92);
      if (rd < 0.6) {
        const k = Math.min(1, (0.6 - rd) / 1.2);
        const cob = 0.85 + 0.15 * hash2(Math.floor(x * 2.2), Math.floor(z * 2.2));
        c.lerp(new THREE.Color(0.86 * cob, 0.88 * cob, 0.95 * cob), k * 0.85);
      }
    },
  },
  harbour: {
    tex: 'asphalt', texM: 8, seg: 80, zMax: S.MAP_HALF,
    color(x, z, h, rd, c) {
      const v = 0.82 + 0.25 * hash2(Math.floor(x / 6), Math.floor(z / 6));
      c.setRGB(v, v, v * 1.02);
      if (z > S.MAP_HALF - 6) c.multiplyScalar(1.15);   // lichtere betonnen kaderand
    },
  },
};

function buildGeneratedGround(g, id) {
  const cfg = GROUND_CFG[id] || GROUND_CFG.village;
  const ext = S.MAP_HALF + 70;
  const zMax = cfg.zMax !== undefined ? cfg.zMax : ext;
  const w = ext * 2, d = zMax + ext;
  const seg = LOW ? Math.round(cfg.seg * 0.66) : cfg.seg;
  const geo = new THREE.PlaneGeometry(w, d, seg, Math.max(2, Math.round((seg * d) / w)));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, (zMax - ext) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = S.heightAt(id, x, z);
    pos.setY(i, h);
    const slope = Math.hypot(S.heightAt(id, x + 1, z) - h, S.heightAt(id, x, z + 1) - h);
    cfg.color(x, z, h, S.roadDist(id, x, z), c, slope);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = levelTex(cfg.tex);
  const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: cfg.rough || 1, metalness: 0 });
  // texture-herhaling via UV's (gedeelde texture, dus niet tex.repeat aanpassen)
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / cfg.texM, -pos.getZ(i) / cfg.texM);
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  ground.userData.ownGeo = true;
  g.add(ground);
}

// Bestrating over de grond waar roadDist < 0 (zachte randen via vertex-alfa).
function buildRoadOverlay(g, id, texName, texM) {
  const step = LOW ? 0.8 : 0.5, half = S.MAP_HALF;
  const n = Math.round((2 * half) / step) + 1;
  const rd = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) rd[i * n + j] = S.roadDist(id, -half + i * step, -half + j * step);
  const pos = [], col = [], uv = [], idx = [];
  const vmap = new Int32Array(n * n).fill(-1);
  const vert = (i, j) => {
    const k = i * n + j;
    if (vmap[k] >= 0) return vmap[k];
    const x = -half + i * step, z = -half + j * step;
    vmap[k] = pos.length / 3;
    pos.push(x, S.heightAt(id, x, z) + 0.02, z);
    const a = Math.max(0, Math.min(1, (0.35 - rd[k]) / 0.7));
    col.push(1, 1, 1, a);
    uv.push(x / texM, -z / texM);
    return vmap[k];
  };
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const k = i * n + j;
      if (Math.min(rd[k], rd[k + 1], rd[k + n], rd[k + n + 1]) > 0.35) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
      idx.push(a, c, b, a, d, c);
    }
  }
  if (!idx.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: levelTex(texName), vertexColors: true, transparent: true, roughness: 0.95,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.userData.ownGeo = true;
  g.add(m);
}

// ---- muren en gebouwen (samengevoegd per materiaal)

const WALL_STYLE = {
  adobe: { tex: 'adobe', m: 4 }, plaster: { tex: 'plaster', m: 6 }, brick: { tex: 'brick', m: 3 },
  stone: { tex: 'stone', m: 3 }, concrete: { tex: 'concrete', m: 3.5 }, metal: { tex: 'metal', m: 2.5, metal: 0.35, rough: 0.7 },
  wood: { tex: 'wood', m: 2 }, roof: { tex: 'roofmetal', m: 3, metal: 0.4, rough: 0.7 },
};
const WALL_TINTS = {
  plaster: [[1, 1, 1], [1, 0.93, 0.8], [0.98, 0.86, 0.82], [0.88, 0.9, 0.92], [0.96, 0.9, 0.72], [0.9, 0.95, 0.88]],
  metal: [[0.75, 0.95, 1.0], [1.0, 1.0, 1.0], [0.85, 1.0, 0.85], [1.0, 0.85, 0.75]],
  adobe: [[1, 1, 1], [1.0, 0.95, 0.9], [0.95, 0.93, 0.92]],
};

function newArrays() { return { pos: [], nor: [], uv: [], col: [], idx: [] }; }
// Vierhoek a-b-c-d (rondom), normaal n; draairichting wordt zo nodig omgedraaid.
function pushQuad(A, v, n, uvs, cols) {
  const ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
  const bx = v[3][0] - v[0][0], by = v[3][1] - v[0][1], bz = v[3][2] - v[0][2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
  const base = A.pos.length / 3;
  for (let i = 0; i < 4; i++) {
    A.pos.push(v[i][0], v[i][1], v[i][2]);
    A.nor.push(n[0], n[1], n[2]);
    A.uv.push(uvs[i][0], uvs[i][1]);
    const c = cols[i] || cols[0];
    A.col.push(c[0], c[1], c[2]);
  }
  if (flip) A.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  else A.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function arraysToMesh(A, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
  geo.setIndex(A.idx);
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.userData.ownGeo = true;
  return m;
}

// Doos van een muurstuk p (lokale X = lengte) van y0 tot y1.
function addWallBox(A, p, hx, hz, y0, y1, M, tint, uOff, darkBase) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const W = (lx, lz, y) => [p.x + lx * c + lz * s, y, p.z - lx * s + lz * c];
  const N = (nx, nz) => [nx * c + nz * s, 0, -nx * s + nz * c];
  const bot = darkBase ? [tint[0] * 0.72, tint[1] * 0.72, tint[2] * 0.72] : tint;
  const vb = (y0 - p.baseY) / M, vt = (y1 - p.baseY) / M;
  const faces = [
    [[-hx, hz], [hx, hz], [0, 1], 2 * hx], [[hx, -hz], [-hx, -hz], [0, -1], 2 * hx],
    [[hx, hz], [hx, -hz], [1, 0], 2 * hz], [[-hx, -hz], [-hx, hz], [-1, 0], 2 * hz],
  ];
  for (const [P, Q, n, len] of faces) {
    const u0 = uOff / M, u1 = (uOff + len) / M;
    pushQuad(A, [W(P[0], P[1], y0), W(Q[0], Q[1], y0), W(Q[0], Q[1], y1), W(P[0], P[1], y1)], N(n[0], n[1]),
      [[u0, vb], [u1, vb], [u1, vt], [u0, vt]], [bot, bot, tint, tint]);
  }
  const top = [tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9];
  pushQuad(A, [W(-hx, -hz, y1), W(hx, -hz, y1), W(hx, hz, y1), W(-hx, hz, y1)], [0, 1, 0],
    [[-hx / M, -hz / M], [hx / M, -hz / M], [hx / M, hz / M], [-hx / M, hz / M]], [top]);
  if (y0 > p.baseY + 0.5) {   // onderkant van lateien / daken
    pushQuad(A, [W(-hx, -hz, y0), W(hx, -hz, y0), W(hx, hz, y0), W(-hx, hz, y0)], [0, -1, 0],
      [[-hx / M, -hz / M], [hx / M, -hz / M], [hx / M, hz / M], [-hx / M, hz / M]], [bot]);
  }
}

// Ramen/deuren als platte vlakjes op een zijde van een massief gebouw.
function faceQuad(A, p, nx, nz, along, yc, w, h, col) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const ext = (nx ? p.hx : p.hz) + 0.03;
  const tx = nz, tz = -nx;
  const cxl = nx * ext + tx * along, czl = nz * ext + tz * along;
  const W = (lx, lz, y) => [p.x + lx * c + lz * s, y, p.z - lx * s + lz * c];
  const n = [nx * c + nz * s, 0, -nx * s + nz * c];
  const ax = tx * w / 2, az = tz * w / 2, y0 = yc - h / 2, y1 = yc + h / 2;
  pushQuad(A, [W(cxl - ax, czl - az, y0), W(cxl + ax, czl + az, y0), W(cxl + ax, czl + az, y1), W(cxl - ax, czl - az, y1)], n,
    [[0, 0], [1, 0], [1, 1], [0, 1]], [col]);
}

function dressBuilding(p, id, dark, lit, lampHeads) {
  const sides = [[0, 1, p.hx], [0, -1, p.hx], [1, 0, p.hz], [-1, 0, p.hz]];
  const r = rng(Math.floor(p.x * 13 + p.z * 7) | 0);
  const b = p.baseY;
  if (p.deco === 'warehouse') {
    for (const [nx, nz, half] of sides) {
      if (nx) {
        faceQuad(dark, p, nx, nz, 0, b + 2.6, 5.5, 5.2, [0.32, 0.33, 0.33]);
        faceQuad(lit, p, nx, nz, 0, b + 5.7, 0.8, 0.25, [1, 0.8, 0.55]);
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw), lx = nx * (p.hx + 0.6);
        lampHeads.push({ x: p.x + lx * c, y: b + 5.4, z: p.z - lx * s });
      } else {
        for (let a = -half + 2; a <= half - 2; a += 3) faceQuad(lit, p, nx, nz, a, b + p.h - 1.2, 2.2, 0.5, [0.75, 0.85, 1]);
      }
    }
    return;
  }
  const office = p.deco === 'office';
  const rows = office ? (p.h > 4 ? [1.4, 3.0] : [1.5]) : p.h > 5.2 ? [1.5, 4.0] : [1.6];
  let doorDone = false;
  for (const [nx, nz, half] of sides) {
    const n = Math.floor((half * 2 - 1.5) / 2.6);
    for (let k = 0; k < n; k++) {
      const a = (k - (n - 1) / 2) * 2.6;
      for (const yy of rows) {
        if (!doorDone && yy === rows[0] && k === Math.floor(n / 2)) {
          faceQuad(dark, p, nx, nz, a, b + 1.0, 1.1, 2.0, [0.16, 0.12, 0.09]);
          doorDone = true;
          continue;
        }
        if (office) {
          const on = r() < 0.7;
          faceQuad(on ? lit : dark, p, nx, nz, a, b + yy, 1.5, 1.0, on ? (r() < 0.6 ? [1, 0.85, 0.6] : [0.8, 0.9, 1]) : [0.08, 0.09, 0.1]);
        } else {
          faceQuad(dark, p, nx, nz, a, b + yy, 0.75, 0.85, [0.13, 0.1, 0.08]);
        }
      }
    }
  }
}

function buildWalls(g, id, props) {
  const groups = {};
  for (const p of props) if (p.kind === 'wall' && !p.hidden) (groups[p.mat] = groups[p.mat] || []).push(p);   // hidden = botsing van de blokhut (eigen model)
  const dark = newArrays(), lit = newArrays();
  const lampHeads = [];
  for (const mat in groups) {
    const st = WALL_STYLE[mat] || WALL_STYLE.concrete;
    const A = newArrays();
    const tints = WALL_TINTS[mat];
    for (const p of groups[mat]) {
      const hsh = hash2(p.gid || Math.floor(p.x), (p.gid || 0) * 0.37 + 1.7);
      const t0 = tints ? tints[Math.floor(hsh * tints.length)] : [1, 1, 1];
      const k = 0.9 + 0.12 * hash2(p.gid || 3, 9.1);
      const tint = [t0[0] * k, t0[1] * k, t0[2] * k];
      const yb = p.yb || 0;
      const y0 = yb > 0 ? p.baseY + yb : p.baseY - 0.3, y1 = p.baseY + yb + p.h;
      addWallBox(A, p, p.hx, p.hz, y0, y1, st.m, tint, hsh * 40, yb === 0 && p.h > 1.5);
      const solid = p.hz >= 1 && p.h >= 2.5 && !yb && mat !== 'roof';
      if (solid && mat === 'adobe') addWallBox(A, p, p.hx + 0.1, p.hz + 0.1, y1 - 0.05, y1 + 0.28, st.m, [tint[0] * 0.95, tint[1] * 0.95, tint[2] * 0.95], 0, false);
      if (solid) dressBuilding(p, id, dark, lit, lampHeads);
    }
    const m = new THREE.MeshStandardMaterial({
      map: levelTex(st.tex), vertexColors: true, roughness: st.rough || 0.95, metalness: st.metal || 0,
    });
    const mesh = arraysToMesh(A, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.ownMat = true;
    g.add(mesh);
  }
  if (dark.idx.length) {
    const m = arraysToMesh(dark, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));
    m.userData.ownMat = true; m.receiveShadow = true;
    g.add(m);
  }
  if (lit.idx.length) {
    const m = arraysToMesh(lit, new THREE.MeshBasicMaterial({ vertexColors: true }));
    m.userData.ownMat = true;
    g.add(m);
  }
  return lampHeads;
}

// ---- props (instanced)

const tmpObj = new THREE.Object3D();
const tmpCol = new THREE.Color();
// items: {x, y, z, yaw, s | sx/sy/sz, rx, rz, color}
function addInstanced(g, name, items, opts) {
  opts = opts || {};
  const src = MODELS[name];
  if (!items.length) return true;
  if (!src) return false;
  for (const part of bakedParts(src)) {
    const mat = opts.material || part.material;
    const inst = new THREE.InstancedMesh(part.geometry, mat, items.length);
    items.forEach((it, i) => {
      tmpObj.position.set(it.x, it.y, it.z);
      tmpObj.rotation.set(it.rx || 0, it.yaw || 0, it.rz || 0);
      if (it.sx) tmpObj.scale.set(it.sx, it.sy, it.sz); else tmpObj.scale.setScalar(it.s || 1);
      tmpObj.updateMatrix();
      inst.setMatrixAt(i, tmpObj.matrix);
      if (it.color !== undefined && opts.tint && part.material.name === opts.tint) inst.setColorAt(i, tmpCol.setHex(it.color));
    });
    if (opts.material) inst.userData.ownMat = true;
    inst.castShadow = opts.shadow !== false && !LOW;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    g.add(inst);
  }
  return true;
}

const PALETTES = {
  desert: { container: [0xb89a6a, 0x8c4a2f, 0x5f7486, 0x6b6b48, 0xc9c2b0, 0x9a6b3c], barrel: [0x55603a, 0x7a2e22, 0x2f4f6b, 0x3c3c3c], rock: 0xe0b98a },
  harbour: { container: [0xa8322a, 0x2a5d9c, 0x2f7a4a, 0xd9822b, 0x8a8f94, 0xe0ddd5, 0x6b2a3a, 0x1f7f86, 0xc9a227], barrel: [0x1f4fa0, 0xb02a20, 0xd8b020, 0x222222, 0x2e7d4f], rock: 0xffffff },
  default: { container: [0x6b6b48, 0x8c4a2f, 0x5f7486], barrel: [0x55603a, 0x7a2e22, 0x2f4f6b], rock: 0xffffff },
};

function buildGeneratedProps(g, id, obs, r) {
  const pal = PALETTES[id] || PALETTES.default;
  const items = {};
  const push = (n, it) => (items[n] = items[n] || []).push(it);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const wells = [];
  for (const p of obs.props) {
    const b = p.baseY;
    switch (p.kind) {
      case 'container': {
        for (let k = 0; k < p.stack; k++) push('container', { x: p.x, y: b + k * 2.59, z: p.z, yaw: p.yaw + (k ? (r() - 0.5) * 0.03 : 0), color: pick(pal.container) });
        break;
      }
      case 'crate':
        for (let k = 0; k < p.stack; k++) push('crate', { x: p.x, y: b - 0.08 + k * 1.1, z: p.z, yaw: p.yaw + (k ? 0.25 : 0) });
        break;
      case 'sandbags': push('sandbags', { x: p.x, y: b - 0.08, z: p.z, yaw: p.yaw }); break;
      case 'tower': push('tower', { x: p.x, y: b - 0.08, z: p.z, yaw: p.yaw }); break;
      case 'barrel': push('barrel', { x: p.x, y: b, z: p.z, yaw: r() * 6.3, color: pick(pal.barrel) }); break;
      case 'rubble': push('rubble', { x: p.x, y: b - 0.05, z: p.z, yaw: p.yaw, sx: 0.85, sy: 1, sz: 0.8 }); break;
      case 'well': wells.push(p); break;
      case 'wall': break;
      default: push(p.kind, { x: p.x, y: b, z: p.z, yaw: p.yaw });
    }
  }
  for (const t of obs.trees) {
    if (t.kind === 'boulder') {
      const sx = t.r / 0.7, sy = t.h / 0.42, sz = t.r / 0.62;
      push('rock', { x: t.x, y: t.baseY - 0.03 * sy, z: t.z, yaw: r() * 6.3, sx, sy, sz, rx: (r() - 0.5) * 0.2, rz: (r() - 0.5) * 0.2, color: pal.rock });
    } else {
      push(t.kind, { x: t.x, y: t.baseY - 0.15, z: t.z, yaw: r() * 6.3, s: t.scale * (t.kind === 'palm' ? 1 : 0.95) });
    }
  }
  let ok = true;
  for (const n in items) ok = addInstanced(g, n, items[n], { tint: n === 'container' ? 'ContainerPaint' : n === 'barrel' ? 'BarrelPaint' : n === 'rock' ? 'Rock' : null }) && ok;
  if (wells.length) {
    const st = new THREE.MeshStandardMaterial({ map: levelTex('stone'), roughness: 0.95 });
    for (const p of wells) {
      const D = S.PROP_DIMS.well;
      const geo = new THREE.CylinderGeometry(D.r, D.r + 0.05, D.h + 0.3, 20, 1, true);
      const m = new THREE.Mesh(geo, st);
      m.position.set(p.x, p.baseY + (D.h - 0.3) / 2, p.z);
      m.castShadow = true; m.receiveShadow = true;
      m.material.side = THREE.DoubleSide;
      m.userData.ownGeo = true;
      g.add(m);
      const water = new THREE.Mesh(new THREE.CircleGeometry(D.r - 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.2 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(p.x, p.baseY + 0.5, p.z);
      water.userData.ownGeo = true;
      g.add(water);
    }
  }
  // sneeuwkapjes op de rotsblokken
  if (id === 'snow' && items.rock && MODELS.rock) {
    const capMat = new THREE.MeshStandardMaterial({ color: 0xe9eff7, roughness: 0.8 });
    const caps = items.rock.map((it) => ({ x: it.x, y: it.y + it.sy * 0.3, z: it.z, yaw: it.yaw, sx: it.sx * 0.9, sy: it.sy * 0.42, sz: it.sz * 0.9, rx: it.rx, rz: it.rz }));
    addInstanced(g, 'rock', caps, { material: capMat, shadow: false });
  }
  return ok;
}

// Vrije plekjes voor decoratie (geen botsing): niet in obstakels.
function decoSpots(id, r, n, minR, maxR, clearR) {
  const out = [];
  for (let t = 0; t < n * 6 && out.length < n; t++) {
    const x = (r() * 2 - 1) * maxR, z = (r() * 2 - 1) * maxR;
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d < minR || d > maxR) continue;
    if (d < S.MAP_HALF && !S.isClear(id, x, z, clearR)) continue;
    if (S.insideBuilding(id, x, z, 0.8) >= 0) continue;   // geen struiken/rotsjes binnen in gebouwen
    out.push({ x, z, y: S.heightAt(id, x, z) });
  }
  return out;
}
function ringSpots(id, r, n, inner, outer) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = inner + r() * (outer - inner);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    out.push({ x, z, y: S.heightAt(id, x, z) });
  }
  return out;
}

// Grondplekjes (lichtcirkels van lampen, kraters): plat vlak dat licht optelt of donker maakt.
function addDecals(g, spots, tex, size, opts) {
  if (!spots.length) return;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, color: opts.color || 0xffffff, opacity: opts.opacity || 1,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: !opts.additive,
  });
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  spots.forEach((p, i) => {
    tmpObj.position.set(p.x, p.y + 0.04, p.z);
    tmpObj.rotation.set(0, p.yaw || 0, 0);
    tmpObj.scale.set(p.s || size, 1, p.s || size);
    tmpObj.updateMatrix();
    inst.setMatrixAt(i, tmpObj.matrix);
  });
  inst.userData.ownMat = true;
  inst.renderOrder = 1;
  inst.computeBoundingSphere();
  g.add(inst);
}

// Een paar echte puntlichten die steeds naar de lampen het dichtst bij de camera springen.
function lampLightPool(g, heads, count, color, intensity, dist) {
  if (!heads.length) return null;
  const lights = [];
  for (let i = 0; i < count; i++) {
    const L = new THREE.PointLight(color, intensity, dist, 2);
    L.position.set(heads[i % heads.length].x, heads[i % heads.length].y, heads[i % heads.length].z);
    g.add(L);
    lights.push(L);
  }
  let next = 0;
  return (now) => {
    if (now < next) return;
    next = now + 250;
    const cx = camera.position.x, cz = camera.position.z;
    const sorted = heads.map((h) => [Math.hypot(h.x - cx, h.z - cz), h]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < lights.length; i++) {
      const h = sorted[i] && sorted[i][1];
      if (h) lights[i].position.set(h.x, h.y, h.z);
    }
  };
}

// Vallende sneeuw rond de camera.
function snowfall(g) {
  const N = LOW ? 1200 : 2600, B = 46, H = 24;
  const pos = new Float32Array(N * 3), spd = new Float32Array(N);
  const r = rng(77);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (r() - 0.5) * B; pos[i * 3 + 1] = r() * H; pos[i * 3 + 2] = (r() - 0.5) * B;
    spd[i] = 1.2 + r() * 1.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = radialTex('flake', 'rgba(255,255,255,1)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)');
  const mat = new THREE.PointsMaterial({ size: 0.16, map: tex, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.9 });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.ownGeo = true;
  g.add(pts);
  let t = 0;
  return (dt) => {
    t += dt;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < N; i++) {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      y -= spd[i] * dt;
      x += Math.sin(t * 0.7 + i) * 0.4 * dt + 0.6 * dt;
      if (y < cy - 8) y += H;
      if (y > cy + H - 8) y -= H;
      if (x - cx > B / 2) x -= B; else if (x - cx < -B / 2) x += B;
      if (z - cz > B / 2) z -= B; else if (z - cz < -B / 2) z += B;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    pts.visible = S.insideBuilding('snow', cx, cz) < 0;   // geen sneeuw binnen in een blokhut
  };
}

// Opstijgende rookpluimen (brandende ruïnes).
function smokeColumns(g, spots) {
  const tex = radialTex('smoke', 'rgba(70,68,66,0.55)', 'rgba(70,68,66,0.3)', 'rgba(70,68,66,0)');
  const parts = [];
  for (const s of spots) {
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.userData.ownMat = true;
      g.add(sp);
      parts.push({ sp, s, age: i / 9 });
    }
  }
  return (dt) => {
    for (const p of parts) {
      p.age += dt / 9;
      if (p.age > 1) p.age -= 1;
      const k = p.age;
      p.sp.position.set(p.s.x + k * 6, p.s.y + 1 + k * 22, p.s.z + k * 2.5);
      const size = 2 + k * 9;
      p.sp.scale.set(size, size, 1);
      p.sp.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.9;
    }
  };
}

const LEVEL_DECOR = {
  desert(g, id, obs, r) {
    const shrubs = decoSpots(id, r, LOW ? 90 : 170, 0, S.MAP_HALF + 40, 0.8)
      .map((p) => ({ x: p.x, y: p.y - 0.05, z: p.z, yaw: r() * 6.3, s: 0.6 + r() * 0.9 }));
    const rocks = decoSpots(id, r, LOW ? 50 : 100, 0, S.MAP_HALF + 40, 0.8)
      .map((p) => { const s = 0.25 + r() * 0.55; return { x: p.x, y: p.y - 0.1 * s, z: p.z, yaw: r() * 6.3, sx: s, sy: s * (0.6 + r() * 0.5), sz: s, color: 0xe0b98a }; });
    const palms = ringSpots(id, r, LOW ? 20 : 40, S.MAP_HALF + 8, S.MAP_HALF + 50)
      .map((p) => ({ x: p.x, y: p.y - 0.15, z: p.z, yaw: r() * 6.3, s: 0.8 + r() * 0.5 }));
    let ok = addInstanced(g, 'shrub', shrubs, { shadow: false });
    ok = addInstanced(g, 'rock', rocks, { tint: 'Rock', shadow: false }) && ok;
    ok = addInstanced(g, 'palm', palms) && ok;
    return ok;
  },
  snow(g, id, obs, r) {
    buildRoadOverlay(g, id, 'slush', 4);
    const deco = ringSpots(id, r, LOW ? 140 : 260, S.MAP_HALF + 6, S.MAP_HALF + 60)
      .map((p) => ({ x: p.x, y: p.y - 0.2, z: p.z, yaw: r() * 6.3, s: 0.9 + r() * 0.8 }));
    let ok = addInstanced(g, 'snowpine', deco);
    const young = decoSpots(id, r, LOW ? 60 : 120, 0, S.MAP_HALF, 1.0)
      .map((p) => { const s = 0.14 + r() * 0.14; return { x: p.x, y: p.y - 0.2 - s * 2.2, z: p.z, yaw: r() * 6.3, sx: s * 1.3, sy: s, sz: s * 1.3 }; });
    if (MODELS.snowpine) {
      const fol = bakedParts(MODELS.snowpine).find((p) => /foliage/i.test(p.name));
      if (fol) {
        const inst = new THREE.InstancedMesh(fol.geometry, fol.material, young.length);
        young.forEach((it, i) => { tmpObj.position.set(it.x, it.y, it.z); tmpObj.rotation.set(0, it.yaw, 0); tmpObj.scale.set(it.sx, it.sy, it.sz); tmpObj.updateMatrix(); inst.setMatrixAt(i, tmpObj.matrix); });
        inst.receiveShadow = true; inst.computeBoundingSphere();
        g.add(inst);
      }
    }
    const rocks = decoSpots(id, r, LOW ? 50 : 90, 0, S.MAP_HALF + 30, 0.8)
      .map((p) => { const s = 0.3 + r() * 0.5; return { x: p.x, y: p.y - 0.12 * s, z: p.z, yaw: r() * 6.3, sx: s, sy: s * 0.7, sz: s }; });
    ok = addInstanced(g, 'rock', rocks, { shadow: false }) && ok;
    levelFx = snowfall(g);
    return ok;
  },
  village(g, id, obs, r) {
    buildRoadOverlay(g, id, 'cobble', 3);
    // puin langs muren (alleen decoratie)
    const walls = obs.props.filter((p) => p.kind === 'wall' && !p.yb && p.h > 1.2);
    const rub = [];
    for (let t = 0; t < 400 && rub.length < (LOW ? 40 : 75); t++) {
      const p = walls[Math.floor(r() * walls.length)];
      if (!p) break;
      const side = r() < 0.5 ? -1 : 1, along = (r() * 2 - 1) * p.hx;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), lz = side * (p.hz + 0.7);
      const x = p.x + along * c + lz * s, z = p.z - along * s + lz * c;
      if (!S.isClear(id, x, z, 0.5)) continue;
      const k = 0.4 + r() * 0.4;
      rub.push({ x, y: S.heightAt(id, x, z) - 0.05, z, yaw: r() * 6.3, sx: k, sy: k * (0.7 + r() * 0.5), sz: k });
    }
    let ok = addInstanced(g, 'rubble', rub, { shadow: false });
    const pines = ringSpots(id, r, LOW ? 70 : 130, S.MAP_HALF + 10, S.MAP_HALF + 60)
      .map((p) => ({ x: p.x, y: p.y - 0.15, z: p.z, yaw: r() * 6.3, s: 0.8 + r() * 0.7 }));
    ok = addInstanced(g, 'pine', pines) && ok;
    addDecals(g, decoSpots(id, r, 26, 0, S.MAP_HALF, 1.5).map((p) => ({ x: p.x, y: p.y, z: p.z, s: 2.5 + r() * 3, yaw: r() * 6 })),
      radialTex('crater', 'rgba(25,22,18,0.85)', 'rgba(45,40,34,0.45)', 'rgba(50,45,40,0)'), 4, {});
    // rook uit een paar ruïnes
    const smoke = [];
    for (let i = 0; i < 4 && walls.length; i++) {
      const p = walls[Math.floor(r() * walls.length)];
      smoke.push({ x: p.x, y: p.baseY, z: p.z });
    }
    levelFx = smokeColumns(g, smoke);
    return ok;
  },
  harbour(g, id, obs, r, lampHeads) {
    // water, kademuur en een vrachtschip
    const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), new THREE.MeshStandardMaterial({ color: 0x08131d, roughness: 0.18, metalness: 0.6 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -1.7, S.MAP_HALF + 210);
    water.userData.ownGeo = true;
    g.add(water);
    const quay = new THREE.Mesh(new THREE.PlaneGeometry(330, 2.2), new THREE.MeshStandardMaterial({ map: levelTex('concrete'), roughness: 0.95 }));
    quay.position.set(0, -1.1, S.MAP_HALF);
    quay.userData.ownGeo = true;
    g.add(quay);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(330, 0.3), new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.8 }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.03, S.MAP_HALF - 2.2);
    line.userData.ownGeo = true;
    g.add(line);
    const bollardGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.6, 10);
    bollardGeo.translate(0, 0.3, 0);
    const bol = new THREE.InstancedMesh(bollardGeo, new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6, metalness: 0.5 }), 30);
    for (let i = 0; i < 30; i++) { tmpObj.position.set(-160 + i * 11, 0, S.MAP_HALF - 0.6); tmpObj.rotation.set(0, 0, 0); tmpObj.scale.setScalar(1); tmpObj.updateMatrix(); bol.setMatrixAt(i, tmpObj.matrix); }
    bol.userData.ownMat = true;
    g.add(bol);
    let ok = addInstanced(g, 'ship', [{ x: 15, y: -1.7, z: S.MAP_HALF + 32, yaw: 0 }], { shadow: false });
    // skyline in de verte
    const sky2 = new THREE.MeshBasicMaterial({ map: levelTex('skyline'), color: 0xffffff });
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.5 + (i / 25) * Math.PI * 1.0 + Math.PI;     // west, zuid, oost
      const d = 175 + r() * 50, w = 14 + r() * 26, h = 14 + r() * 40;
      const geo = new THREE.BoxGeometry(w, h, w * 0.7);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 12, uv.getY(k) * h / 16);
      const m = new THREE.Mesh(geo, sky2);
      m.position.set(Math.sin(a) * d, h / 2 - 1, Math.cos(a) * d);
      m.rotation.y = a;
      m.userData.ownGeo = true;
      g.add(m);
    }
    // lantaarnpalen: lichtcirkels op de grond, lichtkegels en een pool echte lampen
    const heads = lampHeads.slice();
    for (const p of obs.props) {
      if (p.kind !== 'lamp') continue;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      heads.push({ x: p.x + 1.35 * c, y: p.baseY + 7.1, z: p.z - 1.35 * s, lamp: true });
    }
    // lampen onder het dak van de open loods
    const roof = obs.props.find((p) => p.mat === 'roof');
    if (roof) {
      for (const lx of [-12, 0, 12]) heads.push({ x: roof.x + lx, y: roof.baseY + 7.4, z: roof.z, lamp: true, inside: true });
      const fx = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe0b0 }));
      for (const lx of [-12, 0, 12]) { const f = fx.clone(); f.position.set(roof.x + lx, roof.baseY + 7.8, roof.z); g.add(f); }
      fx.userData.ownGeo = true; fx.userData.ownMat = true; g.add(fx); fx.visible = false;
    }
    const pools = heads.filter((h) => h.lamp).map((h) => ({ x: h.x, y: 0, z: h.z, s: 15 + r() * 2 }));
    addDecals(g, pools, radialTex('lamppool', 'rgba(255,196,120,0.8)', 'rgba(255,170,90,0.3)', 'rgba(255,150,70,0)'), 15, { additive: true });
    // lichtbundel: zacht, vervaagt naar beneden (vertexkleur)
    const coneGeo = new THREE.ConeGeometry(3.2, 6.8, 20, 4, true);
    coneGeo.translate(0, -3.4, 0);
    {
      const cp = coneGeo.attributes.position, cc = new Float32Array(cp.count * 3);
      for (let i = 0; i < cp.count; i++) { const k = Math.pow(Math.max(0, 1 + cp.getY(i) / 6.8), 2.2); cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = k; }
      coneGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    }
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffb060, vertexColors: true, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false });
    const lampsOnly = heads.filter((h) => h.lamp && !h.inside);
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, Math.max(1, lampsOnly.length));
    lampsOnly.forEach((h, i) => { tmpObj.position.set(h.x, h.y + 0.05, h.z); tmpObj.rotation.set(0, 0, 0); tmpObj.scale.setScalar(1); tmpObj.updateMatrix(); cones.setMatrixAt(i, tmpObj.matrix); });
    cones.count = lampsOnly.length;
    cones.userData.ownMat = true;
    cones.renderOrder = 2;
    cones.computeBoundingSphere();
    g.add(cones);
    const pool = lampLightPool(g, heads, LOW ? 3 : 6, 0xffb46a, 70, 22);
    levelFx = (dt, now) => { if (pool) pool(now); };
    return ok;
  },
};

function buildGeneratedLevel(g, id) {
  const obs = S.getObstacles(id);
  const r = rng(91 + id.length * 31 + id.charCodeAt(0));
  buildGeneratedGround(g, id);
  const lampHeads = buildWalls(g, id, obs.props);
  let ok = buildGeneratedProps(g, id, obs, r);
  const db = doors.build(g, id, obs);   // DEUR-HOOK: deurbladen, ladders, lantaarns (+ lampen voor de haven)
  lampHeads.push(...db.heads);
  ok = db.ok && ok;
  const deco = LEVEL_DECOR[id];
  if (deco) ok = deco(g, id, obs, r, lampHeads) && ok;
  g.userData.needsModels = !ok && !levelModelsDone;
}

// ---- poppetjes

const matCache = new Map();
function mat(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); matCache.set(color, m); }
  return m;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(unitBox, mat(color));
  m.scale.set(w, h, d);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}

function gunMesh(weaponId) {
  const g = new THREE.Group();
  let front = 0.75;
  if (weaponId === 'shotgun') {
    g.add(box(0.1, 0.12, 0.85, 0x1c1c1c, 0, 0.02, 0.25));
    g.add(box(0.13, 0.16, 0.45, 0x6d4c41, 0, -0.02, -0.05));
  } else if (weaponId === 'smg') {
    g.add(box(0.09, 0.13, 0.6, 0x262626, 0, 0, 0.12));
    g.add(box(0.06, 0.24, 0.08, 0x111111, 0, -0.16, 0.12));
    front = 0.45;
  } else if (weaponId === 'sniper' || weaponId === 'dmr') {
    g.add(box(0.08, 0.1, 1.3, weaponId === 'sniper' ? 0x3d4a2c : 0x5b3a1e, 0, 0, 0.35));
    g.add(box(0.07, 0.07, 0.4, 0x111111, 0, 0.11, 0.05));   // kijker
    front = 1.0;
  } else if (weaponId === 'lmg') {
    g.add(box(0.12, 0.17, 1.2, 0x262626, 0, 0, 0.3));
    g.add(box(0.11, 0.14, 0.14, 0x3d4a2c, 0, -0.14, 0.12));  // munitiekist
    front = 0.9;
  } else {
    g.add(box(0.1, 0.14, 0.95, 0x262626, 0, 0, 0.25));
    g.add(box(0.1, 0.22, 0.3, 0x3a3a3a, 0, -0.08, -0.25));
    g.add(box(0.08, 0.2, 0.1, 0x111111, 0, -0.17, 0.15));
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, front);
  g.add(muzzle);
  return { group: g, muzzle };
}

// Skin-model uit Blender (soldier.glb of een model uit build_skins.py):
// knooppunten legL/legR (heup als draaipunt) en body. Materialen die per skin of speler
// verschillen (Tint, camo, kleuren) worden gekloond, zodat skins niet in elkaar overlopen;
// removeEntity() ruimt die klonen weer op. Texturen zijn gedeeld en blijven bestaan.
function createSoldier(skin, tint, weaponId) {
  const g = new THREE.Group();
  const m = (MODELS[skin.model] || MODELS.soldier).clone(true);
  const own = new Map();   // origineel materiaal -> kloon voor dit poppetje
  const camo = skin.camo ? camoTextures[skin.camo] || null : null;
  const colors = skin.colors || {};
  const variant = (src) => {
    const name = src.name;
    const isTint = name === 'Tint';
    const recolor = Object.prototype.hasOwnProperty.call(colors, name);
    const camoMap = !!camo && (name === 'Camo' || (name === 'HelmetCover' && skin.helmet === 'camo'));
    const helmetColor = name === 'HelmetCover' && typeof skin.helmet === 'number';
    if (!isTint && !recolor && !camoMap && !helmetColor) return src;
    let c = own.get(src);
    if (c) return c;
    c = src.clone();
    if (isTint) {
      c.color.setHex(tint);
      c.emissive = new THREE.Color(tint).multiplyScalar(0.25);
    }
    if (camoMap) c.map = camo;
    if (helmetColor) { c.map = null; c.color.setHex(skin.helmet); }
    if (recolor) c.color.setHex(colors[name]);
    c.needsUpdate = true;
    own.set(src, c);
    return c;
  };
  m.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material)) o.material = variant(o.material);
  });
  m.scale.x = -1; // spiegelen: geweer in de rechterhand (camera kijkt over de rechterschouder)
  g.add(m);
  const legL = m.getObjectByName('legL') || new THREE.Object3D();
  const legR = m.getObjectByName('legR') || new THREE.Object3D();
  const wdef = S.WEAPONS[weaponId] || S.WEAPONS.rifle;
  const gunSrc = MODELS[wdef.model] || MODELS.rifle;
  const gun = gunSrc ? gunSrc.clone(true) : gunMesh(weaponId).group;
  gun.position.set(-0.13, 1.24, 0.36);
  const muzzle = new THREE.Object3D();
  const mz = (MODELS[wdef.model] && wdef.muzzle) || [0, 0.065, 0.9];
  muzzle.position.set(mz[0], mz[1], mz[2]);
  gun.add(muzzle);
  g.add(gun);
  return { group: g, legL, legR, muzzle, gun, ownMats: [...own.values()] };
}

// Noodgeval als de modellen niet geladen zijn (geen internet/timeout): eenvoudig blokpoppetje.
function createBoxFallback(tint, weaponId) {
  const g = new THREE.Group();
  const suit = 0x3d4630;
  const legL = new THREE.Group(); legL.position.set(-0.14, 0.9, 0);
  legL.add(box(0.2, 0.9, 0.24, suit, 0, -0.45, 0));
  const legR = new THREE.Group(); legR.position.set(0.14, 0.9, 0);
  legR.add(box(0.2, 0.9, 0.24, suit, 0, -0.45, 0));
  g.add(legL, legR);
  g.add(box(0.44, 0.7, 0.28, suit, 0, 1.25, 0));               // romp
  g.add(box(0.46, 0.08, 0.3, tint, 0, 1.45, 0));               // teamband
  g.add(box(0.24, 0.26, 0.26, 0xc69c80, 0, 1.75, 0));          // hoofd
  const gun = gunMesh(weaponId);
  gun.group.position.set(-0.13, 1.24, 0.36);
  g.add(gun.group);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legL, legR, muzzle: gun.muzzle, gun: gun.group };
}

function createCharacter(skinId, tint, weaponId) {
  const skin = S.skinById(skinId);   // onbekende skin -> eerste skin
  if (MODELS[skin.model] || MODELS.soldier) return createSoldier(skin, tint, weaponId);
  return createBoxFallback(tint, weaponId);
}

// Naamlabels: canvas-sprite (512x128). Ze schalen mee met de afstand zodat ze op het
// scherm nooit kleiner worden dan bij LABEL_REF meter, en worden (zacht) verborgen
// als er een boom/dekking tussen de camera en de speler staat.
const LABEL_W = 2.4, LABEL_H = 0.6, LABEL_REF = 11, LABEL_MAX_DIST = 95;
function makeLabel() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false,
  }));
  sp.scale.set(LABEL_W, LABEL_H, 1);
  sp.position.set(0, 2.5, 0);
  sp.center.set(0.5, 0);   // onderkant van het label ligt vast boven het hoofd
  sp.renderOrder = 10;
  return { sprite: sp, canvas: cv, tex, ctx: cv.getContext('2d'), occluded: false, alpha: 0 };
}

function tintCss(tint) {
  return '#' + S.TINTS[tint % S.TINTS.length].toString(16).padStart(6, '0');
}

function drawLabel(e) {
  const ctx = e.label.ctx;
  const name = e.name.toUpperCase();
  const tint = tintCss(e.tint);
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '700 54px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const tw = Math.min(400, ctx.measureText(name).width);
  const cx = 256 + 16;                 // ruimte links voor het kleurmarkeringsruitje
  // ruitje in de spelerskleur
  const mx = cx - tw / 2 - 26, my = 46;
  ctx.save();
  ctx.translate(mx, my); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(-13, -13, 26, 26);
  ctx.fillStyle = tint; ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
  // naam met dikke donkere rand
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(name, cx, 64, 400);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, cx, 64, 400);
  // levensbalk met streep in de spelerskleur erboven
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(96, 76, 320, 30);
  ctx.fillStyle = tint;
  ctx.fillRect(100, 80, 312, 5);
  ctx.fillStyle = e.hp > 50 ? '#8fd16a' : e.hp > 25 ? '#ff9a1f' : '#ff3b30';
  ctx.fillRect(100, 88, Math.max(0, 312 * (e.hp / 100)), 14);
  e.label.tex.needsUpdate = true;
}

// Spawnbescherming: doorschijnende "bel" met een gloeiende rand (fresnel), gedeeld door iedereen.
const shieldGeo = new THREE.SphereGeometry(1, 24, 16);
const shieldMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { color: { value: new THREE.Color(0x6fd3ff) }, opacity: { value: 0.6 } },
  vertexShader: [
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);',
    '  gl_FragColor = vec4(color * (0.12 + rim * 1.4) * opacity, 1.0);',
    '}',
  ].join('\n'),
});
function makeShield() {
  const m = new THREE.Mesh(shieldGeo, shieldMat);
  m.scale.set(0.85, 1.2, 0.85);
  m.position.y = 1.05;
  m.renderOrder = 5;
  m.visible = false;
  return m;
}

// [MES] mes en medkit (eenvoudige blokjes), in de rechterhand van het poppetje (lemmet wijst naar +Z)
const KNIFE_POS = new THREE.Vector3(-0.24, 1.12, 0.32);
function knifeMesh() {
  const g = new THREE.Group();
  g.add(box(0.035, 0.04, 0.12, 0x1d1d1d, 0, 0, 0));          // heft
  g.add(box(0.07, 0.018, 0.022, 0x555555, 0, 0, 0.07));      // pareerstang
  g.add(box(0.012, 0.035, 0.2, 0xc9ced3, 0, 0.004, 0.18));   // lemmet
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function medkitMesh() {
  const g = new THREE.Group();
  g.add(box(0.22, 0.15, 0.08, 0xe6e4dc, 0, 0, 0));
  g.add(box(0.13, 0.035, 0.085, 0xc62828, 0, 0, 0));
  g.add(box(0.035, 0.11, 0.085, 0xc62828, 0, 0, 0));
  return g;
}

// Mondingsvuur + kogelsporen van een 'shot'-bericht (ook gebruikt door de killcam-herhaling)
function shotFx(m, replay) {
      const e = players.get(m.id);
      if (!e) return;
      const start = new THREE.Vector3();
      if (e.muzzle && e.alive) {
        e.group.updateMatrixWorld(true);
        e.muzzle.getWorldPosition(start);
      } else {
        start.set(e.x + Math.sin(e.yaw) * 0.8, e.y + 1.35, e.z + Math.cos(e.yaw) * 0.8);
      }
      // [FPS] eigen schot in eerste persoon: spoor vanaf de viewmodel-loop, flits zit in het viewmodel
      if (!replay && e.me && fps && fps.ownShotStart(start)) { flashLight.position.copy(start); flashLight.intensity = 18; }
      else muzzleFlash(start);
      const w = S.WEAPONS[m.w];
      const range = w ? w.range : 120;
      let puffs = 0;
      for (const p of m.p) {
        const end = new THREE.Vector3(m.o[0] + p[0] * p[3], m.o[1] + p[1] * p[3], m.o[2] + p[2] * p[3]);
        addTracer(start, end);
        if (p[3] < range - 0.5 && puffs < 3) { impactPuff(end); puffs++; }
      }
      if (m.id !== myId) {
        const dist = start.distanceTo(camera.position);
        shotSound(m.w, Math.max(0.03, Math.min(0.5, 1.2 - dist / 70)));
      }
}

function addEntity(info) {
  const ch = createCharacter(info.skin, S.TINTS[info.tint % S.TINTS.length], info.weapon);
  const knife = knifeMesh();
  knife.position.copy(KNIFE_POS); knife.visible = false;
  ch.group.add(knife);
  const medkit = medkitMesh();
  medkit.position.set(0.05, 1.2, 0.34); medkit.visible = false;
  ch.group.add(medkit);
  // buitenste groep = plek + kijkrichting (+ label/schild); ch.group = 'body' voor houdingen en omvallen
  const outer = new THREE.Group();
  outer.add(ch.group);
  ch.group.rotation.order = 'YXZ';
  const label = makeLabel();
  outer.add(label.sprite);
  const shield = makeShield();
  outer.add(shield);
  scene.add(outer);
  const alive = info.alive !== false;
  const y0 = typeof info.y === 'number' ? info.y : (levelId ? S.supportHeight(levelId, info.x, info.z) : 0);
  const fl = info.st | 0;
  const e = {
    id: info.id, name: info.name, tint: info.tint, skin: info.skin, weapon: info.weapon,
    bot: !!info.bot, wins: info.wins || 0, me: info.id === myId,
    group: outer, body: ch.group, legL: ch.legL, legR: ch.legR, muzzle: ch.muzzle, label, shield, ownMats: ch.ownMats || [],
    gun: ch.gun || null, gunPos: ch.gun ? ch.gun.position.clone() : null,
    x: info.x, z: info.z, yaw: info.yaw, tx: info.x, tz: info.z, tyaw: info.yaw,
    y: y0, ty: y0, hp: info.hp == null ? 100 : info.hp, alive, anim: 0, deadT: alive ? 0 : 99,
    // verticale toestand (eigen speler: Shared.stepPlayer; anderen: uit de snapshots)
    stance: fl & 3, air: !!(fl & 4), onLadder: !!(fl & 8), vy: 0, ground: true, ladder: -1, ls: 0,
    pose: { c: 0, p: 0, a: 0, l: 0 }, ladderYaw: null,
    // [MES] inventaris: slot 0 wapen / 1 mes / 2 medkit, steek-animatie, medkit, finisher
    knife, medkit, slot: (fl >> 4) & 3, healing: !!(fl & 64), stabT: -1e9, swingUntil: 0, fin: null,
  };
  label.sprite.visible = false;   // updateLabels() laat hem zacht verschijnen
  label.sprite.material.opacity = 0;
  drawLabel(e);
  players.set(e.id, e);
  return e;
}

function removeEntity(e) {
  scene.remove(e.group);
  e.label.tex.dispose();
  e.label.sprite.material.dispose();
  for (const m of e.ownMats) m.dispose();
  players.delete(e.id);
}

function clearEntities() {
  for (const e of [...players.values()]) removeEntity(e);
  specTarget = null;
}

// ---- effecten: kogelsporen, mondingsvuur, inslagen

function radialTexture(inner, mid, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, mid); gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const flashTex = radialTexture('rgba(255,250,225,1)', 'rgba(255,190,90,0.85)', 'rgba(255,120,20,0)');
const dustTex = radialTexture('rgba(125,110,85,0.75)', 'rgba(115,100,78,0.45)', 'rgba(110,95,75,0)');

const tracers = [];
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85, fog: false });
function addTracer(a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.2) return;
  // Een kort lichtspoor dat met hoge snelheid langs de baan vliegt (geen lange 'touwen' door beeld).
  const seg = Math.min(4.5, len);
  const m = new THREE.Mesh(unitBox, tracerMat);
  m.scale.set(0.022, 0.022, seg);
  m.lookAt(dir);
  dir.divideScalar(len);
  m.position.copy(a).addScaledVector(dir, seg * 0.5);
  scene.add(m);
  tracers.push({ mesh: m, a: a.clone(), dir, len, seg, dist: 0 });
}
const TRACER_SPEED = 420; // m/s

const effects = [];
const flashLight = new THREE.PointLight(0xffb060, 0, 10, 2);
scene.add(flashLight);

function addSprite(tex, pos, size, life, grow, additive) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  sp.position.copy(pos);
  sp.scale.set(size, size, 1);
  sp.material.rotation = Math.random() * Math.PI * 2;
  scene.add(sp);
  effects.push({ sp, life, max: life, grow, size });
}

function muzzleFlash(pos) {
  addSprite(flashTex, pos, 0.45 + Math.random() * 0.35, 0.05, 2, true);
  flashLight.position.copy(pos);
  flashLight.intensity = 18;
}

function impactPuff(pos) {
  for (let i = 0, n = Settings.fxCount(3); i < n; i++) { // [polish] effectdichtheid
    const p = pos.clone();
    p.x += (Math.random() - 0.5) * 0.3; p.y += Math.random() * 0.25; p.z += (Math.random() - 0.5) * 0.3;
    addSprite(dustTex, p, 0.25 + Math.random() * 0.2, 0.45 + Math.random() * 0.2, 2.2, false);
  }
}

function updateEffects(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.dist += TRACER_SPEED * dt;
    if (tr.dist >= tr.len - tr.seg * 0.5) { scene.remove(tr.mesh); tracers.splice(i, 1); continue; }
    tr.mesh.position.copy(tr.a).addScaledVector(tr.dir, Math.min(tr.dist + tr.seg * 0.5, tr.len - tr.seg * 0.5));
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const f = effects[i];
    f.life -= dt;
    if (f.life <= 0) { scene.remove(f.sp); f.sp.material.dispose(); effects.splice(i, 1); continue; }
    const k = 1 - f.life / f.max;
    const s = f.size * (1 + f.grow * k);
    f.sp.scale.set(s, s, 1);
    f.sp.material.opacity = 1 - k;
    if (f.sp.position) f.sp.position.y += dt * 0.3;
  }
  flashLight.intensity *= Math.exp(-dt * 45);
}

function clearEffects() {
  for (const tr of tracers) scene.remove(tr.mesh);
  tracers.length = 0;
  for (const f of effects) { scene.remove(f.sp); f.sp.material.dispose(); }
  effects.length = 0;
  flashLight.intensity = 0;
  for (const r of smashRings) { scene.remove(r.mesh); r.mesh.material.dispose(); }
  smashRings.length = 0;
}

// Cody cheat controls (server validates the unlock code before applying effects).
const cheatState = { speedBoost: false, superJump: false, godMode: false, infiniteAmmo: true, wallHack: false, aimbot: false };
let cheatUnlocked = false;
function syncCheats() { if (cheatUnlocked) send({ t: 'cheats', code: 'Cody', cheats: cheatState }); }
function renderCheats() {
  document.querySelectorAll('.cheatToggle').forEach((b) => {
    const k = b.dataset.cheat; const on = !!cheatState[k];
    b.textContent = (k === 'speedBoost' ? 'Speed boost' : k === 'superJump' ? 'Super jump' : k === 'godMode' ? 'God mode' : k === 'wallHack' ? 'Wall hack' : k === 'aimbot' ? 'Aimbot' : 'Infinite ammo') + ': ' + (on ? 'ON' : 'OFF');
    b.classList.toggle('active', on);
  });
  renderCheatHud();
}
$('cheatUnlockBtn').onclick = () => {
  if (($('cheatCodeInput').value || '').trim() !== 'Cody') { $('cheatCodeInput').value = ''; $('cheatCodeInput').placeholder = 'Wrong code'; return; }
  cheatUnlocked = true; $('cheatPanel').classList.remove('hidden'); renderCheats(); syncCheats();
};
document.querySelectorAll('.cheatToggle').forEach((b) => b.addEventListener('click', () => {
  if (!cheatUnlocked) return;
  const k = b.dataset.cheat;
  // Infinite ammo is already the default: the current game has no magazine or reload limit.
  if (k === 'infiniteAmmo') { cheatState.infiniteAmmo = true; renderCheats(); syncCheats(); return; }
  cheatState[k] = !cheatState[k]; renderCheats(); syncCheats();
}));

// ------------------------------------------------------------ netwerk

function send(o) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
}

function closeSocket() {
  if (ws) {
    const s = ws;
    ws = null;
    try { s.close(); } catch (e) { /* ignore */ }
  }
}

function connect(create) {
  const name = ($('nameInput').value || '').trim() || 'Player';
  savePref('name', name);
  const code = ($('codeInput').value || '').trim();
  if (!create && !code) { setMenuMsg(t('errNoCode')); return; }
  setMenuMsg(t('connecting'));
  initAudio();
  closeSocket();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(proto + '://' + location.host);
  ws = sock;
  sock.onopen = () => send({ t: 'join', name, create, room: code, weapon: myWeapon, skin: mySkin, fin: myFin });
  sock.onmessage = (ev) => {
    if (sock !== ws) return;
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    onMessage(m);
  };
  sock.onclose = () => {
    if (sock !== ws) return;
    ws = null;
    const lostRoom = screen !== 'menu' ? roomCode : ''; // [polish] duidelijkere melding + code invullen
    resetGame();
    showScreen('menu');
    setMenuMsg(lostRoom ? t('connLost', { code: lostRoom }) : t('errConn'));
    if (lostRoom) $('codeInput').value = lostRoom;
  };
  sock.onerror = () => { /* onclose volgt */ };
}

function releasePointer() {
  try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ }
}

// Alles van een lopend spel opruimen (entiteiten, effecten, HUD-toestand).
function clearMatchState() {
  clearEntities();
  clearEffects();
  doors.clearFx();
  clearBanner();
  clearDamageDirs();
  hideKillConfirm();
  hideMatchEnd();
  protectUntil = 0;
  $('protect').classList.add('hidden');
  $('spectateMsg').textContent = '';
  input.fire = false; input.mouseFire = false; input.jx = 0; input.jy = 0;
  joy.id = null; lookP.id = null;
  keys.clear();
  $('joyBase').style.display = 'none';
  zoomOff();
  releasePointer();
}

function resetGame() {
  clearMatchState();
  phase = 'menu';
  myId = null;
}

// Na een wedstrijd stuurt de server iedereen terug naar de lobby.
function returnToLobby() {
  clearMatchState();
  phase = 'lobby';
  roundNo = 0;
  showScreen('lobby');
  renderLobby();
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome': {
      myId = m.id;
      roomCode = m.room;
      syncCheats();
      setMenuMsg('');
      showScreen('lobby');
      renderLobby();
      break;
    }
    case 'error': {
      setMenuMsg(m.code === 'noroom' ? t('errNoroom') : m.code === 'full' ? t('errFull') : t('errConn'));
      closeSocket();
      break;
    }
    case 'lobby': {
      hostId = m.hostId;
      lobbyPlayers = m.players;
      if (DIFFICULTIES.includes(m.difficulty)) difficulty = m.difficulty;
      if (TARGETS.includes(Number(m.target))) matchTarget = Number(m.target);
      if (S.MODES[m.mode]) curMode = m.mode;
      if (m.state === 'lobby' && screen === 'hud') returnToLobby();
      else if (screen === 'lobby') renderLobby();
      break;
    }
    case 'settings': {
      // (eventueel) losse bevestiging van de server
      if (DIFFICULTIES.includes(m.difficulty)) difficulty = m.difficulty;
      if (TARGETS.includes(Number(m.target))) matchTarget = Number(m.target);
      if (screen === 'lobby') renderLobby();
      break;
    }
    case 'round': {
      clearEntities();
      clearEffects();
      clearDamageDirs();
      hideKillConfirm();
      hideMatchEnd();
      protectUntil = 0;
      zoomOff();
      buildLevel(m.level);
      doors.onRound(m);   // DEUR-HOOK: begintoestand van de deuren (m.doors)
      roundNo = m.round;
      if (TARGETS.includes(Number(m.target))) matchTarget = Number(m.target);
      if (S.MODES[m.mode]) curMode = m.mode;
      killCamStop(); kcClear();
      for (const p of m.players) addEntity(p);
      const me = players.get(myId);
      if (me) { look.yaw = me.yaw; look.pitch = 0.12; }
      showScreen('hud');
      phase = m.countdown > 0 ? 'countdown' : 'between';
      phaseEnd = performance.now() + m.countdown;
      nextShotAt = 0;
      lastSentX = 1e9;
      input.jumpQ = false;
      resetInventory();   // [MES]
      if (modeDef().knives && me) { mySlot = 1; me.slot = 1; send({ t: 'slot', s: 1 }); }   // mesgevecht
      camEye = MV.EYE[0];
      updateStanceUi(me);
      $('spectateMsg').textContent = me && me.alive ? '' : t('waiting');
      const lvl = S.LEVELS.find((l) => l.id === m.level);
      $('hudLevel').textContent = t('roundN', { n: m.round, level: lvl ? lvl.name[lang] : m.level });
      $('hudTarget').textContent = t('firstTo', { n: matchTarget }) + (curMode !== 'classic' ? ' · ' + modeDef().icon + ' ' + modeDef().name[lang] : '');
      bannerKey = '';
      setHp(me ? me.hp : 100);
      updateHud();
      break;
    }
    case 'phase': {
      phase = m.phase;
      if (m.phase === 'playing') {
        setBanner(t('go'), '');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(clearBanner, 800);
        const pm = Number(m.protectMs) || 0;
        if (pm > 0) { protectDur = pm; protectUntil = performance.now() + pm; }
        else protectUntil = 0;
      }
      break;
    }
    case 'snap': {
      for (const a of m.p) {
        const e = players.get(a[0]);
        if (!e) continue;
        if (!e.me) {
          e.tx = a[1]; e.tz = a[2]; e.tyaw = a[3];
          // hoogte + houding (oudere servers sturen die niet: grond, staand)
          if (typeof a[6] === 'number') {
            e.ty = a[6]; const fl = a[7] | 0; e.stance = fl & 3; e.air = !!(fl & 4); e.onLadder = !!(fl & 8);
            e.slot = (fl >> 4) & 3; e.healing = !!(fl & 64);   // [MES] actief vak + medkit
          }
          else { e.ty = null; e.stance = 0; e.air = false; e.onLadder = false; }
        }
        if (e.hp !== a[4]) { e.hp = a[4]; drawLabel(e); if (e.me) setHp(e.hp); }
        const alive = a[5] === 1;
        if (alive !== e.alive) {
          e.alive = alive;
          if (e.me) $('spectateMsg').textContent = alive ? '' : t('dead');
        }
      }
      updateHud();
      break;
    }
    case 'shot': {
      kcShots.push({ t: performance.now(), m });
      shotFx(m, false);
      break;
    }
    case 'hit': {
      const e = players.get(m.id);
      if (e) {
        e.hp = m.hp; drawLabel(e);
        if (e.me) {
          setHp(m.hp);
          const v = $('vignette');
          v.classList.add('show');
          setTimeout(() => v.classList.remove('show'), 70);
          blip(160, 0.15, 0.25);
          if (m.by !== myId) addDamageDir(m.by);
        }
      }
      if (m.by === myId && m.id !== myId) {
        const h = $('hitmarker');
        h.classList.add('show');
        setTimeout(() => h.classList.remove('show'), 90);
        blip(950, 0.06, 0.18);
        if (m.m) thump(110, 0.12, 0.35);                 // [MES] raak met het mes
        if (m.bs) addFeed(t('backstab'));
      }
      break;
    }
    case 'swing': {   // [MES] iemand steekt met het mes (eigen steek is al lokaal getoond)
      const e = players.get(m.id);
      if (e && !e.me) { e.stabT = performance.now(); e.swingUntil = e.stabT + 600; swishSound(0.25); }
      break;
    }
    case 'heal': {    // [MES] medkit gestart (ms > 0) of afgebroken (ms = 0)
      const e = players.get(m.id);
      if (e) e.healing = m.ms > 0;
      if (e && e.me) { myHeal = m.ms > 0 ? { t0: performance.now(), ms: m.ms } : null; }
      break;
    }
    case 'healed': {
      const e = players.get(m.id);
      if (e) { e.hp = m.hp; e.healing = false; drawLabel(e); }
      if (e && e.me) { setHp(m.hp); myHeal = null; myMedkits = m.n; blip(660, 0.12, 0.2); if (healReturnSlot >= 0) { setSlot(healReturnSlot); healReturnSlot = -1; } }
      break;
    }
    case 'finish': {  // [MES] finisher start (ms > 0) of afgebroken (ms = 0)
      const a = players.get(m.a), v = players.get(m.v);
      if (m.ms > 0) {
        const t0 = performance.now();
        const d = a && v ? Math.hypot(v.x - a.x, v.z - a.z) : 1;
        if (a) { a.fin = { role: 'a', t0, ms: m.ms, d, partner: m.v, yaw: m.yaw, kind: m.k }; a.yaw = a.tyaw = m.yaw; }
        if (v) { v.fin = { role: 'v', t0, ms: m.ms, d, partner: m.a, yaw: m.yaw, kind: m.k }; v.yaw = v.tyaw = m.yaw; }
        if ((a && a.me) || (v && v.me)) { look.yaw = m.yaw; zoomOff(); myHeal = null; }
        if (a && a.me) swishSound(0.4);
      } else {
        if (a) a.fin = null;
        if (v) v.fin = null;
      }
      break;
    }
    case 'kill': {
      const v = players.get(m.id), k = players.get(m.by);
      if (v) { v.alive = false; v.healing = false; if (v.me) { $('spectateMsg').textContent = t('dead'); myHeal = null; } }
      if (k && k.fin && m.fin) k.fin.done = true;       // aanvaller speelt de laatste slam-frame uit
      if (v && v.fin && !m.fin) v.fin = null;
      if (v && v.fin) v.fin.done = true;                // slachtoffer blijft in de eindhouding liggen
      addFeed(t(m.fin ? 'finished' : 'killed', { a: k ? k.name : '?', b: v ? v.name : '?' }));
      if (v && v.me && k && !k.me && !m.fin) killCamStart(k, m);   // KILLCAM
      if (m.by === myId && m.id !== myId) {
        killSound();
        showKillConfirm(v ? v.name : '?');
        streakKill();
      }
      updateHud();
      break;
    }
    case 'left': {
      const e = players.get(m.id);
      if (e) removeEntity(e);
      hostId = m.hostId;
      updateHud();
      break;
    }
    case 'takeover': {
      // Een uitgeschakelde speler neemt het lichaam van een bot over.
      const bot = players.get(m.bot), e = players.get(m.id);
      const botName = bot ? bot.name : (m.botName || '?');
      if (bot) { if (specTarget === bot) specTarget = null; removeEntity(bot); }
      if (e) {
        e.x = e.tx = m.x; e.z = e.tz = m.z; e.yaw = e.tyaw = m.yaw;
        e.y = e.ty = typeof m.y === 'number' ? m.y : S.supportHeight(levelId, m.x, m.z);
        e.stance = 0; e.air = false; e.onLadder = false; e.vy = 0; e.ground = true; e.ladder = -1;
        e.hp = m.hp; e.alive = true;
        if (e.me) updateStanceUi(e);
        e.protUntil = performance.now() + (m.protectMs || 0);
        drawLabel(e);
        if (e.me) {
          look.yaw = m.yaw; look.pitch = 0.12;
          setHp(m.hp);
          $('spectateMsg').textContent = '';
          lastSentX = 1e9;
          clearDamageDirs();
          resetInventory(); myMedkits = typeof m.mk === 'number' ? m.mk : myMedkits;   // [MES]
        }
        e.slot = 0; e.healing = false; e.fin = null;
      }
      addFeed(t('tookOver', { a: e ? e.name : '?', b: botName }));
      updateHud();
      break;
    }
    case 'roundEnd': {
      // (de killcam blijft gewoon doorlopen: als jij de laatste kill incasseert komt dit bericht meteen na je dood)
      phase = 'between';
      for (const s of m.scores) { const e = players.get(s.id); if (e) e.wins = s.wins; }
      const ranked = [...players.values()].sort((a, b) => b.wins - a.wins);
      const board = ranked.slice(0, 4).map((e) => e.name + ' ' + e.wins + '/' + matchTarget).join('  ·  ');
      let note = t('next');
      if (m.matchOver) note = t('finalRound');
      else {
        const mp = ranked.filter((e) => e.wins === matchTarget - 1).map((e) => e.name);
        if (mp.length) note = t('matchPoint', { name: mp.join(', ') }) + '\n' + t('next');
      }
      setBanner(m.winnerName ? t('win', { name: m.winnerName }) : t('draw'), board + '\n' + note);
      clearTimeout(bannerTimer);
      break;
    }
    case 'matchEnd': {
      phase = 'over';
      if (kc.active) kc.pendingMatchEnd = m;      // eindscherm pas na de killcam
      else showMatchEnd(m);
      break;
    }
    case 'door': {   // DEUR-HOOK: open / dicht / schade / kapot
      doors.onMessage(m);
      break;
    }
    default:
  }
}

// ------------------------------------------------------------ lobby UI

// Wapenkaart in de lobby: naam, eigenschap-labels en balkjes (schade / tempo / bereik),
// geschaald t.o.v. het sterkste wapen in die eigenschap.
const WSTAT_MAX = (() => {
  const ws = S.WEAPON_IDS.map((id) => S.WEAPONS[id]);
  return {
    dmg: Math.max(...ws.map((w) => w.damage * w.pellets)),
    rate: Math.max(...ws.map((w) => 1 / w.interval)),
    range: Math.max(...ws.map((w) => w.range)),
  };
})();
function weaponCard(b, w) {
  const head = document.createElement('span');
  head.className = 'wname';
  head.textContent = w.name[lang];
  b.appendChild(head);
  const tags = [];
  if (w.zoom) tags.push(t('wScope'));
  if ((w.speed || 1) > 1) tags.push(t('wMove'));
  if ((w.speed || 1) < 0.9) tags.push(t('wHeavy'));
  const tg = document.createElement('span');
  tg.className = 'wtags';
  tg.textContent = tags.join(' · ');
  b.appendChild(tg);
  const stats = [
    ['statDmg', (w.damage * w.pellets) / WSTAT_MAX.dmg],
    ['statRate', (1 / w.interval) / WSTAT_MAX.rate],
    ['statRange', w.range / WSTAT_MAX.range],
  ];
  for (const [key, v] of stats) {
    const row = document.createElement('span');
    row.className = 'wstat';
    const lab = document.createElement('span');
    lab.className = 'wl';
    lab.textContent = t(key);
    const bar = document.createElement('span');
    bar.className = 'wbar';
    const fill = document.createElement('i');
    fill.style.width = Math.round(Math.max(0.08, Math.min(1, v)) * 100) + '%';
    bar.appendChild(fill);
    row.append(lab, bar);
    b.appendChild(row);
  }
}

function renderPicks() {
  const wp = $('weaponPick');
  wp.textContent = '';
  wp.classList.add('wgrid');
  S.WEAPON_IDS.forEach((id) => {
    const b = document.createElement('button');
    b.className = 'pick wpick' + (myWeapon === id ? ' active' : '');
    weaponCard(b, S.WEAPONS[id]);
    b.onclick = () => { myWeapon = id; sendPick(); renderPicks(); };
    wp.appendChild(b);
  });
  // finisher: elke speler kiest zelf zijn afmaker
  const fp = $('finPick');
  fp.textContent = '';
  for (const id of S.FINISHER_IDS) {
    const f = S.FINISHERS[id];
    const b = document.createElement('button');
    b.className = 'pick modeBtn' + (myFin === id ? ' active' : '');
    const ic = document.createElement('span'); ic.className = 'mi'; ic.textContent = f.icon;
    const nm = document.createElement('span'); nm.textContent = f.name[lang];
    b.append(ic, nm);
    b.onclick = () => { myFin = id; savePref('fin', myFin); sendPick(); renderPicks(); };
    fp.appendChild(b);
  }
  // skins: raster met klein plaatje (public/models/skins/thumb_<id>.jpg) en een kleurstaal eronder
  const sk = $('skinPick');
  sk.textContent = '';
  const css = (c) => '#' + c.toString(16).padStart(6, '0');
  S.SKINS.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'pick skin' + (mySkin === s.id ? ' active' : '');
    b.title = s.name[lang];
    const sw = s.swatch || [0x555555, 0x333333, 0x777777];
    const thumb = document.createElement('span');
    thumb.className = 'sw';
    thumb.style.background =
      'linear-gradient(90deg, ' + css(sw[0]) + ' 0 34%, ' + css(sw[1]) + ' 34% 67%, ' + css(sw[2]) + ' 67%) bottom / 100% 5px no-repeat, ' +
      'url(models/skins/thumb_' + s.id + '.jpg) center / cover no-repeat, ' + css(sw[1]);
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = s.name[lang];
    b.append(thumb, nm);
    b.onclick = () => {
      mySkin = s.id;
      savePref('skin', mySkin);
      sendPick();
      renderPicks();
    };
    sk.appendChild(b);
  });
}

function renderLobby() {
  $('roomCode').textContent = roomCode;
  const ul = $('playerList');
  ul.textContent = '';
  for (const p of lobbyPlayers) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = '#' + S.TINTS[p.tint % S.TINTS.length].toString(16).padStart(6, '0');
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = p.name + (p.id === myId ? ' ★' : '');
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = (p.id === hostId ? t('host') + ' · ' : '') + S.WEAPONS[p.weapon].name[lang];
    li.append(dot, nm, meta);
    ul.appendChild(li);
  }
  const isHost = hostId === myId;
  renderSettings(isHost);
  $('btnStart').classList.toggle('hidden', !isHost);
  $('waitMsg').classList.toggle('hidden', isHost);
  $('soloMsg').classList.toggle('hidden', !(isHost && lobbyPlayers.filter((p) => !p.bot).length === 1));
}

// Moeilijkheid + aantal rondes: de host kan kiezen, de rest ziet de waarden alleen.
function sendSettings() { send({ t: 'settings', difficulty, target: matchTarget, mode: curMode }); }

function settingsButtons(el, ids, current, label, onPick, isHost) {
  el.textContent = '';
  el.classList.toggle('readonly', !isHost);
  el.title = isHost ? '' : t('hostOnly');
  for (const id of ids) {
    const b = document.createElement('button');
    b.className = 'pick' + (current === id ? ' active' : '');
    b.textContent = label(id);
    b.disabled = !isHost;
    if (isHost) b.onclick = () => { onPick(id); sendSettings(); renderSettings(true); };
    el.appendChild(b);
  }
}

function renderSettings(isHost) {
  settingsButtons($('diffPick'), DIFFICULTIES, difficulty, (id) => t(DIFF_KEYS[id]),
    (id) => { difficulty = id; }, isHost);
  settingsButtons($('targetPick'), TARGETS, matchTarget, (n) => String(n),
    (n) => { matchTarget = n; }, isHost);
  // spelmodus: raster met icoon + naam (host kiest)
  const mp = $('modePick');
  mp.textContent = '';
  mp.classList.toggle('readonly', !isHost);
  for (const id of S.MODE_IDS) {
    const md = S.MODES[id];
    const b = document.createElement('button');
    b.className = 'pick modeBtn' + (curMode === id ? ' active' : '');
    b.title = md.desc[lang];
    const ic = document.createElement('span'); ic.className = 'mi'; ic.textContent = md.icon;
    const nm = document.createElement('span'); nm.textContent = md.name[lang];
    b.append(ic, nm);
    b.disabled = !isHost;
    if (isHost) b.onclick = () => { curMode = id; sendSettings(); renderSettings(true); };
    mp.appendChild(b);
  }
  $('modeDesc').textContent = modeDef().desc[lang];
  $('settingsHint').classList.toggle('hidden', isHost);
}

// Wacht tot de 3D-modellen geladen zijn voordat we een spel in gaan.
async function connectWhenReady(create) {
  setMenuMsg(t('connecting'));
  await Promise.all([modelsLoaded, skinsLoaded]);
  connect(create);
}
$('btnCreate').onclick = () => connectWhenReady(true);
$('btnJoin').onclick = () => connectWhenReady(false);
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') connectWhenReady(false); });
$('btnStart').onclick = () => send({ t: 'start' });
$('btnLeaveLobby').onclick = () => { closeSocket(); resetGame(); showScreen('menu'); setMenuMsg(''); };
$('btnLangNl').onclick = () => { lang = 'nl'; applyLang(); };
$('btnLangEn').onclick = () => { lang = 'en'; applyLang(); };
$('btnShare').onclick = async () => {
  const url = location.origin + '/?room=' + roomCode;
  try {
    if (navigator.share) { await navigator.share({ title: 'Arena Shooter', url }); return; }
    await navigator.clipboard.writeText(url);
    const b = $('btnShare'), old = b.textContent;
    b.textContent = t('linkCopied');
    setTimeout(() => { b.textContent = old; }, 1500);
  } catch (e) { /* geannuleerd of niet toegestaan */ }
};
$('btnQuit').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  Settings.openPause(); // [polish] menuknop opent het pauzemenu (daar zit "Spel verlaten")
});
function leaveGame() { closeSocket(); resetGame(); showScreen('menu'); setMenuMsg(''); } // [polish]

// ------------------------------------------------------------ HUD

let bannerKey = '';
let bannerTimer = null;
function setBanner(main, sub) {
  const b = $('banner');
  while (b.firstChild) b.removeChild(b.firstChild);
  const d = document.createElement('div');
  d.textContent = main;
  b.appendChild(d);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'sub';
    s.textContent = sub;
    b.appendChild(s);
  }
}
function clearBanner() {
  const b = $('banner');
  while (b.firstChild) b.removeChild(b.firstChild);
  bannerKey = '';
}
function addFeed(text) {
  const f = $('feed');
  const d = document.createElement('div');
  d.textContent = text;
  f.appendChild(d);
  while (f.children.length > 4) f.removeChild(f.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4500);
}
function setHp(hp) {
  const bar = $('hpBar');
  bar.style.width = Math.max(0, hp) + '%';
  bar.style.background = hp > 50 ? '#4cd964' : hp > 25 ? '#ff9500' : '#ff3b30';
  $('hpText').textContent = Math.max(0, Math.round(hp));
}
function updateHud() {
  let n = 0;
  for (const e of players.values()) if (e.alive) n++;
  $('hudAlive').textContent = t('alive', { n });
  $('hudTarget').textContent = roundNo ? t('firstTo', { n: matchTarget }) : '';
}

// ---- schaderichting: rode boog rond het midden die naar de schutter wijst
const DMG_LIFE = 1100;
const dmgDirs = [];
{
  const wrap = $('dmgDirs');
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    el.className = 'dmgArc';
    wrap.appendChild(el);
    dmgDirs.push({ el, by: null, x: 0, z: 0, t0: -1e9, active: false });
  }
}
function addDamageDir(byId) {
  const src = players.get(byId);
  if (!src) return;
  const now = performance.now();
  let slot = dmgDirs.find((d) => d.active && d.by === byId);
  if (!slot) slot = dmgDirs.find((d) => !d.active);
  if (!slot) slot = dmgDirs.reduce((a, b) => (a.t0 < b.t0 ? a : b));
  slot.by = byId; slot.x = src.x; slot.z = src.z; slot.t0 = now; slot.active = true;
  slot.el.style.display = 'block';
}
function updateDamageDirs(now, me) {
  for (const d of dmgDirs) {
    if (!d.active) continue;
    const age = now - d.t0;
    if (age >= DMG_LIFE || !me) { d.active = false; d.el.style.display = 'none'; continue; }
    const src = players.get(d.by);
    if (src && src.alive) { d.x = src.x; d.z = src.z; }   // volg de schutter, anders laatste plek
    const dx = d.x - me.x, dz = d.z - me.z;
    const sy = Math.sin(look.yaw), cy = Math.cos(look.yaw);
    const fwd = dx * sy + dz * cy;          // vooruit = (sin yaw, cos yaw)
    const right = -dx * cy + dz * sy;       // rechts = (-cos yaw, sin yaw)
    const ang = Math.atan2(right, fwd);     // 0 = recht vooruit (boven), positief = rechts
    d.el.style.transform = 'translate(-50%, -50%) rotate(' + ang.toFixed(3) + 'rad)';
    const k = age / DMG_LIFE;
    d.el.style.opacity = (k < 0.15 ? 1 : 1 - (k - 0.15) / 0.85).toFixed(3);
  }
}
function clearDamageDirs() {
  for (const d of dmgDirs) { d.active = false; d.el.style.display = 'none'; }
}

// ---- kill-bevestiging onder het vizier
let killTimer = null;
function showKillConfirm(name) {
  const el = $('killConfirm');
  $('killName').textContent = name;
  el.classList.remove('show');
  void el.offsetWidth;                    // animatie opnieuw starten
  el.classList.add('show');
  clearTimeout(killTimer);
  killTimer = setTimeout(hideKillConfirm, 1600);
}
// ---- kill-streak aankondiger: kills binnen 5 s van elkaar
let streakN = 0, streakT = 0, streakTimer = 0;
const STREAK_NAMES = { 2: ['DUBBELE KILL', 'DOUBLE KILL'], 3: ['DRIEDUBBEL!', 'TRIPLE KILL!'], 4: ['MEGA KILL!!', 'MEGA KILL!!'], 5: ['RAMPAGE!!!', 'RAMPAGE!!!'], 6: ['ONSTOPBAAR!!!', 'UNSTOPPABLE!!!'] };
function streakKill() {
  const now = performance.now();
  streakN = now - streakT < 5000 ? streakN + 1 : 1;
  streakT = now;
  if (streakN < 2) return;
  const nm = STREAK_NAMES[Math.min(6, streakN)][lang === 'nl' ? 0 : 1];
  const el = $('streak');
  if (!el) return;
  el.textContent = nm;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(streakTimer); streakTimer = setTimeout(() => el.classList.remove('show'), 1700);
  blip(300 + streakN * 90, 0.18, 0.4); setTimeout(() => blip(450 + streakN * 120, 0.25, 0.4), 120);
  shake(0.12, 250);
}
function hideKillConfirm() {
  clearTimeout(killTimer);
  $('killConfirm').classList.remove('show');
}

// ---- spawnbescherming (HUD-balk + bellen om de spelers)
let protectShown = false;
function updateProtect(now, me) {
  const left = protectUntil - now;
  const on = left > 0 && phase === 'playing';
  let any = on;
  for (const e of players.values()) {
    const own = e.protUntil > now && phase === 'playing';   // bescherming na het overnemen van een bot
    e.shield.visible = (on || own) && e.alive;
    if (own) any = true;
  }
  if (any) {
    const blink = left < 600 ? (Math.sin(now * 0.04) > 0 ? 1 : 0.25) : 1;
    shieldMat.uniforms.opacity.value = (0.55 + 0.2 * Math.sin(now * 0.008)) * blink;
  }
  const mine = on && !!me && me.alive;
  if (mine !== protectShown) { protectShown = mine; $('protect').classList.toggle('hidden', !mine); }
  if (mine) $('protectFill').style.transform = 'scaleX(' + Math.max(0, left / protectDur).toFixed(3) + ')';
}

// ---- eindscherm van de wedstrijd
let matchEndTimer = null;
function showMatchEnd(m) {
  releasePointer();
  input.fire = false; input.mouseFire = false; input.jx = 0; input.jy = 0;
  joy.id = null; lookP.id = null;
  keys.clear();
  $('joyBase').style.display = 'none';
  hideKillConfirm();
  clearDamageDirs();
  clearBanner();
  clearTimeout(bannerTimer);
  const meWon = m.winnerId != null && m.winnerId === myId;
  const title = $('meTitle');
  title.textContent = '';
  if (meWon) {
    title.textContent = t('youWin');
  } else {
    const lab = document.createElement('span');
    lab.className = 'meLab';
    lab.textContent = t('winner') + ': ';
    const nm = document.createElement('span');
    nm.className = 'meName';
    nm.textContent = m.winnerName || '—';
    title.append(lab, nm);
  }
  title.classList.toggle('mine', meWon);
  $('meTag').textContent = t('matchOver');

  const head = $('meHead');
  head.textContent = '';
  for (const k of ['colPlace', 'colName', 'colWins', 'colKills']) {
    const th = document.createElement('th');
    th.textContent = t(k);
    head.appendChild(th);
  }
  const body = $('meBody');
  body.textContent = '';
  const ranking = Array.isArray(m.ranking) ? m.ranking : [];
  ranking.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.id === myId) tr.classList.add('me');
    if (r.id === m.winnerId) tr.classList.add('win');
    const tdP = document.createElement('td');
    tdP.className = 'pl';
    tdP.textContent = String(i + 1);
    const tdN = document.createElement('td');
    tdN.className = 'nm';
    const pl = players.get(r.id);
    if (pl) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = tintCss(pl.tint);
      tdN.appendChild(dot);
    }
    tdN.appendChild(document.createTextNode(r.name || '?'));
    if (r.id === myId || r.bot) {
      const tag = document.createElement('span');
      tag.className = 'tag' + (r.id === myId ? ' you' : '');
      tag.textContent = r.id === myId ? t('you') : t('bot');
      tdN.appendChild(tag);
    }
    const tdW = document.createElement('td');
    tdW.textContent = String(r.wins || 0);
    const tdK = document.createElement('td');
    tdK.textContent = String(r.kills || 0);
    tr.append(tdP, tdN, tdW, tdK);
    body.appendChild(tr);
  });

  const until = performance.now() + 8000;
  const tick = () => {
    const s = Math.max(0, Math.ceil((until - performance.now()) / 1000));
    $('meBack').textContent = t('backLobby', { n: s });
  };
  tick();
  clearInterval(matchEndTimer);
  matchEndTimer = setInterval(tick, 250);
  $('matchEnd').classList.remove('hidden');
  if (meWon) { blip(523, 0.15, 0.12); setTimeout(() => blip(659, 0.15, 0.12), 150); setTimeout(() => blip(784, 0.3, 0.12), 300); }
}
function hideMatchEnd() {
  clearInterval(matchEndTimer);
  matchEndTimer = null;
  const el = $('matchEnd');
  if (el) el.classList.add('hidden');
}

// ------------------------------------------------------------ besturing

const hud = $('hud');
const joy = { id: null, ox: 0, oy: 0 };
const lookP = { id: null, x: 0, y: 0 };
const JOY_MAX = 55;

function clampPitch() { look.pitch = Math.max(-1.0, Math.min(0.8, look.pitch)); }

hud.addEventListener('pointerdown', (e) => {
  initAudio();
  e.preventDefault();
  if (e.pointerType === 'mouse' && e.button === 2) {   // rechts = inzoomen (vasthouden)
    if (document.pointerLockElement === hud) zoom.held = true;
    return;
  }
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement !== hud) {
      try { const p = hud.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ }
    } else if (takeoverBot) {
      doTakeover();            // uitgeschakeld + muis vast: klikken = bot overnemen
    } else {
      input.mouseFire = true;
    }
    return;
  }
  if (e.clientX < window.innerWidth * 0.45 && joy.id === null) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
    const base = $('joyBase');
    base.style.display = 'block';
    base.style.left = (e.clientX - 62) + 'px';
    base.style.top = (e.clientY - 62) + 'px';
    $('joyKnob').style.transform = 'translate(0px, 0px)';
  } else if (lookP.id === null) {
    lookP.id = e.pointerId; lookP.x = e.clientX; lookP.y = e.clientY;
  }
});

hud.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouseChord(e); return; }
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_MAX) { dx = (dx / len) * JOY_MAX; dy = (dy / len) * JOY_MAX; }
    input.jx = dx / JOY_MAX;
    input.jy = -dy / JOY_MAX;
    $('joyKnob').style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  } else if (e.pointerId === lookP.id) {
    const dx = e.clientX - lookP.x, dy = e.clientY - lookP.y;
    lookP.x = e.clientX; lookP.y = e.clientY;
    const sm = Settings.lookMul('touch'); // [polish] gevoeligheid / Y omkeren
    look.yaw -= dx * 0.0065 * sm.x;
    look.pitch -= dy * 0.005 * sm.y;
    clampPitch();
  }
});

function endPointer(e) {
  if (e.pointerType === 'mouse') { input.mouseFire = false; zoom.held = false; return; }
  if (e.pointerId === joy.id) {
    joy.id = null; input.jx = 0; input.jy = 0;
    $('joyBase').style.display = 'none';
  }
  if (e.pointerId === lookP.id) lookP.id = null;
}
hud.addEventListener('pointerup', endPointer);
hud.addEventListener('pointercancel', endPointer);

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== hud) return;
  const sm = Settings.lookMul('mouse'); // [polish] gevoeligheid / Y omkeren
  look.yaw -= e.movementX * 0.0022 * sm.x;
  look.pitch -= e.movementY * 0.0022 * sm.y;
  clampPitch();
});

// ---- bot overnemen na uitschakeling
let takeoverBot = null;      // de bot die de knop nu zou overnemen
let takeoverLabel = '';
const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
function pickTakeoverBot(me) {
  // de gezondste levende bot; bij gelijke HP de dichtstbijzijnde
  let best = null, bh = -1, bd = Infinity;
  for (const e of players.values()) {
    if (!e.bot || !e.alive) continue;
    const d = me ? Math.hypot(e.x - me.x, e.z - me.z) : 0;
    if (e.hp > bh || (e.hp === bh && d < bd)) { bh = e.hp; bd = d; best = e; }
  }
  return best;
}
function doTakeover() {
  if (takeoverBot) send({ t: 'takeover', id: takeoverBot.id });
}
function updateTakeover(me) {
  const can = !!me && !me.alive && phase === 'playing';
  takeoverBot = can ? pickTakeoverBot(me) : null;
  if (takeoverBot && specTarget !== takeoverBot) specTarget = takeoverBot;   // kijk mee met de bot die je zou overnemen
  const label = takeoverBot
    ? t('takeover', { name: takeoverBot.name }) + ' · ' + Math.max(0, Math.round(takeoverBot.hp)) + ' HP' + (COARSE ? '' : ' [E]')
    : '';
  if (label !== takeoverLabel) {
    takeoverLabel = label;
    const b = $('btnTakeover');
    b.textContent = label;
    b.classList.toggle('hidden', !label);
  }
}
$('btnTakeover').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault();
  initAudio();
  doTakeover();
});

const fireBtn = $('fireBtn');
fireBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); initAudio(); input.fire = true; });
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
  fireBtn.addEventListener(ev, () => { input.fire = false; });
});

// ---- springen / hurken / liggen (pc: spatie, C, Z/Ctrl; touch: knoppen naast VUUR; VR: X en linkerstick indrukken)
function canAct(me) { return !!me && me.alive && (phase === 'playing' || phase === 'between'); }
function setStance(me, want) {
  if (!canAct(me) || me.ladder >= 0 || want === me.stance) return;   // op een ladder sta je altijd
  if (want === 2 && !me.ground) return;                              // niet liggen in de lucht
  if (want < me.stance && !S.canStance(levelId, me.x, me.z, me.y, want)) {
    // opstaan lukt niet (iets boven je): uit liggen dan in elk geval hurken
    if (want === 0 && me.stance === 2 && S.canStance(levelId, me.x, me.z, me.y, 1)) want = 1;
    else return;
  }
  me.stance = want;
  updateStanceUi(me);
}
function toggleCrouch() { const me = players.get(myId); if (me) setStance(me, me.stance === 1 ? 0 : 1); }
function toggleProne() { const me = players.get(myId); if (me) setStance(me, me.stance === 2 ? 0 : 2); }
function requestJump() { const me = players.get(myId); if (canAct(me)) input.jumpQ = true; }
let stanceUiKey = '';
function updateStanceUi(me) {
  const st = me && me.alive ? me.stance : 0;
  const k = String(st);
  if (k === stanceUiKey) return;
  stanceUiKey = k;
  $('crouchBtn').classList.toggle('on', st === 1);
  $('proneBtn').classList.toggle('on', st === 2);
}
[['jumpBtn', requestJump], ['crouchBtn', toggleCrouch], ['proneBtn', toggleProne]].forEach(([id, fn]) => {
  $(id).addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); initAudio(); fn(); });
});

// ---- inzoomen (wapens met S.WEAPONS[id].zoom: sniper, DMR)
// Pc: rechtermuisknop vasthouden. Touch: ZOOM-knop (aan/uit).
// De camera schuift naar het schietpunt (camPos + kijkrichting * CAM_DIST), zodat het
// midden van het beeld precies op de kogelbaan ligt, en de FOV wordt smaller.
let scopeMul = 1;   // K/L: scope sterker/zwakker (alleen met sniper/DMR)
const zoom = { held: false, toggle: false, active: false, k: 0, baseFov: 0, yaw0: 0, pitch0: 0, ui: '' };
const zoomEye = new THREE.Vector3();
function zoomWeapon(me) {
  const w = me && S.WEAPONS[me.weapon];
  return w && w.zoom ? w : null;
}
// Muisknoppen die tijdens een andere ingedrukte knop veranderen komen als pointermove binnen.
function mouseChord(e) {
  if (document.pointerLockElement !== hud) return;
  if (e.button === 2) zoom.held = !!(e.buttons & 2);
  else if (e.button === 0 && !takeoverBot) input.mouseFire = !!(e.buttons & 1);
}
// Helemaal uit (nieuwe ronde, terug naar lobby/menu).
function zoomOff() {
  zoom.held = false; zoom.toggle = false; zoom.active = false;
  if (zoom.k > 0) { zoom.k = 0; camera.fov = zoom.baseFov; camera.updateProjectionMatrix(); }
  updateZoomUi(null);
}
// Kijkgevoeligheid mee laten schalen met de zoom (werkt voor muis en touch).
function zoomLook() {
  if (zoom.k > 0 && zoom.baseFov > 0) {
    const f = camera.fov / zoom.baseFov;
    look.yaw = zoom.yaw0 + angDiff(look.yaw, zoom.yaw0) * f;
    look.pitch = zoom.pitch0 + (look.pitch - zoom.pitch0) * f;
  }
  zoom.yaw0 = look.yaw; zoom.pitch0 = look.pitch;
}
function updateZoom(me, dt) {
  const w = zoomWeapon(me);
  const can = !!w && me.alive && (phase === 'playing' || phase === 'countdown');
  if (!can) zoom.toggle = false;            // uitgeschakeld of ronde voorbij: zoom los
  zoom.active = can && (zoom.held || zoom.toggle);
  const prev = zoom.k;
  if (prev === 0 && zoom.active) zoom.baseFov = camera.fov;
  zoom.k += ((zoom.active ? 1 : 0) - zoom.k) * Math.min(1, dt * 14);
  if (!zoom.active && zoom.k < 0.02) zoom.k = 0;
  if (zoom.k > 0 || prev > 0) {
    const target = w ? Math.max(6, Math.min(zoom.baseFov, w.zoom * scopeMul)) : zoom.baseFov;
    camera.fov = zoom.baseFov + (target - zoom.baseFov) * zoom.k;
    camera.updateProjectionMatrix();
  }
  if (me && zoom.k > 0.5) me.group.visible = false;   // eigen poppetje niet in beeld
  updateZoomUi(me, w, can);
}
function updateZoomUi(me, w, can) {
  const scoped = !!w && w.scope && zoom.k > 0.6;
  const key = (can ? 'b' : '') + (zoom.active ? 'a' : '') + (scoped ? 's' + Math.round(zoom.k * 10) : '');
  if (key === zoom.ui) return;
  zoom.ui = key;
  $('zoomBtn').classList.toggle('hidden', !can);
  $('zoomBtn').classList.toggle('on', !!zoom.active);
  const sc = $('scope');
  sc.classList.toggle('hidden', !scoped);
  if (scoped) sc.style.opacity = Math.min(1, (zoom.k - 0.6) / 0.35).toFixed(2);
  $('crosshair').classList.toggle('zoomHide', scoped);
}
function applyZoomCamera(focus, me, d) {
  if (zoom.k <= 0 || focus !== me) return;
  zoomEye.copy(camPos).addScaledVector(d, CAM_DIST);
  camera.position.lerp(zoomEye, zoom.k);
}
$('zoomBtn').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault();
  initAudio();
  zoom.toggle = !zoom.toggle;
});
hud.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== hud) zoom.held = false; });
window.addEventListener('blur', () => { zoom.held = false; });

window.addEventListener('keydown', (e) => {
  if (screen !== 'hud' || Settings.isPaused()) return; // [polish] geen invoer tijdens het pauzemenu
  if (kc.active) { if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') && kc.real > 1.5) { e.preventDefault(); killCamSkip(); } return; }   // KILLCAM: spatie = overslaan
  keys.add(e.code);
  if (e.code === 'KeyK' || e.code === 'KeyL') {   // sniperscope: K = inzoomen, L = uitzoomen
    const me0 = players.get(myId);
    if (zoomWeapon(me0) && canAct(me0)) {
      if (e.code === 'KeyK') { if (!zoom.active) zoom.toggle = true; else scopeMul = Math.max(0.3, scopeMul * 0.8); }
      else if (zoom.active) { scopeMul *= 1.25; if (scopeMul > 1.5) { scopeMul = 1; zoom.toggle = false; zoom.held = false; } }
    }
  }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) requestJump(); }        // spatie = springen (niet meer vuren)
  if (e.code === 'KeyC' && !e.repeat) toggleCrouch();
  if ((e.code === 'KeyZ' || e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat) { e.preventDefault(); toggleProne(); }
  // E: levend en bij een deur = deur open/dicht (DEUR-HOOK), uitgeschakeld = bot overnemen
  if (e.code === 'KeyE' && !e.repeat && !doors.tryUse(players.get(myId))) doTakeover();
  if (e.code === 'KeyV' && !e.repeat && fps) fps.toggle();   // [FPS] eerste/derde persoon
  // [MES] 1/2/3 = vak kiezen, Q = snelle messteek, H = medkit, F = finisher
  if (!e.repeat) {
    if (e.code === 'Digit1') setSlot(0);
    else if (e.code === 'Digit2') setSlot(1);
    else if (e.code === 'Digit3') setSlot(2);
    else if (e.code === 'KeyQ') stab(players.get(myId), performance.now());
    else if (e.code === 'KeyH') useMedkit();
    else if (e.code === 'KeyF') doFinish();
    else if (e.code === 'KeyB') toggleCheat('aimbot');
    else if (e.code === 'KeyN') toggleCheat('wallHack');
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); });
window.addEventListener('blur', () => { keys.clear(); input.fire = false; });

// voorkom scrollen/zoomen op iOS tijdens het spelen
document.addEventListener('touchmove', (e) => { if (screen === 'hud') e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------ spelloop

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function moveMe(me, dt) {
  const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const ky = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let ix = input.jx + kx, iy = input.jy + ky;
  const l = Math.hypot(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  const fx = Math.sin(look.yaw), fz = Math.cos(look.yaw);
  const rx = -Math.cos(look.yaw), rz = Math.sin(look.yaw);
  const vx = fx * iy + rx * ix, vz = fz * iy + rz * ix;
  const px = me.x, pz = me.z;
  const wdef = S.WEAPONS[me.weapon];
  // VR: echt bukken (hoofd laag) = gehurkt
  if (vrCrouch !== !!me.vrc) {
    me.vrc = vrCrouch;
    if (vrCrouch && me.stance === 0) setStance(me, 1);
    else if (!vrCrouch && me.stance === 1) setStance(me, 0);
  }
  // SMG sneller, LMG/sniper trager; gehurkt/liggend langzamer (op de ladder: klimsnelheid in stepPlayer)
  // [MES] mes in de hand: iets sneller (en zonder wapengewicht); medkit gebruiken: half zo snel
  const wsp = mySlot === 1 ? S.MELEE.SPEED : ((wdef && wdef.speed) || 1);
  const sp = SPEED * wsp * (modeDef().speed || 1) * (cheatState.speedBoost ? 1.75 : 1) * (myHeal ? S.MEDKIT.MOVE : 1) * (me.ladder >= 0 ? 1 : MV.SPEED[me.stance]);
  const jump = input.jumpQ;
  input.jumpQ = false;
  const prevStance = me.stance;
  S.stepPlayer(levelId, me, { vx: vx * sp, vz: vz * sp, jump, jumpV: cheatState.superJump ? 12 : modeDef().jumpV, gravity: modeDef().gravity }, dt);
  me.air = !me.ground && me.ladder < 0;
  me.onLadder = me.ladder >= 0;
  if (me.stance !== prevStance) updateStanceUi(me);
  return Math.hypot(me.x - px, me.z - pz) / Math.max(dt, 0.001);
}

// Kijkrichting naar de ladder voor een klimmende speler (dichtstbijzijnde ladder).
function ladderYawFor(e) {
  const L = S.getObstacles(levelId).ladders;
  if (e.me && e.ladder >= 0 && L[e.ladder]) return L[e.ladder].rot + Math.PI;
  let best = null, bd = 2.0;
  for (const ld of L) {
    const d = Math.hypot(ld.x - e.x, ld.z - e.z);
    if (d < bd) { bd = d; best = ld; }
  }
  return best ? best.rot + Math.PI : null;
}

// Houdingen op de bestaande knooppunten: body (romp + benen + geweer), legL/legR (heup), gun.
const PRONE_GUN = new THREE.Vector3(-0.13, 1.45, -0.12);
const tmpGun = new THREE.Vector3();
function applyPose(e, dt, speed, climbSpeed) {
  const P = e.pose, k = Math.min(1, dt * 10);
  const alive = e.alive;
  P.c += ((alive && e.stance === 1 && !e.onLadder ? 1 : 0) - P.c) * k;
  P.p += ((alive && e.stance === 2 && !e.onLadder ? 1 : 0) - P.p) * k;
  P.a += ((alive && e.air ? 1 : 0) - P.a) * Math.min(1, dt * 14);
  P.l += ((alive && e.onLadder ? 1 : 0) - P.l) * k;
  e.anim += (speed * 1.4 * (1 - P.p * 0.4) + climbSpeed * 3.2) * dt;
  const walk = Math.sin(e.anim) * Math.min(1, speed / 4) * 0.9 * (1 - P.c * 0.5) * (1 - P.p * 0.6) * (1 - P.a) * (1 - P.l);
  const climb = Math.sin(e.anim) * 0.55 * P.l * Math.min(1, climbSpeed * 2);
  const lean = 0.28 * P.c;
  // gehurkt: lager, iets voorover, voorste been naar voren, achterste been schuin naar achteren
  // (benen hebben geen knie: zo blijven de voeten boven de grond/vloer);
  // liggend: plat voorover, midden van het lichaam op de spelerspositie
  e.body.position.set(0, -0.32 * P.c + 0.18 * P.p, -0.85 * P.p);
  const death = alive ? 0 : -Math.min(1, e.deadT * 2.8) * Math.PI / 2;
  e.body.rotation.x = lean + (Math.PI / 2) * P.p + death;
  e.legL.rotation.x = walk - 0.85 * P.c - lean - 0.85 * P.a + climb;
  e.legR.rotation.x = -walk + 0.8 * P.c - lean - 0.45 * P.a - climb;
  if (e.gun && e.gunPos) {
    tmpGun.copy(e.gunPos).lerp(PRONE_GUN, P.p);
    tmpGun.x -= 0.08 * P.l; tmpGun.y -= (0.12 + Math.abs(climb) * 0.08) * P.l; tmpGun.z -= 0.18 * P.l;
    e.gun.position.copy(tmpGun);
    e.gun.rotation.x = -lean - (Math.PI / 2) * P.p - 1.2 * P.l + climb * 0.3;
  }
  e.label.sprite.position.y = 2.5 - 0.55 * P.c - 1.75 * P.p;
  e.shield.position.y = 1.05 - 0.35 * P.c - 0.7 * P.p;
  meleePose(e);   // [MES]
}

// [MES] mes / medkit in de hand, steek (arm naar voren), finisher.
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function meleePose(e) {
  const now = performance.now();
  const slot = e.me ? (now < quickKnifeUntil ? 1 : mySlot) : e.slot;
  const knifeOut = e.alive && (slot === 1 || now < e.swingUntil) && !e.healing;
  const medOut = e.alive && e.healing;
  e.knife.visible = knifeOut;
  e.medkit.visible = medOut;
  e.body.rotation.z = 0;
  if (e.gun) e.gun.visible = !(knifeOut || medOut || (e.fin && e.fin.role === 'a'));
  // steek: snel naar voren, langzamer terug
  const st = (now - e.stabT) / 350;
  const thrust = st >= 0 && st < 1 ? (st < 0.3 ? st / 0.3 : 1 - (st - 0.3) / 0.7) : 0;
  e.knife.position.set(KNIFE_POS.x + 0.06 * thrust, KNIFE_POS.y + 0.12 * thrust, KNIFE_POS.z + 0.45 * thrust);
  e.knife.rotation.set(-0.25 * thrust, 0, 0);
  e.body.rotation.x += 0.12 * thrust;
  if (medOut) e.medkit.position.y = 1.2 + Math.sin(now * 0.012) * 0.04;   // verband aanleggen
  if (e.fin) finisherPose(e, now);
}
// ======================================================================================
// FINISHERS (1.35 s, elke speler kiest er een in de lobby; de server stuurt m.k = soort)
//   hulk      pakken, boven het hoofd tillen, de grond in slaan: schokgolf + scheur
//   ninja     twee flitsende sneden, aanvaller schiet erdoorheen, slachtoffer valt in tweeën
//   heli      rondzwaaien (3 draaien) en wegslingeren
//   uppercut  raket-uppercut: slachtoffer vliegt 9 m de lucht in, tolt en slaat neer
//   lightning bliksem uit een wolk, slachtoffer trilt en verkoolt
// Eindpose (p = 1): slachtoffer ligt plat; blijft zo liggen tot hij verdwijnt.
// ======================================================================================
const smashRings = [];   // effecten: { mesh, life, max, kind: 'ring'|'crack'|'fade', r }
let camShake = { until: 0, amp: 0, t0: 0, dur: 450 };
function shake(amp, ms) { camShake = { until: performance.now() + ms, amp, t0: performance.now(), dur: ms }; }
const shockGeo = new THREE.RingGeometry(0.82, 1.0, 64);
const crackTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.translate(64, 64); g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 2.2;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + Math.random() * 0.3; let r = 6, x = 0, y = 0;
    g.beginPath(); g.moveTo(0, 0);
    while (r < 60) { r += 6 + Math.random() * 8; const aa = a + (Math.random() - 0.5) * 0.5; x = Math.cos(aa) * r; y = Math.sin(aa) * r; g.lineTo(x, y); }
    g.stroke();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const addFx = (mesh, life, kind, r) => { scene.add(mesh); smashRings.push({ mesh, life, max: life, kind, r: r || 0 }); };
// vlakke schokgolf op de grond (of rechtop als vertical)
function fxRing(pos, color, maxR, life, vertical) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const m = new THREE.Mesh(shockGeo, mat);
  m.rotation.x = vertical ? 0 : -Math.PI / 2; m.position.copy(pos); m.scale.setScalar(0.3);
  addFx(m, life, 'ring', maxR);
}
function fxCrack(pos, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, opacity: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.copy(pos); m.position.y += 0.02; m.scale.setScalar(size);
  addFx(m, 4, 'crack');
}
function fxDust(pos, n, size, spread) {
  for (let i = 0, c = Settings.fxCount(n); i < c; i++) {
    const a = (i / c) * Math.PI * 2 + Math.random() * 0.4, r = Math.random() * (spread || 1.2);
    const q = pos.clone(); q.x += Math.cos(a) * r; q.z += Math.sin(a) * r; q.y += 0.1 + Math.random() * 0.4;
    addSprite(dustTex, q, size * (0.7 + Math.random() * 0.6), 0.9 + Math.random() * 0.5, 3.2, false);
  }
}
function fxFlash(pos, size, light) {
  addSprite(flashTex, pos, size, 0.18, 2.4, true);
  flashLight.position.copy(pos); flashLight.intensity = light;
}
// dunne gloeiende lijn tussen twee punten (zwaardsnede, bliksem)
function fxBeam(a, b, width, color, life) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.scale.set(width, width, len);
  m.position.copy(a).addScaledVector(d, 0.5); m.lookAt(b);
  addFx(m, life, 'fade');
}
function fxBolt(top, bottom, width, life) {   // gekartelde bliksem
  let prev = top.clone();
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const q = top.clone().lerp(bottom, t);
    if (i < n) { q.x += (Math.random() - 0.5) * 2.2 * (1 - t); q.z += (Math.random() - 0.5) * 2.2 * (1 - t); }
    fxBeam(prev, q, width, 0xcfe6ff, life);
    fxBeam(prev, q, width * 2.6, 0x5b8dff, life);
    prev = q;
  }
}
function updateSmash(dt) {
  for (let i = smashRings.length - 1; i >= 0; i--) {
    const r = smashRings[i];
    r.life -= dt;
    if (r.life <= 0) { scene.remove(r.mesh); r.mesh.material.dispose(); smashRings.splice(i, 1); continue; }
    const k = 1 - r.life / r.max;
    if (r.kind === 'crack') { r.mesh.material.opacity = Math.min(1, r.life / 1.5); continue; }
    if (r.kind === 'fade') { r.mesh.material.opacity = (1 - k) * (1 - k); continue; }
    r.mesh.scale.setScalar(0.3 + r.r * (1 - Math.pow(1 - k, 3)));
    r.mesh.material.opacity = 0.95 * (1 - k);
  }
}
function applyCamShake() {
  const n = performance.now();
  if (n >= camShake.until || (vr && vr.active)) return;
  const k = (camShake.until - n) / camShake.dur, a = camShake.amp * k * k;
  camera.position.x += (Math.random() - 0.5) * a;
  camera.position.y += (Math.random() - 0.5) * a;
  camera.position.z += (Math.random() - 0.5) * a;
}
const nearMe = (x, z) => { const m = players.get(myId); return m ? Math.hypot(m.x - x, m.z - z) : 99; };
const shakeAt = (x, z, big) => { const d = nearMe(x, z), a = d < 2.2 ? big : Math.max(0, big * 0.8 - d * 0.012); if (a > 0.01) shake(a, 450); };

// ---- gedeelde basis voor elke finisher
function finisherPose(e, now) {
  const f = e.fin;
  const elapsed = Math.max(0, now - f.t0);
  const p = Math.min(1, elapsed / f.ms);
  const yaw = Number.isFinite(f.yaw) ? f.yaw : e.yaw;
  const kind = FIN_ANIMS[f.kind] ? f.kind : 'hulk';
  const c = { e, f, p, yaw, fx: Math.sin(yaw), fz: Math.cos(yaw), other: players.get(f.partner), now };
  if (f.role === 'a') {
    if (p >= 1) { e.body.rotation.y = 0; e.fin = null; return; }
    e.knife.visible = false;
    FIN_ANIMS[kind].a(c);
  } else {
    // positie van de aanvaller (voor banen om hem heen) en grondhoogte van het slachtoffer
    const A = c.other || e;
    c.A = { x: A.x, y: A.y || 0, z: A.z };
    c.G = { x: e.x, y: e.y, z: e.z };
    e.body.position.set(0, 0, 0);
    if (e.gun) e.gun.visible = p < 0.1;
    e.knife.visible = false; e.medkit.visible = false;
    e.group.rotation.y = yaw;
    f.dispY = 0;
    FIN_ANIMS[kind].v(c);
  }
}
// zet het slachtoffer op een wereldpositie (x,z) en hoogte y (voeten)
function putVictim(c, x, y, z) { c.e.group.position.set(x, y, z); c.f.dispY = y - c.G.y; }
// netjes plat op de rug (eindpose)
const LIE = -1.52;

const FIN_ANIMS = {
  // ------------------------------------------------------------------ HULK SMASH
  hulk: {
    a(c) {
      const { e, p } = c;
      const grab = smooth(0.0, 0.16, p), lift = smooth(0.16, 0.42, p), slam = smooth(0.50, 0.60, p), hold = smooth(0.42, 0.50, p);
      e.body.position.z += Math.max(0, c.f.d - 0.9) * smooth(0, 0.16, p);
      e.body.position.y += -0.22 * grab * (1 - lift) - 0.12 * slam * (1 - smooth(0.6, 0.8, p));
      e.body.rotation.x = -0.18 * grab - 0.5 * lift + 0.2 * hold + 1.15 * slam - 0.7 * smooth(0.65, 1, p);
      e.body.rotation.z = Math.sin(p * 60) * 0.03 * hold * (1 - slam);
      e.legL.rotation.x = -0.5 * grab + 0.2 * lift - 0.5 * slam;
      e.legR.rotation.x = 0.45 * grab - 0.2 * lift - 0.3 * slam;
    },
    v(c) {
      const { e, f, p, fx, fz, A, G } = c;
      const grab = smooth(0.0, 0.16, p), lift = smooth(0.16, 0.42, p), slam = smooth(0.50, 0.60, p);
      const overX = A.x + fx * 0.15, overZ = A.z + fz * 0.15, overY = A.y + 2.7;
      const hitX = A.x + fx * 1.25, hitZ = A.z + fz * 1.25;
      if (!f.fxDone && p >= 0.58) {
        f.fxDone = true;
        const pos = new THREE.Vector3(hitX, Math.max(G.y, A.y) + 0.06, hitZ);
        fxRing(pos, 0xffffff, 7.5, 0.55); fxRing(pos, 0xffb347, 5, 0.75);
        fxCrack(pos, 4.2); fxDust(pos, 18, 0.9, 1.2); fxFlash(pos.clone().setY(pos.y + 0.5), 3.2, 90);
        shakeAt(hitX, hitZ, 0.22); noiseBurst(0.35, 0.9, 140); blip(55, 0.35, 0.5);
      }
      let x = G.x + (overX - G.x) * lift + (hitX - overX) * slam, z = G.z + (overZ - G.z) * lift + (hitZ - overZ) * slam;
      let y = G.y + (overY - G.y) * lift + (G.y - overY) * slam;
      const bounce = smooth(0.62, 0.75, p) * (1 - smooth(0.75, 1.0, p)), launch = smooth(0.70, 1.0, p);
      x += fx * launch * 4.5; z += fz * launch * 4.5; y += bounce * 1.1 + launch * 0.2;
      putVictim(c, x, y, z);
      e.body.rotation.x = -1.55 * lift - 0.1 * slam + 0.35 * bounce;
      e.body.rotation.z = Math.sin(p * 46) * 0.07 * grab * (1 - slam);
      e.legL.rotation.x = e.legR.rotation.x = 0.6 * Math.sin(p * 30) * lift * (1 - slam) + 0.8 * slam;
    },
  },
  // ------------------------------------------------------------------ NINJA SLASH
  ninja: {
    a(c) {
      const { e, p } = c;
      const s1 = smooth(0.16, 0.24, p) * (1 - smooth(0.24, 0.32, p)), s2 = smooth(0.34, 0.42, p) * (1 - smooth(0.42, 0.50, p));
      const dash = Math.max(0, c.f.d - 0.8) * smooth(0, 0.12, p), through = 2.4 * smooth(0.44, 0.58, p);
      e.body.position.z += dash + through;
      e.body.position.y += -0.15 * smooth(0, 0.12, p) * (1 - smooth(0.6, 0.9, p));
      e.body.rotation.x = 0.35 * smooth(0, 0.12, p) - 0.25 * smooth(0.6, 1, p);
      e.body.rotation.y = 0.9 * s1 - 1.0 * s2;
      e.legL.rotation.x = -0.7 * smooth(0, 0.1, p) + 0.5 * smooth(0.5, 0.7, p);
      e.legR.rotation.x = 0.7 * smooth(0, 0.1, p) - 0.5 * smooth(0.5, 0.7, p);
      e.knife.visible = true;
      e.knife.position.set(KNIFE_POS.x + 0.15 * s1 - 0.2 * s2, KNIFE_POS.y + 0.35 * s1 - 0.3 * s2, KNIFE_POS.z + 0.4 * (s1 + s2));
      e.knife.rotation.set(1.3 * s1 - 1.3 * s2 - 0.4, 0, 1.1 * s1 - 1.1 * s2);
    },
    v(c) {
      const { e, f, p, fx, fz, G } = c;
      if (!f.fx1 && p >= 0.27) { f.fx1 = true; ninjaSlash(G, fx, fz, 1); }
      if (!f.fx2 && p >= 0.45) { f.fx2 = true; ninjaSlash(G, fx, fz, -1); shakeAt(G.x, G.z, 0.12); fxFlash(new THREE.Vector3(G.x, G.y + 1.1, G.z), 2.6, 60); }
      const freeze = p < 0.5 ? Math.sin(p * 90) * 0.02 : 0;                // tijd staat stil: trillen
      const fall = smooth(0.58, 0.82, p), slide = smooth(0.58, 1.0, p);
      putVictim(c, G.x + fx * slide * 1.1 + freeze, G.y, G.z + fz * slide * 1.1);
      e.body.rotation.x = LIE * fall;
      e.body.rotation.z = 0.5 * smooth(0.5, 0.7, p) * (1 - fall);          // scheef langs de snede
      e.legL.rotation.x = 0.3 * fall; e.legR.rotation.x = -0.3 * fall;
    },
  },
  // ------------------------------------------------------------------ HELICOPTER THROW
  heli: {
    a(c) {
      const { e, p } = c;
      const spin = Math.PI * 2 * 3 * smooth(0.12, 0.68, p);
      e.body.position.z += Math.max(0, c.f.d - 0.9) * smooth(0, 0.12, p);
      e.body.rotation.y = spin;
      e.body.rotation.x = 0.15 * smooth(0.1, 0.3, p);
      e.legL.rotation.x = Math.sin(p * 40) * 0.4 * smooth(0.12, 0.3, p);
      e.legR.rotation.x = -Math.sin(p * 40) * 0.4 * smooth(0.12, 0.3, p);
      if (p > 0.68) e.body.rotation.y = 0;
    },
    v(c) {
      const { e, f, p, A, G, fx, fz } = c;
      const turns = 3, T0 = 0.12, T1 = 0.68;
      const sp = smooth(T0, T1, p);
      const ang = Math.atan2(fx, fz) + Math.PI * 2 * turns * sp;      // start vlak voor de aanvaller
      const R = 1.35;
      if (p < T1) {
        const rise = smooth(0.1, 0.3, p);
        const x0 = G.x + (A.x + Math.sin(ang) * R - G.x) * smooth(0, 0.14, p), z0 = G.z + (A.z + Math.cos(ang) * R - G.z) * smooth(0, 0.14, p);
        putVictim(c, x0, G.y + 1.3 * rise, z0);
        e.group.rotation.y = ang + Math.PI / 2;
        e.body.rotation.x = -1.35 * rise; e.body.rotation.z = sp * 0.6;
        if (f.trail === undefined || p - f.trail > 0.04) { f.trail = p; fxDust(new THREE.Vector3(A.x, A.y + 0.05, A.z), 4, 0.8, 1.6); }
        if (p > 0.2) shakeAt(A.x, A.z, 0.03 + 0.05 * sp);
      } else {
        const u = (p - T1) / (1 - T1);                                 // weggeslingerd
        const a1 = Math.atan2(fx, fz) + Math.PI * 2 * turns;
        const sx = A.x + Math.sin(a1) * R, sz = A.z + Math.cos(a1) * R;
        const tx = Math.cos(a1), tz = -Math.sin(a1);                   // raaklijn = vliegrichting
        const dist = 9 * (1 - Math.pow(1 - u, 2));
        putVictim(c, sx + tx * dist, G.y + 1.3 + 3.2 * 4 * u * (1 - u) - 1.3 * u * u, sz + tz * dist);
        e.group.rotation.y = a1 + Math.PI / 2;
        e.body.rotation.x = -1.35 + (LIE + 1.35) * smooth(0.6, 1, u); e.body.rotation.z = 0.6 + 6.28 * u * (1 - u) * 2;
        if (!f.fxDone && u > 0.97) { f.fxDone = true; const q = new THREE.Vector3(sx + tx * dist, G.y + 0.06, sz + tz * dist); fxDust(q, 14, 1.0, 1.0); fxRing(q, 0xd9c9a0, 4, 0.5); shakeAt(q.x, q.z, 0.1); noiseBurst(0.25, 0.7, 180); }
      }
      e.legL.rotation.x = e.legR.rotation.x = 0.3 * Math.sin(p * 30);
    },
  },
  // ------------------------------------------------------------------ ROCKET UPPERCUT
  uppercut: {
    a(c) {
      const { e, p } = c;
      const wind = smooth(0.0, 0.28, p), punch = smooth(0.30, 0.38, p), rec = smooth(0.55, 0.9, p);
      e.body.position.z += Math.max(0, c.f.d - 0.85) * smooth(0, 0.14, p);
      e.body.position.y += -0.3 * wind * (1 - punch) + 0.5 * punch * (1 - rec);
      e.body.rotation.x = -0.35 * wind + 0.55 * punch - 0.3 * rec;
      e.legL.rotation.x = -0.6 * wind * (1 - punch); e.legR.rotation.x = 0.5 * wind * (1 - punch) + 0.4 * punch * (1 - rec);
    },
    v(c) {
      const { e, f, p, fx, fz, G } = c;
      const T = 0.32;
      if (!f.fxDone && p >= T) {
        f.fxDone = true;
        const pos = new THREE.Vector3(G.x, G.y + 1.0, G.z);
        fxFlash(pos, 4, 120); fxRing(pos.clone().setY(G.y + 0.06), 0xffe08a, 6, 0.5); fxRing(pos, 0xffffff, 4, 0.4, true);
        fxDust(pos.clone().setY(G.y + 0.1), 16, 1.0, 1.0); shakeAt(G.x, G.z, 0.25); noiseBurst(0.3, 1.0, 220); blip(90, 0.3, 0.6);
      }
      if (p < T) {                              // opgetild door de klap-opbouw
        const bob = smooth(0.1, T, p);
        putVictim(c, G.x, G.y + 0.1 * bob, G.z);
        e.body.rotation.x = -0.15 * bob; e.body.rotation.z = Math.sin(p * 70) * 0.04;
      } else {
        const u = (p - T) / (1 - T), H = 9.5;
        const y = G.y + 4 * H * u * (1 - u), drift = 2.2 * u;
        putVictim(c, G.x + fx * drift, y, G.z + fz * drift);
        // tolt rond (twee salto's) en landt op zijn rug
        const flip = -Math.PI * 4 * smooth(0, 0.9, u);
        e.body.rotation.x = u < 0.9 ? flip : LIE;
        if (u >= 0.9) e.body.rotation.x = LIE;
        e.body.rotation.z = 0.4 * Math.sin(u * 9) * (1 - u);
        if (u < 0.9 && (f.trail === undefined || u - f.trail > 0.06)) { f.trail = u; fxDust(new THREE.Vector3(G.x + fx * drift, y, G.z + fz * drift), 3, 0.7, 0.4); }
        if (!f.fxDone2 && u >= 0.98) {
          f.fxDone2 = true;
          const q = new THREE.Vector3(G.x + fx * drift, G.y + 0.06, G.z + fz * drift);
          fxRing(q, 0xffffff, 6, 0.5); fxCrack(q, 3.2); fxDust(q, 14, 1.0, 1.0); shakeAt(q.x, q.z, 0.18); noiseBurst(0.3, 0.9, 150);
        }
      }
      e.legL.rotation.x = 0.4; e.legR.rotation.x = -0.4;
    },
  },
  // ------------------------------------------------------------------ LIGHTNING STRIKE
  lightning: {
    a(c) {
      const { e, p } = c;
      const raise = smooth(0.0, 0.3, p) * (1 - smooth(0.6, 0.9, p));
      e.body.position.z += Math.max(0, c.f.d - 2.4) * smooth(0, 0.14, p);
      e.body.rotation.x = -0.45 * raise;       // armen/borst naar de hemel
      e.body.position.y += 0.1 * raise;
      e.body.rotation.z = Math.sin(p * 80) * 0.03 * smooth(0.35, 0.5, p) * (1 - smooth(0.6, 0.8, p));
      e.legL.rotation.x = -0.2 * raise; e.legR.rotation.x = 0.2 * raise;
    },
    v(c) {
      const { e, f, p, fx, fz, G } = c;
      const T = 0.36;
      if (!f.fxDone && p >= T) {
        f.fxDone = true;
        const base = new THREE.Vector3(G.x, G.y, G.z), top = new THREE.Vector3(G.x + (Math.random() - 0.5) * 3, G.y + 38, G.z + (Math.random() - 0.5) * 3);
        fxBolt(top, base.clone().setY(G.y + 0.1), 0.09, 0.45);
        for (let k = 0; k < 3; k++) fxBolt(top.clone().setY(G.y + 14 + k * 4), base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0.1, (Math.random() - 0.5) * 6)), 0.04, 0.3);
        fxFlash(new THREE.Vector3(G.x, G.y + 1.4, G.z), 6, 220); fxRing(base.clone().setY(G.y + 0.06), 0x9fc4ff, 8, 0.6); fxRing(base.clone().setY(G.y + 0.06), 0xffffff, 4, 0.35);
        fxCrack(base, 3.0); fxDust(base, 14, 1.0, 1.4);
        shakeAt(G.x, G.z, 0.3); noiseBurst(0.6, 1.0, 90); blip(48, 0.5, 0.6);
      }
      const zap = p >= T && p < 0.72;
      const jx = zap ? (Math.random() - 0.5) * 0.09 : 0, jz = zap ? (Math.random() - 0.5) * 0.09 : 0;
      const fall = smooth(0.7, 0.92, p);
      putVictim(c, G.x + jx + fx * 0.4 * fall, G.y + (zap ? 0.15 : 0), G.z + jz + fz * 0.4 * fall);
      e.body.rotation.x = (zap ? (Math.random() - 0.5) * 0.35 : 0) + LIE * fall;
      e.body.rotation.z = zap ? (Math.random() - 0.5) * 0.4 : 0;
      e.legL.rotation.x = zap ? Math.random() - 0.5 : 0.2 * fall; e.legR.rotation.x = zap ? Math.random() - 0.5 : -0.2 * fall;
      // vonken blijven spatten tijdens de schok
      if (zap && Math.random() < 0.35) fxFlash(new THREE.Vector3(G.x + (Math.random() - 0.5) * 0.8, G.y + 0.5 + Math.random() * 1.2, G.z + (Math.random() - 0.5) * 0.8), 0.9, 25);
    },
  },
};
// twee kruisende lichtsnedes door de borst van het slachtoffer
function ninjaSlash(G, fx, fz, side) {
  const cx = G.x, cy = G.y + 1.05, cz = G.z;
  const rx = fz, rz = -fx;               // dwars op de aanvalsrichting
  const L = 1.5;
  const a = new THREE.Vector3(cx - rx * L, cy + side * 0.9, cz - rz * L), b = new THREE.Vector3(cx + rx * L, cy - side * 0.9, cz + rz * L);
  fxBeam(a, b, 0.05, 0xffffff, 0.4); fxBeam(a, b, 0.16, 0x6fd3ff, 0.35);
  swishSound(0.8);
}

// ---- Cheat: wall hack. Alle andere spelers krijgen een rood vak dat dwars door muren, rotsen en gebouwen
// zichtbaar is (alleen jouw scherm; de server stuurt de posities toch al naar iedereen).
const espGeo = new THREE.BoxGeometry(0.8, 1, 0.6);
const espEdgeGeo = new THREE.EdgesGeometry(espGeo);
const espFillMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, fog: false });
const espLineMat = new THREE.LineBasicMaterial({ color: 0xff5a44, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false });
function updateEsp(e) {
  const on = cheatState.wallHack && !e.me && e.alive;
  if (!e.esp) {
    if (!on) return;
    const g = new THREE.Group();
    const fill = new THREE.Mesh(espGeo, espFillMat); fill.renderOrder = 1000; fill.frustumCulled = false;
    const line = new THREE.LineSegments(espEdgeGeo, espLineMat); line.renderOrder = 1001; line.frustumCulled = false;
    g.add(fill, line);
    e.group.add(g);
    e.esp = g;
  }
  e.esp.visible = on;
  if (!on) return;
  const st = e.stance | 0, h = MV.HEIGHT[st] || 1.8;
  e.esp.scale.set(1, h, st === 2 ? 3 : 1);
  e.esp.position.set(0, h / 2, st === 2 ? 0.4 : 0);
}

function updateEntities(dt, mySpeed) {
  for (const e of players.values()) {
    let speed = 0, climbSpeed = 0;
    const py = e.y;
    if (e.me) {
      speed = mySpeed;
      if (e.alive && !locked(e)) e.yaw = look.yaw;
      e.onLadder = e.ladder >= 0;
    } else {
      const k = Math.min(1, dt * 12);
      const px = e.x, pz = e.z;
      e.x += (e.tx - e.x) * k;
      e.z += (e.tz - e.z) * k;
      e.yaw += angDiff(e.tyaw, e.yaw) * k;
      speed = Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 0.001);
      // hoogte uit de snapshot (oude server: ondergrond onder de speler)
      const ty = e.ty !== null && e.ty !== undefined ? e.ty : S.supportHeight(levelId, e.x, e.z, e.y);
      if (Math.abs(ty - e.y) > 3) e.y = ty; else e.y += (ty - e.y) * k;
    }
    if (e.onLadder) { climbSpeed = Math.abs(e.y - py) / Math.max(dt, 0.001); speed = 0; }
    e.group.position.set(e.x, e.y, e.z);
    if (e.onLadder) { if (e.ladderYaw === null) e.ladderYaw = ladderYawFor(e); }
    else e.ladderYaw = null;
    e.group.rotation.y = e.ladderYaw !== null && e.alive ? e.ladderYaw : e.yaw;
    // omvallen bij uitschakelen (in applyPose), daarna verdwijnen
    if (e.alive) e.deadT = 0;
    else { e.deadT += dt; speed = 0; climbSpeed = 0; }
    e.group.visible = e.alive || e.deadT < 2.5;
    updateEsp(e);   // cheat: wall hack
    applyPose(e, dt, speed, climbSpeed);
  }
}

// Labels: zichtlijn-test (5x per seconde), afstandsschaal en zacht in-/uitfaden.
const occDir = new THREE.Vector3();
const occFrom = new THREE.Vector3();
let nextOcclusion = 0;
function updateLabels(dt, now) {
  const doOcc = now >= nextOcclusion;
  if (doOcc) {
    nextOcclusion = now + 200;
    occFrom.copy(camera.position);
  }
  for (const e of players.values()) {
    const lb = e.label;
    if (e.me || !e.alive) {
      lb.alpha = 0;
      lb.sprite.visible = false;
      continue;
    }
    const dx = e.x - camera.position.x, dy = e.y + 1.5 - camera.position.y, dz = e.z - camera.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (doOcc) {
      if (dist > LABEL_MAX_DIST) lb.occluded = true;
      else if (dist < 0.5) lb.occluded = false;
      else {
        occDir.set(dx / dist, dy / dist, dz / dist);
        // borst (1.5) geblokkeerd? probeer dan nog het hoofd-/labelpunt, anders verbergen
        let blocked = S.rayBlockDistance(levelId, occFrom, occDir, dist - 0.4) < dist - 0.5;
        if (blocked) {
          const dy2 = dy + 0.9;
          const d2 = Math.sqrt(dx * dx + dy2 * dy2 + dz * dz);
          occDir.set(dx / d2, dy2 / d2, dz / d2);
          blocked = S.rayBlockDistance(levelId, occFrom, occDir, d2 - 0.4) < d2 - 0.5;
        }
        lb.occluded = blocked;
      }
    }
    const wh = cheatState.wallHack;
    lb.sprite.material.depthTest = !wh;   // wall hack: naam ook door muren
    const want = lb.occluded && !wh ? 0 : 1;
    lb.alpha += (want - lb.alpha) * Math.min(1, dt * (want ? 8 : 12));
    if (lb.alpha < 0.02) { lb.sprite.visible = false; continue; }
    lb.sprite.visible = true;
    lb.sprite.material.opacity = lb.alpha;
    // nooit kleiner op het scherm dan op LABEL_REF meter afstand
    const s = Math.max(1, dist / LABEL_REF);
    lb.sprite.scale.set(LABEL_W * s, LABEL_H * s, 1);
  }
}

const CAM_RIGHT = 0.8; // originele schoudercamera: personage links, vizier naast het personage
const camHead = new THREE.Vector3();
const camDir = new THREE.Vector3();
const camLookDir = new THREE.Vector3();
const camRight = new THREE.Vector3();
let camDistNow = CAM_DIST;
function updateCamera(me, dt) {
  let focus = me;
  if (me && !me.alive) {
    if (!specTarget || !players.has(specTarget.id) || !specTarget.alive) {
      specTarget = null;
      for (const e of players.values()) if (e.alive && !e.me) { specTarget = e; break; }
    }
    if (specTarget) focus = specTarget;
  }
  if (!focus) return;
  // ooghoogte volgt de houding zacht (staan 1.7, gehurkt 1.15, liggend 0.5)
  const eyeWant = MV.EYE[focus.alive && !focus.onLadder ? focus.stance : 0] || MV.EYE[0];
  camEye += (eyeWant - camEye) * Math.min(1, (dt || 0.016) * 9);
  const cp = Math.cos(look.pitch);
  const d = camLookDir.set(Math.sin(look.yaw) * cp, Math.sin(look.pitch), Math.cos(look.yaw) * cp);
  if (finCamera(me, d, dt)) return;   // [MES] finisher: filmische camera (ook vanuit eerste persoon)
  // [FPS] eerste persoon (eigen levende speler, niet in VR): camera op het oog, viewmodel in public/fps.js
  if (fps && fps.update(me, focus, camEye, d, dt)) { camPos.copy(camera.position); camera.userData.dir = d; return; }
  const right = camRight.set(-Math.cos(look.yaw), 0, Math.sin(look.yaw));
  camPos.set(focus.x, focus.y + camEye, focus.z)
    .addScaledVector(d, -CAM_DIST)
    .addScaledVector(right, CAM_RIGHT);
  const minY = S.heightAt(levelId, camPos.x, camPos.z) + 0.6;
  if (camPos.y < minY) camPos.y = minY;
  // Camera niet door bomen/dekking: schuif naar voren als er iets tussen zit.
  // camPos blijft de "ideale" plek (daar rekent het schieten mee).
  camHead.set(focus.x, focus.y + camEye, focus.z).addScaledVector(right, CAM_RIGHT * 0.5);
  camDir.subVectors(camPos, camHead);
  const full = camDir.length();
  camDir.divideScalar(full || 1);
  const block = S.rayBlockDistance(levelId, camHead, camDir, full);
  const want = block < full ? Math.max(0.5, block - 0.45) : full;
  camDistNow = want < camDistNow ? want : camDistNow + (want - camDistNow) * Math.min(1, (dt || 0.016) * 5);
  camera.position.copy(camHead).addScaledVector(camDir, camDistNow);
  applyZoomCamera(focus, me, d);
  camera.lookAt(camera.position.x + d.x, camera.position.y + d.y, camera.position.z + d.z);
  camera.userData.dir = d;
}

// ------------------------------------------------------------ [MES] inventaris: 1 wapen, 2 mes, 3 medkit; Q steek, H medkit, F finisher
let mySlot = 0, myMedkits = 1, myHeal = null, healReturnSlot = -1, quickKnifeUntil = 0, nextStabAt = 0;
let finTarget = null, finUiKey = '', invUiKey = '';
function resetInventory() {
  mySlot = 0; myMedkits = 1; myHeal = null; healReturnSlot = -1; quickKnifeUntil = 0; finTarget = null;
  const me = players.get(myId);
  if (me) { me.slot = 0; me.healing = false; me.fin = null; }
}
function locked(me) { return !!(me && me.fin && !me.fin.done); }
function setSlot(s) {
  const me = players.get(myId);
  if (!canAct(me) || locked(me) || s === mySlot) return;
  if (s === 0 && modeDef().knives) return;   // mesgevecht: geen wapen
  mySlot = s; me.slot = s;
  if (s !== 2) { myHeal = null; healReturnSlot = -1; }
  send({ t: 'slot', s });
  input.mouseFire = false;
}
function swishSound(vol) { noiseBurst(0.13, vol, 1800); }
// Mes-steek (vak 2 + vuren, of Q vanuit elk vak): animatie meteen, de server beslist over raak/schade.
function stab(me, now) {
  if (!canAct(me) || phase !== 'playing' || locked(me) || now < nextStabAt) return;
  nextStabAt = now + S.MELEE.COOLDOWN * 1000;
  if (mySlot !== 1) quickKnifeUntil = now + 550;
  me.stabT = now; me.swingUntil = now + 550;
  myHeal = null;
  send({ t: 'melee', yaw: +look.yaw.toFixed(3) });
  swishSound(0.35);
  if (fps && fps.onStab) fps.onStab();
}
function useMedkit() {
  const me = players.get(myId);
  if (!canAct(me) || locked(me) || myHeal || myMedkits <= 0 || me.hp >= 100) return;
  if (mySlot !== 2) { healReturnSlot = mySlot; setSlot(2); }
  send({ t: 'heal' });
  myHeal = { t0: performance.now(), ms: S.MEDKIT.MS };   // (de server bevestigt of breekt af)
}
function doFinish() {
  const me = players.get(myId);
  if (finTarget && canAct(me) && !locked(me)) send({ t: 'finish', id: finTarget.id });
}
// Finisher-prompt: dichtstbijzijnde vijand waarop het mag (zelfde regels als de server, Shared.canFinish)
function updateInventoryUi(me, now) {
  let best = null, bd = Infinity;
  if (canAct(me) && phase === 'playing' && !locked(me)) {
    const a = { x: me.x, z: me.z, y: me.y, yaw: look.yaw, alive: true };
    for (const e of players.values()) {
      if (e.me || !e.alive || e.fin) continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d < bd && S.canFinish(a, e)) { bd = d; best = e; }
    }
  }
  finTarget = best;
  const fk = best ? best.id + lang : '';
  if (fk !== finUiKey) {
    finUiKey = fk;
    $('finPrompt').classList.toggle('hidden', !best);
    $('finBtn').classList.toggle('hidden', !best);
    if (best) {
      $('finPrompt').textContent = '';
      const k = document.createElement('kbd'); k.textContent = 'F';
      $('finPrompt').append(k, ' ' + t('finPrompt') + ' · ' + best.name);
    }
  }
  const showSlot = now < quickKnifeUntil ? 1 : mySlot;
  const ik = showSlot + '|' + myMedkits + '|' + (me ? me.weapon : '') + lang + (me && me.alive ? 1 : 0);
  if (ik !== invUiKey) {
    invUiKey = ik;
    const w = me && S.WEAPONS[me.weapon];
    $('invW').textContent = w ? w.name[lang] : '';
    $('invMedN').textContent = 'x' + myMedkits;
    document.querySelectorAll('.invSlot').forEach((b) => {
      b.classList.toggle('on', +b.dataset.s === showSlot);
      if (+b.dataset.s === 2) b.classList.toggle('empty', myMedkits <= 0);
    });
    $('invBar').classList.toggle('hidden', !(me && me.alive));
  }
  const hb = $('healBar');
  if (myHeal && now - myHeal.t0 > myHeal.ms + 900) myHeal = null;   // geen antwoord: weg
  if (myHeal) {
    hb.classList.remove('hidden');
    $('healFill').style.transform = 'scaleX(' + Math.min(1, (now - myHeal.t0) / myHeal.ms).toFixed(3) + ')';
  } else if (!hb.classList.contains('hidden')) hb.classList.add('hidden');
  if (fps && fps.setSlot) fps.setSlot(showSlot, !!myHeal);
}
document.querySelectorAll('.invSlot').forEach((b) => {
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault(); initAudio();
    const s = +b.dataset.s;
    if (s === 2) useMedkit(); else setSlot(s);
  });
});
$('finBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); initAudio(); doFinish(); });

// [MES] Finisher waar de eigen speler in zit: camera trekt naar achteren en draait langzaam om beide spelers heen.
const finCam = new THREE.Vector3(), finMid = new THREE.Vector3();
let finCamOn = false;
function finCamera(me, d, dt) {
  if (!me || !me.fin || (vr && vr.active)) { finCamOn = false; return false; }
  const f = me.fin;
  const el = performance.now() - f.t0;
  const p = Math.min(1, el / f.ms);
  if ((f.role === 'a' && p >= 1) || el > f.ms + 900) { finCamOn = false; return false; }
  const other = players.get(f.partner);
  const a = f.role === 'a' ? me : other, v = f.role === 'a' ? other : me;
  if (!a || !v) return false;
  const R = { uppercut: 7.5, heli: 5.4, lightning: 5.2, ninja: 3.8, hulk: 3.6 }[(me.fin && me.fin.kind) || 'hulk'] || 3.6;
  const vOff = (v.fin && v.fin.dispY) || 0;          // slachtoffer vliegt: camera volgt hem een beetje
  finMid.set((a.x + v.x) / 2, (a.y + v.y) / 2 + 0.9 + vOff * 0.5, (a.z + v.z) / 2);
  const ang = a.yaw + Math.PI * 0.5 + 0.5 - p * 0.9;
  finCam.set(finMid.x + Math.sin(ang) * R, finMid.y + 0.9, finMid.z + Math.cos(ang) * R);
  finCamOn = true;
  camera.position.lerp(finCam, Math.min(1, (dt || 0.016) * 5));   // zacht naar achteren trekken
  camera.lookAt(finMid);
  camera.userData.dir = d;
  return true;
}

// In-game cheat-indicator (alleen na het ontgrendelen): tik/klik erop of druk B = aimbot, N = wall hack.
function renderCheatHud() {
  const h = $('cheatHud'); if (!h) return;
  h.classList.toggle('hidden', !cheatUnlocked);
  $('aimBtn').textContent = 'AIMBOT: ' + (cheatState.aimbot ? 'ON' : 'OFF') + ' [B]';
  $('aimBtn').classList.toggle('active', cheatState.aimbot);
  $('whBtn').textContent = 'WALLS: ' + (cheatState.wallHack ? 'ON' : 'OFF') + ' [N]';
  $('whBtn').classList.toggle('active', cheatState.wallHack);
}
function toggleCheat(k) { if (!cheatUnlocked) return; cheatState[k] = !cheatState[k]; renderCheats(); syncCheats(); }
$('aimBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); toggleCheat('aimbot'); });
$('whBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); toggleCheat('wallHack'); });

// Aimbot: kies de dichtstbijzijnde levende vijand met vrij zicht (binnen wapenbereik) en geef het
// richtpunt (kop/borst). null = geen doel.
function aimbotTarget(origin, w) {
  let best = null, bd = Infinity;
  const o = { x: origin.x, y: origin.y, z: origin.z };
  for (const e of players.values()) {
    if (e.me || !e.alive) continue;
    const st = e.stance | 0;
    const tx = e.x, tz = e.z, ty = e.y + (st === 0 ? 1.5 : st === 1 ? 1.0 : 0.35);   // kop
    const dx = tx - o.x, dy = ty - o.y, dz = tz - o.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > w.range || d < 0.3 || d >= bd) continue;
    const dir = { x: dx / d, y: dy / d, z: dz / d };
    if (S.rayBlockDistance(levelId, o, dir, d) < d - 0.4) continue;   // muur ertussen
    bd = d; best = new THREE.Vector3(tx, ty, tz);
  }
  return best;
}

function tryFire(me, now) {
  const wanted = input.fire || input.mouseFire;   // (spatie = springen)
  if (!wanted || phase !== 'playing' || !me || !me.alive || locked(me)) return;
  if (mySlot === 1) { stab(me, now); return; }                       // [MES] mes: steken
  if (mySlot === 2) { input.mouseFire = false; useMedkit(); return; } // [MES] medkit gebruiken
  if (myHeal || now < quickKnifeUntil || now < nextShotAt) return;
  const w = S.WEAPONS[me.weapon];
  const viewDir = camera.userData.dir;
  if (!viewDir) return;
  // Een beetje 'te laat' (frame-afronding) mag mee naar het volgende schot, zodat snelle
  // wapens bij 60 fps hun echte vuursnelheid halen (server staat dit toe).
  const late = now - nextShotAt;
  const ivl = w.interval * (modeDef().fireMul || 1);
  nextShotAt = now + ivl * 1000 - (late > 0 && late < ivl * 100 ? late : 0);
  // Kruisje: zoek wat het midden van het beeld echt raakt (muur, prop, speler, grond) en schiet vanaf het
  // speler-schietpunt naar dat punt. Zo valt de kogel op elke afstand op het kruisje (ook dichtbij).
  const origin = new THREE.Vector3(me.x, me.y + S.MOVE.EYE[me.stance | 0], me.z);
  const aimTargets = [];
  for (const e of players.values()) if (!e.me && e.alive) aimTargets.push({ x: e.x, y: e.y, z: e.z, stance: e.stance | 0, yaw: e.yaw });
  const ap = S.aimPoint(levelId, camera.position, viewDir, origin, aimTargets, 250);
  const aimPoint = new THREE.Vector3(ap.x, ap.y, ap.z);
  if (aimPoint.distanceToSquared(origin) < 0.09) aimPoint.copy(origin).addScaledVector(viewDir, 1);   // te dichtbij: kijkrichting
  if (cheatState.aimbot) { const tg = aimbotTarget(origin, w); if (tg) aimPoint.copy(tg); }   // cheat: aimbot
  const shotDir = aimPoint.sub(origin).normalize();
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const shot = { t: 'shoot', o: [+ox.toFixed(3), +oy.toFixed(3), +oz.toFixed(3)], d: [+shotDir.x.toFixed(5), +shotDir.y.toFixed(5), +shotDir.z.toFixed(5)] };
  if (zoom.active && zoom.k > 0.8) shot.z = 1;   // ingezoomd: kijker-nauwkeurigheid (sniper)
  if (camera.userData.vrShot) Object.assign(shot, camera.userData.vrShot);   // VR-HOOK: two:1 (twee handen), z:1 (sniper)
  send(shot);
  shotSound(w.id, 0.45);
  if (fps) fps.onFire(w.id);   // [FPS] terugslag + mondingsvuur van het viewmodel
}

function sendState(me, now) {
  if (!me || !me.alive || (phase !== 'playing' && phase !== 'between')) return;
  if (now - lastSend < 50) return;
  const moved = Math.abs(me.x - lastSentX) > 0.01 || Math.abs(me.z - lastSentZ) > 0.01 || Math.abs(look.yaw - lastSentYaw) > 0.01 ||
    Math.abs(me.y - lastSentY) > 0.01 || me.stance !== lastSentS;
  if (!moved && now - lastSend < 500) return;
  lastSend = now;
  lastSentX = me.x; lastSentZ = me.z; lastSentYaw = look.yaw; lastSentY = me.y; lastSentS = me.stance;
  // y = voeten (cm), s = houding 0 staan / 1 gehurkt / 2 liggend (server controleert beide)
  send({ t: 'state', x: +me.x.toFixed(2), z: +me.z.toFixed(2), y: +me.y.toFixed(2), s: me.stance, yaw: +look.yaw.toFixed(2) });
}

function updateBanner(now) {
  if (phase !== 'countdown') return;
  const secs = Math.ceil((phaseEnd - now) / 1000);
  const key = 'c' + secs + '|' + roundNo + '|' + lang;
  if (key === bannerKey) return;
  bannerKey = key;
  const lvl = S.LEVELS.find((l) => l.id === levelId);
  const sub = t('roundN', { n: roundNo, level: lvl ? lvl.name[lang] : levelId });
  if (secs > 0) setBanner(String(secs), sub);
  else setBanner('', sub);
}

let lastFrame = performance.now();
let frameErrs = 0;
function frame(now) {
  // Een fout in één frame mag het renderen nooit stilzetten (three stopt de lus anders voorgoed).
  try { frameInner(now); }
  catch (err) {
    if (frameErrs++ < 5) console.error('[frame]', err);
    try { if (kc.active) killCamStop(); } catch (_) {}
    try { renderer.render(scene, camera); } catch (_) {}
  }
}
function frameInner(now) {
  // (lus via renderer.setAnimationLoop, zodat hij ook in een WebXR-sessie draait)
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (screen !== 'hud' || !levelId) { if (vr) vr.idle(dt, now); return; }   // VR-HOOK: lobby in VR

  const me = players.get(myId);
  zoomLook();
  if (vr) vr.preUpdate(me, dt, now);   // VR-HOOK: controllers -> input/look.yaw, rondlopen in de kamer
  let mySpeed = 0;
  if (!kc.active && me && me.alive && (phase === 'playing' || phase === 'between') && !locked(me)) mySpeed = moveMe(me, dt);

  killCamEntities(dt);   // KILLCAM: herhaling van de laatste seconden (zet iedereen op zijn opgenomen plek)
  updateEntities(dt, mySpeed);
  kcRecord(now);
  if (!kc.active) updateZoom(me, dt);
  updateCamera(me, dt);
  killCamCamera(dt);
  if (vr) vr.updateCamera(me, dt, now);   // VR-HOOK: eerste persoon, richten met de controller, VR-HUD
  updateLabels(dt, now);
  if (!kc.active) {
    updateProtect(now, me);
    updateTakeover(me);
    updateDamageDirs(now, me);
    tryFire(me, now);
    updateInventoryUi(me, now);   // [MES]
    sendState(me, now);
  }
  updateBanner(now);
  updateEffects(dt);
  updateSmash(dt);
  applyCamShake();
  doors.update(me, dt, now);       // DEUR-HOOK: deuren laten draaien, splinters, lampjes, hint/knop
  if (levelFx) levelFx(dt, now);   // sneeuw, rook, lampen (per level)

  // zon + schaduwgebied volgen de camera (op hele meters, tegen flikkeren)
  const fx = Math.round(camera.position.x), fz = Math.round(camera.position.z);
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx + SUN_OFF.x, SUN_OFF.y, fz + SUN_OFF.z);
  sky.position.copy(camera.position);
  Settings.onFrame(now, dt, me, mySpeed); // [polish] FPS, auto-kwaliteit, voetstappen, hartslag
  renderer.render(scene, camera);
  if (fps) fps.render();      // [FPS] viewmodel (eigen scene, dieptebuffer gewist) - alleen in eerste persoon
  if (vr) vr.afterRender();   // VR-HOOK
}

// ------------------------------------------------------------ KILLCAM
// Na je dood zie je een herhaling van de laatste ~3 seconden vanuit de aanvaller: eerst een schoudercamera
// achter hem, dan slow-motion en inzoomen naar zijn ogen op het moment van de kogel. Daarna een bevroren
// beeld met zijn naam en wapen. Alles komt uit een opname van de posities die de client sowieso al ontvangt.
const KC_KEEP = 6000, KC_WINDOW = 2.8, KC_INTRO = 0.3, KC_FREEZE = 0.7;
const kcBuf = [];      // { t, d: [[id, x, y, z, yaw, stance]] }
const kcShots = [];    // { t, m } schotberichten (voor mondingsvuur en kogelsporen)
let kcLastRec = 0;
const kc = { active: false };
const kcEl = (id) => document.getElementById(id);
function kcRecord(now) {
  if (kc.active || now - kcLastRec < 33) return;
  kcLastRec = now;
  const d = [];
  for (const e of players.values()) d.push([e.id, e.x, e.y, e.z, e.yaw, e.stance | 0]);
  kcBuf.push({ t: now, d });
  while (kcBuf.length && kcBuf[0].t < now - KC_KEEP) kcBuf.shift();
  while (kcShots.length && kcShots[0].t < now - KC_KEEP) kcShots.shift();
}
function kcClear() { kcBuf.length = 0; kcShots.length = 0; }
// positie van entiteit id op opgenomen tijd T (lineair tussen twee opnames)
function kcSample(id, T) {
  let i = kc.idx;
  while (i + 1 < kcBuf.length && kcBuf[i + 1].t <= T) i++;
  kc.idx = i;
  const A = kcBuf[i], B = kcBuf[Math.min(i + 1, kcBuf.length - 1)];
  const a = A.d.find((r) => r[0] === id); if (!a) return null;
  const b = B.d.find((r) => r[0] === id) || a;
  const k = B.t > A.t ? Math.max(0, Math.min(1, (T - A.t) / (B.t - A.t))) : 0;
  let dy = b[4] - a[4]; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, z: a[3] + (b[3] - a[3]) * k, yaw: a[4] + dy * k, stance: a[5] };
}
function killCamStart(killer, m) {
  if (kc.active || !killer || (vr && vr.active) || screen !== 'hud') return;
  const me = players.get(myId);
  if (!me || kcBuf.length < 3) return;
  const deathT = performance.now();
  let first = kcBuf.findIndex((f) => f.t >= deathT - KC_WINDOW * 1000);
  if (first < 0 || deathT - kcBuf[first].t < 400) first = Math.max(0, kcBuf.length - 1 - Math.round(KC_WINDOW * 30));
  if (first >= kcBuf.length - 2) return;
  const win = (deathT - kcBuf[first].t) / 1000;
  if (win < 0.4) return;
  Object.assign(kc, {
    active: true, idx: first, tStart: kcBuf[first].t, win, ft: 0, real: 0, killerId: killer.id, shotI: 0, frozen: 0, flashed: false,
    saved: {
      meAlive: me.alive, meDead: me.deadT, kAlive: killer.alive, kDead: killer.deadT,
      yaw: look.yaw, pitch: look.pitch, fov: camera.fov,
    },
  });
  me.alive = true; me.deadT = 0; killer.deadT = Math.min(killer.deadT, 0);
  const alive0 = killer.alive; killer.alive = true;
  kc.saved.kAlive = alive0;
  zoomOff();
  document.body.classList.add('kc');
  const w = S.WEAPONS[killer.weapon];
  kcEl('kcName').textContent = killer.name;
  kcEl('kcWeapon').textContent = m && m.m ? (lang === 'nl' ? 'MES' : 'KNIFE') : (w ? w.name[lang].toUpperCase() : '');
  const root = kcEl('killcam');
  root.classList.remove('hidden', 'freeze');
  void root.offsetWidth;
  root.classList.add('run');
  noiseBurst(0.45, 0.5, 500);   // terugspoel-zwiep
}
function killCamStop() {
  if (!kc.active) return;
  kc.active = false;
  const me = players.get(myId), k = players.get(kc.killerId), sv = kc.saved;
  if (me) { me.alive = sv.meAlive; me.deadT = 99; }
  if (k) { k.alive = sv.kAlive; k.deadT = sv.kDead; k.group.visible = k.alive || k.deadT < 2.5; }
  look.yaw = sv.yaw; look.pitch = sv.pitch;
  camera.fov = sv.fov; camera.updateProjectionMatrix();
  document.body.classList.remove('kc');
  const root = kcEl('killcam');
  root.classList.add('hidden'); root.classList.remove('run', 'freeze');
  specTarget = null;
  if (kc.pendingMatchEnd) { const me2 = kc.pendingMatchEnd; kc.pendingMatchEnd = null; showMatchEnd(me2); }
}
// voor updateEntities: zet iedereen op zijn opgenomen plek en laat de tijd lopen
function killCamEntities(dt) {
  if (!kc.active) return;
  kc.real += dt;
  const prog0 = kc.ft / kc.win;
  const rate = kc.real < KC_INTRO ? 0 : (prog0 < 0.72 ? 1.25 : 0.45);      // eerst even stilstaan (intro), dan af en toe slow-mo
  if (kc.ft < kc.win) kc.ft = Math.min(kc.win, kc.ft + dt * rate);
  else kc.frozen += dt;
  if (kc.frozen > KC_FREEZE) { killCamStop(); return; }
  const T = kc.tStart + kc.ft * 1000;
  kc.idx = Math.max(0, Math.min(kc.idx, kcBuf.length - 1));
  if (kcBuf[kc.idx] && kcBuf[kc.idx].t > T) kc.idx = 0;
  for (const e of players.values()) {
    const s = kcSample(e.id, T);
    if (!s) continue;
    e.x = e.tx = s.x; e.z = e.tz = s.z; e.y = e.ty = s.y; e.yaw = e.tyaw = s.yaw; e.stance = s.stance;
    if (e.me) look.yaw = s.yaw;
  }
  // schoten uit de opname opnieuw afspelen (mondingsvuur + kogelspoor)
  while (kc.shotI < kcShots.length) {
    const sh = kcShots[kc.shotI];
    if (sh.t < kc.tStart) { kc.shotI++; continue; }
    if (sh.t > T) break;
    kc.shotI++;
    shotFx(sh.m, true);
  }
  // overlay: tijdcode + einde-slag
  const left = Math.max(0, kc.win - kc.ft);
  kcEl('kcTime').textContent = '-00:0' + left.toFixed(1);
  if (kc.ft >= kc.win && !kc.flashed) {
    kc.flashed = true;
    kcEl('killcam').classList.add('freeze');
    shake(0.2, 400); blip(110, 0.3, 0.5); noiseBurst(0.25, 0.6, 160);
  }
}
const kcPos = new THREE.Vector3(), kcLook = new THREE.Vector3(), kcChase = new THREE.Vector3(), kcPov = new THREE.Vector3();
function killCamCamera(dt) {
  if (!kc.active) return;
  const me = players.get(myId), K = players.get(kc.killerId);
  if (!me || !K) return;
  const T = kc.tStart + kc.ft * 1000;
  const kp = kcSample(K.id, T) || { x: K.x, y: K.y, z: K.z, yaw: K.yaw, stance: 0 };
  const vp = kcSample(me.id, T) || { x: me.x, y: me.y, z: me.z, yaw: me.yaw, stance: 0 };
  const prog = Math.min(1, kc.ft / kc.win);
  const pov = smooth(0.60, 0.82, prog);                                    // schoudercamera -> ogen van de schutter
  const sy = Math.sin(kp.yaw), cy = Math.cos(kp.yaw);
  kcChase.set(kp.x - sy * 3.4 + cy * 0.95, kp.y + 1.95 + 0.4 * Math.sin(kc.real * 0.9), kp.z - cy * 3.4 - sy * 0.95);
  kcPov.set(kp.x + sy * 0.15, kp.y + (MV.EYE[kp.stance] || 1.7), kp.z + cy * 0.15);
  kcPos.lerpVectors(kcChase, kcPov, pov);
  camera.position.copy(kcPos);
  kcLook.set(vp.x, vp.y + (MV.CHEST[vp.stance] || 1.0) + 0.25, vp.z);
  // intro: beeld zakt van boven naar de schoudercamera
  const intro = Math.max(0, 1 - kc.real / KC_INTRO);
  camera.position.y += intro * intro * 6;
  camera.lookAt(kcLook);
  camera.rotateZ(0.05 * (1 - pov) * Math.sin(kc.real * 0.7) + 0.035 * intro);   // lichte scheefstand
  const dist = Math.hypot(vp.x - kp.x, vp.z - kp.z);
  const zoomFov = 38 - Math.min(1, Math.max(0, (dist - 20) / 90)) * 20;
  let fov = 70 + (zoomFov - 70) * pov * pov;
  if (kc.ft >= kc.win) fov -= 6 * Math.min(1, kc.frozen * 3);               // duw-in bij de slag
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  K.group.visible = pov < 0.75;                                              // niet in zijn eigen hoofd kijken
  camera.userData.dir = camera.getWorldDirection(new THREE.Vector3());
}
function killCamSkip() { if (kc.active) killCamStop(); }
(function initKillCam() {
  const r = kcEl('killcam');
  if (r) r.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (kc.real > 2) killCamSkip(); });
})();

// ------------------------------------------------------------ start

$('nameInput').value = loadPref('name') || '';
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('codeInput').value = urlRoom.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
// [FPS] eerste-persoonscamera (vóór Settings.init/applyLang: voegt teksten toe aan I18N)
let fps = null;
try {
  fps = initFps({
    renderer, camera, scene, hemi, sun, S, MODELS, gunMesh, flashTex, look, I18N, t,
    getLang: () => lang,
    getZoom: () => { const w = zoomWeapon(players.get(myId)); return { k: zoom.k, scope: !!(w && w.scope) }; },
    vrActive: () => !!(vr && vr.active),
  });
} catch (err) { console.warn('FPS-module niet gestart:', err); }
// [polish] instellingen/pauzemenu/laadscherm koppelen (vóór applyLang: voegt ook teksten toe aan I18N)
Settings.init({
  renderer, camera, scene, sun, canvas, hud, flashLight, LOW, I18N, t,
  ready: modelsLoaded, models: MODELS, modelNames: MODEL_NAMES,
  getScreen: () => screen, getPhase: () => phase, getLang: () => lang,
  setLang: (l) => { lang = l; applyLang(); },
  clearInput: () => {
    keys.clear(); input.fire = false; input.mouseFire = false; input.jx = 0; input.jy = 0; input.jumpQ = false;
    joy.id = null; lookP.id = null; $('joyBase').style.display = 'none';
  },
  leaveGame,
});
applyLang();
showScreen('menu');
// naamlabels opnieuw tekenen zodra het HUD-lettertype binnen is
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { for (const e of players.values()) drawLabel(e); }).catch(() => {});
}

// ---- VR-HOOK (fase 5, Meta Quest 3): losse module public/vr.js. Los geladen, zodat een fout
// of een browser zonder WebXR het gewone spel nooit raakt.
let vr = null;
import('./vr.js').then((m) => {
  vr = m.initVR({
    renderer, scene, camera, sky, S, MODELS, players, look, input, gunMesh, doTakeover,
    doorAction: () => doors.tryUse(players.get(myId)),   // DEUR-HOOK: A (levend, bij een deur)
    getMyId: () => myId, getPhase: () => phase, getLevelId: () => levelId, getScreen: () => screen,
    getSpecTarget: () => specTarget, getLang: () => lang,
    // bewegingsfase: X = springen, linkerstick indrukken = liggen, echt bukken = gehurkt
    jump: requestJump, toggleProne, setCrouch: (v) => { vrCrouch = !!v; },
  });
}).catch((err) => console.warn('VR-module niet geladen:', err));
renderer.setAnimationLoop(frame);

// Alleen lokaal: koppeling voor automatische tests (niet actief op de echte website).
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__game = {
    players, look, keys, input,
    get myId() { return myId; }, get phase() { return phase; }, get roundNo() { return roundNo; },
    get difficulty() { return difficulty; }, get matchTarget() { return matchTarget; },
    get protectLeft() { return Math.max(0, protectUntil - performance.now()); },
  };
}
if (window.__game) {
  window.__game.zoom = zoom; window.__game.camera = camera;
  window.__game.doors = doors; window.__game.camPos = camPos;   // DEUR-HOOK
  // (addEntity/removeEntity: losse poppetjes voor visuele tests van de houdingen)
  Object.assign(window.__game, { S, toggleCrouch, toggleProne, requestJump, addEntity, removeEntity });
  // [MES] inventaris / finisher
  Object.assign(window.__game, { setSlot, stab, useMedkit, doFinish, send });
  Object.defineProperty(window.__game, 'mySlot', { get: () => mySlot });
  Object.defineProperty(window.__game, 'finTarget', { get: () => finTarget });
  Object.defineProperty(window.__game, 'myHeal', { get: () => myHeal });
  Object.defineProperty(window.__game, 'levelId', { get: () => levelId });
}
