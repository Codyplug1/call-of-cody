import * as THREE from 'three';
import * as Settings from './settings.js';
import * as FC from './fps-core.js';

/* ============================================================
 * [FPS] Eerste-persoonscamera (pc + telefoon; VR heeft een eigen eerste persoon in vr.js).
 *
 * - Wisselen: toets V, de camera-knop rechtsboven (touch) of Instellingen > Camera.
 *   De keuze staat in cc_settings (settings.camera = 'third' | 'first'), standaard derde persoon.
 * - Camera op ooghoogte (S.MOVE.EYE per houding, zacht), eigen lichaam verborgen.
 * - Viewmodel: het eigen wapen (glb of gunMesh-noodvorm) + handschoenen/onderarmen in de kleuren
 *   van de skin. Het staat in een eigen scene met een eigen camera (vaste FOV, near 1 cm) en wordt
 *   na de wereld getekend met een gewiste dieptebuffer: het steekt dus nooit door muren.
 * - Uitgeschakeld/meekijken of in VR: gewoon de bestaande derde-persoonscamera.
 *
 * game.js roept alleen deze haakjes aan (zoek in game.js op "[FPS]"):
 *   initFps(ctx)                       - eenmalig, vóór Settings.init (voegt teksten toe aan I18N)
 *   fps.update(me, focus, eye, d, dt)  - in updateCamera; true = camera geplaatst (eerste persoon)
 *   fps.shotOrigin()                   - in tryFire: schietpunt = oog (of null)
 *   fps.onFire(weaponId)               - in tryFire na het versturen: terugslag + mondingsvuur
 *   fps.ownShotStart(start)            - bij een eigen 'shot': spoor vanaf de viewmodel-loop
 *   fps.render()                       - na renderer.render(scene, camera)
 *   fps.toggle()                       - toets V
 * ============================================================ */

const $ = (id) => document.getElementById(id);

export function initFps(ctx) {
  const { renderer, camera, S } = ctx;
  // teksten (instellingen, besturingshulp, knop) aan de I18N-tabel van game.js toevoegen
  if (ctx.I18N) for (const l of Object.keys(FC.FPS_TEXT)) ctx.I18N[l] = Object.assign(ctx.I18N[l] || {}, FC.FPS_TEXT[l]);
  const tr = (k) => (ctx.t ? ctx.t(k) : (FC.FPS_TEXT.en[k] || k));

  // ---------------------------------------------------------- viewmodel-scene
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(FC.VM_FOV, 1, 0.01, 10);
  const vmHemi = new THREE.HemisphereLight(0xd6e0e6, 0x4a4430, 1.9);
  const vmSun = new THREE.DirectionalLight(0xffe2b5, 2.6);
  const vmFlashLight = new THREE.PointLight(0xffb060, 0, 2.5, 2);
  vmScene.add(vmHemi, vmSun, vmSun.target, vmFlashLight);

  const root = new THREE.Group();            // pose (greep t.o.v. het oog)
  root.rotation.order = 'YXZ';
  vmScene.add(root);
  const holder = new THREE.Group();          // geweermodellen wijzen naar +Z: 180° draaien
  holder.rotation.y = Math.PI;
  root.add(holder);
  const hands = new THREE.Group();           // handen in viewmodel-ruimte (rechts = +X)
  root.add(hands);
  const vmMuzzle = new THREE.Object3D();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ctx.flashTex || null, color: 0xffffff, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  flash.visible = false;
  flash.renderOrder = 10;
  vmScene.add(flash);

  // [MES] mes- en medkit-viewmodel (eenvoudige blokjes; kamera kijkt langs -Z)
  const alt = new THREE.Group();
  alt.rotation.order = 'YXZ';
  vmScene.add(alt);
  const altMat = (c, m) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: m || 0, fog: false });
  const altBox = (parent, w, h, d, c, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), altMat(c, m));
    b.position.set(x, y, z); b.frustumCulled = false; parent.add(b); return b;
  };
  const vmKnife = new THREE.Group();
  altBox(vmKnife, 0.03, 0.035, 0.1, 0x1d1d1d, 0, 0, 0);               // heft
  altBox(vmKnife, 0.06, 0.016, 0.018, 0x555555, 0, 0, -0.058);         // pareerstang
  altBox(vmKnife, 0.01, 0.03, 0.17, 0xc9ced3, 0, 0.004, -0.15, 0.6);   // lemmet
  altBox(vmKnife, 0.06, 0.07, 0.07, 0x4a4a44, 0.004, -0.01, 0.01);     // vuist
  altBox(vmKnife, 0.06, 0.055, 0.2, 0x4d5631, 0.02, -0.035, 0.13);     // onderarm
  alt.add(vmKnife);
  const vmMed = new THREE.Group();
  altBox(vmMed, 0.16, 0.11, 0.06, 0xe6e4dc, 0, 0, 0);
  altBox(vmMed, 0.1, 0.028, 0.062, 0xc62828, 0, 0, 0);
  altBox(vmMed, 0.028, 0.08, 0.062, 0xc62828, 0, 0, 0);
  vmMed.position.set(-0.12, 0.02, -0.02);
  alt.add(vmMed);
  alt.visible = false;
  let vmSlot = 0, vmHeal = false, stabT = 9;

  // ---------------------------------------------------------- toestand
  let active = false;        // vorige frame in eerste persoon (voor 'shot'-berichten tussen frames)
  let frameOn = false;       // deze frame in eerste persoon (update -> tryFire -> render)
  let built = null;          // { key, ent, mats: [], geos: [] }
  let bobPhase = 0, bobA = 0, recoil = 0, flashT = 0;
  const sway = { x: 0, y: 0 };
  const sk = [0, 0];         // zachte houding (gehurkt, liggend)
  let ladK = 0, adsK = 0, airK = 0;
  let lastYaw = null, lastPitch = 0, lastX = null, lastZ = 0;
  let step = null;
  let compact = false;
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const sunDir = new THREE.Vector3();

  function measure() {
    compact = Math.min(window.innerWidth, window.innerHeight) < 500 ||
      !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerHeight < 700);
  }
  measure();
  window.addEventListener('resize', measure);

  // ---------------------------------------------------------- opbouw viewmodel
  function disposeBuilt() {
    if (!built) return;
    holder.clear();
    hands.clear();
    for (const m of built.mats) m.dispose();
    for (const g of built.geos) g.dispose();
    built = null;
  }
  function vmMat(src, mats) {
    const m = src.clone();
    m.fog = false;
    if (m.side !== undefined) m.side = THREE.FrontSide;
    mats.push(m);
    return m;
  }
  // Boxprojectie voor UV's (camo op de mouwen niet uitgerekt): 1 herhaling per `rep` meter.
  function boxUV(geo, rep) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (ax > 0.5) uv.setXY(i, z / rep, y / rep);
      else if (ay > 0.5) uv.setXY(i, x / rep, z / rep);
      else uv.setXY(i, x / rep, y / rep);
    }
    uv.needsUpdate = true;
  }
  // Materialen van het eigen poppetje (zelfde skin-kleuren/camo) zoeken op naam.
  function skinMats(ent) {
    const found = {};
    if (ent && ent.body) {
      ent.body.traverse((o) => {
        if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
        const n = o.material.name;
        if (n && !found[n]) found[n] = o.material;
      });
    }
    const skin = S.skinById(ent && ent.skin);
    const cols = skin.colors || {};
    const sw = skin.swatch || [0x7f7854, 0x4d5631, 0x56402a];
    const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    return {
      glove: found.Glove || found.Wrap || std(cols.Glove || 0x61615d),
      sleeve: found.Camo || found.NinjaSuit || std(sw[1]),
      cuff: found.Webbing || found.Strap || std(cols.Webbing || 0x3a3f2e),
    };
  }
  function addBox(parent, mat, geos, w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // Onderarm (mouw) van pols naar elleboog, met een manchet bij de pols.
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  function addForearm(M, geos, wrist, elbow) {
    const a = tmpV.set(wrist[0], wrist[1], wrist[2]);
    const b = tmpV2.set(elbow[0], elbow[1], elbow[2]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.divideScalar(len || 1);
    const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, dir);
    const sleeveGeo = new THREE.BoxGeometry(0.085, 0.08, len);
    if (M.sleeve.map) boxUV(sleeveGeo, 0.35);
    geos.push(sleeveGeo);
    const sleeve = new THREE.Mesh(sleeveGeo, M.sleeve);
    sleeve.position.copy(a).addScaledVector(dir, len / 2);
    sleeve.quaternion.copy(q);
    const cuffGeo = new THREE.BoxGeometry(0.075, 0.07, 0.05);
    geos.push(cuffGeo);
    const cuff = new THREE.Mesh(cuffGeo, M.cuff);
    cuff.position.copy(a).addScaledVector(dir, 0.03);
    cuff.quaternion.copy(q);
    hands.add(sleeve, cuff);
  }
  function build(ent) {
    const wid = ent.weapon || 'rifle';
    const wdef = S.WEAPONS[wid] || S.WEAPONS.rifle;
    const src = ctx.MODELS[wdef.model] || null;
    const key = ent.id + '|' + ent.skin + '|' + wid + '|' + (src ? 'm' : 'b');
    if (built && built.key === key && built.ent === ent) return;
    disposeBuilt();
    const mats = [], geos = [];
    // wapen
    let gun, mz;
    if (src) {
      gun = src.clone(true);
      mz = wdef.muzzle || [0, 0.065, 0.9];
    } else {
      const gm = ctx.gunMesh(wid);
      gun = gm.group;
      mz = [gm.muzzle.position.x, gm.muzzle.position.y, gm.muzzle.position.z];
    }
    const own = new Map();
    gun.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
      if (o.material && !Array.isArray(o.material)) {
        let m = own.get(o.material);
        if (!m) { m = vmMat(o.material, mats); own.set(o.material, m); }
        o.material = m;
      }
    });
    holder.add(gun);
    vmMuzzle.position.set(mz[0], mz[1], mz[2]);
    holder.add(vmMuzzle);
    // handen (viewmodel-ruimte: greep = oorsprong, loop langs -Z)
    const sm = skinMats(ent);
    const M = { glove: vmMat(sm.glove, mats), sleeve: vmMat(sm.sleeve, mats), cuff: vmMat(sm.cuff, mats) };
    // rechterhand om de pistoolgreep: vuist, duim links over de greep, wijsvinger bij de trekker
    addBox(hands, M.glove, geos, 0.062, 0.085, 0.075, 0.002, -0.055, 0.012);
    addBox(hands, M.glove, geos, 0.02, 0.026, 0.06, -0.036, -0.022, -0.004);
    addBox(hands, M.glove, geos, 0.018, 0.02, 0.05, 0.022, -0.03, -0.045);
    addForearm(M, geos, [0.012, -0.085, 0.05], [0.1, -0.25, 0.4]);
    // linkerhand onder het voorhout: handpalm, vingers rechts om het voorhout, duim links
    const g = FC.supportHandView(wid);
    addBox(hands, M.glove, geos, 0.07, 0.03, 0.1, g.x, g.y - 0.046, g.z);
    addBox(hands, M.glove, geos, 0.02, 0.06, 0.09, g.x + 0.038, g.y - 0.014, g.z);
    addBox(hands, M.glove, geos, 0.018, 0.04, 0.055, g.x - 0.037, g.y - 0.022, g.z + 0.01);
    addForearm(M, geos, [g.x - 0.015, g.y - 0.07, g.z + 0.05], [g.x - 0.24, -0.33, g.z + 0.3]);
    hands.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    built = { key, ent, mats, geos };
  }

  // ---------------------------------------------------------- per frame
  function update(me, focus, eye, d, dt) {
    const vrOn = !!(ctx.vrActive && ctx.vrActive());
    const want = FC.wantFirstPerson({ mode: Settings.settings.camera, vr: vrOn, me, focus });
    updateBtn(vrOn);
    if (!want) {
      active = false; frameOn = false;
      lastYaw = null; lastX = null; step = null;
      return false;
    }
    active = true; frameOn = true;
    dt = dt || 0.016;
    // camera op het oog; treden zacht bijschuiven
    step = FC.stepSmooth(step, me.y, me.ground !== false && !me.onLadder, dt);
    camera.position.set(me.x, me.y + eye + step.off, me.z);
    camera.lookAt(camera.position.x + d.x, camera.position.y + d.y, camera.position.z + d.z);
    camera.updateMatrixWorld();
    me.group.visible = false;               // eigen lichaam niet in beeld

    // viewmodel bijwerken
    build(me);
    const k = Math.min(1, dt * 10);
    sk[0] += ((me.stance === 1 && !me.onLadder ? 1 : 0) - sk[0]) * k;
    sk[1] += ((me.stance === 2 && !me.onLadder ? 1 : 0) - sk[1]) * k;
    ladK += ((me.onLadder ? 1 : 0) - ladK) * Math.min(1, dt * 8);
    const z = ctx.getZoom ? ctx.getZoom() : { k: 0, scope: false };
    adsK = z.k || 0;
    airK += ((me.air ? 1 : 0) - airK) * Math.min(1, dt * 12);
    // snelheid uit de verplaatsing (horizontaal)
    let speed = 0;
    if (lastX !== null) speed = Math.hypot(me.x - lastX, me.z - lastZ) / dt;
    if (speed > 20) speed = 0;              // teleport
    lastX = me.x; lastZ = me.z;
    bobPhase = FC.advanceBob(bobPhase, speed, dt);
    bobA += (FC.bobAmp(speed, me.stance, me.air || me.onLadder, adsK) - bobA) * Math.min(1, dt * 8);
    // naslingeren bij draaien
    const yaw = ctx.look.yaw, pitch = ctx.look.pitch;
    if (lastYaw !== null) {
      let dy = yaw - lastYaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      const st = FC.swayTarget(dy, pitch - lastPitch, dt);
      const sm = 1 - adsK * 0.8;
      sway.x += (st.x * sm - sway.x) * Math.min(1, dt * 8);
      sway.y += (st.y * sm - sway.y) * Math.min(1, dt * 8);
    }
    lastYaw = yaw; lastPitch = pitch;
    recoil = FC.decayRecoil(recoil, dt);

    const pose = FC.viewmodelPose(me.weapon, { stanceK: sk, ladder: ladK, ads: adsK, compact });
    const bob = FC.bobOffset(bobPhase, bobA);
    const rc = FC.recoilOffset(recoil * (1 - adsK * 0.5));
    // in de lucht: wapen iets omhoog bij springen, omlaag bij vallen
    const vy = Number.isFinite(me.vy) ? me.vy : 0;
    const airY = Math.max(-0.03, Math.min(0.02, -vy * 0.003)) * airK;
    root.position.set(pose.x + bob.x + sway.x, pose.y + bob.y + sway.y + rc.y + airY, pose.z + rc.z);
    root.rotation.set(pose.rx + rc.rx + sway.y * 0.6, pose.ry + sway.x * 1.2, pose.rz + bob.rz);
    root.scale.setScalar(pose.scale);
    root.visible = !(z.scope && adsK > 0.6);   // door de kijker: alleen de scope-overlay
    // [MES] mes/medkit in plaats van het wapen, met een korte steek naar voren
    stabT += dt;
    const useAlt = vmSlot !== 0 || vmHeal;
    alt.visible = useAlt;
    if (useAlt) {
      root.visible = false;
      vmKnife.visible = vmSlot === 1 && !vmHeal;
      vmMed.visible = vmSlot === 2 || vmHeal;
      const s = stabT / 0.32;
      const th = s < 1 ? (s < 0.3 ? s / 0.3 : 1 - (s - 0.3) / 0.7) : 0;
      const hb = vmHeal ? Math.sin(stabT * 9) * 0.015 : 0;
      alt.position.set(0.2 + bob.x + sway.x - 0.06 * th, -0.2 + bob.y + sway.y + 0.03 * th + hb, -0.4 - 0.2 * th);
      alt.rotation.set(0.25 + sway.y * 0.6 - 0.25 * th, 0.05 + sway.x * 1.2 + 0.15 * th, bob.rz);
    }

    // licht: zelfde kleuren als het level, zonrichting meedraaiend met de camera
    if (ctx.hemi) {
      vmHemi.color.copy(ctx.hemi.color); vmHemi.groundColor.copy(ctx.hemi.groundColor);
      vmHemi.intensity = ctx.hemi.intensity;
    }
    if (ctx.sun) {
      vmSun.color.copy(ctx.sun.color); vmSun.intensity = ctx.sun.intensity;
      sunDir.subVectors(ctx.sun.position, ctx.sun.target.position).normalize();
      tmpQ.copy(camera.quaternion).invert();
      vmSun.position.copy(sunDir.applyQuaternion(tmpQ)).multiplyScalar(5);
    }
    // mondingsvuur
    if (flashT > 0) {
      flashT -= dt;
      root.updateMatrixWorld(true);
      vmMuzzle.getWorldPosition(flash.position);
      flash.position.z -= 0.04;
      vmFlashLight.position.copy(flash.position);
      flash.visible = flashT > 0 && root.visible;
      const lowQ = Settings.vrBridge && Settings.vrBridge.effectiveQuality === 'low';
      vmFlashLight.intensity = flash.visible && !lowQ ? 2.2 * (flashT / 0.05) : 0;
    } else { flash.visible = false; vmFlashLight.intensity = 0; }
    return true;
  }

  function render() {
    if (!frameOn) return;
    frameOn = false;
    if (renderer.xr && renderer.xr.isPresenting) return;
    const fov = compact ? FC.VM_FOV_COMPACT : FC.VM_FOV;
    if (vmCam.aspect !== camera.aspect || vmCam.fov !== fov) {
      vmCam.aspect = camera.aspect; vmCam.fov = fov; vmCam.updateProjectionMatrix();
    }
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
    renderer.autoClear = ac;
  }

  function shotOrigin() { return frameOn ? camera.position : null; }

  function onFire(weaponId) {
    if (!active) return;
    recoil = FC.kickRecoil(recoil, weaponId);
    flashT = 0.05;
    flash.material.rotation = Math.random() * Math.PI * 2;
    const s = (weaponId === 'shotgun' ? 0.32 : weaponId === 'smg' ? 0.18 : 0.24) * (0.85 + Math.random() * 0.3);
    flash.scale.set(s, s, 1);
  }

  // Eigen schot in eerste persoon: start van het kogelspoor = waar de viewmodel-loop op het scherm
  // staat (op dezelfde afstand), zodat het spoor uit het eigen wapen komt. Geeft false buiten FPS.
  function ownShotStart(out) {
    if (!active || !built) return false;
    if (!root.visible) {
      // door de kijker: net onder het midden van het beeld
      tmpV.set(0, -0.12, -1).applyQuaternion(camera.quaternion);
      out.copy(camera.position).add(tmpV);
      return true;
    }
    root.updateMatrixWorld(true);
    vmMuzzle.getWorldPosition(tmpV);          // viewmodel-ruimte (vmCam staat in de oorsprong)
    const dist = Math.max(0.2, -tmpV.z);
    const tv = Math.tan(THREE.MathUtils.degToRad(vmCam.fov) / 2);
    const nx = tmpV.x / (dist * tv * vmCam.aspect), ny = tmpV.y / (dist * tv);
    const tm = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    tmpV2.set(nx * dist * tm * camera.aspect, ny * dist * tm, -dist).applyQuaternion(camera.quaternion);
    out.copy(camera.position).add(tmpV2);
    return true;
  }

  // ---------------------------------------------------------- wisselen (V, knop, instellingen)
  function toggle() { Settings.setCamera(FC.nextMode(Settings.settings.camera)); updateBtn(false); }

  const btn = $('camBtn');
  let btnKey = '';
  function updateBtn(vrOn) {
    if (!btn) return;
    const first = FC.parseMode(Settings.settings.camera) === 'first';
    const key = (first ? '1' : '3') + (vrOn ? 'v' : '') + (ctx.getLang ? ctx.getLang() : '');
    if (key === btnKey) return;
    btnKey = key;
    btn.classList.toggle('on', first);
    btn.classList.toggle('hidden', vrOn);
    const lab = btn.querySelector('.camTag');
    if (lab) lab.textContent = first ? '1P' : '3P';
    btn.setAttribute('aria-label', tr('camBtn') + ' - ' + tr(first ? 'camFirst' : 'camThird'));
    btn.title = tr('camBtn') + ' (V)';
  }
  if (btn) {
    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); toggle(); });
    btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
  }
  updateBtn(false);

  // [MES] actief vak (0 wapen / 1 mes / 2 medkit), medkit bezig, steek-animatie
  function setSlot(slot, healing) { vmSlot = slot | 0; vmHeal = !!healing; }
  function onStab() { stabT = 0; vmSlot = 1; }

  const api = {
    update, render, shotOrigin, onFire, ownShotStart, toggle, setSlot, onStab,
    get active() { return active; },
    get mode() { return FC.parseMode(Settings.settings.camera); },
    _internals: { vmScene, vmCam, root, holder, hands, vmMuzzle, flash, alt, get built() { return built; }, get compact() { return compact; } },
  };
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__fps = api;
  return api;
}
