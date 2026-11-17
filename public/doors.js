/*
 * Deuren, ladders en lampen in gebouwen (client).
 * De wereld (obs.doors / obs.buildings / obs.ladders) komt uit shared.js, de toestand van de deuren van de server:
 *   round: { doors: [[toestand, hp], ...] }   (toestand 0 = dicht, 1 = open naar binnen, 2 = open naar buiten, 3 = kapot)
 *   door:  { id, s, hp, by?, p?: [x, y, z] (inslag), deny?: 1 (alleen naar de aanvrager) }
 * Client -> server: { t: 'door', id }   (E / DEUR-knop / VR A, alleen levend en dichtbij)
 *
 * Alles wat vaak voorkomt is Ã©Ã©n InstancedMesh (deurbladen per model, lantaarns, splinters): weinig draw calls.
 */

const SWING_TIME = 0.3;     // s, openen/dichtgaan
const ROLL_TIME = 0.9;      // s, roldeur
const USE_COOLDOWN = 280;   // ms tussen twee deur-acties

const TEXT = {
  nl: { doorOpen: 'Deur openen', doorClose: 'Deur sluiten', doorBtn: 'DEUR', doorBlocked: 'Er staat iemand in de weg', doorRoll: 'Roldeur' },
  en: { doorOpen: 'Open door', doorClose: 'Close door', doorBtn: 'DOOR', doorBlocked: 'Someone is in the way', doorRoll: 'Roll-up door' },
};

export function initDoors(ctx) {
  const { THREE, S, scene, camera, MODELS, LOW, send, I18N, t, getAudio, puff, levelTex, getMe, getPhase, hud } = ctx;
  for (const l in TEXT) Object.assign(I18N[l] || (I18N[l] = {}), TEXT[l]);

  let levelId = null, obs = null, doors = [];
  let st = null;                       // gedeeld met shared.js (setDoorState)
  let cur = new Float32Array(0);       // huidige stand per deur: -1..1 (draai, + = naar binnen) of 0..1 (rol)
  let flash = new Float32Array(0);     // oplichten na een treffer
  let dirty = new Uint8Array(0);
  const slots = [];                    // per deur: [{ mesh-groep, index }] per blad
  let groups = {};                     // kind -> { meshes: [InstancedMesh], count }
  let housing = null;                  // rolluik-kasten
  let lights = [], lamps = [], nextLight = 0;
  let nearId = -1, lastUse = 0, uiKey = '', denyUntil = 0;

  // ---------------------------------------------------------------- UI
  const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const hint = document.createElement('div');
  hint.id = 'doorHint';
  hint.className = 'hidden';
  hud.appendChild(hint);
  const btn = document.createElement('button');
  btn.id = 'doorBtn';
  btn.className = 'hidden';
  hud.appendChild(btn);
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    tryUse(getMe());
  });

  // ---------------------------------------------------------------- geluid (zelf gemaakt)
  function vol(x, z, base) {
    const d = Math.hypot(x - camera.position.x, z - camera.position.z);
    return base * Math.max(0.04, Math.min(1, 1.2 - d / 40));
  }
  function noise(a, dur, v, type, freq, q, delay) {
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = a.createGain(); g.gain.value = v;
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(a.currentTime + (delay || 0));
  }
  function tone(a, type, f0, f1, dur, v, delay) {
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function creak(v) {
    const a = getAudio(); if (!a) return;
    const t0 = a.currentTime;
    const o = a.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 + Math.random() * 30, t0);
    o.frequency.linearRampToValueAtTime(165 + Math.random() * 40, t0 + 0.16);
    o.frequency.linearRampToValueAtTime(90, t0 + 0.4);
    const lfo = a.createOscillator(); lfo.frequency.value = 19 + Math.random() * 8;
    const lg = a.createGain(); lg.gain.value = 28;
    lfo.connect(lg); lg.connect(o.frequency);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 5;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    o.connect(bp); bp.connect(g); g.connect(a.destination);
    o.start(t0); lfo.start(t0); o.stop(t0 + 0.45); lfo.stop(t0 + 0.45);
  }
  function thunk(v, delay) {
    const a = getAudio(); if (!a) return;
    noise(a, 0.09, v * 0.9, 'lowpass', 600, 0, delay);
    tone(a, 'sine', 85, 45, 0.14, v * 0.8, delay);
  }
  function rattle(v) {
    const a = getAudio(); if (!a) return;
    for (let i = 0; i < 9; i++) noise(a, 0.07, v * (0.5 + Math.random() * 0.3), 'bandpass', 1500 + Math.random() * 900, 3, i * 0.085);
    thunk(v * 0.7, 0.8);
  }
  function hitSound(v, metal) {
    const a = getAudio(); if (!a) return;
    if (metal) { tone(a, 'triangle', 900 + Math.random() * 300, 500, 0.12, v * 0.5); noise(a, 0.05, v * 0.6, 'highpass', 2500); return; }
    noise(a, 0.06, v, 'lowpass', 1900);
    tone(a, 'sine', 170, 90, 0.08, v * 0.7);
  }
  function crack(v, metal) {
    const a = getAudio(); if (!a) return;
    noise(a, 0.45, v, 'lowpass', metal ? 4000 : 2400);
    for (let i = 0; i < 6; i++) noise(a, 0.04, v * 0.7, 'bandpass', 1200 + Math.random() * 2000, 2, 0.02 + Math.random() * 0.25);
    tone(a, 'sine', 70, 35, 0.35, v);
  }

  // ---------------------------------------------------------------- splinters (Ã©Ã©n InstancedMesh, hergebruikt)
  const SPL_N = LOW ? 60 : 120;
  const splGeo = new THREE.BoxGeometry(0.035, 0.035, 0.2);
  const splMat = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.9 });
  const splMesh = new THREE.InstancedMesh(splGeo, splMat, SPL_N);
  splMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  splMesh.frustumCulled = false;
  splMesh.count = 0;
  scene.add(splMesh);
  const spl = [];
  for (let i = 0; i < SPL_N; i++) spl.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), g: 0 });
  let splNext = 0;
  const tmpO = new THREE.Object3D(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
  function splinters(x, y, z, n, nx, nz, ground, color) {
    for (let i = 0; i < n; i++) {
      const s = spl[splNext]; splNext = (splNext + 1) % SPL_N;
      s.life = 1.3 + Math.random() * 0.9;
      s.p.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.5);
      const side = Math.random() < 0.5 ? -1 : 1;
      s.v.set(nx * side * (1 + Math.random() * 3) + (Math.random() - 0.5) * 2.5, 1 + Math.random() * 3.5, nz * side * (1 + Math.random() * 3) + (Math.random() - 0.5) * 2.5);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      s.g = ground;
      s.sc = 0.6 + Math.random() * 0.9;
    }
    if (color !== undefined) splMat.color.setHex(color);
  }
  function updateSplinters(dt) {
    let n = 0;
    for (let i = 0; i < SPL_N; i++) {
      const s = spl[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.p.y > s.g + 0.02) {
        s.v.y -= 9.8 * dt;
        s.p.addScaledVector(s.v, dt);
        s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
        if (s.p.y < s.g + 0.02) { s.p.y = s.g + 0.02; s.r.x = Math.PI / 2; s.r.z = 0; }
      }
      tmpO.position.copy(s.p);
      tmpO.rotation.copy(s.r);
      tmpO.scale.setScalar(s.life > 0.3 ? s.sc : s.sc * s.life / 0.3);
      tmpO.updateMatrix();
      splMesh.setMatrixAt(n++, tmpO.matrix);
    }
    splMesh.count = n;
    if (n) splMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- opbouw per level
  function bakedParts(root) {
    const parts = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      parts.push({ geometry: geo, material: o.material });
    });
    return parts;
  }
  function instGroup(g, parts, count) {
    const meshes = parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geometry, p.material, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = !LOW; m.receiveShadow = true;
      m.frustumCulled = false;   // bladen bewegen; de bounding sphere zou steeds opnieuw moeten
      for (let i = 0; i < count; i++) m.setColorAt(i, tmpC.setRGB(1, 1, 1));
      g.add(m);
      return m;
    });
    return { meshes };
  }
  // Doosjes samenvoegen tot Ã©Ã©n geometrie (ladders, rolluik-kasten).
  function mergeBoxes(list) {
    const pos = [], nor = [], uv = [], idx = [];
    for (const b of list) {
      const geo = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
      tmpO.position.set(b.x, b.y, b.z); tmpO.rotation.set(0, b.ry || 0, 0); tmpO.scale.set(1, 1, 1); tmpO.updateMatrix();
      geo.applyMatrix4(tmpO.matrix);
      const base = pos.length / 3;
      pos.push(...geo.attributes.position.array); nor.push(...geo.attributes.normal.array); uv.push(...geo.attributes.uv.array);
      for (const i of geo.index.array) idx.push(base + i);
      geo.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  function build(g, id, o) {
    levelId = id; obs = o; doors = o.doors || [];
    groups = {}; slots.length = 0; lights = []; lamps = [];
    cur = new Float32Array(doors.length); flash = new Float32Array(doors.length); dirty = new Uint8Array(doors.length).fill(1);
    if (!st || st.level !== id || st.s.length !== doors.length) st = S.newDoorState(id);
    let ok = true;
    // deurbladen: per soort Ã©Ã©n InstancedMesh per onderdeel van het model
    const need = { wood: 0, metal: 0, roll: 0 };
    for (const d of doors) need[d.kind] += d.leaves;
    const src = { wood: MODELS.door, metal: MODELS.door_metal };
    for (const k of ['wood', 'metal']) {
      if (!need[k]) continue;
      if (!src[k]) { ok = false; continue; }
      groups[k] = instGroup(g, bakedParts(src[k]), need[k]);
      groups[k].count = 0;
    }
    if (need.roll) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0.5, 0);
      const uvA = geo.attributes.uv;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 2.2, uvA.getY(i) * 2.0);
      const mat = new THREE.MeshStandardMaterial({ map: levelTex('metal'), color: 0x9aa3a8, roughness: 0.6, metalness: 0.45 });
      const grp = instGroup(g, [{ geometry: geo, material: mat }], need.roll);
      grp.meshes[0].userData.ownMat = true;
      groups.roll = grp; grp.count = 0;
      const boxes = [];
      for (const d of doors) {
        if (d.kind !== 'roll') continue;
        boxes.push({ x: d.x + d.nx * 0.35, y: d.y1 - 0.25, z: d.z + d.nz * 0.35, sx: d.w + 0.3, sy: 0.5, sz: 0.5, ry: Math.atan2(-d.uz, d.ux) });
      }
      housing = new THREE.Mesh(mergeBoxes(boxes), new THREE.MeshStandardMaterial({ color: 0x5b6266, roughness: 0.6, metalness: 0.5 }));
      housing.userData.ownGeo = true;
      housing.castShadow = !LOW;
      g.add(housing);
    }
    for (const d of doors) {
      const gr = groups[d.kind];
      const s = [];
      for (let k = 0; k < d.leaves; k++) s.push(gr ? gr.count++ : -1);
      slots.push(s);
    }
    // ladders (binnen in gebouwen; de torenladders zitten in het torenmodel)
    const lad = [];
    for (const L of o.ladders || []) {
      if (L.kind !== 'ladder') continue;
      const ry = L.rot + Math.PI / 2, ox = Math.sin(L.rot) * 0.06, oz = Math.cos(L.rot) * 0.06;
      const px = Math.cos(L.rot), pz = -Math.sin(L.rot);   // haaks op de buitenrichting (langs de muur)
      const h = L.topY - L.bottomY + 0.9;
      for (const sd of [-1, 1]) lad.push({ x: L.x + ox + px * sd * L.width / 2, y: L.bottomY + h / 2, z: L.z + oz + pz * sd * L.width / 2, sx: 0.06, sy: h, sz: 0.07, ry });
      for (let y = L.bottomY + 0.28; y < L.topY + 0.6; y += 0.3) lad.push({ x: L.x + ox, y, z: L.z + oz, sx: L.width, sy: 0.04, sz: 0.05, ry });
    }
    if (lad.length) {
      const m = new THREE.Mesh(mergeBoxes(lad), new THREE.MeshStandardMaterial({ color: 0x6b4d30, roughness: 0.9 }));
      m.userData.ownGeo = true; m.userData.ownMat = true;
      m.castShadow = !LOW; m.receiveShadow = true;
      g.add(m);
    }
    // lantaarns + koord, en een pool van een paar warme lampjes (niet in de haven: die heeft al een lampenpool)
    const heads = [];
    for (const b of o.buildings || []) for (const L of b.lamps) { lamps.push(L); heads.push({ x: L.x, y: L.y + 0.1, z: L.z, lamp: true, inside: !L.out }); }
    const inside = lamps.filter((L) => !L.out);
    if (inside.length) {
      if (MODELS.lantern) {
        const parts = bakedParts(MODELS.lantern);
        for (const p of parts) {
          const m = new THREE.InstancedMesh(p.geometry, p.material, inside.length);
          inside.forEach((L, i) => { tmpO.position.set(L.x, L.y - 0.12, L.z); tmpO.rotation.set(0, i * 0.7, 0); tmpO.scale.setScalar(L.y - (bFloor(L)) > 1.6 ? 1.25 : 1); tmpO.updateMatrix(); m.setMatrixAt(i, tmpO.matrix); });
          m.computeBoundingSphere();
          g.add(m);
        }
      } else ok = false;
      const cords = inside.filter((L) => L.y - bFloor(L) > 1.6).map((L) => ({ x: L.x, y: L.y + 0.4, z: L.z, sx: 0.015, sy: 0.5, sz: 0.015 }));
      if (cords.length) {
        const m = new THREE.Mesh(mergeBoxes(cords), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        m.userData.ownGeo = true; m.userData.ownMat = true;
        g.add(m);
      }
    }
    const outs = lamps.filter((L) => L.out);
    if (outs.length) {
      const m = new THREE.Mesh(mergeBoxes(outs.map((L) => ({ x: L.x, y: L.y + 0.1, z: L.z, sx: 0.5, sy: 0.18, sz: 0.5 }))), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      m.userData.ownGeo = true; m.userData.ownMat = true;
      g.add(m);
    }
    if (id !== 'harbour' && inside.length) {
      for (let i = 0; i < (LOW ? 1 : 2); i++) {
        const L = new THREE.PointLight(0xffa64d, 0, 8, 2);
        L.position.set(inside[0].x, inside[0].y + 0.1, inside[0].z);
        g.add(L);
        lights.push(L);
      }
    }
    nextLight = 0;
    applyAll();
    return { ok, heads: id === 'harbour' ? heads : [] };
  }
  function bFloor(L) {
    const i = S.insideBuilding(levelId, L.x, L.z, 0.2);
    return i >= 0 ? obs.buildings[i].base : L.y - 1;
  }

  // ---------------------------------------------------------------- tekenen van de bladen
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function placeDoor(i) {
    const d = doors[i], gr = groups[d.kind];
    if (!gr) return;
    const s = st ? st.s[i] : 0;
    const k = st ? st.hp[i] / d.hp : 1;
    const f = flash[i];
    const c = (0.42 + 0.58 * Math.max(0, k)) * (1 + f * 1.6);
    tmpC.setRGB(c, c * (1 - f * 0.15), c * (1 - f * 0.35));
    if (d.kind === 'roll') {
      const j = slots[i][0];
      let m;
      if (s === 3) m = zero;
      else {
        const o = Math.max(0, Math.min(1, cur[i]));
        const h = (d.y1 - d.y0) * (1 - o) + 0.08;
        tmpO.position.set(d.x, d.y1 - h, d.z);
        tmpO.rotation.set(0, Math.atan2(-d.uz, d.ux), 0);
        tmpO.scale.set(d.w, h, d.t);
        tmpO.updateMatrix();
        m = tmpO.matrix;
      }
      for (const mesh of gr.meshes) { mesh.setMatrixAt(j, m); mesh.setColorAt(j, tmpC); }
      return;
    }
    const pcs = s === 3 ? null : S.leafPieces(d, cur[i] >= 0 ? 1 : 2, Math.abs(cur[i]));
    for (let k2 = 0; k2 < d.leaves; k2++) {
      const j = slots[i][k2];
      let m = zero;
      if (pcs) {
        const lf = pcs[k2];
        tmpO.position.set(lf.hinge.x, d.y0, lf.hinge.z);
        tmpO.rotation.set(0, Math.atan2(-lf.dir.z, lf.dir.x), 0);
        tmpO.scale.set(lf.len, (d.y1 - d.y0) / 2, 1);
        tmpO.updateMatrix();
        m = tmpO.matrix;
      }
      for (const mesh of gr.meshes) { mesh.setMatrixAt(j, m); mesh.setColorAt(j, tmpC); }
    }
  }
  function targetOf(i) {
    const s = st ? st.s[i] : 0;
    if (doors[i].kind === 'roll') return s === 1 ? 1 : 0;
    return s === 1 ? 1 : s === 2 ? -1 : 0;
  }
  function flushMeshes() {
    for (const k in groups) for (const m of groups[k].meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  function applyAll() {
    for (let i = 0; i < doors.length; i++) { cur[i] = targetOf(i); placeDoor(i); }
    flushMeshes();
  }

  // ---------------------------------------------------------------- berichten
  function onRound(m) {
    if (!obs) return;
    st = S.newDoorState(levelId);
    if (Array.isArray(m.doors)) {
      m.doors.forEach((a, i) => {
        if (i >= st.s.length || !Array.isArray(a)) return;
        st.s[i] = a[0] | 0; st.hp[i] = +a[1];
      });
    }
    S.setDoorState(st);
    flash.fill(0);
    applyAll();
  }
  function onMessage(m) {
    if (!st || !doors[m.id]) return;
    const i = m.id, d = doors[i];
    if (m.deny) {
      denyUntil = performance.now() + 1200;
      thunk(0.25);
      return;
    }
    const prevS = st.s[i], prevHp = st.hp[i];
    st.s[i] = m.s | 0;
    st.hp[i] = +m.hp;
    const metal = d.kind !== 'wood';
    const cx = d.x, cy = d.y0 + (d.y1 - d.y0) * 0.5, cz = d.z;
    if (st.hp[i] < prevHp && st.s[i] !== 3) {
      flash[i] = 1;
      const p = Array.isArray(m.p) ? m.p : [cx, cy, cz];
      hitSound(vol(p[0], p[2], 0.35), metal);
      splinters(p[0], p[1], p[2], metal ? 2 : 4, d.nx, d.nz, d.y0, metal ? 0x6f7779 : 0x8a6440);
    }
    if (st.s[i] === 3 && prevS !== 3) {
      crack(vol(cx, cz, 0.6), metal);
      splinters(cx, cy, cz, metal ? 14 : 28, d.nx, d.nz, d.y0, metal ? 0x6f7779 : 0x8a6440);
      if (puff) for (let k = 0; k < 4; k++) puff(new THREE.Vector3(cx + (Math.random() - 0.5) * d.w, d.y0 + 0.3 + Math.random() * 1.6, cz));
    } else if (st.s[i] !== prevS) {
      const v = vol(cx, cz, 0.3);
      if (d.kind === 'roll') rattle(v);
      else { creak(v); if (st.s[i] === 0) thunk(v * 1.2, SWING_TIME * 0.9); }
    }
    dirty[i] = 1;
  }

  // ---------------------------------------------------------------- gebruiken
  function canUse(me) {
    const ph = getPhase();
    return !!me && me.alive && !!obs && doors.length > 0 && (ph === 'playing' || ph === 'between');
  }
  function tryUse(me) {
    if (!canUse(me)) return false;
    const id = S.nearestDoor(levelId, me.x, me.z, me.yaw, 0, me.y);
    if (id < 0) return false;
    const now = performance.now();
    if (now - lastUse < USE_COOLDOWN) return true;
    lastUse = now;
    send({ t: 'door', id });
    return true;
  }

  // ---------------------------------------------------------------- per frame
  function update(me, dt, now) {
    updateSplinters(dt);
    if (!obs) return;
    let any = false;
    for (let i = 0; i < doors.length; i++) {
      const tg = targetOf(i);
      const sp = dt / (doors[i].kind === 'roll' ? ROLL_TIME : SWING_TIME);
      if (cur[i] !== tg) {
        const dlt = tg - cur[i];
        cur[i] = Math.abs(dlt) <= sp ? tg : cur[i] + Math.sign(dlt) * sp;
        dirty[i] = 1;
      }
      if (flash[i] > 0) { flash[i] = Math.max(0, flash[i] - dt * 6); dirty[i] = 1; }
      if (dirty[i]) { placeDoor(i); dirty[i] = 0; any = true; }
    }
    if (any) flushMeshes();
    // warme lampjes naar de dichtstbijzijnde lantaarns binnen (4x per seconde)
    if (lights.length && now >= nextLight) {
      nextLight = now + 250;
      const cx = camera.position.x, cz = camera.position.z;
      const near = lamps.filter((L) => !L.out).map((L) => [Math.hypot(L.x - cx, L.z - cz), L]).sort((a, b) => a[0] - b[0]);
      lights.forEach((Lt, k) => {
        const e = near[k];
        if (!e || e[0] > 32) { Lt.intensity = 0; Lt.userData.base = 0; return; }
        Lt.position.set(e[1].x, e[1].y + 0.12, e[1].z);
        Lt.userData.base = 7 * Math.min(1, (32 - e[0]) / 8);
      });
    }
    for (const Lt of lights) if (Lt.userData.base) Lt.intensity = Lt.userData.base * (0.92 + 0.08 * Math.sin(now * 0.013 + Lt.id));
    // hint / knop
    nearId = canUse(me) ? S.nearestDoor(levelId, me.x, me.z, me.yaw, 0, me.y) : -1;
    let key = '';
    if (nearId >= 0) {
      const s = st ? st.s[nearId] : 0;
      const label = performance.now() < denyUntil ? t('doorBlocked') : (s === 0 ? t('doorOpen') : t('doorClose'));
      key = (COARSE ? 'b|' : 'h|') + label;
    }
    if (key !== uiKey) {
      uiKey = key;
      const show = !!key, touch = COARSE || document.body.classList.contains('touch-used');
      hint.classList.toggle('hidden', !show || touch);
      btn.classList.toggle('hidden', !show || !touch);
      if (show) {
        const label = key.slice(2);
        hint.innerHTML = '<kbd>E</kbd> ' + label;
        btn.textContent = t('doorBtn');
        btn.title = label;
      }
    }
  }

  function clearFx() {
    for (const s of spl) s.life = 0;
    splMesh.count = 0;
    uiKey = 'x';
    hint.classList.add('hidden'); btn.classList.add('hidden');
  }

  return {
    build, onRound, onMessage, update, tryUse, clearFx,
    get state() { return st; }, get nearId() { return nearId; }, get doors() { return doors; },
  };
}
