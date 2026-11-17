/*
 * Gedeelde spelregels / Shared game rules.
 * Wordt zowel door de server (Node) als door de browser gebruikt,
 * zodat beide dezelfde wereld "zien" (heuvels, bomen, botsingen).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shared = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAP_HALF = 95; // het speelveld loopt van -95 tot +95
  const MAX_PLAYERS = 8;
  const PLAYER_RADIUS = 0.5;
  const TREE_COUNT = 240;
  const CELL = 8;

  // Wapens. Extra velden (fase 2):
  //   model     : naam van public/models/<model>.glb (gebouwd door tools/build_models.py / build_weapons.py)
  //   muzzle    : mondingspunt [x, y, z] t.o.v. de greep in de game (z = vooruit)
  //   botRange  : afstand die een bot met dit wapen probeert aan te houden
  //   speed     : loopsnelheid-factor (1 = normaal)
  //   sound     : geluidsprofiel op de client
  //   zoom      : camera-FOV bij inzoomen (alleen wapens met een kijker); scope = vizier-overlay
  //   hipSpread : spreiding zonder inzoomen (anders geldt spread altijd)
  const WEAPONS = {
    rifle: {
      id: 'rifle',
      name: { nl: 'Aanvalsgeweer', en: 'Assault rifle' },
      damage: 12, interval: 0.13, pellets: 1, spread: 0.015, range: 120,
      model: 'rifle', muzzle: [0, 0.065, 0.9], botRange: 22, speed: 1, sound: 'rifle',
    },
    shotgun: {
      id: 'shotgun',
      name: { nl: 'Shotgun', en: 'Shotgun' },
      damage: 11, interval: 0.8, pellets: 8, spread: 0.065, range: 38,
      // dichtbij extra schade: x1.6 tot 5 m, zakt lineair naar x1 op 14 m; daarna precies zoals voorheen
      closeBoost: { mult: 1.6, full: 5, end: 14 },
      model: 'shotgun', muzzle: [0, 0.065, 0.79], botRange: 9, speed: 1, sound: 'shotgun',
    },
    smg: {
      id: 'smg',
      name: { nl: 'Machinepistool', en: 'SMG' },
      damage: 8, interval: 0.065, pellets: 1, spread: 0.04, range: 45,
      model: 'smg', muzzle: [0, 0.07, 0.47], botRange: 10, speed: 1.1, sound: 'smg',
    },
    lmg: {
      id: 'lmg',
      name: { nl: 'Licht machinegeweer', en: 'Light machine gun' },
      damage: 9, interval: 0.08, pellets: 1, spread: 0.032, range: 100,
      model: 'lmg', muzzle: [0, 0.07, 1.03], botRange: 17, speed: 0.85, sound: 'lmg',
    },
    dmr: {
      id: 'dmr',
      name: { nl: 'Precisiegeweer', en: 'Marksman rifle' },
      damage: 25, interval: 0.38, pellets: 1, spread: 0.006, range: 150,
      model: 'dmr', muzzle: [0, 0.07, 1.01], botRange: 30, speed: 1, sound: 'dmr', zoom: 40,
    },
    sniper: {
      id: 'sniper',
      name: { nl: 'Sniper', en: 'Sniper rifle' },
      damage: 80, interval: 1.3, pellets: 1, spread: 0.002, hipSpread: 0.05, range: 250,
      model: 'sniper', muzzle: [0, 0.075, 1.08], botRange: 38, speed: 0.92, sound: 'sniper', zoom: 18, scope: true,
    },
  };
  const WEAPON_IDS = Object.keys(WEAPONS);
  // Schade van één kogeltje op afstand dist (m). Alleen wapens met closeBoost (shotgun) veranderen.
  function pelletDamage(w, dist) {
    const b = w.closeBoost;
    if (!b || !(dist < b.end)) return w.damage;
    const k = dist <= b.full ? 1 : 1 - (dist - b.full) / (b.end - b.full);
    return w.damage * (1 + (b.mult - 1) * k);
  }

  // ---------------------------------------------------------------- spelmodi (host kiest in de lobby)
  // weapon = iedereen krijgt dit wapen; roulette = elke ronde een willekeurig wapen; knives = alleen mes;
  // oneshot = elke treffer doodt; gravity/jumpV = lage zwaartekracht; speed = loopsnelheid x; fireMul = schiet-interval x; hp = startgezondheid.
  const MODES = {
    classic:  { icon: '⚔', name: { nl: 'Klassiek', en: 'Classic' }, desc: { nl: 'Gewoon spelen.', en: 'Normal rules.' } },
    shotguns: { icon: '💥', weapon: 'shotgun', name: { nl: 'Shotgun-waanzin', en: 'Shotgun madness' }, desc: { nl: 'Iedereen heeft een shotgun.', en: 'Everyone gets a shotgun.' } },
    snipers:  { icon: '🎯', weapon: 'sniper', name: { nl: 'Sniper-duel', en: 'Sniper duel' }, desc: { nl: 'Iedereen heeft een sniper.', en: 'Everyone gets a sniper rifle.' } },
    spray:    { icon: '🔫', weapon: 'smg', name: { nl: 'Kogelregen', en: 'Bullet hell' }, desc: { nl: 'Iedereen heeft een SMG, snel schieten.', en: 'Everyone gets an SMG.' } },
    knives:   { icon: '🔪', knives: true, name: { nl: 'Mesgevecht', en: 'Knife fight' }, desc: { nl: 'Alleen messen en finishers.', en: 'Knives and finishers only.' } },
    roulette: { icon: '🎰', roulette: true, name: { nl: 'Wapenroulette', en: 'Weapon roulette' }, desc: { nl: 'Elke ronde een willekeurig wapen.', en: 'A random weapon every round.' } },
    oneshot:  { icon: '☠', oneshot: true, name: { nl: 'Eén schot', en: 'One shot' }, desc: { nl: 'Elke treffer is dood.', en: 'Every hit kills.' } },
    moon:     { icon: '🌙', gravity: 7, jumpV: 7, name: { nl: 'Maanzwaartekracht', en: 'Moon gravity' }, desc: { nl: 'Zweef en spring heel hoog.', en: 'Float and jump super high.' } },
    hyper:    { icon: '⚡', speed: 1.7, name: { nl: 'Hypersnelheid', en: 'Hyper speed' }, desc: { nl: 'Iedereen rent 70% sneller.', en: 'Everyone runs 70% faster.' } },
    rapid:    { icon: '🌀', fireMul: 0.5, name: { nl: 'Razendsnel', en: 'Rapid fire' }, desc: { nl: 'Alle wapens schieten twee keer zo snel.', en: 'All weapons fire twice as fast.' } },
    glass:    { icon: '🥚', hp: 40, name: { nl: 'Glazen kanon', en: 'Glass cannon' }, desc: { nl: 'Maar 40 HP, dus elke kogel telt.', en: 'Only 40 HP: every bullet counts.' } },
  };
  const MODE_IDS = Object.keys(MODES);
  function modeOf(id) { return MODES[id] || MODES.classic; }

  // Finishers (elke speler kiest er een in de lobby; zelfde duur voor allemaal)
  const FINISHERS = {
    hulk:      { icon: '💪', name: { nl: 'Hulk-smash', en: 'Hulk smash' } },
    ninja:     { icon: '🥷', name: { nl: 'Ninja-snede', en: 'Ninja slash' } },
    heli:      { icon: '🚁', name: { nl: 'Helikopter-worp', en: 'Helicopter throw' } },
    uppercut:  { icon: '🚀', name: { nl: 'Raket-uppercut', en: 'Rocket uppercut' } },
    lightning: { icon: '⚡', name: { nl: 'Bliksemslag', en: 'Lightning strike' } },
  };
  const FINISHER_IDS = Object.keys(FINISHERS);

  // 10 skins. model = glb in public/models (soldier, shellninja, heavy, scout, ghillie).
  // Soldaat-varianten: camo = textuur public/models/skins/<camo>.jpg op materiaal 'Camo',
  // helmet = 'camo' (zelfde textuur op de helmhoes) of een kleur, colors = kleur per materiaalnaam.
  // swatch = 3 kleuren voor het keuzevakje in de lobby. Onbekende id -> SKINS[0].
  const SKINS = [
    { id: 'soldier', name: { nl: 'Bossoldaat', en: 'Woodland' }, model: 'soldier',
      swatch: [0x7f7854, 0x4d5631, 0x56402a] },
    { id: 'shellninja', name: { nl: 'Schaduwschild', en: 'Shadowshell' }, model: 'shellninja',
      swatch: [0x1b1b1e, 0x5d6b45, 0x8a6a2a] },
    { id: 'desert', name: { nl: 'Zandstorm', en: 'Sandstorm' }, model: 'soldier', camo: 'camo_desert', helmet: 'camo',
      colors: { Vest: 0x9c8560, Webbing: 0x7a6748, Boot: 0xa58a65, Scarf: 0xcdb88f, Glove: 0x806a4c },
      swatch: [0xd3c19c, 0xa98b62, 0x7d6448] },
    { id: 'arctic', name: { nl: 'Sneeuwwacht', en: 'Arctic' }, model: 'soldier', camo: 'camo_arctic', helmet: 'camo',
      colors: { Vest: 0xdfe3e6, Webbing: 0xa9afb5, Boot: 0x8c9196, Scarf: 0xf2f3f4, Glove: 0xdfe2e5 },
      swatch: [0xeef0f2, 0xb5bcc4, 0x707882] },
    { id: 'urban', name: { nl: 'Stadsgrijs', en: 'Urban' }, model: 'soldier', camo: 'camo_urban', helmet: 0x45474b,
      colors: { Vest: 0x2b2c2f, Webbing: 0x1d1e20, Boot: 0x1b1b1c, Scarf: 0x55575b, Glove: 0x1d1d1f },
      swatch: [0x8f9193, 0x5a5c60, 0x262729] },
    { id: 'nightops', name: { nl: 'Nachtwacht', en: 'Night Ops' }, model: 'soldier', camo: 'camo_night', helmet: 0x1f2023,
      colors: { Vest: 0x1a1b1e, Webbing: 0x111214, Boot: 0x101011, Scarf: 0x18191b, Glove: 0x111112, Skin: 0x1c1d20, Lens: 0x1f6b34 },
      swatch: [0x2a2c30, 0x16171a, 0x3f8a52] },
    { id: 'digital', name: { nl: 'Pixelmarine', en: 'Navy Digital' }, model: 'soldier', camo: 'camo_digital', helmet: 'camo',
      colors: { Vest: 0x3d495b, Webbing: 0x29313d, Boot: 0x22262c, Scarf: 0x4f5a6a, Glove: 0x23272d },
      swatch: [0x5c6b84, 0x3a4658, 0x8b97a8] },
    { id: 'scout', name: { nl: 'Tijgerstreep', en: 'Jungle Scout' }, model: 'scout',
      swatch: [0x868a5c, 0x4b5530, 0x18190f] },
    { id: 'heavy', name: { nl: 'Pantser', en: 'Ironclad' }, model: 'heavy',
      swatch: [0x5e6352, 0x2b2d2a, 0x8a8f7c] },
    { id: 'ghillie', name: { nl: 'Sluipschutter', en: 'Ghillie' }, model: 'ghillie',
      swatch: [0x8d8a5f, 0x4f5c2e, 0x6f5838] },
  ];
  const SKIN_IDS = SKINS.map((s) => s.id);
  function skinById(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }

  // Fase 3: 5 levels, de server wisselt na elke ronde (in deze volgorde).
  const LEVELS = [
    { id: 'forest', name: { nl: 'Bos met heuvels', en: 'Forest with hills' } },
    { id: 'desert', name: { nl: 'Woestijnpost', en: 'Desert outpost' } },
    { id: 'snow', name: { nl: 'Besneeuwde bergpas', en: 'Snowy mountain pass' } },
    { id: 'village', name: { nl: 'Verwoest dorp', en: 'Ruined village' } },
    { id: 'harbour', name: { nl: 'Haven bij nacht', en: 'Harbour at night' } },
  ];

  // Kleur van het masker, zodat spelers uit elkaar te houden zijn.
  const TINTS = [0xe53935, 0x1e88e5, 0xfb8c00, 0x8e24aa, 0xfdd835, 0x00acc1, 0xd81b60, 0xf5f5f5];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LEVEL_DEFS = {
    forest: {
      height(x, z) {
        return 4.5 * Math.sin(x * 0.045) * Math.cos(z * 0.04) +
               2.5 * Math.sin(x * 0.09 + z * 0.07 + 1.3) +
               1.5 * Math.cos(z * 0.12 - x * 0.05);
      },
    },
    // Woestijn: vlakke post in het midden, duinen eromheen, rand loopt op.
    desert: {
      seed: 7101,
      height(x, z) {
        const k = smooth01(26, 44, Math.hypot(x, z));
        const dune = 2.6 * Math.sin(x * 0.043 + 1.6 * Math.sin(z * 0.023)) +
                     1.4 * Math.sin(z * 0.061 + x * 0.017 + 0.6) + 0.45 * Math.sin(x * 0.12 - z * 0.09);
        return 0.15 * Math.sin(x * 0.05) * Math.cos(z * 0.05) + dune * k + edgeRise(x, z, 84, 0.035, 30);
      },
      // < 0 = zandpad / aangestampte grond (alleen voor de kleuren op de client)
      road(x, z) {
        if (Math.abs(x) < 19.6 && Math.abs(z) < 19.6) return -1;
        let d = Infinity;
        if (Math.abs(z) > 19) d = Math.min(d, Math.abs(x - 2.5 * Math.sin(z * 0.06)) - 2.2);
        if (Math.abs(x) > 19) d = Math.min(d, Math.abs(z - 2.5 * Math.sin(x * 0.06)) - 2.2);
        return d;
      },
      generate: genDesert,
    },
    // Bergpas: een slingerende vallei met een weg, hellingen en hoge bergen buiten het veld.
    snow: {
      seed: 7202,
      height(x, z) {
        const dx = Math.abs(x - snowRoadX(z));
        const valley = 11 * Math.pow(smooth01(9, 72, dx), 1.25);
        const bumps = 1.2 * Math.sin(x * 0.09 + 0.7) * Math.cos(z * 0.075) + 0.6 * Math.sin(x * 0.17 + z * 0.13 + 2);
        return valley + bumps + edgeRise(x, z, 82, 0.06, 55);
      },
      road(x, z) { return Math.abs(x - snowRoadX(z)) - 3.2; },
      generate: genSnow,
    },
    // Dorp: bijna vlak; plein in het midden, 6 straten als spaken en een ringweg (r = 42).
    village: {
      seed: 7303,
      height(x, z) {
        return 0.55 * Math.sin(x * 0.031 + 0.5) * Math.cos(z * 0.027) + 0.2 * Math.sin(x * 0.083 + z * 0.061) +
               edgeRise(x, z, 88, 0.02, 6);
      },
      road: villageRoad,
      generate: genVillage,
    },
    // Haven: vlak beton, water aan de noordkant (z > MAP_HALF).
    harbour: {
      seed: 7404,
      height() { return 0; },
      road() { return Infinity; },
      generate: genHarbour,
    },
  };

  function smooth01(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  // Grond die buiten het speelveld oploopt (zodat de rand natuurlijk aanvoelt).
  function edgeRise(x, z, start, k, cap) {
    const ex = Math.max(0, Math.abs(x) - start), ez = Math.max(0, Math.abs(z) - start);
    return Math.min(cap, k * (ex * ex + ez * ez));
  }
  function snowRoadX(z) { return 20 * Math.sin(z * 0.021 + 0.4); }
  const VILLAGE_STREETS = [0, 1, 2, 3, 4, 5].map((k) => (k * Math.PI) / 3 + 0.18);
  // Afstand tot de rand van een straat (negatief = op straat).
  function villageRoad(x, z) {
    const r = Math.hypot(x, z);
    let d = Math.min(r - 12, Math.abs(r - 42) - 4);
    for (let i = 0; i < VILLAGE_STREETS.length; i++) {
      const a = VILLAGE_STREETS[i], sa = Math.sin(a), ca = Math.cos(a);
      if (x * sa + z * ca > 0) d = Math.min(d, Math.abs(x * ca - z * sa) - 3.25);
    }
    return d;
  }
  function roadDist(levelId, x, z) {
    const L = LEVEL_DEFS[levelId];
    return L && L.road ? L.road(x, z) : Infinity;
  }

  function heightAt(levelId, x, z) {
    const L = LEVEL_DEFS[levelId];
    if (!L) return 0;
    const h = L.height(x, z);
    if (!L.generate) return h;
    // gebouwen staan op een vlak geschoven stuk grond ("pad"); eerst het level genereren
    if (!L.padGrid) getObstacles(levelId);
    const arr = L.padGrid && L.padGrid.get(key(cellOf(x), cellOf(z)));
    if (!arr) return h;
    let bw = 0, by = 0;
    for (let i = 0; i < arr.length; i++) {
      const pd = arr[i];
      const d = boxPointDist(pd, x, z);
      if (d >= pd.blend) continue;
      const w = 1 - smooth01(0, pd.blend, d);
      if (w > bw) { bw = w; by = pd.y; }
    }
    return bw > 0 ? h + (by - h) * bw : h;
  }
  // Vlak stuk grond onder een gebouw (rect = gedraaide rechthoek, y = hoogte, blend = overgang in m).
  function addPad(levelId, rect, y, blend) {
    const L = LEVEL_DEFS[levelId];
    const pd = { x: rect.x, z: rect.z, c: rect.c, s: rect.s, hx: rect.hx, hz: rect.hz, y, blend };
    const R = Math.hypot(rect.hx, rect.hz) + blend;
    for (let i = cellOf(rect.x - R); i <= cellOf(rect.x + R); i++) {
      for (let j = cellOf(rect.z - R); j <= cellOf(rect.z + R); j++) {
        const k = key(i, j);
        if (!L.padGrid.has(k)) L.padGrid.set(k, []);
        L.padGrid.get(k).push(pd);
      }
    }
  }

  // ---- obstakels (bomen) met een grid voor snelle opzoeking ----
  function cellOf(v) { return Math.floor(v / CELL); }
  function key(cx, cz) { return (cx + 64) * 256 + (cz + 64); }

  const obstacleCache = {};
  function getObstacles(levelId) {
    if (obstacleCache[levelId]) return obstacleCache[levelId];
    if (LEVEL_DEFS[levelId] && LEVEL_DEFS[levelId].generate) {
      obstacleCache[levelId] = buildGenerated(levelId);
      return obstacleCache[levelId];
    }
    const trees = [];
    const grid = new Map();
    if (levelId === 'forest') {
      const rnd = mulberry32(1337);
      let tries = 0;
      while (trees.length < TREE_COUNT && tries < 5000) {
        tries++;
        const x = (rnd() * 2 - 1) * (MAP_HALF - 4);
        const z = (rnd() * 2 - 1) * (MAP_HALF - 4);
        if (Math.hypot(x, z) < 10) continue; // open plek in het midden
        let ok = true;
        for (const o of trees) {
          if (Math.hypot(o.x - x, o.z - z) < 4) { ok = false; break; }
        }
        if (!ok) continue;
        const scale = 0.8 + rnd() * 0.9;
        const tree = { x, z, r: 0.45 + scale * 0.2, h: 6, baseY: heightAt(levelId, x, z), scale };
        trees.push(tree);
        const k = key(cellOf(x), cellOf(z));
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(tree);
      }
    }
    const props = levelId === 'forest' ? generateProps(levelId, trees, grid) : [];
    const built = buildPropPieces(levelId, props);
    const vert = buildVerticalData(props, built.pieces);
    const obs = {
      trees, grid, props, propPieces: built.pieces, propGrid: built.grid,
      boxes: vert.boxes, ladders: vert.ladders, boxGrid: vert.grid,
    };
    obstacleCache[levelId] = obs;
    return obs;
  }

  // ---- militaire dekking (zandzakken, kisten, wachttorens) ----
  // Maten moeten gelijk zijn aan de 3D-modellen op de client (pivot = midden onderkant).
  const PROP_DIMS = {
    sandbags: { hx: 1.5, hz: 0.38, h: 1.0 },
    crate: { hx: 0.55, hz: 0.55, h: 1.1 }, // hoogte x stack
    tower: { leg: 1.4, legR: 0.22, h: 6.1 },   // h = bovenkant van de palen (dak erboven)
    // extra levels (modellen uit tools/build_levels.py); 'wall' heeft eigen maten per stuk
    container: { hx: 3.03, hz: 1.22, h: 2.59 },   // hoogte x stack
    jersey: { hx: 1.0, hz: 0.3, h: 0.82 },
    car: { hx: 2.15, hz: 0.95, h: 1.45 },
    logs: { hx: 1.5, hz: 0.55, h: 1.0 },
    cabin: { hx: 3.0, hz: 2.3, h: 4.6 },
    rubble: { hx: 1.1, hz: 0.8, h: 0.7 },
    barrel: { r: 0.31, h: 0.92 },
    lamp: { r: 0.16, h: 7.5 },
    well: { r: 1.3, h: 0.95 },
    crane: { lx: 7, lz: 5, hx: 0.45, hz: 0.8, h: 16 },
    // meubels in gebouwen (tools/build_buildings.py); lokale X = lengte
    table: { hx: 0.6, hz: 0.4, h: 0.8 },
    shelf: { hx: 0.6, hz: 0.22, h: 1.9 },
    bunk: { hx: 1.0, hz: 0.45, h: 1.6 },
    stove: { hx: 0.3, hz: 0.3, h: 0.85 },
    pew: { hx: 1.5, hz: 0.3, h: 0.9 },
  };
  const PROP_GAP = 2.5;        // minimale vrije ruimte tot bomen en andere props
  const SPAWN_RING_IN = 37;    // rond de spawn-ring (straal 42) blijft alles leeg
  const SPAWN_RING_OUT = 47;

  // Lokaal -> wereld (zelfde als Three.js rotation.y = yaw).
  function localToWorld(cx, cz, c, s, lx, lz) {
    return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
  }

  // Afstand van een punt tot een gedraaide rechthoek (0 = erin).
  function boxPointDist(b, wx, wz) {
    const dx = wx - b.x, dz = wz - b.z;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    const ex = Math.max(Math.abs(lx) - b.hx, 0), ez = Math.max(Math.abs(lz) - b.hz, 0);
    return Math.hypot(ex, ez);
  }

  function boxPerimeter(b, step) {
    const pts = [];
    const nx = Math.max(1, Math.ceil((2 * b.hx) / step)), nz = Math.max(1, Math.ceil((2 * b.hz) / step));
    for (let i = 0; i <= nx; i++) {
      const lx = -b.hx + (2 * b.hx * i) / nx;
      pts.push(localToWorld(b.x, b.z, b.c, b.s, lx, -b.hz), localToWorld(b.x, b.z, b.c, b.s, lx, b.hz));
    }
    for (let i = 1; i < nz; i++) {
      const lz = -b.hz + (2 * b.hz * i) / nz;
      pts.push(localToWorld(b.x, b.z, b.c, b.s, -b.hx, lz), localToWorld(b.x, b.z, b.c, b.s, b.hx, lz));
    }
    return pts;
  }

  // Benaderde afstand tussen twee gedraaide rechthoeken (alleen voor het plaatsen).
  function footprintDist(a, b) {
    if (boxPointDist(b, a.x, a.z) === 0 || boxPointDist(a, b.x, b.z) === 0) return 0;
    let best = Infinity;
    for (const p of boxPerimeter(a, 0.2)) best = Math.min(best, boxPointDist(b, p.x, p.z));
    for (const p of boxPerimeter(b, 0.2)) best = Math.min(best, boxPointDist(a, p.x, p.z));
    return best;
  }

  // Grondvlak van een prop voor het plaatsen (toren = hele vierkant tussen de poten).
  function propFootprint(p) {
    let hx, hz;
    if (p.kind === 'tower') { hx = hz = PROP_DIMS.tower.leg + PROP_DIMS.tower.legR; }
    else { hx = PROP_DIMS[p.kind].hx; hz = PROP_DIMS[p.kind].hz; }
    return { x: p.x, z: p.z, c: Math.cos(p.yaw), s: Math.sin(p.yaw), hx, hz };
  }

  function generateProps(levelId, trees, treeGrid) {
    const rnd = mulberry32(4242);
    const props = [];
    const fps = [];
    const TAU = Math.PI * 2;
    const lim = MAP_HALF - 6;

    function fpOk(fp, others) {
      const br = Math.hypot(fp.hx, fp.hz);
      // binnen de kaart
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const p = localToWorld(fp.x, fp.z, fp.c, fp.s, sx * fp.hx, sz * fp.hz);
        if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) return false;
      }
      // niet in de buurt van de spawn-ring
      const rc = Math.hypot(fp.x, fp.z);
      if (rc > SPAWN_RING_IN - br && rc < SPAWN_RING_OUT + br) return false;
      // afstand tot boomstammen
      const cx = cellOf(fp.x), cz = cellOf(fp.z);
      for (let i = cx - 1; i <= cx + 1; i++) {
        for (let j = cz - 1; j <= cz + 1; j++) {
          const arr = treeGrid.get(key(i, j));
          if (!arr) continue;
          for (const t of arr) if (boxPointDist(fp, t.x, t.z) < PROP_GAP) return false;
        }
      }
      // afstand tot andere props
      for (const o of others) {
        if (Math.hypot(o.x - fp.x, o.z - fp.z) > br + Math.hypot(o.hx, o.hz) + PROP_GAP + 0.1) continue;
        if (footprintDist(fp, o) < PROP_GAP) return false;
      }
      return true;
    }

    // Probeer een groep props tegelijk te plaatsen (onderling mogen ze dicht op elkaar).
    function tryPlace(group) {
      const gfps = group.map(propFootprint);
      for (const fp of gfps) if (!fpOk(fp, fps)) return false;
      for (let i = 0; i < group.length; i++) {
        const p = group[i];
        p.baseY = heightAt(levelId, p.x, p.z);
        props.push(p);
        fps.push(gfps[i]);
      }
      return true;
    }

    function randPos(minR, maxR) {
      // willekeurig punt in de kaart, met afstand tot het midden tussen minR en maxR
      for (;;) {
        const x = (rnd() * 2 - 1) * lim, z = (rnd() * 2 - 1) * lim;
        const r = Math.hypot(x, z);
        if (r >= minR && r <= maxR) return { x, z };
      }
    }

    // 1) Wachttorens: één bij de open plek in het midden, de rest verspreid.
    let towerAngle = rnd() * TAU;
    for (let t = 0; t < 200; t++) {
      const a = towerAngle + (t ? (rnd() - 0.5) * 0.6 : 0);
      const r = 5 + rnd() * 1.5;
      if (tryPlace([{ kind: 'tower', x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: rnd() * TAU, stack: 1 }])) {
        towerAngle = a; break;
      }
    }
    let towers = props.length;
    for (let t = 0; t < 4000 && towers < 3; t++) {
      const p = randPos(18, 200);
      if (tryPlace([{ kind: 'tower', x: p.x, z: p.z, yaw: rnd() * TAU, stack: 1 }])) towers++;
    }

    // 2) Zandzakken: een paar losse muren rond het midden (lange kant naar het midden gekeerd).
    let walls = 0;
    for (const off of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      for (let t = 0; t < 60; t++) {
        const a = towerAngle + off + (rnd() - 0.5) * 0.8 * (t ? 1 : 0);
        const r = 6 + rnd() * 1.5;
        if (tryPlace([{ kind: 'sandbags', x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: a, stack: 1 }])) { walls++; break; }
      }
    }

    // Daarna stellingen: los, twee op een rij, L-vorm of U-vorm.
    const LAYOUTS = [
      { w: 0.4, parts: [[0, 0, 0]] },
      { w: 0.2, parts: [[-1.53, 0, 0], [1.53, 0, 0]] },
      { w: 0.25, parts: [[0, 0, 0], [1.9, 1.12, Math.PI / 2]] },
      { w: 0.15, parts: [[0, 0, 0], [1.9, 1.12, Math.PI / 2], [-1.9, 1.12, Math.PI / 2]] },
    ];
    for (let t = 0; t < 6000 && walls < 22; t++) {
      let u = rnd(), lay = LAYOUTS[0];
      for (const L of LAYOUTS) { if (u < L.w) { lay = L; break; } u -= L.w; }
      if (walls + lay.parts.length > 23) lay = LAYOUTS[0];
      const p = randPos(13, 200);
      const gy = rnd() * TAU, c = Math.cos(gy), s = Math.sin(gy);
      const group = lay.parts.map(([lx, lz, dy]) => {
        const w = localToWorld(p.x, p.z, c, s, lx, lz);
        return { kind: 'sandbags', x: w.x, z: w.z, yaw: gy + dy, stack: 1 };
      });
      if (tryPlace(group)) walls += group.length;
    }

    // 3) Kisten: een paar bij het midden, de rest verspreid; ~30% gestapeld.
    let crates = 0;
    for (let t = 0; t < 6000 && crates < 26; t++) {
      const p = crates < 3 ? randPos(3, 9) : randPos(13, 200);
      const stack = rnd() < 0.3 ? 2 : 1;
      if (tryPlace([{ kind: 'crate', x: p.x, z: p.z, yaw: rnd() * TAU, stack }])) crates++;
    }

    // Draaiing netjes tussen 0 en 2*PI houden.
    for (const p of props) p.yaw = ((p.yaw % TAU) + TAU) % TAU;
    return props;
  }

  // Botsingsstukken: gedraaide dozen (zandzakken, kisten) en cirkels (torenpoten).
  function buildPropPieces(levelId, props) {
    const pieces = [];
    const grid = new Map();
    for (const p of props) {
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      if (p.noCol) continue;   // alleen uiterlijk (bijv. het blokhut-model; botsing zit in verborgen muren)
      if (p.kind === 'tower') {
        const D = PROP_DIMS.tower;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const w = localToWorld(p.x, p.z, c, s, sx * D.leg, sz * D.leg);
          const gy = Math.min(p.baseY, heightAt(levelId, w.x, w.z));
          // moveTop: voor het lopen houden de palen op bij het platform (daarboven loop je er vrij langs)
          pieces.push({ type: 1, x: w.x, z: w.z, r: D.legR, br: D.legR, y0: gy - 0.5, y1: p.baseY + D.h, prop: p,
            moveTop: p.baseY + TOWER_PLATFORM.bottom });
        }
        // platformvloer en borstwering (0.9 m, met een opening bij de ladder): houden kogels tegen.
        // overhead = de oude 2D-botsing (resolveCollision) negeert ze; de 3D-botsing gebruikt obs.boxes.
        const P = TOWER_PLATFORM, top = p.baseY + P.top;
        const part = (lx, lz, hx, hz, y0, y1, towerPart) => {
          const w = localToWorld(p.x, p.z, c, s, lx, lz);
          pieces.push({ type: 0, x: w.x, z: w.z, c, s, hx, hz, br: Math.hypot(hx, hz), y0, y1, prop: p, overhead: true, towerPart });
        };
        part(0, 0, P.half, P.half, p.baseY + P.bottom, top, 'floor');
        const e = P.railAt, t = P.railT, gap = P.gap, seg = (P.half - gap) / 2;
        part(0, -e, P.half, t, top, top + P.railing, 'rail');
        part(e, 0, t, P.half, top, top + P.railing, 'rail');
        part(-e, 0, t, P.half, top, top + P.railing, 'rail');
        part(-(gap + seg), e, seg, t, top, top + P.railing, 'rail');   // ladderkant (+Z): opening in het midden
        part(gap + seg, e, seg, t, top, top + P.railing, 'rail');
      } else if (p.kind === 'crane') {
        const D = PROP_DIMS.crane;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const w = localToWorld(p.x, p.z, c, s, sx * D.lx, sz * D.lz);
          pieces.push({
            type: 0, x: w.x, z: w.z, c, s, hx: D.hx, hz: D.hz, br: Math.hypot(D.hx, D.hz),
            y0: p.baseY - 0.5, y1: p.baseY + D.h, prop: p,
          });
        }
      } else if (PROP_DIMS[p.kind] && PROP_DIMS[p.kind].r) {
        const D = PROP_DIMS[p.kind];   // ronde dingen: vaten, lantaarnpalen, put
        pieces.push({ type: 1, x: p.x, z: p.z, r: D.r, br: D.r, y0: p.baseY - 0.5, y1: p.baseY + D.h, prop: p });
      } else if (p.kind !== 'sandbags' && p.kind !== 'crate') {
        // muren / gebouwen ('wall', eigen maten) en dozen uit PROP_DIMS (containers, auto's, ...)
        const D = p.kind === 'wall' ? p : PROP_DIMS[p.kind];
        const yb = p.yb || 0;
        const h = p.kind === 'wall' ? p.h : D.h * (p.kind === 'container' ? p.stack : 1);
        pieces.push({
          type: 0, x: p.x, z: p.z, c, s, hx: D.hx, hz: D.hz, br: Math.hypot(D.hx, D.hz),
          y0: yb > 0 ? p.baseY + yb : p.baseY - 0.5, y1: p.baseY + yb + h, prop: p,
          // boven hoofdhoogte (latei, dak): blokkeert kogels, maar niet het lopen
          overhead: p.oh !== undefined ? p.oh : yb >= 1.9,
          slab: !!p.slab,   // dak / verdiepingsvloer van een gebouw
        });
      } else {
        const D = PROP_DIMS[p.kind];
        const h = D.h * (p.kind === 'crate' ? p.stack : 1);
        pieces.push({
          type: 0, x: p.x, z: p.z, c, s, hx: D.hx, hz: D.hz, br: Math.hypot(D.hx, D.hz),
          y0: p.baseY - 0.5, y1: p.baseY + h, prop: p,
        });
      }
    }
    // In elke cel die de (iets vergrote) omhullende cirkel raakt, zodat één cel opzoeken genoeg is.
    for (const pc of pieces) {
      const R = pc.br + 1.0;
      for (let i = cellOf(pc.x - R); i <= cellOf(pc.x + R); i++) {
        for (let j = cellOf(pc.z - R); j <= cellOf(pc.z + R); j++) {
          const k = key(i, j);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(pc);
        }
      }
    }
    return { pieces, grid };
  }

  // Zit punt (x,y,z) in een prop?
  function blockedByProp(obs, x, y, z) {
    const arr = obs.propGrid && obs.propGrid.get(key(cellOf(x), cellOf(z)));
    if (!arr) return false;
    for (let n = 0; n < arr.length; n++) {
      const pc = arr[n];
      if (y <= pc.y0 || y >= pc.y1) continue;
      if (pc.type === 1) {
        const dx = x - pc.x, dz = z - pc.z;
        if (dx * dx + dz * dz < pc.r * pc.r) return true;
      } else if (boxPointDist(pc, x, z) === 0) return true;
    }
    return false;
  }

  // Exacte afstand langs een straal tot de eerste prop (of maxDist).
  // Loopt cel voor cel door het prop-grid (elk stuk staat in alle cellen die het raakt),
  // en stopt zodra de volgende cel verder ligt dan de dichtstbijzijnde treffer.
  let rayStamp = 0;
  function rayPropDistance(obs, o, d, maxDist) {
    let best = maxDist;
    const pieces = obs.propPieces;
    if (!pieces || !pieces.length) return best;
    const grid = obs.propGrid;
    const dl2 = d.x * d.x + d.z * d.z;
    const stamp = ++rayStamp;
    let cx = cellOf(o.x), cz = cellOf(o.z);
    const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    const tdx = d.x !== 0 ? CELL / Math.abs(d.x) : Infinity;
    const tdz = d.z !== 0 ? CELL / Math.abs(d.z) : Infinity;
    let tmx = d.x > 0 ? ((cx + 1) * CELL - o.x) / d.x : d.x < 0 ? (cx * CELL - o.x) / d.x : Infinity;
    let tmz = d.z > 0 ? ((cz + 1) * CELL - o.z) / d.z : d.z < 0 ? (cz * CELL - o.z) / d.z : Infinity;
    for (let guard = 0; guard < 400; guard++) {
      const arr = grid.get(key(cx, cz));
      if (arr) {
        for (let n = 0; n < arr.length; n++) {
          const pc = arr[n];
          if (pc.rs === stamp) continue;
          pc.rs = stamp;
          const t = rayPieceHit(pc, o, d, dl2, best);
          if (t < best) best = t;
        }
      }
      if (dl2 <= 1e-12) break;
      const tn = tmx < tmz ? tmx : tmz;
      if (tn >= best) break;
      if (tmx < tmz) { cx += stepX; tmx += tdx; } else { cz += stepZ; tmz += tdz; }
    }
    return best;
  }

  // Afstand langs de straal tot één stuk (Infinity = mis of verder dan best).
  function rayPieceHit(pc, o, d, dl2, best) {
    {
      // snelle 2D-afwijzing met de omhullende cirkel
      const ox = pc.x - o.x, oz = pc.z - o.z;
      if (dl2 > 1e-12) {
        const tc = (ox * d.x + oz * d.z) / dl2;
        const lim = pc.br / Math.sqrt(dl2);
        if (tc + lim < 0 || tc - lim > best) return Infinity;
        const px = ox - d.x * tc, pz = oz - d.z * tc;
        if (px * px + pz * pz > pc.br * pc.br) return Infinity;
      } else if (ox * ox + oz * oz > pc.br * pc.br) return Infinity;

      if (pc.type === 0) {
        // straal in lokale ruimte, slab-test over x, y, z
        const rx = o.x - pc.x, rz = o.z - pc.z;
        const lo = [rx * pc.c - rz * pc.s, o.y, rx * pc.s + rz * pc.c];
        const ld = [d.x * pc.c - d.z * pc.s, d.y, d.x * pc.s + d.z * pc.c];
        const mn = [-pc.hx, pc.y0, -pc.hz], mx = [pc.hx, pc.y1, pc.hz];
        let t0 = 0, t1 = best, hit = true;
        for (let a = 0; a < 3; a++) {
          if (Math.abs(ld[a]) < 1e-9) {
            if (lo[a] < mn[a] || lo[a] > mx[a]) { hit = false; break; }
          } else {
            let ta = (mn[a] - lo[a]) / ld[a], tb = (mx[a] - lo[a]) / ld[a];
            if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
            if (ta > t0) t0 = ta;
            if (tb < t1) t1 = tb;
            if (t0 > t1) { hit = false; break; }
          }
        }
        return hit && t0 < best ? t0 : Infinity;
      } else {
        // verticale cilinder (torenpoot, vat, paal)
        const rx = o.x - pc.x, rz = o.z - pc.z;
        const cc = rx * rx + rz * rz - pc.r * pc.r;
        let t;
        if (cc <= 0) t = 0;
        else {
          if (dl2 < 1e-12) return Infinity;
          const b = rx * d.x + rz * d.z;
          const disc = b * b - dl2 * cc;
          if (disc < 0) return Infinity;
          t = (-b - Math.sqrt(disc)) / dl2;
          if (t < 0) return Infinity;
        }
        const y = o.y + d.y * t;
        return y > pc.y0 && y < pc.y1 && t < best ? t : Infinity;
      }
    }
  }

  // Duwt een cirkel uit een gedraaide doos of een cirkelvormig stuk.
  function pushOutOfPiece(pc, x, z, r) {
    if (pc.type === 1) {
      let dx = x - pc.x, dz = z - pc.z;
      let d = Math.hypot(dx, dz);
      const min = pc.r + r;
      if (d >= min) return null;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
      return { x: pc.x + (dx / d) * min, z: pc.z + (dz / d) * min };
    }
    return pushOutOfRect(pc.x, pc.z, pc.c, pc.s, pc.hx, pc.hz, x, z, r);
  }
  function pushOutOfRect(cx, cz, c, s, hx, hz, x, z, r) {
    const dx = x - cx, dz = z - cz;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const px = clamp(lx, -hx, hx), pz = clamp(lz, -hz, hz);
    const ex = lx - px, ez = lz - pz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= r * r) return null;
    let nlx, nlz;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      nlx = px + (ex / d) * r; nlz = pz + (ez / d) * r;
    } else {
      // middelpunt zit in de doos: langs de kortste weg eruit
      const penX = hx - Math.abs(lx), penZ = hz - Math.abs(lz);
      if (penX < penZ) { nlx = (lx < 0 ? -1 : 1) * (hx + r); nlz = lz; }
      else { nlx = lx; nlz = (lz < 0 ? -1 : 1) * (hz + r); }
    }
    return localToWorld(cx, cz, c, s, nlx, nlz);
  }

  function blockedByTree(obs, x, y, z) {
    const cx = cellOf(x), cz = cellOf(z);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const arr = obs.grid.get(key(i, j));
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const t = arr[n];
          const dx = t.x - x, dz = t.z - z;
          if (dx * dx + dz * dz < t.r * t.r && y < t.baseY + t.h && y > t.baseY - 2) return true;
        }
      }
    }
    return false;
  }

  // Duwt een positie uit bomen en binnen de kaart.
  function resolveCollision(levelId, x, z, r) {
    const obs = getObstacles(levelId);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const cx = cellOf(x), cz = cellOf(z);
      for (let i = cx - 1; i <= cx + 1; i++) {
        for (let j = cz - 1; j <= cz + 1; j++) {
          const arr = obs.grid.get(key(i, j));
          if (!arr) continue;
          for (let n = 0; n < arr.length; n++) {
            const t = arr[n];
            let dx = x - t.x, dz = z - t.z;
            let d = Math.hypot(dx, dz);
            const min = t.r + r;
            if (d < min) {
              if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
              x = t.x + (dx / d) * min;
              z = t.z + (dz / d) * min;
              moved = true;
            }
          }
        }
      }
      // militaire props (zandzakken, kisten, torenpoten)
      const parr = obs.propGrid.get(key(cellOf(x), cellOf(z)));
      if (parr) {
        for (let n = 0; n < parr.length; n++) {
          if (parr[n].overhead) continue;
          const p = pushOutOfPiece(parr[n], x, z, r);
          if (p) { x = p.x; z = p.z; moved = true; }
        }
      }
      // DEUR-HOOK: dynamische deuren (dicht blad in de opening / open blad langs de zijkant), zie doorPush()
      { const dp = obs.doors ? doorPush(levelId, obs, x, z, r) : null; if (dp) { x = dp.x; z = dp.z; moved = true; } }
      if (!moved) break;
    }
    return { x: clamp(x, -MAP_HALF, MAP_HALF), z: clamp(z, -MAP_HALF, MAP_HALF) };
  }

  // Afstand tot het eerste obstakel (grond, boom of prop) langs een straal.
  // Props worden exact getest (zandzakken zijn dunner dan de stapgrootte).
  function rayBlockDistance(levelId, o, d, maxDist) {
    const obs = getObstacles(levelId);
    const propDist = doorClip(levelId, o, d, rayPropDistance(obs, o, d, maxDist));   // DEUR-HOOK: deurbladen houden stralen tegen
    for (let s = 0.8; s <= propDist; s += 0.8) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      if (Math.abs(x) > MAP_HALF + 5 || Math.abs(z) > MAP_HALF + 5) return s;
      if (y < heightAt(levelId, x, z)) return s;
      if (blockedByTree(obs, x, y, z)) return s;
    }
    return propDist;
  }

  function raySphere(o, d, cx, cy, cz, r) {
    const ox = cx - o.x, oy = cy - o.y, oz = cz - o.z;
    const t = ox * d.x + oy * d.y + oz * d.z;
    if (t < 0) return null;
    const d2 = ox * ox + oy * oy + oz * oz - t * t;
    if (d2 > r * r) return null;
    return Math.max(0, t - Math.sqrt(r * r - d2));
  }

  // Speler = bollen per houding (staan: borst en hoofd). py = hoogte van de voeten,
  // stance = 0/1/2 of 'stand'/'crouch'/'prone' (weggelaten = staan), yaw = kijkrichting (voor liggen/hurken).
  function rayHitPlayer(o, d, px, py, pz, maxT, stance, yaw) {
    let best = null;
    const spheres = HIT_SPHERES[stanceIndex(stance)];
    const fx = Math.sin(yaw || 0), fz = Math.cos(yaw || 0);
    for (let i = 0; i < spheres.length; i++) {
      const s = spheres[i];
      const t = raySphere(o, d, px + fx * s[0], py + s[1], pz + fz * s[0], s[2]);
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best !== null && best <= maxT ? best : null;
  }

  // Richtpunt onder het kruisje: het eerste wat de camera-straal (door het midden van het beeld) raakt
  // (muur, prop, grond, boom of speler). De speler schiet vanaf zijn eigen schietpunt naar dit punt,
  // zodat de kogel altijd precies op het kruisje landt, ook dichtbij (schoudercamera).
  // cam/dir = camerapositie en -richting; origin = schietpunt van de speler; targets = [{x,y,z,stance,yaw}] (niet jezelf).
  function aimPoint(levelId, cam, dir, origin, targets, maxDist) {
    const far = maxDist || 250;
    // begin de straal ter hoogte van de speler: dingen tussen camera en speler (eigen rug, muur achter je) tellen niet
    let t0 = (origin.x - cam.x) * dir.x + (origin.y - cam.y) * dir.y + (origin.z - cam.z) * dir.z;
    if (!(t0 > 0)) t0 = 0;
    const o = { x: cam.x + dir.x * t0, y: cam.y + dir.y * t0, z: cam.z + dir.z * t0 };
    let hit = rayBlockDistance(levelId, o, dir, far);
    if (targets) {
      for (const v of targets) {
        const t = rayHitPlayer(o, dir, v.x, v.y, v.z, hit, v.stance, v.yaw);
        if (t !== null && t < hit) hit = t;
      }
    }
    return { x: o.x + dir.x * hit, y: o.y + dir.y * hit, z: o.z + dir.z * hit, dist: t0 + hit };
  }

  function spawnPoint(levelId, index, total) {
    const angle = (index / Math.max(1, total)) * Math.PI * 2 + 0.4;
    const radius = 42;
    let r = resolveCollision(levelId, Math.sin(angle) * radius, Math.cos(angle) * radius, 0.6);
    if (levelId !== 'forest' && !isClear(levelId, r.x, r.z, 0.9)) {
      // (zou niet moeten gebeuren: de generator houdt de spawnplekken vrij) spiraal naar een vrije plek
      for (let k = 1; k < 400; k++) {
        const a = k * 2.399, d = 0.6 * Math.sqrt(k);
        const x = clamp(Math.sin(angle) * radius + Math.sin(a) * d, -MAP_HALF + 2, MAP_HALF - 2);
        const z = clamp(Math.cos(angle) * radius + Math.cos(a) * d, -MAP_HALF + 2, MAP_HALF - 2);
        if (isClear(levelId, x, z, 0.9)) { r = { x, z }; break; }
      }
    }
    return { x: r.x, z: r.z, yaw: Math.atan2(-r.x, -r.z) };
  }

  // Staat een cirkel met straal rad hier vrij van obstakels?
  function isClear(levelId, x, z, rad) {
    const r = resolveCollision(levelId, x, z, rad);
    return Math.abs(r.x - x) < 1e-6 && Math.abs(r.z - z) < 1e-6;
  }

  // ================================================================ gegenereerde levels
  // Elk level (behalve het bos) heeft een generate(g)-functie die met een vaste seed
  // obstakels plaatst. Server en client krijgen dus exact dezelfde wereld.

  const SPAWN_RADIUS = 42;
  let padCache = null;
  // Alle mogelijke spawnplekken (1 t/m 8 spelers); hier komt nooit een obstakel.
  function spawnPads() {
    if (padCache) return padCache;
    padCache = [];
    for (let total = 1; total <= MAX_PLAYERS; total++) {
      for (let i = 0; i < total; i++) {
        const a = (i / total) * Math.PI * 2 + 0.4;
        const p = { x: Math.sin(a) * SPAWN_RADIUS, z: Math.cos(a) * SPAWN_RADIUS, a };
        if (!padCache.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.5)) padCache.push(p);
      }
    }
    return padCache;
  }

  function rectOf(x, z, yaw, hx, hz) {
    return { x, z, c: Math.cos(yaw), s: Math.sin(yaw), hx, hz, br: Math.hypot(hx, hz) };
  }
  function rectCorners(b) {
    return [
      localToWorld(b.x, b.z, b.c, b.s, -b.hx, -b.hz), localToWorld(b.x, b.z, b.c, b.s, b.hx, -b.hz),
      localToWorld(b.x, b.z, b.c, b.s, b.hx, b.hz), localToWorld(b.x, b.z, b.c, b.s, -b.hx, b.hz),
    ];
  }
  // Scheidende-assen-test voor twee gedraaide rechthoeken.
  function rectsOverlap(a, b) {
    const axes = [a.c, -a.s, a.s, a.c, b.c, -b.s, b.s, b.c];
    const dx = b.x - a.x, dz = b.z - a.z;
    for (let i = 0; i < 8; i += 2) {
      const ux = axes[i], uz = axes[i + 1];
      const ra = a.hx * Math.abs(a.c * ux - a.s * uz) + a.hz * Math.abs(a.s * ux + a.c * uz);
      const rb = b.hx * Math.abs(b.c * ux - b.s * uz) + b.hz * Math.abs(b.s * ux + b.c * uz);
      if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
    }
    return true;
  }
  // Exacte afstand tussen twee rechthoeken (bij losse convexe vormen ligt die altijd bij een hoekpunt).
  function rectDist(a, b) {
    if (rectsOverlap(a, b)) return 0;
    let m = Infinity;
    for (const p of rectCorners(a)) m = Math.min(m, boxPointDist(b, p.x, p.z));
    for (const p of rectCorners(b)) m = Math.min(m, boxPointDist(a, p.x, p.z));
    return m;
  }

  // Grondvlak(ken) van een gegenereerde prop, voor het plaatsen.
  function genFootprints(p) {
    const D = PROP_DIMS[p.kind];
    if (p.fpRect) return [p.fpRect];   // gebouw: één grondvlak voor het hele gebouw (op het eerste stuk)
    if (p.noFp) return [];
    if (p.kind === 'wall') return [rectOf(p.x, p.z, p.yaw, p.hx, p.hz)];
    if (p.kind === 'tower') { const e = D.leg + D.legR; return [rectOf(p.x, p.z, p.yaw, e, e)]; }
    if (p.kind === 'crane') {
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), out = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const w = localToWorld(p.x, p.z, c, s, sx * D.lx, sz * D.lz);
        out.push(rectOf(w.x, w.z, p.yaw, D.hx, D.hz));
      }
      return out;
    }
    if (D.r) return [rectOf(p.x, p.z, 0, D.r, D.r)];
    return [rectOf(p.x, p.z, p.yaw, D.hx, D.hz)];
  }

  function makeGen(levelId) {
    const L = LEVEL_DEFS[levelId];
    L.padGrid = new Map();   // vlakke stukken grond onder gebouwen (heightAt), worden tijdens het genereren gevuld
    const rnd = mulberry32(L.seed || 1);
    const props = [], fps = [], trees = [], grid = new Map();
    const pads = spawnPads();
    const lim = MAP_HALF - 3;
    const TAU = Math.PI * 2;
    let groupId = 0;

    function fpOk(fp, gap, padGap) {
      for (const p of rectCorners(fp)) if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) return false;
      for (const pd of pads) if (boxPointDist(fp, pd.x, pd.z) < padGap) return false;
      const R = fp.br + gap + 3;
      for (let i = cellOf(fp.x - R); i <= cellOf(fp.x + R); i++) {
        for (let j = cellOf(fp.z - R); j <= cellOf(fp.z + R); j++) {
          const arr = grid.get(key(i, j));
          if (!arr) continue;
          for (const t of arr) if (boxPointDist(fp, t.x, t.z) < t.r + gap) return false;
        }
      }
      const stamp = ++fpStamp;
      const Q = fp.br + gap;
      for (let i = cellOf(fp.x - Q); i <= cellOf(fp.x + Q); i++) {
        for (let j = cellOf(fp.z - Q); j <= cellOf(fp.z + Q); j++) {
          const arr = fpGrid.get(key(i, j));
          if (!arr) continue;
          for (const o of arr) {
            if (o.st === stamp) continue;
            o.st = stamp;
            if (Math.hypot(o.x - fp.x, o.z - fp.z) > fp.br + o.br + gap) continue;
            if (rectDist(fp, o) < gap) return false;
          }
        }
      }
      return true;
    }
    // grondvlakken in een grid (elk in alle cellen die het raakt), voor snelle afstandstests
    let fpStamp = 0;
    const fpGrid = new Map();
    function addFp(f) {
      fps.push(f);
      for (let i = cellOf(f.x - f.br); i <= cellOf(f.x + f.br); i++) {
        for (let j = cellOf(f.z - f.br); j <= cellOf(f.z + f.br); j++) {
          const k = key(i, j);
          if (!fpGrid.has(k)) fpGrid.set(k, []);
          fpGrid.get(k).push(f);
        }
      }
    }

    const g = {
      levelId, rnd, props, trees, grid, pads, lim, TAU,
      range(a, b) { return a + rnd() * (b - a); },
      pick(arr) { return arr[Math.floor(rnd() * arr.length)]; },
      chance(p) { return rnd() < p; },
      // willekeurig punt met afstand tot het midden tussen minR en maxR
      randPos(minR, maxR, edge) {
        const m = lim - (edge || 2);
        for (let k = 0; k < 1000; k++) {
          const x = (rnd() * 2 - 1) * m, z = (rnd() * 2 - 1) * m, r = Math.hypot(x, z);
          if (r >= minR && r <= maxR) return { x, z };
        }
        return { x: 0, z: 0 };
      },
      // Probeer een groep tegelijk te plaatsen (onderling mogen ze elkaar raken).
      // opts.gap = minimale vrije ruimte tot andere obstakels (doorloopbaar), opts.ok = extra test per grondvlak.
      place(group, opts) {
        opts = opts || {};
        const gap = opts.gap !== undefined ? opts.gap : 1.8;
        const padGap = opts.padGap !== undefined ? opts.padGap : 3.2;
        const all = [];
        for (const p of group) for (const f of genFootprints(p)) all.push(f);
        if (!opts.force) {
          const maxStep = opts.maxStep !== undefined ? opts.maxStep : 0.8;
          for (const f of all) {
            if (!fpOk(f, gap, padGap)) return false;
            if (opts.ok && !opts.ok(f)) return false;
            // niet op een steile helling (muren/containers zouden dan scheef in de grond staan)
            let lo = Infinity, hi = -Infinity;
            for (const q of rectCorners(f)) {
              const y = heightAt(levelId, q.x, q.z);
              lo = Math.min(lo, y); hi = Math.max(hi, y);
            }
            if (hi - lo > maxStep) return false;
          }
        }
        groupId++;
        // gebouwen (g.building): één vloerhoogte voor alle stukken, eventueel op een vlak geschoven pad
        for (const p of group) {
          if (!p.uni) continue;
          const f = genFootprints(p)[0];
          if (p.pad) {
            p.ubase = heightAt(levelId, p.x, p.z);
            addPad(levelId, { x: f.x, z: f.z, c: f.c, s: f.s, hx: f.hx + p.pad.margin, hz: f.hz + p.pad.margin }, p.ubase, p.pad.blend);
          } else {
            p.ubase = Infinity;
            for (const q of rectCorners(f)) p.ubase = Math.min(p.ubase, heightAt(levelId, q.x, q.z));
          }
        }
        for (const p of group) {
          p.yaw = ((p.yaw % TAU) + TAU) % TAU;
          p.gid = groupId;   // stukken van hetzelfde huis/gebouw (client: zelfde kleur)
          if (!p.stack) p.stack = 1;
          let base = heightAt(levelId, p.x, p.z);
          for (const f of genFootprints(p)) {
            for (const q of rectCorners(f)) base = Math.min(base, heightAt(levelId, q.x, q.z));
          }
          p.baseY = p.bref ? p.bref.ubase : base;
          props.push(p);
        }
        for (const f of all) addFp(f);
        return true;
      },
      // Boom / rotsblok (cirkel). kind: 'pine' | 'snowpine' | 'palm' | 'boulder'
      tree(t, gap) {
        gap = gap === undefined ? 1.4 : gap;
        if (Math.abs(t.x) > lim - t.r || Math.abs(t.z) > lim - t.r) return false;
        for (const pd of pads) if (Math.hypot(pd.x - t.x, pd.z - t.z) < t.r + 2.6) return false;
        const cx = cellOf(t.x), cz = cellOf(t.z);
        for (let i = cx - 1; i <= cx + 1; i++) {
          for (let j = cz - 1; j <= cz + 1; j++) {
            const arr = grid.get(key(i, j));
            if (!arr) continue;
            for (const o of arr) if (Math.hypot(o.x - t.x, o.z - t.z) < o.r + t.r + gap) return false;
          }
        }
        for (let i = cellOf(t.x - t.r - gap); i <= cellOf(t.x + t.r + gap); i++) {
          for (let j = cellOf(t.z - t.r - gap); j <= cellOf(t.z + t.r + gap); j++) {
            const arr = fpGrid.get(key(i, j));
            if (!arr) continue;
            for (const o of arr) {
              if (Math.hypot(o.x - t.x, o.z - t.z) > o.br + t.r + gap) continue;
              if (boxPointDist(o, t.x, t.z) < t.r + gap) return false;
            }
          }
        }
        t.baseY = heightAt(levelId, t.x, t.z);
        if (!t.scale) t.scale = 1;
        trees.push(t);
        const k = key(cx, cz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(t);
        return true;
      },
      // Massieve doos / muurstuk met het midden op (x, z); lokale X = lengte.
      box(x, z, yaw, hx, hz, h, mat, yb) {
        return { kind: 'wall', x, z, yaw, hx, hz, h, yb: yb || 0, mat, stack: 1 };
      },
      // Muur van (x1,z1) naar (x2,z2) met openingen ({at, w, holes: [[y0,y1],...]}) en optionele schade (0..1).
      wallRun(x1, z1, x2, z2, t, h, mat, openings, damage) {
        const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
        const ux = dx / len, uz = dz / len, yaw = Math.atan2(-dz, dx);
        const out = [];
        const seg = (s0, s1, yb, hh) => {
          if (s1 - s0 < 0.05 || hh < 0.12) return;
          const m = (s0 + s1) / 2;
          out.push({ kind: 'wall', x: x1 + ux * m, z: z1 + uz * m, yaw, hx: (s1 - s0) / 2, hz: t / 2, h: hh, yb, mat, stack: 1 });
        };
        const ops = (openings || []).slice().sort((a, b) => a.at - b.at);
        const spans = [];
        let s = 0;
        for (const o of ops) {
          const a = o.at - o.w / 2, b = o.at + o.w / 2;
          spans.push([s, a]);
          let y = 0;
          for (const hole of o.holes) {
            if (hole[0] > y) seg(a, b, y, hole[0] - y);
            y = Math.max(y, hole[1]);
          }
          if (y < h - 0.25 && !(damage > 0.5)) seg(a, b, y, h - y); // latei
          s = b;
        }
        spans.push([s, len]);
        for (const [a, b] of spans) {
          if (b - a < 0.05) continue;
          if (!damage) { seg(a, b, 0, h); continue; }
          // kapot: in brokken met verschillende hoogtes, met een 'inslag' ergens in het stuk
          const chunks = [];
          let p = a;
          while (p < b - 1e-6) {
            let l = 0.9 + rnd() * 1.6;
            if (b - (p + l) < 0.9) l = b - p;
            chunks.push([p, p + l]);
            p += l;
          }
          const cpos = a + rnd() * (b - a), cw = 1.5 + rnd() * 3.5;
          let cur = null;
          for (const [c0, c1] of chunks) {
            const f = Math.max(0, 1 - Math.abs((c0 + c1) / 2 - cpos) / cw);
            let hh = h * (1 - damage * (0.22 * rnd() + f * (0.85 + 0.3 * rnd())));
            hh = Math.min(h, Math.round(hh * 5) / 5);
            if (hh < 0.5) hh = c1 - c0 >= 1.8 ? 0 : 0.6;   // gat alleen als je erdoor past
            if (cur && Math.abs(cur[2] - hh) < 1e-6) cur[1] = c1;
            else { if (cur) seg(cur[0], cur[1], 0, cur[2]); cur = [c0, c1, hh]; }
          }
          if (cur) seg(cur[0], cur[1], 0, cur[2]);
        }
        return out;
      },
      // Huis (zonder dak) w x d, deuren aan de opgegeven kanten (0 = voor/-z, 1 = rechts, 2 = achter, 3 = links).
      house(cx, cz, yaw, w, d, h, t, mat, opt) {
        opt = opt || {};
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const P = (lx, lz) => localToWorld(cx, cz, c, s, lx, lz);
        const sides = [
          [-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2],
          [w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t],
          [w / 2, d / 2 - t / 2, -w / 2, d / 2 - t / 2],
          [-w / 2 + t / 2, d / 2 - t, -w / 2 + t / 2, -d / 2 + t],
        ];
        const out = [];
        const doors = opt.doors || [0];
        // echte deuren (opt.realDoors): gebouw-gegevens voor bots en meubels, zonder extra rnd()-aanroepen
        const info = opt.realDoors ? { x: cx, z: cz, yaw, hx: w / 2 - t, hz: d / 2 - t, doors: [], lamps: [], roof: false, kind: 'house' } : null;
        const holes = [];
        let nDoors = 0;
        sides.forEach((sd, i) => {
          const A = P(sd[0], sd[1]), B = P(sd[2], sd[3]);
          const len = Math.hypot(B.x - A.x, B.z - A.z);
          const ops = [];
          let door = null, dw = 0;
          if (doors.indexOf(i) >= 0 && len > 3.4) {
            dw = 1.9 + rnd() * 0.3;
            door = 1.0 + dw / 2 + rnd() * (len - 2.0 - dw);
            ops.push({ at: door, w: dw, holes: [[0, 2.3]] });
            const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
            holes.push({ x: A.x + ux * door, z: A.z + uz * door });
          }
          const dmg = (opt.ruin || 0) * (rnd() < 0.6 ? 0.4 + rnd() * 0.9 : 0.1);
          const damaged = dmg > 0.35;
          if (!damaged && opt.windows !== false) {
            const n = Math.floor((len - 1.0) / 2.8);
            const ww = 1.2;
            for (let k = 0; k < n; k++) {
              const at = (len * (k + 1)) / (n + 1);
              if (at < 0.9 + ww / 2 || at > len - 0.9 - ww / 2) continue;
              if (door !== null && Math.abs(at - door) < (dw + ww) / 2 + 0.6) continue;
              ops.push({ at, w: ww, holes: h > 5 ? [[1.0, 2.1], [3.6, 4.7]] : [[1.0, 2.1]] });
            }
          }
          const run = g.wallRun(A.x, A.z, B.x, B.z, t, h, mat, ops, damaged ? Math.min(1, dmg) : 0);
          out.push(...run);
          // deur in een hele muur (met latei): de lateiplaat draagt de deur-gegevens
          if (info && door !== null && !damaged) {
            const spec = g.doorSpec(A, B, { at: door, w: dw, holes: [[0, 2.3]] }, cx, cz, 'wood');
            const lintel = run.find((q) => Math.abs(q.yb - 2.3) < 1e-6 && Math.hypot(q.x - spec.x, q.z - spec.z) < 0.3);
            if (lintel) { spec.bld = info; lintel.doorSpecs = [spec]; nDoors++; }
          }
        });
        if (info && nDoors) out.push(...g.furnish(info, holes, opt.ruin || 0));
        return out;
      },
      // Gegevens van een deur in de opening o van een muur van A naar B; (cx, cz) = midden van het gebouw.
      doorSpec(A, B, o, cx, cz, kind) {
        const len = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
        const x = A.x + ux * o.at, z = A.z + uz * o.at;
        let nx = -uz, nz = ux;
        if ((cx - x) * nx + (cz - z) * nz < 0) { nx = -nx; nz = -nz; }
        const dk = (o.door && o.door.kind) || kind || 'wood';
        return {
          kind: dk, x, z, ux, uz, nx, nz, w: o.w, top: o.holes[0][1],
          leaves: dk === 'roll' ? 1 : (o.door && o.door.leaves) || (o.w > 1.75 ? 2 : 1),
        };
      },
      // Een paar meubels/puin in de hoeken van een huis (eigen rng op basis van de plek: de rest van het level blijft gelijk).
      furnish(info, holes, ruin) {
        const r = mulberry32(((Math.round(info.x * 100) * 73856093) ^ (Math.round(info.z * 100) * 19349663)) | 0);
        const c = Math.cos(info.yaw), s = Math.sin(info.yaw), out = [];
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        const start = Math.floor(r() * 4);
        let n = 1 + (r() < 0.6 ? 1 : 0);
        for (let k = 0; k < 4 && n > 0; k++) {
          const [sx, sz] = corners[(start + k) % 4];
          const u = r();
          const kind = ruin > 0.55 && u < 0.35 ? 'rubble' : u < 0.6 ? 'crate' : u < 0.8 ? 'table' : 'shelf';
          const D = PROP_DIMS[kind];
          if (info.hx < D.hx + 1.3 || info.hz < D.hz + 1.3) continue;
          const lx = sx * (info.hx - D.hx - 0.06), lz = sz * (info.hz - D.hz - 0.06);
          const wpt = localToWorld(info.x, info.z, c, s, lx, lz);
          if (holes.some((hp) => Math.hypot(hp.x - wpt.x, hp.z - wpt.z) < 2.3 + D.hx)) continue;
          out.push({ kind, x: wpt.x, z: wpt.z, yaw: info.yaw + (kind === 'rubble' ? r() * 0.4 : kind === 'shelf' && sz > 0 ? Math.PI : 0), stack: kind === 'crate' && r() < 0.4 ? 2 : 1, noFp: true });
          n--;
        }
        return out;
      },
      // Hol gebouw met muren (dikte t), openingen per zijde, plat dak, verdiepingsvloeren, ladders, meubels en lampen.
      // B: { x, z, yaw, hx, hz, h, t, mat, sides: [ops0..ops3] (null = geen muur aan die kant), roof: {t, mat, walk},
      //      floors: [{lx, lz, hx, hz, y, t}], ladders: [{lx, lz, rot, y0, y1, w}], items: [{kind|box, lx, lz, yaw}],
      //      lamps: [[lx, y, lz, buiten?]], pad: {margin, blend}, hidden (muren niet tekenen), anchor (eigen model) }
      // ops: { at (vanaf het begin van de zijde), w, holes: [[y0, y1]], door: {kind, leaves} }
      // Zijden zoals bij house(): 0 = -z (lokaal), 1 = +x, 2 = +z, 3 = -x.
      building(B) {
        const c = Math.cos(B.yaw), s = Math.sin(B.yaw);
        const P = (lx, lz) => localToWorld(B.x, B.z, c, s, lx, lz);
        const w = 2 * B.hx, d = 2 * B.hz, t = B.t, h = B.h;
        const sides = [
          [-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2],
          [w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t],
          [w / 2, d / 2 - t / 2, -w / 2, d / 2 - t / 2],
          [-w / 2 + t / 2, d / 2 - t, -w / 2 + t / 2, -d / 2 + t],
        ];
        const info = { x: B.x, z: B.z, yaw: B.yaw, hx: B.hx - t, hz: B.hz - t, doors: [], lamps: [], roof: !!B.roof, kind: B.kind || 'house' };
        const parts = [], doorSpecs = [];
        sides.forEach((sd, i) => {
          const ops = B.sides ? B.sides[i] : [];
          if (ops === null) return;
          const A = P(sd[0], sd[1]), E = P(sd[2], sd[3]);
          const list = ops || [];
          parts.push(...g.wallRun(A.x, A.z, E.x, E.z, t, h, B.mat, list.map((o) => ({ at: o.at, w: o.w, holes: o.holes })), 0));
          for (const o of list) if (o.door) doorSpecs.push(g.doorSpec(A, E, o, B.x, B.z, B.doorKind));
        });
        if (B.roof) {
          const rt = B.roof.t || 0.3, ov = B.roof.over || 0;
          const r = g.box(B.x, B.z, B.yaw, B.hx + ov, B.hz + ov, rt, B.roof.mat || B.mat, h - rt);
          r.walk = B.roof.walk !== false; r.slab = true;
          parts.push(r);
        }
        for (const f of B.floors || []) {
          const q = P(f.lx, f.lz), ft = f.t || 0.25;
          const fl = g.box(q.x, q.z, B.yaw, f.hx, f.hz, ft, f.mat || B.mat, f.y - ft);
          fl.walk = true; fl.slab = true;
          parts.push(fl);
        }
        for (const p of B.extra || []) parts.push(p);
        if (B.hidden) for (const p of parts) p.hidden = true;
        for (const it of B.items || []) {
          const q = P(it.lx, it.lz);
          parts.push({ kind: it.kind, x: q.x, z: q.z, yaw: B.yaw + (it.yaw || 0), stack: it.stack || 1 });
        }
        for (const L of B.lamps || []) {
          const q = P(L[0], L[2]);
          info.lamps.push({ x: q.x, y: L[1], z: q.z, out: !!L[3] });
        }
        const anchor = B.anchor || parts[0];
        if (B.anchor) parts.unshift(B.anchor);
        else anchor.fpRect = rectOf(B.x, B.z, B.yaw, B.hx, B.hz);
        anchor.uni = true;
        anchor.bld = info;
        anchor.doorSpecs = doorSpecs;
        anchor.ladderSpecs = (B.ladders || []).map((l) => {
          const q = P(l.lx, l.lz);
          return { x: q.x, z: q.z, rot: B.yaw + l.rot, y0: l.y0, y1: l.y1, width: l.w || 0.6 };
        });
        if (B.pad) anchor.pad = B.pad;
        for (const p of parts) {
          p.bref = anchor;
          if (p !== anchor) p.noFp = true;
        }
        return parts;
      },
      // Klein gebouw (hutje / kantoor): deur aan de kant die naar het midden van de kaart wijst.
      // style: 'adobe' (woestijn) of 'office' (haven). Geen rnd(): de rest van het level blijft gelijk.
      hut(x, z, yaw, hx, hz, h, style) {
        let best = -Infinity, k = 0;
        for (let i = 0; i < 4; i++) {
          const a = yaw + (i * Math.PI) / 2;
          const dot = Math.sin(a) * x + Math.cos(a) * z;   // buitennormaal van zijde 0 = (-sin a, -cos a)
          if (dot > best) { best = dot; k = i; }
        }
        const Y = yaw + (k * Math.PI) / 2, HX = k % 2 ? hz : hx, HZ = k % 2 ? hx : hz;
        const office = style === 'office';
        const t = office ? 0.3 : 0.45, ihx = HX - t, ihz = HZ - t;
        const win = office ? [1.0, 2.1] : [1.0, 1.85], ww = office ? 1.4 : 1.0;
        const sideLen = 2 * HZ - 2 * t;
        const front = [{ at: HX, w: 1.4, holes: [[0, 2.15]], door: { kind: office ? 'metal' : 'wood' } }];
        if (office && HX > 3.5) { front.push({ at: HX - 2.6, w: ww, holes: [win] }, { at: HX + 2.6, w: ww, holes: [win] }); }
        const sideWin = sideLen > 2.6 ? [{ at: sideLen / 2, w: ww, holes: [win] }] : [];
        const back = office && HX > 3.5 ? [{ at: HX - 2.4, w: ww, holes: [win] }, { at: HX + 2.4, w: ww, holes: [win] }] : [];
        const items = [];
        items.push({ kind: 'crate', lx: ihx - 0.6, lz: ihz - 0.6 });
        items.push({ kind: 'table', lx: -ihx + 0.65, lz: ihz - 0.45 });
        if (office) items.push({ kind: 'shelf', lx: ihx - 0.25, lz: -ihz + 1.3, yaw: -Math.PI / 2 });   // (voorkant van de kast = lokale +z)
        if (office && ihx > 3.5) items.push({ kind: 'table', lx: 0.2, lz: -0.2 });
        return g.building({
          x, z, yaw: Y, hx: HX, hz: HZ, h, t, mat: office ? 'concrete' : 'adobe', kind: office ? 'office' : 'hut',
          sides: [front, sideWin, back, sideWin],
          roof: { t: 0.3 }, items, pad: office ? null : { margin: 0.4, blend: 2.0 },
          lamps: [[0, h - 0.75, 0]],
        });
      },
      // Containers in rijen (r) x kolommen (k), lokale X = lengte.
      containerBlock(x, z, yaw, rows, cols, stackFn) {
        const c = Math.cos(yaw), s = Math.sin(yaw), out = [];
        for (let r = 0; r < rows; r++) {
          for (let k = 0; k < cols; k++) {
            const w = localToWorld(x, z, c, s, (k - (cols - 1) / 2) * 6.1, (r - (rows - 1) / 2) * 2.46);
            out.push({ kind: 'container', x: w.x, z: w.z, yaw, stack: stackFn ? stackFn() : 1 });
          }
        }
        return out;
      },
      // Kleine groepjes containers in een paar vormen.
      containerGroup(x, z, yaw) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const at = (lx, lz, dy, stack) => {
          const w = localToWorld(x, z, c, s, lx, lz);
          return { kind: 'container', x: w.x, z: w.z, yaw: yaw + dy, stack };
        };
        const u = rnd();
        if (u < 0.25) return [at(0, 0, 0, 1)];
        if (u < 0.4) return [at(0, 0, 0, 2)];
        if (u < 0.6) return [at(-3.05, 0, 0, 1), at(3.05, 0, 0, rnd() < 0.5 ? 2 : 1)];
        if (u < 0.8) return [at(0, -1.23, 0, 1), at(0, 1.23, 0, rnd() < 0.4 ? 2 : 1)];
        return [at(0, 0, 0, 1), at(4.27, 1.83, Math.PI / 2, rnd() < 0.3 ? 2 : 1)];
      },
      // Zandzakstelling: los, twee op een rij, L- of U-vorm (zoals in het bos).
      sandbagNest(x, z, yaw) {
        const lay = g.pick([
          [[0, 0, 0]], [[-1.53, 0, 0], [1.53, 0, 0]],
          [[0, 0, 0], [1.9, 1.12, Math.PI / 2]],
          [[0, 0, 0], [1.9, 1.12, Math.PI / 2], [-1.9, 1.12, Math.PI / 2]],
        ]);
        const c = Math.cos(yaw), s = Math.sin(yaw);
        return lay.map(([lx, lz, dy]) => {
          const w = localToWorld(x, z, c, s, lx, lz);
          return { kind: 'sandbags', x: w.x, z: w.z, yaw: yaw + dy, stack: 1 };
        });
      },
      // Een rijtje van n stuks van hetzelfde soort (bijv. betonblokken), lokale X = lengterichting.
      row(kind, x, z, yaw, n, step) {
        const c = Math.cos(yaw), s = Math.sin(yaw), out = [];
        for (let i = 0; i < n; i++) {
          const w = localToWorld(x, z, c, s, (i - (n - 1) / 2) * step, 0);
          out.push({ kind, x: w.x, z: w.z, yaw, stack: 1 });
        }
        return out;
      },
      // Herhaal tot n groepen geplaatst zijn (of de pogingen op zijn).
      scatter(n, tries, make, opts) {
        let placed = 0;
        for (let t = 0; t < tries && placed < n; t++) {
          const grp = make(t);
          if (grp && g.place(grp, opts)) placed++;
        }
        return placed;
      },
      // Wat dekking op 5-9 m van elke spawnplek (8 spelers), richting het midden.
      coverNearPads(make, opts) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.4;
          for (let t = 0; t < 40; t++) {
            const da = (rnd() - 0.5) * 0.35, r = SPAWN_RADIUS - 5 - rnd() * 4;
            const x = Math.sin(a + da) * r, z = Math.cos(a + da) * r;
            if (g.place(make(x, z, a + da), opts)) break;
          }
        }
      },
    };
    return g;
  }

  function buildGenerated(levelId) {
    const g = makeGen(levelId);
    LEVEL_DEFS[levelId].generate(g);
    const built = buildPropPieces(levelId, g.props);
    const vert = buildVerticalData(g.props, built.pieces);
    const dd = buildDoorData(levelId, g.props, vert.ladders, built.grid);
    return {
      trees: g.trees, grid: g.grid, props: g.props, propPieces: built.pieces, propGrid: built.grid,
      boxes: vert.boxes, ladders: vert.ladders, boxGrid: vert.grid,
      doors: dd.doors, doorGrid: dd.grid, buildings: dd.buildings,
    };
  }

  // ================================================================ gebouwen en deuren
  // obs.buildings: { id, kind, x, z, yaw, c, s, hx, hz (binnenruimte), base, roof, doors: [ids], lamps: [{x, y, z, out}] }
  // obs.doors:     { id, kind ('wood'|'metal'|'roll'), x, z (midden van de opening, hartlijn muur), ux, uz (langs de muur),
  //                  nx, nz (naar binnen), w (breedte opening), leaves (1|2), t, y0, y1, hp (max), b (gebouw), ok: [in, uit] }
  // De toestand per kamer staat NIET hier (zie setDoorState): 0 = dicht, 1 = open naar binnen, 2 = open naar buiten, 3 = kapot.
  const DOOR_HP = { wood: 60, metal: 90, roll: 150 };
  const DOOR_T = 0.14;          // dikte van het deurblad voor botsing en kogels
  const DOOR_USE_DIST = 1.6;    // client: zo dichtbij moet je staan om de deur te gebruiken
  const DOOR_SERVER_DIST = 2.4; // server: iets ruimer (lag)
  function buildDoorData(levelId, props, ladders, pieceGrid) {
    const doors = [], buildings = [], bmap = new Map();
    const bid = (info, base) => {
      if (bmap.has(info)) return bmap.get(info);
      const id = buildings.length;
      info.id = id;
      info.c = Math.cos(info.yaw); info.s = Math.sin(info.yaw);
      info.base = base !== undefined ? base : heightAt(levelId, info.x, info.z);
      for (const L of info.lamps) L.y += info.base;
      buildings.push(info);
      bmap.set(info, id);
      return id;
    };
    for (const p of props) {
      if (p.bld) bid(p.bld, p.baseY);
      for (const L of p.ladderSpecs || []) {
        ladders.push({ x: L.x, z: L.z, rot: L.rot, bottomY: p.baseY + L.y0, topY: p.baseY + L.y1, width: L.width, kind: 'ladder' });
      }
      for (const sp of p.doorSpecs || []) {
        const info = sp.bld || p.bld;
        const b = info ? bid(info, info === p.bld ? p.baseY : undefined) : -1;
        const y0 = heightAt(levelId, sp.x, sp.z);
        const y1 = p.baseY + sp.top - 0.03;
        if (y1 - y0 < 1.5) continue;
        const dr = {
          id: doors.length, kind: sp.kind, x: sp.x, z: sp.z, ux: sp.ux, uz: sp.uz, nx: sp.nx, nz: sp.nz,
          w: sp.w, leaves: sp.leaves, t: sp.kind === 'roll' ? 0.1 : 0.07, y0, y1, hp: DOOR_HP[sp.kind] || 60, b,
        };
        // kan het blad naar binnen / buiten openzwaaien zonder tegen een muur of meubel te slaan?
        dr.ok = [1, 2].map((st) => {
          if (dr.kind === 'roll') return true;
          for (const lf of leafPieces(dr, st)) {
            const probe = { x: lf.x, z: lf.z, c: lf.c, s: lf.s, hx: lf.hx - 0.06, hz: lf.hz - 0.02 };
            for (const pc of pieceGrid.get(key(cellOf(lf.x), cellOf(lf.z))) || []) {
              if (pc.overhead) continue;
              if (pc.type === 1 ? boxPointDist(probe, pc.x, pc.z) < pc.r : rectsOverlap(probe, pc)) return false;
            }
          }
          return true;
        });
        if (info) buildings[b].doors.push(dr.id);
        doors.push(dr);
      }
    }
    const grid = new Map();
    for (const dr of doors) {
      const R = dr.w + 1.2;
      for (let i = cellOf(dr.x - R); i <= cellOf(dr.x + R); i++) {
        for (let j = cellOf(dr.z - R); j <= cellOf(dr.z + R); j++) {
          const k = key(i, j);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(dr);
        }
      }
    }
    return { doors, grid, buildings };
  }

  // Botsdozen van de deurbladen in toestand st (f = hoe ver open, 0..1; standaard helemaal).
  function leafPieces(dr, st, f) {
    if (st === 3) return [];
    if (f === undefined) f = st === 0 ? 0 : 1;
    if (dr.kind === 'roll') {
      if (f >= 0.999) return [];
      const y0 = dr.y0 + (dr.y1 - dr.y0) * f;
      return [{ type: 0, x: dr.x, z: dr.z, c: dr.ux, s: -dr.uz, hx: dr.w / 2, hz: DOOR_T / 2, br: dr.w / 2 + 0.1, y0, y1: dr.y1 }];
    }
    const out = [];
    const ang = (st === 2 ? -1 : 1) * f * Math.PI / 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const off = DOOR_T / 2;            // scharnier net binnen de opening, zodat het open blad niet in de stijl zit
    const len = dr.leaves === 2 ? dr.w / 2 - off + 0.005 : dr.w - off - 0.02;   // dubbele deur: bladen sluiten op elkaar aan
    for (let i = 0; i < dr.leaves; i++) {
      const sg = i === 0 ? 1 : -1;     // blad 0: scharnier aan de -u kant, blad 1 aan de +u kant
      const hxw = dr.x - sg * dr.ux * (dr.w / 2 - off), hzw = dr.z - sg * dr.uz * (dr.w / 2 - off);
      const dx = sg * dr.ux * ca + dr.nx * sa, dz = sg * dr.uz * ca + dr.nz * sa;
      out.push({
        type: 0, x: hxw + dx * len / 2, z: hzw + dz * len / 2, c: dx, s: -dz,
        hx: len / 2, hz: DOOR_T / 2, br: len / 2 + 0.1, y0: dr.y0 - 0.05, y1: dr.y1,
        hinge: { x: hxw, z: hzw }, dir: { x: dx, z: dz }, len,
      });
    }
    return out;
  }
  function cachedLeaves(dr, st) {
    if (!dr.pk) dr.pk = [];
    return dr.pk[st] || (dr.pk[st] = leafPieces(dr, st));
  }

  // Toestand van de deuren in de huidige kamer: { level, s: [toestand per deur], hp: [hp per deur] } of null.
  // Zonder toestand (null, of een ander level) tellen deuren niet mee: de wereld is dan statisch (tests, decoratie).
  // Server: zet de toestand van een kamer vlak voordat er voor die kamer gebotst / geschoten wordt.
  let doorCtx = null;
  function setDoorState(st) { doorCtx = st || null; }
  function newDoorState(levelId) {
    const obs = getObstacles(levelId), ds = obs.doors || [];
    return { level: levelId, s: ds.map(() => 0), hp: ds.map((d) => d.hp) };
  }
  function activeDoors(levelId) {
    return doorCtx && doorCtx.level === levelId ? doorCtx : null;
  }

  // DEUR-HOOK (resolveCollision, collideY): duw een cirkel uit de deurbladen (dicht = in de opening, open = langs de zijkant).
  // Met y (voeten) en height (lichaamshoogte) zoals collideY: een blad blokkeert alleen als het het lichaam overlapt
  // (wie op een dak / verdieping boven de deur loopt, botst er niet tegen). Zonder y: altijd (2D, resolveCollision).
  function doorPush(levelId, obs, x, z, r, y, height) {
    const ctx = activeDoors(levelId);
    if (!ctx || !obs.doorGrid) return null;
    const arr = obs.doorGrid.get(key(cellOf(x), cellOf(z)));
    if (!arr) return null;
    const hasY = typeof y === 'number';
    const top = hasY ? y + MOVE.STEP : 0, waist = hasY ? y + Math.min(1.0, (height || MOVE.HEIGHT[0]) * 0.6) : 0;
    let moved = false;
    for (let n = 0; n < arr.length; n++) {
      const dr = arr[n], st = ctx.s[dr.id];
      if (st === 3 || st === undefined) continue;
      const pcs = cachedLeaves(dr, st);
      for (let k = 0; k < pcs.length; k++) {
        if (hasY && (pcs[k].y1 <= top || pcs[k].y0 >= waist)) continue;
        const p = pushOutOfPiece(pcs[k], x, z, r);
        if (p) { x = p.x; z = p.z; moved = true; }
      }
    }
    return moved ? { x, z } : null;
  }

  // Eerste deurblad langs een straal (binnen maxDist): { id, t } of null.
  function rayDoorHit(levelId, o, d, maxDist) {
    const ctx = activeDoors(levelId);
    if (!ctx) return null;
    const obs = getObstacles(levelId);
    const ds = obs.doors;
    if (!ds || !ds.length) return null;
    const dl2 = d.x * d.x + d.z * d.z;
    let best = maxDist, hit = null;
    for (let n = 0; n < ds.length; n++) {
      const dr = ds[n], st = ctx.s[dr.id];
      if (st === 3 || st === undefined) continue;
      // snelle afwijzing: midden van de deur ver van de straal
      const ox = dr.x - o.x, oz = dr.z - o.z, R = dr.w + 0.3;
      if (dl2 > 1e-12) {
        const tc = (ox * d.x + oz * d.z) / dl2, lim = R / Math.sqrt(dl2);
        if (tc + lim < 0 || tc - lim > best) continue;
        const px = ox - d.x * tc, pz = oz - d.z * tc;
        if (px * px + pz * pz > R * R) continue;
      } else if (ox * ox + oz * oz > R * R) continue;
      const pcs = cachedLeaves(dr, st);
      for (let k = 0; k < pcs.length; k++) {
        const t = rayPieceHit(pcs[k], o, d, dl2, best);
        if (t < best) { best = t; hit = { id: dr.id, t }; }
      }
    }
    return hit;
  }
  // DEUR-HOOK (rayBlockDistance): afstand tot het eerste obstakel, ingekort tot een deurblad ervoor.
  function doorClip(levelId, o, d, dist) {
    const h = rayDoorHit(levelId, o, d, dist);
    return h ? h.t : dist;
  }

  // Raakt de draaiende deur (van toestand a naar b) een speler? players: [{x, z}]
  function doorSweepBlocked(dr, a, b, players, rad) {
    rad = rad || 0.36;   // iets kleiner dan de spelersstraal: alleen echt in de weg staan telt
    if (dr.kind === 'roll') {
      if (b !== 0) return false;    // oprollen raakt niemand
      const pcs = leafPieces(dr, 0);
      return players.some((p) => pcs.some((pc) => pushOutOfPiece(pc, p.x, p.z, rad)));
    }
    const fa = a === 0 ? 0 : 1, fb = b === 0 ? 0 : 1;
    const side = a === 0 ? b : a;   // de kant waar het blad doorheen zwaait
    for (let k = 0; k <= 6; k++) {
      const f = fa + (fb - fa) * (k / 6);
      const pcs = leafPieces(dr, side, f);
      for (const p of players) for (const pc of pcs) if (pushOutOfPiece(pc, p.x, p.z, rad)) return true;
    }
    return false;
  }

  // Server-regels voor het openen/sluiten. user = {x, z}, players = alle levende spelers (incl. user).
  // Geeft de nieuwe toestand terug, of -1 (te ver weg, kapot, of iemand staat in de weg).
  // Met y (voeten, optioneel): wie boven de deur staat (dak, verdieping) kan hem niet bedienen en staat niet in de weg.
  function doorAtHeight(dr, p) {
    return typeof p.y !== 'number' || (p.y < dr.y1 - 0.3 && p.y + MOVE.HEIGHT[2] > dr.y0);
  }
  function doorUse(levelId, id, cur, user, players, maxDist) {
    const obs = getObstacles(levelId);
    const dr = obs.doors && obs.doors[id];
    if (!dr || cur === 3 || cur === undefined) return -1;
    if (Math.hypot(user.x - dr.x, user.z - dr.z) > (maxDist || DOOR_SERVER_DIST)) return -1;
    if (!doorAtHeight(dr, user)) return -1;
    players = players.filter((p) => doorAtHeight(dr, p));
    if (cur !== 0) {
      // sluiten: niemand anders in de zwaai; de gebruiker zelf mag er wel staan, maar niet in de deuropening
      const others = players.filter((p) => p !== user && (p.x !== user.x || p.z !== user.z));
      return doorSweepBlocked(dr, cur, 0, others) || doorSweepBlocked(dr, 0, 0, [user]) ? -1 : 0;
    }
    if (dr.kind === 'roll') return 1;
    // weg van de gebruiker: buiten -> naar binnen open, binnen -> naar buiten open
    const inside = (user.x - dr.x) * dr.nx + (user.z - dr.z) * dr.nz > 0;
    const order = inside ? [2, 1] : [1, 2];
    for (const st of order) {
      if (!dr.ok[st - 1]) continue;
      if (!doorSweepBlocked(dr, 0, st, players)) return st;
    }
    return -1;
  }

  // Dichtstbijzijnde bruikbare deur voor een speler op (x, z) die naar yaw kijkt (client), of -1.
  // y (voeten, optioneel): deuren onder je (je staat op een dak / verdieping) tellen niet.
  function nearestDoor(levelId, x, z, yaw, maxDist, y) {
    const obs = getObstacles(levelId);
    const arr = obs.doorGrid && obs.doorGrid.get(key(cellOf(x), cellOf(z)));
    if (!arr) return -1;
    const ctx = activeDoors(levelId);
    maxDist = maxDist || DOOR_USE_DIST;
    let best = -1, bs = Infinity;
    for (const dr of arr) {
      if (ctx && ctx.s[dr.id] === 3) continue;
      if (typeof y === 'number' && !doorAtHeight(dr, { y })) continue;
      const dx = dr.x - x, dz = dr.z - z, dist = Math.hypot(dx, dz);
      if (dist > maxDist) continue;
      let a = Math.atan2(dx, dz) - yaw;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      if (Math.abs(a) > 1.25 && dist > 0.9) continue;   // ongeveer ernaar kijken (of er pal voor staan)
      const score = dist + Math.abs(a) * 0.6;
      if (score < bs) { bs = score; best = dr.id; }
    }
    return best;
  }

  // In welk gebouw (binnenruimte) ligt (x, z)? Index in obs.buildings of -1.
  function insideBuilding(levelId, x, z, margin) {
    const obs = getObstacles(levelId), bs = obs.buildings;
    if (!bs) return -1;
    margin = margin || 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx) > b.hx + b.hz + 1 || Math.abs(dz) > b.hx + b.hz + 1) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hx + margin && Math.abs(lz) < b.hz + margin) return i;
    }
    return -1;
  }

  // Vrije plekken binnen in een gebouw (voor bots die dekking zoeken), lui berekend.
  function buildingSpots(levelId, bi) {
    const obs = getObstacles(levelId), b = obs.buildings && obs.buildings[bi];
    if (!b) return [];
    if (b.spots) return b.spots;
    const keep = doorCtx;
    doorCtx = null;
    b.spots = [];
    for (let lx = -b.hx + 0.7; lx <= b.hx - 0.7; lx += 0.8) {
      for (let lz = -b.hz + 0.7; lz <= b.hz - 0.7; lz += 0.8) {
        const q = localToWorld(b.x, b.z, b.c, b.s, lx, lz);
        // niet in de zwaai van een deur
        if (b.doors.some((id) => Math.hypot(obs.doors[id].x - q.x, obs.doors[id].z - q.z) < obs.doors[id].w + 0.6)) continue;
        if (isClear(levelId, q.x, q.z, 0.6)) b.spots.push(q);
      }
    }
    doorCtx = keep;
    return b.spots;
  }

  // Bots: tussenpunt op weg van (x, z) naar (gx, gz) als er een gebouw in- of uitgegaan moet worden.
  // Geeft { x, z, door } (door = id van de deur waar het pad doorheen gaat) of null (rechtstreeks lopen).
  function doorRoute(levelId, x, z, gx, gz) {
    const obs = getObstacles(levelId);
    if (!obs.buildings || !obs.buildings.length) return null;
    const gi = insideBuilding(levelId, gx, gz);
    const pt = (dr, k) => ({ x: dr.x + dr.nx * k, z: dr.z + dr.nz * k, door: dr.id });
    // midden in een deuropening: eerst helemaal erdoor
    const arr = obs.doorGrid && obs.doorGrid.get(key(cellOf(x), cellOf(z)));
    if (arr) {
      for (const dr of arr) {
        const ox = x - dr.x, oz = z - dr.z;
        const lat = ox * dr.ux + oz * dr.uz, depth = ox * dr.nx + oz * dr.nz;
        if (Math.abs(lat) > dr.w / 2 || Math.abs(depth) > 1.0) continue;
        const goalIn = gi >= 0 && gi === dr.b;
        if (goalIn && depth < 0.9) return pt(dr, 1.3);
        if (!goalIn && depth > -0.9) return pt(dr, -1.4);
      }
    }
    const bi = insideBuilding(levelId, x, z);
    if (bi === gi) return null;
    const leaving = bi >= 0;
    const B = obs.buildings[leaving ? bi : gi];
    if (!B.doors.length) return null;
    let dr = null, bd = Infinity;
    for (const id of B.doors) {
      const d0 = obs.doors[id];
      const c = Math.hypot(d0.x - x, d0.z - z) + Math.hypot(d0.x - gx, d0.z - gz);
      if (c < bd) { bd = c; dr = d0; }
    }
    const ox = x - dr.x, oz = z - dr.z;
    const lat = ox * dr.ux + oz * dr.uz, depth = ox * dr.nx + oz * dr.nz;
    const inLine = Math.abs(lat) < dr.w / 2 - 0.15;
    if (leaving) return inLine && depth < 1.6 ? pt(dr, -1.4) : pt(dr, 1.1);
    return inLine && depth > -1.8 ? pt(dr, 1.3) : pt(dr, -1.4);
  }

  // ---- gegevens voor verticale beweging (springen, staan op dozen, klimmen)
  // boxes:   { x, z, hw, hd, rot, bottom, h, walkable, kind, piece, c, s, cb }
  //          h = wereldhoogte (Y) van de bovenkant, bottom = Y van de onderkant, rot = draaiing (zoals rotation.y),
  //          hw/hd = halve maten langs lokale X/Z. walkable = je kunt bovenop staan.
  //          c/s = cos/sin(rot), cb = onderkant voor de botsing (dozen op de grond lopen door tot onder de grond).
  //          kind 'railing' = borstwering van een wachttoren (niet beloopbaar).
  // ladders: { x, z, rot, bottomY, topY, width, kind }
  //          (x, z) = midden van de ladder; rot = richting waar de ladder naar buiten wijst
  //          (naar buiten = (sin rot, cos rot)); de klimmer staat aan die kant en kijkt naar -buiten.
  // De kisten en torens staan in de game 0.08 m in de grond (zie game.js), dus hun bovenkant ook.
  const TOWER_PLATFORM = { half: 1.625, bottom: 4.04, top: 4.2, railing: 0.9, railAt: 1.6, railT: 0.05, gap: 0.56 };   // zie build_tower()
  const TOWER_LADDER = { lz: 1.55, width: 0.6 };
  const SINK = 0.08;
  const WALKABLE_KINDS = ['crate', 'container', 'table', 'stove', 'pew', 'bunk', 'shelf', 'barrel', 'car', 'logs', 'well', 'rubble', 'jersey', 'sandbags', 'lamp', 'crane'];
  function buildVerticalData(props, pieces) {
    const boxes = [], ladders = [];
    for (const pc of pieces) {
      const p = pc.prop;
      // Ronde props (zoals vaten en putten) kregen al 3D-botsing, maar geen bovenvlak
      // in de support-data. Voeg voor expliciet beloopbare ronde objecten een compact
      // bovenvlak toe zodat je er ook echt op kunt landen en blijven staan.
      if (pc.type === 1) {
        if (WALKABLE_KINDS.indexOf(p.kind) >= 0) {
          const r = pc.r * 0.82;
          boxes.push({ x: pc.x, z: pc.z, hw: r, hd: r, rot: 0, bottom: pc.y0, h: pc.y1,
            walkable: true, kind: p.kind, piece: pc, c: 1, s: 0, cb: pc.y0 });
        }
        continue;
      }
      if (pc.type !== 0 || pc.towerPart === 'floor') continue;
      const yb = p.yb || 0;
      let walkable = false, kind = p.kind;
      if (p.walk !== undefined) walkable = p.walk;   // daken / verdiepingsvloeren van gebouwen
      else if (WALKABLE_KINDS.indexOf(p.kind) >= 0) walkable = true;
      // massieve gebouwen (dikke 'muur') en daken hebben een plat dak; dunne muren en lateien niet
      else if (p.kind === 'wall') walkable = p.mat === 'roof' || !pc.overhead;   // alle muurstukken (ook dunne) zijn beloopbaar
      const sink = p.kind === 'crate' ? SINK : 0;
      let bottom = p.baseY + yb - sink, h = pc.y1 - sink, cb = yb > 0 ? bottom : pc.y0;
      if (pc.towerPart === 'rail') { kind = 'railing'; bottom = cb = pc.y0; h = pc.y1; }
      boxes.push({
        x: pc.x, z: pc.z, hw: pc.hx, hd: pc.hz, rot: Math.atan2(pc.s, pc.c),
        bottom, h, walkable, kind, piece: pc, c: pc.c, s: pc.s, cb,
      });
    }
    for (const p of props) {
      if (p.kind !== 'tower') continue;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const bottom = p.baseY + TOWER_PLATFORM.bottom;
      boxes.push({
        x: p.x, z: p.z, hw: TOWER_PLATFORM.half, hd: TOWER_PLATFORM.half, rot: p.yaw,
        bottom, h: p.baseY + TOWER_PLATFORM.top, walkable: true,
        kind: 'towerPlatform', railing: TOWER_PLATFORM.railing, piece: null, c, s, cb: bottom,
      });
      const w = localToWorld(p.x, p.z, c, s, 0, TOWER_LADDER.lz);
      ladders.push({
        x: w.x, z: w.z, rot: p.yaw, bottomY: p.baseY, topY: p.baseY + TOWER_PLATFORM.top,
        width: TOWER_LADDER.width, kind: 'tower',
      });
    }
    // grid (zelfde cellen als de props), elke doos in alle cellen die hij (met marge) raakt
    const grid = new Map();
    for (const b of boxes) {
      const R = Math.hypot(b.hw, b.hd) + 1.0;
      for (let i = cellOf(b.x - R); i <= cellOf(b.x + R); i++) {
        for (let j = cellOf(b.z - R); j <= cellOf(b.z + R); j++) {
          const k = key(i, j);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(b);
        }
      }
    }
    return { boxes, ladders, grid };
  }

  // ================================================================ verticale beweging
  // Gedeeld door de client (voorspelling), de server (controle) en de bots.
  // Houding (stance): 0 = staan, 1 = gehurkt, 2 = liggend.
  const STANCES = ['stand', 'crouch', 'prone'];
  const MOVE = {
    GRAVITY: 22,            // m/s²
    JUMP_V: 8.2,            // sprongsnelheid -> ~1.53 m hoog, zodat ook autos bereikbaar zijn
    MAX_JUMP: 1.55,         // hoogste sprong boven de laatste ondergrond (server)
    STEP: 0.35,             // zo hoog stap je zonder springen ergens op
    STEP_DOWN: 0.55,        // zo ver stap je omlaag zonder te vallen (heuvels, randjes)
    SUPPORT_R: 0.25,        // je staat op een doos zolang je midden binnen deze marge boven de doos is
    CLIMB_SPEED: 2.5,       // m/s op een ladder
    LADDER_STAND: 0.6,      // afstand van de klimmer tot de ladder
    LADDER_REACH: 0.6,      // zo ver voor de klimplek kun je de ladder nog pakken
    LADDER_TOP_IN: 0.55,    // waar je bovenaan op het platform uitstapt (achter de ladder)
    LADDER_EXIT: 0.6,       // ladder tegen een muur (kind 'ladder'): zo ver achter de klimplek stap je de vloer op
    HEIGHT: [1.8, 1.25, 0.65],   // lichaamshoogte per houding (botsing met plafonds/dozen)
    SPEED: [1, 0.55, 0.25],      // loopsnelheid-factor per houding
    SPREAD: [1, 0.65, 0.45],     // spreiding-factor per houding
    AIR_SPREAD: 1.8,             // spreiding-factor in de lucht
    EYE: [1.7, 1.15, 0.5],       // camerahoogte (speler)
    BOT_EYE: [1.5, 1.15, 0.4],   // ooghoogte van bots (schieten / zien)
    CHEST: [1.0, 0.65, 0.3],     // richtpunt (borst) per houding
    STANCE_MS: 200,              // minimale tijd tussen twee houdingswissels (server)
  };
  function stanceIndex(s) {
    if (s === 1 || s === 'crouch') return 1;
    if (s === 2 || s === 'prone') return 2;
    return 0;
  }

  function boxesAt(obs, x, z) {
    return (obs.boxGrid && obs.boxGrid.get(key(cellOf(x), cellOf(z)))) || null;
  }
  function boxDist(b, x, z) {
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    return Math.hypot(Math.max(Math.abs(lx) - b.hw, 0), Math.max(Math.abs(lz) - b.hd, 0));
  }

  /**
   * Hoogste beloopbare ondergrond (grond of bovenkant van een beloopbare doos) onder (x, z)
   * die niet hoger ligt dan fromY + STEP (zo stap je op kleine randjes, maar moet je op een kist springen).
   * fromY weggelaten = vanaf de grond.
   */
  function supportHeight(levelId, x, z, fromY, r) {
    const ground = heightAt(levelId, x, z);
    const limit = (fromY === undefined || fromY === null ? ground : fromY) + MOVE.STEP;
    const rad = r === undefined ? MOVE.SUPPORT_R : r;
    let best = ground;
    const arr = boxesAt(getObstacles(levelId), x, z);
    if (arr) {
      for (let n = 0; n < arr.length; n++) {
        const b = arr[n];
        if (!b.walkable || b.h > limit || b.h <= best) continue;
        if (boxDist(b, x, z) <= rad) best = b.h;
      }
    }
    return best;
  }

  /**
   * Botsing in 3D: duwt een cirkel (straal r) met voeten op y en lichaamshoogte height uit bomen,
   * palen/vaten en dozen. Een doos blokkeert alleen als hij het lichaam overlapt:
   * - bovenkant hoger dan y + STEP (anders stap/sta je erop),
   * - onderkant lager dan heuphoogte (hoger = plafond: dat regelt de verticale beweging).
   */
  function collideY(levelId, x, z, r, y, height) {
    const obs = getObstacles(levelId);
    const top = y + MOVE.STEP, waist = y + Math.min(1.0, height * 0.6);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const cx = cellOf(x), cz = cellOf(z);
      for (let i = cx - 1; i <= cx + 1; i++) {
        for (let j = cz - 1; j <= cz + 1; j++) {
          const arr = obs.grid.get(key(i, j));
          if (!arr) continue;
          for (let n = 0; n < arr.length; n++) {
            const t = arr[n];
            if (y >= t.baseY + t.h) continue;
            let dx = x - t.x, dz = z - t.z;
            let d = Math.hypot(dx, dz);
            const min = t.r + r;
            if (d < min) {
              if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
              x = t.x + (dx / d) * min; z = t.z + (dz / d) * min;
              moved = true;
            }
          }
        }
      }
      const parr = obs.propGrid.get(key(cellOf(x), cellOf(z)));
      if (parr) {
        for (let n = 0; n < parr.length; n++) {
          const pc = parr[n];
          if (pc.type !== 1) continue;                     // dozen: zie boxes hieronder
          const pTop = pc.moveTop !== undefined ? pc.moveTop : pc.y1;
          if (pTop <= top || pc.y0 >= waist) continue;
          const p = pushOutOfPiece(pc, x, z, r);
          if (p) { x = p.x; z = p.z; moved = true; }
        }
      }
      const barr = boxesAt(obs, x, z);
      if (barr) {
        for (let n = 0; n < barr.length; n++) {
          const b = barr[n];
          if (b.h <= top || b.cb >= waist) continue;
          const p = pushOutOfRect(b.x, b.z, b.c, b.s, b.hw, b.hd, x, z, r);
          if (p) { x = p.x; z = p.z; moved = true; }
        }
      }
      // DEUR-HOOK: dichte / open deurbladen (toestand van de kamer of client, zie setDoorState), hoogte-bewust
      if (obs.doors) {
        const dp = doorPush(levelId, obs, x, z, r, y, height);
        if (dp) { x = dp.x; z = dp.z; moved = true; }
      }
      if (!moved) break;
    }
    return { x: clamp(x, -MAP_HALF, MAP_HALF), z: clamp(z, -MAP_HALF, MAP_HALF) };
  }

  // Laagste plafond (onderkant van een doos boven de heup) boven een speler, of Infinity.
  function ceilingAt(levelId, x, z, r, y, height) {
    const arr = boxesAt(getObstacles(levelId), x, z);
    let best = Infinity;
    if (!arr) return best;
    const waist = y + Math.min(1.0, height * 0.6);
    for (let n = 0; n < arr.length; n++) {
      const b = arr[n];
      if (b.cb < waist || b.cb >= best) continue;
      if (boxDist(b, x, z) < r - 0.02) best = b.cb;
    }
    return best;
  }

  // Past houding 'stance' hier (niet met je hoofd door een plafond)?
  function canStance(levelId, x, z, y, stance) {
    const h = MOVE.HEIGHT[stanceIndex(stance)];
    return ceilingAt(levelId, x, z, PLAYER_RADIUS, y, 0.6) >= y + h;
  }

  // ---- ladders: het klimpad is een L: omhoog op de klimplek (LADDER_STAND voor de ladder),
  // bovenaan horizontaal door de opening in de borstwering naar LADDER_TOP_IN achter de ladder.
  // s = afgelegde weg langs dat pad (0 = onderaan).
  // Ladders tegen een muur in een gebouw (kind 'ladder', door een gat in een verdiepingsvloer): de muur zit achter
  // de ladder, dus bovenaan loopt het pad de andere kant op: van de muur af (achter de klimmer) de vloer op
  // (LADDER_EXIT). I.dir = +1 (van de ladder af) of -1 (toren: door de opening naar binnen), I.u0..I.u1 = bereik bovenaan.
  function ladderInfo(levelId, ld) {
    if (ld._info && ld._info.lvl === levelId) return ld._info;
    const ox = Math.sin(ld.rot), oz = Math.cos(ld.rot);
    const sx = ld.x + ox * MOVE.LADDER_STAND, sz = ld.z + oz * MOVE.LADDER_STAND;
    const wall = ld.kind === 'ladder';
    // (gebouw: de onderkant kan op een vloer staan; toren: de grond, ook als die lager ligt dan de toren)
    const ground = heightAt(levelId, sx, sz);
    const y0 = Math.min(ld.topY - 0.5, wall ? Math.max(ground, ld.bottomY) : ground);
    const L1 = ld.topY - y0, L2 = wall ? MOVE.LADDER_EXIT : MOVE.LADDER_STAND + MOVE.LADDER_TOP_IN;
    const dir = wall ? 1 : -1, uEnd = MOVE.LADDER_STAND + dir * L2;
    ld._info = {
      lvl: levelId, ox, oz, sx, sz, y0, L1, L2, total: L1 + L2, wall, dir,
      u0: Math.min(MOVE.LADDER_STAND, uEnd), u1: Math.max(MOVE.LADDER_STAND, uEnd),
    };
    return ld._info;
  }
  function ladderPos(levelId, ld, s) {
    const I = ladderInfo(levelId, ld);
    s = clamp(s, 0, I.total);
    if (s <= I.L1) return { x: I.sx, z: I.sz, y: I.y0 + s };
    const u = MOVE.LADDER_STAND + I.dir * (s - I.L1);
    return { x: ld.x + I.ox * u, z: ld.z + I.oz * u, y: ld.topY };
  }
  // (u, v): u = afstand naar buiten vanaf de ladder, v = zijwaarts
  function ladderLocal(levelId, ld, x, z) {
    const I = ladderInfo(levelId, ld);
    const dx = x - ld.x, dz = z - ld.z;
    return { u: dx * I.ox + dz * I.oz, v: dx * I.oz - dz * I.ox, I };
  }
  /**
   * Index van de ladder waarvan (x, y, z) op het klimpad ligt (met marge tol), of -1.
   * Gebruikt door de server om klimmende spelers goed te keuren.
   */
  function ladderAt(levelId, x, z, y, tol) {
    const t = tol === undefined ? 0.45 : tol;
    const L = getObstacles(levelId).ladders;
    for (let i = 0; i < L.length; i++) {
      const ld = L[i];
      if (Math.abs(x - ld.x) > 3 || Math.abs(z - ld.z) > 3) continue;
      const { u, v, I } = ladderLocal(levelId, ld, x, z);
      if (Math.abs(v) > ld.width / 2 + t) continue;
      if (Math.abs(u - MOVE.LADDER_STAND) <= t && y >= I.y0 - t && y <= ld.topY + t) return i;
      if (u >= I.u0 - t && u <= I.u1 + t && Math.abs(y - ld.topY) <= t) return i;
    }
    return -1;
  }

  // Een ladder pakken? (onderaan: naar de ladder toe lopen; bovenaan: vanaf het platform naar de opening lopen,
  // of bij een muurladder vanaf de vloer naar het gat met de ladder toe lopen -> naar beneden).
  // skip = index van een ladder die (nog) niet gepakt mag worden (net losgelaten, zie stepPlayer).
  // Geeft { index, s, sg } (sg = -1: naar de ladder toe lopen = omlaag klimmen) of null.
  function ladderGrab(levelId, x, z, y, vx, vz, grounded, skip) {
    const sp = Math.hypot(vx, vz);
    if (sp < 0.1) return null;
    const L = getObstacles(levelId).ladders;
    for (let i = 0; i < L.length; i++) {
      if (i === skip) continue;
      const ld = L[i];
      if (Math.abs(x - ld.x) > 3 || Math.abs(z - ld.z) > 3) continue;
      const { u, v, I } = ladderLocal(levelId, ld, x, z);
      const toward = -(vx * I.ox + vz * I.oz) / sp;   // > 0 = naar de toren / muur toe
      if (Math.abs(v) < 0.5 && u > 0.05 && u < MOVE.LADDER_STAND + MOVE.LADDER_REACH &&
          y >= I.y0 - 0.4 && y < ld.topY - 0.4 && toward > 0.6) {
        return { index: i, s: clamp(y - I.y0, 0, I.L1 - 0.01), sg: 1 };
      }
      if (!grounded || Math.abs(v) >= 0.45 || Math.abs(y - ld.topY) >= 0.3) continue;
      if (!I.wall && u > -1.0 && u < 0.15 && toward < -0.6) {
        return { index: i, s: clamp(I.L1 + MOVE.LADDER_STAND - u, I.L1 + 0.3, I.total - 0.05), sg: 1 };
      }
      if (I.wall && u > MOVE.LADDER_STAND + 0.1 && u < I.u1 + 0.6 && toward > 0.6) {
        return { index: i, s: clamp(I.L1 + u - MOVE.LADDER_STAND, I.L1 + 0.05, I.total - 0.05), sg: -1 };
      }
    }
    return null;
  }

  /**
   * Eén bewegingsstap (client-voorspelling en bots).
   * st:  { x, z, y, vy, ground, stance, ladder (-1 = niet), ls }  (wordt aangepast en teruggegeven)
   * inp: { vx, vz }  gewenste snelheid in m/s (al met houding/wapen verrekend),
   *      jump: true = springen (eenmalig), r: straal (standaard PLAYER_RADIUS)
   * Op een ladder: naar de toren toe bewegen = omhoog/naar binnen, ervan af = omlaag/naar buiten.
   */
  function stepPlayer(levelId, st, inp, dt) {
    const obs = getObstacles(levelId);
    const R = inp.r || PLAYER_RADIUS;
    const jumpV = Number.isFinite(inp.jumpV) ? inp.jumpV : MOVE.JUMP_V;
    const grav = Number.isFinite(inp.gravity) ? inp.gravity : MOVE.GRAVITY;   // spelmodus 'Moon'
    const vx = inp.vx || 0, vz = inp.vz || 0;
    if (st.ladder === undefined) st.ladder = -1;
    if (st.ladder >= 0) {
      const ld = obs.ladders[st.ladder];
      if (!ld) { st.ladder = -1; return st; }
      const I = ladderInfo(levelId, ld);
      st.stance = 0;
      if (inp.jump) {   // eraf springen (naar buiten)
        st.ladder = -1; st.ground = false; st.vy = 3.2;
        const p = collideY(levelId, st.x + I.ox * 0.3, st.z + I.oz * 0.3, R, st.y, MOVE.HEIGHT[0]);
        st.x = p.x; st.z = p.z;
        return st;
      }
      const sp = Math.hypot(vx, vz);
      const toward = sp > 0.05 ? -(vx * I.ox + vz * I.oz) / sp : 0;
      // sg = -1: van bovenaf gepakt (muurladder): naar de ladder toe lopen = omlaag
      const climb = (st.lsg || 1) * clamp(toward * 1.5, -1, 1) * Math.min(1, sp / 1.5);
      st.ls += climb * MOVE.CLIMB_SPEED * dt;
      st.vy = 0;
      const leave = (top) => {
        // net losgelaten: deze ladder niet meteen weer pakken zolang je dezelfde kant op blijft lopen
        st.lbi = toward > 0.3 || toward < -0.3 ? st.ladder : -1;
        st.lbd = toward > 0 ? 1 : -1;
        st.lbt = !!(top && I.wall);   // boven op de vloer van een muurladder: niet terug het gat in lopen
        st.ladder = -1; st.lsg = 1; st.ground = true;
      };
      if (st.ls >= I.total) {               // boven: op het platform / de verdiepingsvloer
        const p = ladderPos(levelId, ld, I.total);
        st.x = p.x; st.z = p.z; st.y = Math.max(p.y, supportHeight(levelId, p.x, p.z, p.y));
        leave(true);
        return st;
      }
      if (st.ls <= 0 && climb < 0) {        // onder: weer op de grond
        st.x = I.sx; st.z = I.sz; st.y = supportHeight(levelId, I.sx, I.sz, I.y0);
        leave(false);
        return st;
      }
      st.ls = clamp(st.ls, 0, I.total);
      const p = ladderPos(levelId, ld, st.ls);
      st.x = p.x; st.z = p.z; st.y = p.y; st.ground = false;
      return st;
    }

    // net van een ladder af: blokkade opheffen zodra je niet meer dezelfde kant op loopt
    let lvx = vx, lvz = vz;
    if (st.lbi >= 0) {
      const bl = obs.ladders[st.lbi], sp = Math.hypot(vx, vz);
      const I = bl && ladderInfo(levelId, bl);
      const toward = I && sp > 0.1 ? -(vx * I.ox + vz * I.oz) / sp : 0;
      if (!I || toward * st.lbd < 0.3) st.lbi = -1;
      else if (st.lbt) {
        // boven een muurladder uitgestapt met de stick nog naar de muur: niet het gat in lopen (wel zijwaarts)
        const dot = vx * I.ox + vz * I.oz;
        if (dot < 0) { lvx = vx - dot * I.ox; lvz = vz - dot * I.oz; }
      }
    }

    if (st.stance !== 2) {
      const g = ladderGrab(levelId, st.x, st.z, st.y, vx, vz, st.ground, st.lbi >= 0 ? st.lbi : -1);
      if (g) {
        st.ladder = g.index; st.ls = g.s; st.lsg = g.sg; st.stance = 0; st.vy = 0; st.ground = false; st.lbi = -1;
        const p = ladderPos(levelId, obs.ladders[g.index], g.s);
        st.x = p.x; st.z = p.z; st.y = p.y;
        return st;
      }
    }

    if (inp.jump && st.ground) {
      if (st.stance !== 0 && canStance(levelId, st.x, st.z, st.y, 0)) {
        const wasProne = st.stance === 2;
        st.stance = 0;
        if (!wasProne) { st.vy = jumpV; st.ground = false; }   // uit liggen: alleen opstaan
      } else if (st.stance === 0) { st.vy = jumpV; st.ground = false; }
    }
    const h = MOVE.HEIGHT[st.stance] || MOVE.HEIGHT[0];
    const r = collideY(levelId, st.x + lvx * dt, st.z + lvz * dt, R, st.y, h);
    st.x = r.x; st.z = r.z;
    if (st.ground) {
      const sup = supportHeight(levelId, st.x, st.z, st.y);
      if (sup >= st.y - MOVE.STEP_DOWN) { st.y = sup; st.vy = 0; }
      else { st.ground = false; st.vy = 0; }
    }
    if (!st.ground) {
      const prevY = st.y;
      st.vy = Math.max(st.vy - grav * dt, -40);
      st.y += st.vy * dt;
      if (st.vy > 0) {
        const cb = ceilingAt(levelId, st.x, st.z, R, prevY, h);
        if (st.y + h > cb) { st.y = Math.max(prevY, cb - h); st.vy = 0; }
      }
      const sup = supportHeight(levelId, st.x, st.z, Math.max(prevY, st.y));
      if (st.vy <= 0 && st.y <= sup) { st.y = sup; st.vy = 0; st.ground = true; }
      else {
        const g = heightAt(levelId, st.x, st.z);
        if (st.y < g) { st.y = g; st.vy = Math.max(0, st.vy); st.ground = st.vy === 0; }
      }
    }
    return st;
  }

  /**
   * Servercontrole van een 'state'-bericht (positie, hoogte, houding).
   * ac: anticheat-toestand { x, z, y, sy (laatste ondergrond), airT, t (ms), stance, stanceT, ladder }
   * m:  bericht { x, z, y?, s? }; now = ms; opts: { speed (m/s), factor, tol }
   * Geeft { x, z, y, stance, air, ladder } en werkt ac bij.
   * - horizontaal: niet sneller dan speed * factor (+ tol), niet in obstakels (3D-botsing)
   * - hoogte: niet hoger dan een sprong boven de laatste ondergrond (met zwaartekracht na de top),
   *   behalve op een ladder (klimsnelheid); niet onder de grond
   * - houding: hooguit elke STANCE_MS wisselen, niet liggen op een ladder of in de lucht
   */
  function validateState(levelId, ac, m, now, opts) {
    const o = opts || {};
    const dt = clamp((now - ac.t) / 1000, 0, 3);
    const want = m.s === 0 || m.s === 1 || m.s === 2 ? m.s : ac.stance;
    let stance = ac.stance;
    if (want !== stance && now - (ac.stanceT || 0) >= MOVE.STANCE_MS) stance = want;
    // horizontaal
    let x = clamp(m.x, -MAP_HALF, MAP_HALF), z = clamp(m.z, -MAP_HALF, MAP_HALF);
    const mul = Math.max(MOVE.SPEED[ac.stance] || 1, MOVE.SPEED[stance] || 1);
    const maxD = (o.speed || 7) * (o.factor || 1.6) * mul * dt + (o.tol === undefined ? 0.75 : o.tol);
    const dx = x - ac.x, dz = z - ac.z, dist = Math.hypot(dx, dz);
    if (dist > maxD) { x = ac.x + (dx / dist) * maxD; z = ac.z + (dz / dist) * maxD; }
    // hoogte
    let y = typeof m.y === 'number' && Number.isFinite(m.y) ? m.y : supportHeight(levelId, x, z, ac.y);
    const jumpV = Number.isFinite(o.jumpV) ? o.jumpV : MOVE.JUMP_V;
    const G = Number.isFinite(o.gravity) ? o.gravity : MOVE.GRAVITY;
    const tA = jumpV / G, H = jumpV * jumpV / (2 * G);
    const tt = Math.max(0, (ac.airT || 0) + dt - 0.35);   // marge voor netwerk-jitter
    let maxY = ac.sy + (tt <= tA ? H : H - 0.5 * G * (tt - tA) * (tt - tA)) + 0.3;
    let ladder = ladderAt(levelId, x, z, y);
    if (ladder >= 0 && ac.ladder >= 0) maxY = Math.min(maxY, ac.y + MOVE.CLIMB_SPEED * 1.6 * dt + 0.35);
    if (y > maxY) y = maxY;
    const g = heightAt(levelId, x, z);
    if (y < g) y = g;
    if (ladder >= 0 && ladderAt(levelId, x, z, y) < 0) ladder = -1;
    // in het ladderbereik maar gewoon op een vloer / platform / de grond staan = niet klimmen
    // (botsing en houding zoals altijd; bv. hurken op het torenplatform of naast het gat van een verdiepingsladder)
    if (ladder >= 0 && supportHeight(levelId, x, z, y) >= y - 0.05) ladder = -1;
    if (ladder >= 0) stance = 0;
    else {
      // DEUR-HOOK: een deurblad is dun; met een grote stap (lag of valsspelen) niet erdoorheen "tunnelen":
      // de beweging stopt vóór het eerste blad (dicht of open) op lichaamshoogte. Daarna de gewone 3D-botsing.
      const mdx = x - ac.x, mdz = z - ac.z, md = Math.hypot(mdx, mdz);
      if (md > 0.05 && activeDoors(levelId)) {
        const dir = { x: mdx / md, y: 0, z: mdz / md };
        const h = rayDoorHit(levelId, { x: ac.x, y: y + MOVE.STEP + 0.05, z: ac.z }, dir, md + PLAYER_RADIUS);
        if (h) {
          const k = Math.max(0, h.t - PLAYER_RADIUS - 0.01);
          x = ac.x + dir.x * k; z = ac.z + dir.z * k;
        }
      }
      const r = collideY(levelId, x, z, PLAYER_RADIUS, y, MOVE.HEIGHT[stance]);
      x = r.x; z = r.z;
    }
    const sup = supportHeight(levelId, x, z, y);
    let air = false;
    if (ladder >= 0 || y - sup <= 0.25) {
      if (y < sup) y = sup;
      ac.sy = ladder >= 0 ? y : sup; ac.airT = 0;
    } else {
      ac.airT = (ac.airT || 0) + dt;
      air = true;
      if (stance === 2) stance = ac.stance === 2 ? 1 : ac.stance;
    }
    if (stance !== ac.stance && stance < ac.stance && !canStance(levelId, x, z, y, stance)) stance = ac.stance;
    if (stance !== ac.stance) ac.stanceT = now;
    ac.x = x; ac.z = z; ac.y = y; ac.t = now; ac.stance = stance; ac.ladder = ladder;
    return { x, z, y, stance, air, ladder: ladder >= 0 };
  }

  // Raakbollen [vooruit, omhoog, straal] per houding (t.o.v. de voeten, vooruit = kijkrichting).
  const HIT_SPHERES = [
    [[0, 0.55, 0.55], [0, 1.35, 0.5]],                       // staan (hoofd tot ~1.85)
    [[0.1, 0.5, 0.45], [0.15, 1.05, 0.35]],                   // gehurkt (hoofd ~1.1)
    [[0.7, 0.3, 0.3], [0.05, 0.3, 0.35], [-0.6, 0.22, 0.3]],  // liggend: laag en lang
  ];

  // ---------------------------------------------------------------- woestijnpost
  // Hoofdgebouw: hoog deel (A, 2 verdiepingen, ladder naar boven, deur naar het platte dak van B) en laag deel (B).
  function desertMainBuilding(g) {
    const t = 0.5, up = [4.5, 5.5], low = [1.0, 2.0];
    const A = g.building({
      x: -3.2, z: 0, yaw: 0, hx: 2.2, hz: 3.0, h: 6.4, t, mat: 'adobe', kind: 'house',
      sides: [
        [{ at: 2.2, w: 1.4, holes: [[0, 2.2], up], door: { kind: 'wood' } }],
        // tussenmuur met B: open doorgang beneden, deur naar het dak van B boven
        [{ at: 2.5, w: 1.4, holes: [[0, 2.2], [3.85, 5.9]] }],
        [{ at: 1.2, w: 1.0, holes: [low] }, { at: 3.2, w: 1.0, holes: [up] }],
        [{ at: 2.8, w: 1.0, holes: [low, up] }, { at: 4.2, w: 0.9, holes: [up] }],
      ],
      roof: { t: 0.3 },
      floors: [
        { lx: 0, lz: -0.75, hx: 1.7, hz: 1.75, y: 3.8 },
        { lx: 0.5, lz: 1.75, hx: 1.2, hz: 0.75, y: 3.8 },
      ],
      ladders: [{ lx: -1.64, lz: 1.75, rot: Math.PI / 2, y0: 0, y1: 3.8, w: 0.6 }],
      items: [{ kind: 'crate', lx: 1.1, lz: -1.9, stack: 2 }, { kind: 'crate', lx: 1.15, lz: 1.95 }],
      lamps: [[0, 2.9, -0.6], [0, 5.6, -0.6]],
    });
    const B = g.building({
      x: 2.1, z: 0, yaw: 0, hx: 3.1, hz: 3.6, h: 3.8, t, mat: 'adobe', kind: 'house',
      sides: [
        [{ at: 2.6, w: 1.4, holes: [[0, 2.2]], door: { kind: 'wood' } }, { at: 4.8, w: 1.0, holes: [low] }],
        [{ at: 2.0, w: 1.0, holes: [low] }, { at: 4.6, w: 1.0, holes: [low] }],
        [{ at: 3.6, w: 1.4, holes: [[0, 2.2]], door: { kind: 'wood' } }, { at: 5.4, w: 1.0, holes: [low] }],
        // aan de kant van A alleen twee stukjes bij de hoeken (A heeft daar de muur)
        [{ at: 3.1, w: 6.0, holes: [[0, 9]] }],
      ],
      roof: { t: 0.3 },
      items: [
        { kind: 'table', lx: 1.0, lz: 0.3 }, { kind: 'shelf', lx: 2.33, lz: -2.3, yaw: -Math.PI / 2 },
        { kind: 'crate', lx: -2.0, lz: -2.5 }, { kind: 'bunk', lx: 1.5, lz: 2.62 },
      ],
      lamps: [[1.0, 2.9, 0.3]],
    });
    return A.concat(B);
  }

  function genDesert(g) {
    const H = 20, T = 0.7, WH = 3.2, GATE = 3.6;
    const c = [];
    // ommuurde post 40 x 40 met een poort in het midden van elke kant en twee bressen
    c.push(...g.wallRun(-H - T / 2, H, -GATE, H, T, WH, 'adobe', [], 0.45));
    c.push(...g.wallRun(GATE, H, H + T / 2, H, T, WH, 'adobe', [], 0));
    c.push(...g.wallRun(-H - T / 2, -H, -GATE, -H, T, WH, 'adobe', [], 0));
    c.push(...g.wallRun(GATE, -H, H + T / 2, -H, T, WH, 'adobe', [], 0.25));
    c.push(...g.wallRun(H, -H + T / 2, H, -GATE, T, WH, 'adobe', [], 0.85));
    c.push(...g.wallRun(H, GATE, H, H - T / 2, T, WH, 'adobe', [], 0));
    c.push(...g.wallRun(-H, -H + T / 2, -H, -GATE, T, WH, 'adobe', [], 0));
    c.push(...g.wallRun(-H, GATE, -H, H - T / 2, T, WH, 'adobe', [], 0.3));
    // hoofdgebouw (laag deel + hoger deel), bijgebouw, wachttoren
    c.push(...desertMainBuilding(g));
    c.push(...g.hut(12.5, 13, 0, 3.5, 2.6, 3.4, 'adobe'));
    c.push({ kind: 'tower', x: -14.5, z: -14.5, yaw: Math.PI / 4 });
    // lage muurtjes, zandzakken bij de poorten, kisten en vaten
    c.push(g.box(11, -9.5, 0, 3.0, 0.25, 1.2, 'adobe'));
    c.push(g.box(13.75, -12.5, 0, 0.25, 2.75, 1.2, 'adobe'));
    c.push(g.box(-9, 11, 0, 2.5, 0.25, 1.2, 'adobe'));
    c.push({ kind: 'sandbags', x: 3.2, z: 14.5, yaw: 0 }, { kind: 'sandbags', x: -3.2, z: -14.5, yaw: 0 });
    c.push({ kind: 'sandbags', x: 14.5, z: -3.2, yaw: Math.PI / 2 }, { kind: 'sandbags', x: -14.5, z: 3.2, yaw: Math.PI / 2 });
    c.push({ kind: 'crate', x: -13.5, z: 13.5, yaw: 0.2, stack: 2 }, { kind: 'crate', x: -12.2, z: 13.8, yaw: 0.5, stack: 1 });
    c.push({ kind: 'barrel', x: -15.5, z: 10.8 }, { kind: 'barrel', x: -14.9, z: 10.4 }, { kind: 'barrel', x: 7.0, z: -4.9 });
    c.push({ kind: 'crate', x: 7.2, z: 5.5, yaw: 0.1, stack: 1 }, { kind: 'crate', x: -9.5, z: -6.5, yaw: 0.7, stack: 2 });
    c.push({ kind: 'jersey', x: 9.5, z: 1.5, yaw: Math.PI / 2 }, { kind: 'jersey', x: -10, z: 4, yaw: 0.3 });
    g.place(c, { force: true });

    const compound = rectOf(0, 0, 0, H + 0.4, H + 0.4);
    const outside = { ok: (f) => rectDist(f, compound) >= 4 };
    const TAU = g.TAU;
    // lemen hutjes (massief) en een paar kapotte huisjes zonder dak
    g.scatter(5, 600, () => {
      const p = g.randPos(32, 200, 4);
      // (zelfde volgorde van rnd()-aanroepen als het oude massieve hutje)
      const yaw = g.range(0, TAU), hx = g.range(2.2, 3.0), hz = g.range(2.2, 3.0), h = g.range(2.8, 3.4);
      return g.hut(p.x, p.z, yaw, hx, hz, h, 'adobe');
    }, Object.assign({ gap: 2.5 }, outside));
    g.scatter(3, 600, () => {
      const p = g.randPos(32, 200, 6);
      return g.house(p.x, p.z, g.range(0, TAU), g.range(6, 8), g.range(5, 6.5), 2.9, 0.55, 'adobe', { doors: [0, 2], ruin: 0.7 });
    }, Object.assign({ gap: 2.5 }, outside));
    // containers (verschillende vormen), lage muren, zandzakstellingen, betonblokken
    g.scatter(13, 3000, () => { const p = g.randPos(28, 200, 4); return g.containerGroup(p.x, p.z, g.range(0, TAU)); },
      Object.assign({ gap: 2.2 }, outside));
    g.scatter(16, 3000, () => {
      const p = g.randPos(28, 200, 3), yaw = g.range(0, TAU), len = g.range(4, 9), h = g.range(1.1, 1.4);
      const out = [g.box(p.x, p.z, yaw, len / 2, 0.25, h, 'adobe')];
      if (g.chance(0.4)) {
        const c2 = Math.cos(yaw), s2 = Math.sin(yaw), l2 = g.range(2.5, 5);
        const w = localToWorld(p.x, p.z, c2, s2, len / 2 - 0.25, l2 / 2 - 0.25);
        out.push(g.box(w.x, w.z, yaw + Math.PI / 2, l2 / 2, 0.25, h, 'adobe'));
      }
      return out;
    }, Object.assign({ gap: 2.0 }, outside));
    g.scatter(10, 3000, () => { const p = g.randPos(26, 200, 3); return g.sandbagNest(p.x, p.z, g.range(0, TAU)); }, outside);
    g.scatter(6, 2000, () => { const p = g.randPos(26, 200, 3); return g.row('jersey', p.x, p.z, g.range(0, TAU), 2 + Math.floor(g.rnd() * 3), 2.02); }, outside);
    g.scatter(14, 2000, () => {
      const p = g.randPos(26, 200, 3), n = 1 + Math.floor(g.rnd() * 3);
      const out = [];
      for (let i = 0; i < n; i++) out.push({ kind: 'barrel', x: p.x + (i % 2) * 0.64, z: p.z + Math.floor(i / 2) * 0.64 });
      return out;
    }, outside);
    g.scatter(12, 2000, () => {
      const p = g.randPos(26, 200, 3);
      return [{ kind: 'crate', x: p.x, z: p.z, yaw: g.range(0, TAU), stack: g.chance(0.3) ? 2 : 1 }];
    }, outside);
    g.coverNearPads((x, z, a) => (g.chance(0.5) ? [{ kind: 'sandbags', x, z, yaw: a }] : g.row('jersey', x, z, a + Math.PI / 2, 2, 2.02)), outside);
    // palmen rond de post en verspreid, wat rotsblokken
    let palms = 0;
    for (let t = 0; t < 3000 && palms < 28; t++) {
      const p = palms < 12 ? g.randPos(24, 34) : g.randPos(34, 200, 3);
      if (Math.abs(p.x) < H + 3 && Math.abs(p.z) < H + 3) continue;
      if (g.tree({ x: p.x, z: p.z, r: 0.32, h: 9, scale: g.range(0.85, 1.2), kind: 'palm' }, 1.6)) palms++;
    }
    let rocks = 0;
    for (let t = 0; t < 2000 && rocks < 14; t++) {
      const p = g.randPos(30, 200, 3), r = g.range(0.8, 1.7);
      if (g.tree({ x: p.x, z: p.z, r, h: r * 1.1, scale: r, kind: 'boulder' }, 1.6)) rocks++;
    }
  }

  // ---------------------------------------------------------------- besneeuwde bergpas
  // Holle blokhut (model public/models/cabin.glb uit tools/build_buildings.py, maten in CABIN).
  // Het model zelf botst niet; verborgen muren, latei, dakplaten en gevels doen dat wel. Deur aan +z (naar de weg).
  const CABIN = {
    hx: 3.0, hz: 2.3, t: 0.26, eave: 2.5, ridge: 4.3, roofEdge: 2.75, roofEaveY: 2.55,
    door: { x: -1.25, w: 1.4, top: 2.1 }, win: { w: 1.2, sill: 1.0, top: 1.95 },
    frontWinX: 0.9, sideWinZ: [-0.2, 0.2],   // ramen: voorgevel (x) en rechter / linker zijwand (z)
  };
  function cabinGroup(g, x, z, yaw) {
    const C = CABIN, c = Math.cos(yaw), s = Math.sin(yaw);
    const win = [C.win.sill, C.win.top], sideLen = 2 * C.hz - 2 * C.t;
    const extra = [];
    const lbox = (lx, lz, hx, hz, h, yb) => { const q = localToWorld(x, z, c, s, lx, lz); return g.box(q.x, q.z, yaw, hx, hz, h, 'log', yb); };
    // dak (twee schuine vlakken) als trapjes van platen; boven hoofdhoogte, dus alleen voor kogels en camera
    const k = (C.ridge - C.roofEaveY) / C.roofEdge;
    for (const sz of [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const z0 = (C.roofEdge * j) / 3, z1 = (C.roofEdge * (j + 1)) / 3;
        const top = C.ridge - k * z0 + 0.05, bot = C.ridge - k * z1 - 0.3;
        const p = lbox(0, sz * (z0 + z1) / 2, C.hx + 0.4, (z1 - z0) / 2, top - bot, bot);
        p.slab = true; p.walk = false;
        extra.push(p);
      }
    }
    // puntgevels boven de zijwanden
    for (const sx of [-1, 1]) {
      const xx = sx * (C.hx - C.t / 2);
      extra.push(lbox(xx, 0, C.t / 2, 1.7, 0.7, C.eave), lbox(xx, 0, C.t / 2, 1.0, 0.7, C.eave + 0.7));
      extra[extra.length - 1].slab = extra[extra.length - 2].slab = true;
    }
    return g.building({
      anchor: { kind: 'cabin', x, z, yaw, noCol: true }, hidden: true, kind: 'cabin',
      x, z, yaw, hx: C.hx, hz: C.hz, h: C.eave, t: C.t, mat: 'log',
      sides: [
        [],
        [{ at: sideLen / 2 + C.sideWinZ[0], w: C.win.w, holes: [win] }],
        [{ at: C.hx - C.door.x, w: C.door.w, holes: [[0, C.door.top]], door: { kind: 'wood' } }, { at: C.hx - C.frontWinX, w: C.win.w, holes: [win] }],
        [{ at: sideLen / 2 - C.sideWinZ[1], w: C.win.w, holes: [win] }],
      ],
      extra,
      items: [
        { kind: 'bunk', lx: 1.72, lz: -1.57 },
        { kind: 'table', lx: 0.9, lz: 0.35 },
        { kind: 'stove', lx: -2.4, lz: -1.66 },
        { kind: 'crate', lx: 2.17, lz: 1.47 },
      ],
      lamps: [[0.9, 0.92, 0.35]],   // lantaarn op de tafel (y = midden van het glas)
      pad: { margin: 0.6, blend: 3.0 },
    });
  }

  function genSnow(g) {
    const TAU = g.TAU;
    const roadDir = (z) => {
      const dxdz = 20 * 0.021 * Math.cos(z * 0.021 + 0.4), n = Math.hypot(dxdz, 1);
      return { tx: dxdz / n, tz: 1 / n, nx: 1 / n, nz: -dxdz / n };
    };
    const offRoad = { ok: (f) => { for (const q of rectCorners(f).concat([f])) if (roadDist('snow', q.x, q.z) < 0.8) return false; return true; } };
    // gehucht: blokhutten langs de weg, deur naar de weg
    const cabins = [];
    [-62, -46, -30, -14, 4, 20, 36, 54, 70].forEach((z0, i) => {
      for (let t = 0; t < 12; t++) {
        const side = (i + (t >= 6 ? 1 : 0)) % 2 ? 1 : -1;
        const zc = z0 + (t % 6) * 1.5 - 4;
        const rd = roadDir(zc), off = 9.5 + (t % 3);
        const x = snowRoadX(zc) + side * rd.nx * off, z = zc + side * rd.nz * off;
        const yaw = Math.atan2(-side * rd.nx, -side * rd.nz);
        if (g.place(cabinGroup(g, x, z, yaw), { gap: 3, maxStep: 1.3 })) { cabins.push({ x, z, yaw, side }); break; }
      }
    });
    // houtstapels naast de hutten
    for (const cb of cabins) {
      const c = Math.cos(cb.yaw), s = Math.sin(cb.yaw);
      for (const lx of [-5.2, 5.2]) {
        const w = localToWorld(cb.x, cb.z, c, s, lx, -1.0);
        if (g.place([{ kind: 'logs', x: w.x, z: w.z, yaw: cb.yaw + Math.PI / 2 }], { gap: 1.6 })) break;
      }
    }
    // houten hekken (laag) rond de achtertuinen
    for (const cb of cabins) {
      const c = Math.cos(cb.yaw), s = Math.sin(cb.yaw);
      for (let t = 0; t < 6; t++) {
        const w = localToWorld(cb.x, cb.z, c, s, g.range(-2, 2), -5.8 - t * 0.4);
        if (g.place([g.box(w.x, w.z, cb.yaw, g.range(2.5, 4), 0.1, 1.05, 'wood')], { gap: 1.8, maxStep: 1.0 })) break;
      }
    }
    // wachttorens op de hellingen
    g.scatter(3, 2000, () => {
      const p = g.randPos(15, 200, 4);
      if (Math.abs(p.x - snowRoadX(p.z)) < 18) return null;
      return [{ kind: 'tower', x: p.x, z: p.z, yaw: g.range(0, TAU) }];
    }, { gap: 2.5 });
    // achtergelaten wrakken op de weg
    g.scatter(3, 400, () => {
      const z = g.range(-80, 80), rd = roadDir(z), side = g.chance(0.5) ? 1 : -1;
      const x = snowRoadX(z) + side * rd.nx * 1.6, zz = z + side * rd.nz * 1.6;
      return [{ kind: 'car', x, z: zz, yaw: Math.atan2(-rd.tz, rd.tx) + g.range(-0.3, 0.3) }];
    }, { gap: 2.2 });
    // dekking verspreid
    g.scatter(9, 3000, () => { const p = g.randPos(10, 200, 3); return g.sandbagNest(p.x, p.z, g.range(0, TAU)); }, offRoad);
    g.scatter(10, 3000, () => { const p = g.randPos(8, 200, 3); return [{ kind: 'logs', x: p.x, z: p.z, yaw: g.range(0, TAU) }]; }, offRoad);
    g.scatter(12, 3000, () => {
      const p = g.randPos(8, 200, 3);
      return [{ kind: 'crate', x: p.x, z: p.z, yaw: g.range(0, TAU), stack: g.chance(0.3) ? 2 : 1 }];
    }, offRoad);
    g.coverNearPads((x, z, a) => (g.chance(0.5) ? [{ kind: 'sandbags', x, z, yaw: a }] : [{ kind: 'logs', x, z, yaw: a }]), {});
    // rotsblokken: losse en groepjes (rotspartijen)
    let rocks = 0;
    for (let t = 0; t < 4000 && rocks < 70; t++) {
      const p = g.randPos(6, 200, 3);
      if (roadDist('snow', p.x, p.z) < 2.5) continue;
      const n = g.chance(0.3) ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const r = g.range(0.9, 2.3);
        const x = p.x + (k ? g.range(-3, 3) : 0), z = p.z + (k ? g.range(-3, 3) : 0);
        if (g.tree({ x, z, r, h: r * 1.25, scale: r, kind: 'boulder' }, k ? 1.3 : 1.6)) rocks++;
      }
    }
    // besneeuwde dennen: dicht op de hellingen, weinig in het dal
    let pines = 0;
    for (let t = 0; t < 8000 && pines < 190; t++) {
      const p = g.randPos(6, 200, 2);
      const dx = Math.abs(p.x - snowRoadX(p.z));
      if (dx < 5 || g.rnd() > 0.12 + 0.88 * smooth01(8, 32, dx)) continue;
      const scale = g.range(0.75, 1.5);
      if (g.tree({ x: p.x, z: p.z, r: 0.4 + scale * 0.18, h: 7, scale, kind: 'snowpine' }, 2.0)) pines++;
    }
  }

  // ---------------------------------------------------------------- verwoest dorp
  function genVillage(g) {
    const TAU = g.TAU;
    // vrij van straten (met marge m)
    const offRoad = (m) => ({
      ok: (f) => {
        const nx = Math.max(1, Math.ceil(f.hx / 1.2)), nz = Math.max(1, Math.ceil(f.hz / 1.2));
        for (let i = -nx; i <= nx; i++) {
          for (let j = -nz; j <= nz; j++) {
            const q = localToWorld(f.x, f.z, f.c, f.s, (f.hx * i) / nx, (f.hz * j) / nz);
            if (villageRoad(q.x, q.z) < m) return false;
          }
        }
        return true;
      },
    });
    // put op het plein, met wat dekking eromheen
    g.place([{ kind: 'well', x: 0, z: 0, yaw: 0 }], { force: true });
    g.scatter(5, 400, () => {
      const a = g.range(0, TAU), r = g.range(5, 9.5), x = Math.sin(a) * r, z = Math.cos(a) * r;
      const u = g.rnd();
      if (u < 0.4) return [{ kind: 'sandbags', x, z, yaw: a }];
      if (u < 0.7) return [{ kind: 'crate', x, z, yaw: g.range(0, TAU), stack: g.chance(0.5) ? 2 : 1 }];
      return [{ kind: 'car', x, z, yaw: a + Math.PI / 2 + g.range(-0.4, 0.4) }];
    }, { gap: 2.0 });
    // kerkruïne (met klokkentoren) tussen twee straten, voorkant naar het midden
    {
      const a = VILLAGE_STREETS[0] + Math.PI / 6, r = 64;
      const cx = Math.sin(a) * r, cz = Math.cos(a) * r, yaw = a;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const P = (lx, lz) => localToWorld(cx, cz, c, s, lx, lz);
      const W = 13, D = 22, T = 0.9, HH = 7.5;
      const grp = [];
      // kerk: dubbele deuren in het portaal en de zijdeur (lateien dragen de deur-gegevens), banken als dekking
      const info = { x: cx, z: cz, yaw, hx: W / 2 - T, hz: D / 2 - T, doors: [], lamps: [], roof: false, kind: 'church' };
      const run = (l1, l2, ops, dmg) => {
        const A = P(l1[0], l1[1]), B = P(l2[0], l2[1]);
        const pcs = g.wallRun(A.x, A.z, B.x, B.z, T, HH, 'stone', ops, dmg);
        for (const o of ops) {
          if (!o.door) continue;
          const spec = g.doorSpec(A, B, o, cx, cz, 'wood');
          const lintel = pcs.find((q) => Math.abs(q.yb - o.holes[0][1]) < 1e-6 && Math.hypot(q.x - spec.x, q.z - spec.z) < 0.3);
          if (lintel) { spec.bld = info; lintel.doorSpecs = [spec]; }
        }
        grp.push(...pcs);
      };
      const tall = (at) => ({ at, w: 1.6, holes: [[2.4, 5.8]] });
      run([-W / 2, -D / 2 + T / 2], [W / 2, -D / 2 + T / 2], [{ at: W / 2, w: 3.2, holes: [[0, 4.2]], door: { leaves: 2 } }], 0);
      run([W / 2 - T / 2, -D / 2 + T], [W / 2 - T / 2, D / 2 - T], [tall(4), { at: 10, w: 2.0, holes: [[0, 2.6]], door: { leaves: 2 } }, tall(16)], 0);
      run([-W / 2 + T / 2, -D / 2 + T], [-W / 2 + T / 2, D / 2 - T], [], 0.8);
      run([W / 2, D / 2 - T / 2], [-W / 2, D / 2 - T / 2], [tall(W / 2)], 0.3);
      // het hele schip als grondvlak, zodat er geen huizen binnen in de kerk komen te staan
      grp[0].fpRect = rectOf(cx, cz, yaw, W / 2, D / 2);
      // kerkbanken (twee rijen met een middenpad), altaar en wat puin langs de kapotte muur
      const cr = mulberry32(5150);
      for (let row = 0; row < 6; row++) {
        for (const sx of [-1, 1]) {
          if (cr() < 0.15) continue;   // een paar banken zijn weg
          const q = P(sx * 2.7, -5.4 + row * 2.2);
          grp.push({ kind: 'pew', x: q.x, z: q.z, yaw: yaw + (cr() - 0.5) * 0.25, noFp: true });
        }
      }
      { const q = P(0, D / 2 - T - 1.6); grp.push({ kind: 'table', x: q.x, z: q.z, yaw, noFp: true }); }
      for (const lz of [-8.3, 7.6]) { const q = P(-W / 2 + T + 1.3, lz); grp.push({ kind: 'rubble', x: q.x, z: q.z, yaw: yaw + 0.3, noFp: true }); }
      // klokkentoren: hol, deur aan de voorkant, ladder naar de klokkenzolder (galmgaten met borstwering)
      const tw = P(-W / 2 + 2.5, -D / 2 - 2.4);
      const bell = [10.4, 11.9];
      grp.push(...g.building({
        x: tw.x, z: tw.z, yaw, hx: 2.5, hz: 2.5, h: 13, t: 0.6, mat: 'stone', kind: 'tower',
        sides: [
          [{ at: 2.5, w: 1.4, holes: [[0, 2.3], bell], door: { kind: 'wood' } }],
          [{ at: 1.9, w: 1.4, holes: [bell] }],
          [{ at: 2.5, w: 1.4, holes: [bell] }],
          [{ at: 1.9, w: 1.4, holes: [bell] }],
        ],
        roof: { t: 0.4 },
        floors: [{ lx: 0, lz: -0.5, hx: 1.9, hz: 1.4, y: 9.6 }, { lx: -0.8, lz: 1.4, hx: 1.1, hz: 0.5, y: 9.6 }],
        ladders: [{ lx: 1.0, lz: 1.86, rot: Math.PI, y0: 0, y1: 9.6, w: 0.6 }],
      }));
      g.place(grp, { force: true });
      // gebouw-gegevens van het schip van de kerk: de lateiplaten verwijzen naar info (zie buildDoorData)
    }
    // huizen: eerst met de voorgevel langs de straten (smalle straten, steegjes ertussen), daarna opvullen
    const mats = ['plaster', 'plaster', 'plaster', 'brick', 'brick', 'stone'];
    const tryHouse = (cx, cz, yaw, w, d) => {
      const h = g.chance(0.35) ? g.range(5.6, 6.4) : g.range(3.0, 3.8);
      const doors = [0];
      if (g.chance(0.5)) doors.push(2);
      if (g.chance(0.3)) doors.push(g.chance(0.5) ? 1 : 3);
      const grp = g.house(cx, cz, yaw, w, d, h, 0.5, g.pick(mats), { doors, ruin: g.range(0.15, 0.95), realDoors: true });
      return g.place(grp, Object.assign({ gap: 1.6 }, offRoad(0.3)));
    };
    for (const a of VILLAGE_STREETS) {
      const ux = Math.sin(a), uz = Math.cos(a), nx = Math.cos(a), nz = -Math.sin(a);
      for (const side of [-1, 1]) {
        let s = 13 + g.range(0, 3);
        while (s < 92) {
          const w = g.range(6, 10), d = g.range(5.5, 8);
          if (g.chance(0.85)) {
            const off = 3.25 + g.range(0.4, 1.2) + d / 2, m = s + w / 2;
            tryHouse(ux * m + nx * side * off, uz * m + nz * side * off, Math.atan2(nx * side, nz * side), w, d);
          }
          s += w + g.range(1.8, 4);
        }
      }
    }
    for (const ring of [[SPAWN_RADIUS, 4, [-1, 1]], [12, 0, [1]]]) {
      for (const side of ring[2]) {
        let th = g.range(0, 0.3);
        while (th < TAU) {
          const w = g.range(6, 10), d = g.range(5.5, 8);
          const R = ring[0] + side * (ring[1] + g.range(0.4, 1.2) + d / 2), mth = th + w / 2 / R;
          const rx = Math.sin(mth), rz = Math.cos(mth);
          if (g.chance(0.85)) tryHouse(rx * R, rz * R, Math.atan2(rx * side, rz * side), w, d);
          th += (w + g.range(1.8, 4)) / R;
        }
      }
    }
    for (let t = 0; t < 3000; t++) {
      const p = g.randPos(14, 200, 4);
      tryHouse(p.x, p.z, Math.atan2(p.x, p.z) + (g.chance(0.7) ? 0 : Math.PI / 2), g.range(6, 10), g.range(5, 7.5));
    }
    // lage tuinmuren
    g.scatter(26, 3000, () => {
      const p = g.randPos(14, 200, 3), yaw = g.range(0, TAU), len = g.range(3.5, 8);
      return g.wallRun(...(function () {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const A = localToWorld(p.x, p.z, c, s, -len / 2, 0), B = localToWorld(p.x, p.z, c, s, len / 2, 0);
        return [A.x, A.z, B.x, B.z];
      })(), 0.45, g.range(1.0, 1.3), 'stone', [], g.chance(0.5) ? 0.4 : 0);
    }, Object.assign({ gap: 1.8 }, offRoad(0.3)));
    // autowrakken, barricades en puin op straat
    const onStreet = (along, lateral) => {
      if (g.chance(0.3)) {
        const a = g.range(0, TAU), r = SPAWN_RADIUS + lateral;
        return { x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: a };    // ringweg (tangentiaal)
      }
      const a = g.pick(VILLAGE_STREETS), d = along;
      const sa = Math.sin(a), ca = Math.cos(a);
      return { x: sa * d + ca * lateral, z: ca * d - sa * lateral, yaw: a + Math.PI / 2 };
    };
    g.scatter(12, 3000, () => {
      const q = onStreet(g.range(16, 88), (g.chance(0.5) ? 1 : -1) * g.range(1.3, 1.9));
      return [{ kind: 'car', x: q.x, z: q.z, yaw: q.yaw + g.range(-0.25, 0.25) }];
    }, { gap: 2.0 });
    g.scatter(14, 3000, () => {
      const q = onStreet(g.range(15, 88), g.range(-2, 2));
      return [{ kind: 'rubble', x: q.x, z: q.z, yaw: g.range(0, TAU) }];
    }, { gap: 1.8 });
    g.scatter(10, 3000, () => {
      const q = onStreet(g.range(15, 88), (g.chance(0.5) ? 1 : -1) * g.range(0.8, 1.6));
      return [{ kind: 'sandbags', x: q.x, z: q.z, yaw: q.yaw + Math.PI / 2 + g.range(-0.2, 0.2) }];
    }, { gap: 1.8 });
    g.scatter(12, 3000, () => {
      const p = g.randPos(10, 200, 3);
      return [{ kind: 'crate', x: p.x, z: p.z, yaw: g.range(0, TAU), stack: g.chance(0.25) ? 2 : 1 }];
    }, { gap: 1.8 });
    g.scatter(8, 3000, () => { const p = g.randPos(10, 200, 3); return [{ kind: 'barrel', x: p.x, z: p.z }]; }, { gap: 1.6 });
    // een paar bomen aan de rand
    let trees = 0;
    for (let t = 0; t < 3000 && trees < 30; t++) {
      const p = g.randPos(55, 200, 3);
      if (villageRoad(p.x, p.z) < 1.5) continue;
      const scale = g.range(0.7, 1.3);
      if (g.tree({ x: p.x, z: p.z, r: 0.45 + scale * 0.2, h: 6, scale, kind: 'pine' }, 2.0)) trees++;
    }
  }

  // ---------------------------------------------------------------- haven bij nacht
  function genHarbour(g) {
    const TAU = g.TAU;
    const stackFn = () => { const u = g.rnd(); return u < 0.45 ? 1 : u < 0.85 ? 2 : 3; };
    // twee portaalkranen op de kade, met een container eronder
    for (const x of [-34, 36]) {
      g.place([{ kind: 'crane', x, z: 84, yaw: 0 }, { kind: 'container', x, z: 84, yaw: 0, stack: 1 + (x > 0 ? 1 : 0) }], { force: true });
    }
    // loods A (open, met dak), loods B (massief), kantoor
    {
      const cx = -52, cz = -50, W = 36, D = 18, H = 8, T = 0.5;
      const big = (at, w) => ({ at, w, holes: [[0, 5.2]] });
      const grp = [];
      grp.push(...g.wallRun(cx - W / 2, cz - D / 2 + T / 2, cx + W / 2, cz - D / 2 + T / 2, T, H, 'metal', [big(10, 6), big(26, 3)], 0));
      grp.push(...g.wallRun(cx + W / 2, cz + D / 2 - T / 2, cx - W / 2, cz + D / 2 - T / 2, T, H, 'metal', [big(12, 6)], 0));
      grp.push(...g.wallRun(cx - W / 2 + T / 2, cz - D / 2 + T, cx - W / 2 + T / 2, cz + D / 2 - T, T, H, 'metal', [big((D - 2 * T) / 2, 7)], 0));
      grp.push(...g.wallRun(cx + W / 2 - T / 2, cz + D / 2 - T, cx + W / 2 - T / 2, cz - D / 2 + T, T, H, 'metal', [big((D - 2 * T) / 2, 7)], 0));
      const roof = g.box(cx, cz, 0, W / 2 + 0.3, D / 2 + 0.3, 0.4, 'roof', H);
      roof.noFp = true;
      grp.push(roof);
      g.place(grp, { force: true });
      // inhoud: containers en pallets
      g.place([{ kind: 'container', x: cx - 9, z: cz + 3.5, yaw: 0, stack: 2 }, { kind: 'container', x: cx - 9, z: cz + 1.04, yaw: 0, stack: 1 }], { gap: 2.5, padGap: 0 });
      g.place([{ kind: 'container', x: cx + 8, z: cz - 2.5, yaw: Math.PI / 2, stack: 1 }], { gap: 2.5, padGap: 0 });
      g.place([{ kind: 'crate', x: cx + 1, z: cz + 4, yaw: 0.1, stack: 2 }, { kind: 'crate', x: cx + 2.15, z: cz + 4, yaw: 0, stack: 1 }], { gap: 2.0, padGap: 0 });
      g.place([{ kind: 'crate', x: cx - 1, z: cz - 4.5, yaw: 0.4, stack: 1 }], { gap: 2.0, padGap: 0 });
      g.place([{ kind: 'crate', x: cx + 13, z: cz + 5, yaw: 0.0, stack: 2 }], { gap: 2.0, padGap: 0 });
    }
    {
      // loods B: hol, roldeuren aan beide korte kanten, een loopdeur en hoge ramen; kantoren met deur en ramen
      const hw = [6.4, 7.4], hwin = (at) => ({ at, w: 2.4, holes: [hw] });
      const roll = { at: 7.5, w: 5.5, holes: [[0, 5.2]], door: { kind: 'roll' } };
      const b = g.building({
        x: 56, z: -52, yaw: 0, hx: 15, hz: 8, h: 9, t: 0.5, mat: 'metal', kind: 'warehouse',
        sides: [
          [hwin(4), { at: 10, w: 1.4, holes: [[0, 2.2]], door: { kind: 'metal' } }, hwin(16), hwin(22), hwin(27)],
          [roll],
          [hwin(5), hwin(11), hwin(19), hwin(25)],
          [roll],
        ],
        roof: { t: 0.4 },
        items: [
          { kind: 'container', lx: -8, lz: 4.6, stack: 2 }, { kind: 'container', lx: 2, lz: 4.6 },
          { kind: 'crate', lx: 9, lz: -5, stack: 2 }, { kind: 'crate', lx: 10.2, lz: -5.3 },
          { kind: 'crate', lx: 0.5, lz: -5.5, yaw: 0.4 }, { kind: 'barrel', lx: -10, lz: -5.8 }, { kind: 'barrel', lx: -9.4, lz: -6.1 },
          { kind: 'shelf', lx: 12, lz: 7.1, yaw: Math.PI }, { kind: 'shelf', lx: 13.3, lz: 7.1, yaw: Math.PI },
        ],
        lamps: [[-9, 7.7, 0], [0, 7.7, 0], [9, 7.7, 0], [15.7, 5.6, 0, 1], [-15.7, 5.6, 0, 1]],
      });
      g.place(b, { gap: 3 });
      g.place(g.hut(6, -82, 0, 5.5, 3.2, 4.2, 'office'), { gap: 3 });
      g.place(g.hut(-80, 20, Math.PI / 2, 5, 3, 3.6, 'office'), { gap: 3 });
    }
    // containerblokken met looppaden ertussen (plein in het midden blijft open)
    g.scatter(20, 4000, () => {
      const p = g.randPos(14, 200, 6), yaw = g.chance(0.5) ? 0 : Math.PI / 2;
      const rows = 1 + Math.floor(g.rnd() * 3), cols = 1 + Math.floor(g.rnd() * 4);
      return g.containerBlock(p.x, p.z, yaw, rows, cols, stackFn);
    }, { gap: 3.2 });
    g.scatter(8, 2000, () => { const p = g.randPos(14, 200, 4); return g.containerGroup(p.x, p.z, g.range(0, TAU)); }, { gap: 2.4 });
    // lantaarnpalen langs de paden (niet in de open loods)
    const shed = rectOf(-52, -50, 0, 18.5, 9.5);
    for (let gx = -81; gx <= 81; gx += 18) {
      for (let gz = -81; gz <= 81; gz += 18) {
        for (let t = 0; t < 8; t++) {
          const x = gx + g.range(-5, 5), z = gz + g.range(-5, 5);
          if (g.place([{ kind: 'lamp', x, z, yaw: g.range(0, TAU) }], { gap: 1.4, ok: (f) => rectDist(f, shed) > 2 })) break;
        }
      }
    }
    // betonblokken, pallets, vaten, een paar zandzakken
    g.scatter(12, 3000, () => { const p = g.randPos(6, 200, 3); return g.row('jersey', p.x, p.z, g.range(0, TAU), 2 + Math.floor(g.rnd() * 3), 2.02); }, {});
    g.scatter(18, 3000, () => {
      const p = g.randPos(5, 200, 3);
      return [{ kind: 'crate', x: p.x, z: p.z, yaw: g.range(0, TAU), stack: g.chance(0.35) ? 2 : 1 }];
    }, {});
    g.scatter(12, 3000, () => {
      const p = g.randPos(6, 200, 3), n = 1 + Math.floor(g.rnd() * 4);
      const out = [];
      for (let i = 0; i < n; i++) out.push({ kind: 'barrel', x: p.x + (i % 2) * 0.64, z: p.z + Math.floor(i / 2) * 0.64 });
      return out;
    }, {});
    g.scatter(5, 2000, () => { const p = g.randPos(8, 200, 3); return g.sandbagNest(p.x, p.z, g.range(0, TAU)); }, {});
    g.coverNearPads((x, z, a) => (g.chance(0.6) ? g.row('jersey', x, z, a + Math.PI / 2, 2, 2.02) : [{ kind: 'crate', x, z, yaw: a, stack: 2 }]), {});
  }

  // ---------------------------------------------------------------- mes, medkit, finisher (server-gezag)
  // Inventaris: slot 0 = hoofdwapen, 1 = mes, 2 = medkit.
  const MELEE = { RANGE: 2.15, CONE: 0.48, DMG: 65, BACKSTAB: 100, COOLDOWN: 0.28, SPEED: 2.0, BACK: 2.0, DOOR_DMG: 10 };
  const MEDKIT = { MS: 1500, HEAL: 60, MOVE: 0.5 };
  const FINISH = { RANGE: 2.2, DY: 0.6, HP: 35, MS: 1350, HEAL: 15, FACE: 1.2 };
  function angWrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  // Staat a achter v? (hoek tussen de kijkrichting van v en de richting v -> a groter dan MELEE.BACK)
  function isBehind(a, v) {
    return Math.abs(angWrap(Math.atan2(a.x - v.x, a.z - v.z) - (v.yaw || 0))) > MELEE.BACK;
  }
  // Mes-steek van speler a (met kijkrichting yaw) op kandidaten (levend, niet a zelf).
  // 3D-afstand tussen de borsten (houding/hoogte), kegel ~50 graden (+ breedte van het lichaam),
  // vrije lijn (ook deuren). Geeft { v, back, dmg } van het dichtstbijzijnde doel of null.
  function meleeTarget(levelId, a, yaw, list) {
    let best = null, bd = Infinity;
    const ay = a.y + MOVE.CHEST[a.stance | 0];
    for (const v of list) {
      if (v === a || !v.alive) continue;
      const vy = v.y + MOVE.CHEST[v.stance | 0];
      const dx = v.x - a.x, dz = v.z - a.z, dy = vy - ay;
      const dh = Math.hypot(dx, dz), d3 = Math.hypot(dh, dy);
      if (d3 > MELEE.RANGE || d3 >= bd) continue;
      if (dh > 0.3) {
        const tol = MELEE.CONE + Math.atan2(PLAYER_RADIUS, dh);
        if (Math.abs(angWrap(Math.atan2(dx, dz) - yaw)) > tol) continue;
      }
      if (d3 > 0.3) {
        const o = { x: a.x, y: ay + 0.2, z: a.z };
        const dir = { x: dx / d3, y: (vy - o.y) / d3, z: dz / d3 };
        const l = Math.hypot(dir.x, dir.y, dir.z);
        dir.x /= l; dir.y /= l; dir.z /= l;
        if (levelId && rayBlockDistance(levelId, o, dir, d3) < d3 - 0.25) continue;
      }
      bd = d3; best = v;
    }
    if (!best) return null;
    const back = isBehind(a, best);
    return { v: best, back, dmg: back ? MELEE.BACKSTAB : MELEE.DMG };
  }
  // Mag a een finisher op v doen? (afstand, hoogte, laag hp of van achteren, a kijkt ongeveer naar v)
  function canFinish(a, v) {
    if (!a || !v || a === v || !a.alive || !v.alive) return false;
    const dx = v.x - a.x, dz = v.z - a.z;
    const dh = Math.hypot(dx, dz);
    if (dh > FINISH.RANGE || Math.abs((v.y || 0) - (a.y || 0)) > FINISH.DY) return false;
    if (dh > 0.3 && Math.abs(angWrap(Math.atan2(dx, dz) - (a.yaw || 0))) > FINISH.FACE) return false;
    return v.hp <= FINISH.HP || isBehind(a, v);
  }

  return {
    MELEE, MEDKIT, FINISH, isBehind, meleeTarget, canFinish,
    MAP_HALF, MAX_PLAYERS, PLAYER_RADIUS,
    WEAPONS, WEAPON_IDS, pelletDamage, MODES, MODE_IDS, modeOf, FINISHERS, FINISHER_IDS, SKINS, LEVELS, TINTS,
    SKIN_IDS, skinById,
    clamp, heightAt, getObstacles, resolveCollision,
    PROP_DIMS, blockedByProp,
    rayBlockDistance, rayHitPlayer, aimPoint, spawnPoint,
    roadDist, isClear, spawnPads,
    // verticale beweging (springen, hurken, liggen, klimmen)
    MOVE, STANCES, stanceIndex, supportHeight, collideY, ceilingAt, canStance,
    ladderAt, ladderPos, ladderInfo, stepPlayer, validateState,
    // gebouwen en deuren
    DOOR_HP, DOOR_USE_DIST, DOOR_SERVER_DIST, CABIN,
    setDoorState, newDoorState, leafPieces, rayDoorHit, doorUse, doorSweepBlocked, nearestDoor,
    insideBuilding, buildingSpots, doorRoute,
  };
});
