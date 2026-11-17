import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import * as VC from './vr-core.js';
import * as Settings from './settings.js';
import { createVRMenu } from './vr-menu.js';

/* ============================================================
 * VR-modus (fase 5, Meta Quest 3 / WebXR in Quest Browser)
 *
 * game.js laadt dit bestand los (dynamic import) en roept op een paar plekken een hook aan:
 *   vr.idle(dt, now)          - lobby/menu-scherm terwijl je in VR zit (game.js tekent dan niets)
 *   vr.preUpdate(me, dt, now) - vóór moveMe: controllers -> input.jx/jy/fire, look.yaw = hoofdrichting
 *   vr.updateCamera(me, dt)   - na updateCamera: rig op de speler, richten met het geweer
 *   vr.afterRender()          - na renderer.render: camera.position weer in wereldcoördinaten
 * en tryFire gebruikt camera.userData.vrOrigin (loop van het geweer) als die gezet is, plus
 * camera.userData.vrShot (extra velden voor 'shoot', bv. two:1 bij tweehandig vasthouden).
 * Buiten een VR-sessie doen alle hooks niets.
 *
 * Camera-rig: een Group op de grond onder de speler; de XR-camera zit daarin op de echte
 * hoofdhoogte (reference space 'local-floor'). Rondlopen in de kamer verplaatst de speler mee.
 *
 * Fase VR2: menu in VR (public/vr-menu.js), schiethand links/rechts, twee handen aan het geweer,
 * zittend spelen / hoogte. VR-instellingen staan in cc_settings.vr (via settings.js vrBridge).
 * ============================================================ */

const RIGHT_HANDED_FALLBACK = true;

function loadSetting(k, def) {
  try { const v = localStorage.getItem(k); return v === null ? def : v === '1'; } catch (e) { return def; }
}

export function initVR(ctx) {
  const { renderer, scene, camera, S, players, look, input } = ctx;
  const $ = (id) => document.getElementById(id);

  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  let active = false;
  let starting = false;
  let mode = null;            // 'fp' | 'spec' | 'idle'
  let rigYaw = 0;
  let lastMe = null;
  let lastMeX = 0, lastMeZ = 0;
  let lastLookYaw = NaN;
  let padState = VC.initialPadState();
  let lastPad = null;          // laatste mapControllers-resultaat (grips/trekkers voor geweer en menu)
  const fade = VC.newFade();
  // VR-instellingen: cc_settings.vr (oude losse sleutels vrSnap/vrVignette tellen nog als startwaarde)
  const settings = VC.sanitizeVrSettings(Settings.vrBridge.getVr(),
    { snap: loadSetting('vrSnap', undefined), vignette: loadSetting('vrVignette', undefined) });
  function setVr(next) {
    const oldLift = VC.rigLift(settings);
    Object.assign(settings, VC.sanitizeVrSettings(next));
    Settings.vrBridge.setVr(settings);
    rig.position.y += VC.rigLift(settings) - oldLift;     // zittend/hoogte meteen toepassen
  }
  let fireLock = false;        // na het sluiten van het menu: pas weer vuren als de trekker los is
  let toast = null;
  let savedFov = camera.fov;

  const headLocal = new THREE.Vector3(0, 1.6, 0);
  const headQuatL = new THREE.Quaternion();
  let headYawL = 0;
  const headWorld = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const aimDir = new THREE.Vector3();
  const aimOrigin = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpV3 = new THREE.Vector3();
  let vigTarget = 0;
  let crouched = false;       // echte hoofdhoogte onder VC.VR_CROUCH_HEAD

  // ---------------------------------------------------------- rig + objecten

  const rig = new THREE.Group();
  rig.name = 'vrRig';

  // Comfort: één bol om het hoofd voor vignet (bij bewegen), zwart faden en rode schadeflits.
  const comfortMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, fog: false, side: THREE.BackSide,
    uniforms: { fade: { value: 0 }, vig: { value: 0 }, hurt: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform float fade; uniform float vig; uniform float hurt; varying vec3 vP;',
      'void main(){',
      '  float c = -normalize(vP).z;',
      '  float edge = 1.0 - smoothstep(0.55, 0.93, c);',
      '  float aV = vig * edge;',
      '  float aH = hurt * (1.0 - smoothstep(0.4, 0.98, c)) * 0.55;',
      '  float a = max(fade, max(aV, aH));',
      '  float red = aH > aV + 0.001 ? 1.0 : 0.0;',
      '  vec3 col = vec3(0.55, 0.0, 0.0) * red * (1.0 - fade);',
      '  gl_FragColor = vec4(col, a);',
      '}',
    ].join('\n'),
  });
  const comfort = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), comfortMat);
  comfort.renderOrder = 1000;
  comfort.frustumCulled = false;
  comfort.visible = false;
  let vigNow = 0, hurtNow = 0;

  // Vloer onder je voeten in de lobby (dan is er misschien nog geen level).
  const idleFloor = new THREE.Mesh(
    new THREE.CircleGeometry(2.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x20261f, transparent: true, opacity: 0.92, fog: false }),
  );
  idleFloor.position.y = 0.005;
  idleFloor.visible = false;
  rig.add(idleFloor);

  // HUD-panelen (canvas-texturen)
  function makePanel(w, h, mw, mh, order) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    }));
    m.renderOrder = order;
    m.frustumCulled = false;
    m.visible = false;
    return { mesh: m, canvas: cv, g: cv.getContext('2d'), tex, key: '', alpha: 0, yaw: 0 };
  }
  const wrist = makePanel(VC.WRIST_W, VC.WRIST_H, 0.2, 0.1, 21);
  const banner = makePanel(VC.BANNER_W, VC.BANNER_H, 1.2, 0.6, 20);
  rig.add(wrist.mesh, banner.mesh);

  // Controllers: target-ray (richten) + grip (controllermodel)
  const factory = new XRControllerModelFactory();
  const slots = [0, 1].map((i) => {
    const ray = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    const model = factory.createControllerModel(grip);
    grip.add(model);
    rig.add(ray, grip);
    const slot = { i, ray, grip, model, source: null };
    ray.addEventListener('connected', (e) => { slot.source = e.data || null; });
    ray.addEventListener('disconnected', () => { slot.source = null; });
    return slot;
  });
  function hand(h) {
    let s = slots.find((x) => x.source && x.source.handedness === h);
    if (!s && h === 'right' && RIGHT_HANDED_FALLBACK) s = slots.find((x) => x.source && x.source.handedness !== 'left');
    return s || null;
  }
  // Schiethand (geweer, vuren) en steunhand (polspaneel, voorhout pakken) volgens de instelling.
  const domSide = () => (settings.hand === 'left' ? 'left' : 'right');
  const supSide = () => (settings.hand === 'left' ? 'right' : 'left');
  const domHand = () => hand(domSide());
  const supHand = () => hand(supSide());

  // Geweer in de schiethand: gunRoot volgt de target-ray van die controller (één hand) of richt
  // van de schiethand naar de steunhand (twee handen). Loop langs -Z van gunRoot.
  const gunRoot = new THREE.Group();
  gunRoot.name = 'vrGunRoot';
  rig.add(gunRoot);
  const gunHolder = new THREE.Group();
  gunHolder.rotation.y = Math.PI;        // geweermodellen wijzen naar +Z
  gunHolder.position.set(VC.GUN_HOLDER_OFFSET.x, VC.GUN_HOLDER_OFFSET.y, VC.GUN_HOLDER_OFFSET.z);
  gunRoot.add(gunHolder);
  gunHolder.visible = false;
  // Twee handen: handschoen op het voorhout + oplichtende ring als de steunhand dichtbij is.
  // Geweer-coördinaten: +X = links van de speler. Linker steunhand: handpalm onder het voorhout,
  // vingers om de rechterkant (-X), duim links (+X). Voor linkshandigen gespiegeld (scale.x = -1).
  const glove = new THREE.Group();
  {
    const gm = new THREE.MeshStandardMaterial({ color: 0x9c8458, roughness: 0.85, side: THREE.DoubleSide });   // coyote-bruine handschoen
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.095), gm);
    palm.position.set(0, -0.04, 0);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.088), gm);
    fingers.position.set(-0.036, -0.005, 0);
    const tips = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.084), gm);
    tips.position.set(-0.024, 0.03, 0);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.045, 0.05), gm);
    thumb.position.set(0.034, -0.014, 0.012);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.04), new THREE.MeshStandardMaterial({ color: 0x3a3f2e, roughness: 0.9, side: THREE.DoubleSide }));
    cuff.position.set(0.01, -0.07, -0.06);
    glove.add(palm, fingers, tips, thumb, cuff);
  }
  glove.visible = false;
  gunHolder.add(glove);
  const gripRing = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.004, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.6, depthWrite: false, fog: false, toneMapped: false }));
  gripRing.visible = false;
  gunHolder.add(gripRing);           // torus ligt in het XY-vlak: as langs de loop (+Z)
  let grip2 = VC.initialGrip();      // toestand steunhand
  let grip2Blend = 0;                // 0 = één hand, 1 = twee handen (overgang ~80 ms)
  const qOne = new THREE.Quaternion(), qTwo = new THREE.Quaternion(), qWant = new THREE.Quaternion();
  const domUp = new THREE.Vector3();
  let gunWeapon = null;
  let gunObj = null;
  const vrMuzzle = new THREE.Object3D();
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]),
    new THREE.LineBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.55, fog: false, depthWrite: false }),
  );
  laser.frustumCulled = false;
  vrMuzzle.add(laser);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6a3c, fog: false, toneMapped: false }));
  dot.visible = false;

  function buildGun(weaponId) {
    if (gunObj) gunHolder.remove(gunObj);
    gunWeapon = weaponId;
    const M = ctx.MODELS || {};
    const src = M[weaponId] || (weaponId === 'shotgun' ? M.shotgun : null) || M.rifle;
    let muzzleZ = weaponId === 'shotgun' ? 0.79 : 0.9, muzzleY = 0.065;
    if (src) {
      gunObj = src.clone(true);
      if (!M[weaponId] || (weaponId !== 'rifle' && weaponId !== 'shotgun')) {
        const box = new THREE.Box3().setFromObject(gunObj);
        if (Number.isFinite(box.max.z) && box.max.z > 0.2) { muzzleZ = box.max.z; muzzleY = (box.min.y + box.max.y) / 2; }
      }
    } else if (ctx.gunMesh) {
      const gm = ctx.gunMesh(weaponId);
      gunObj = gm.group;
      muzzleZ = gm.muzzle.position.z; muzzleY = gm.muzzle.position.y;
    } else {
      gunObj = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x262626 }));
      gunObj.position.z = 0.3;
      muzzleZ = 0.7; muzzleY = 0;
    }
    gunObj.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    gunHolder.add(gunObj);
    vrMuzzle.position.set(0, muzzleY, muzzleZ);
    gunHolder.add(vrMuzzle);
    const gp = VC.supportGripGun(weaponId);
    glove.position.set(gp.x, gp.y, gp.z);
    gripRing.position.set(gp.x, gp.y, gp.z);
  }

  // ---------------------------------------------------------- menu (public/vr-menu.js)

  const menu = createVRMenu({
    rig, slots,
    getLang: () => (ctx.getLang ? ctx.getLang() : 'en'),
    getVr: () => ({ ...settings }),
    setVr,
    pulse: (slot, i, ms) => pulse(slot, i, ms),
    exitVR: () => { try { const s = renderer.xr.getSession(); if (s) s.end(); } catch (e) { /* ignore */ } },
    onOpen: () => { input.fire = false; input.jx = 0; input.jy = 0; },
    onClose: () => { fireLock = true; },
  });
  wrist.mesh.add(menu.wristButton);
  function toggleMenu() { menu.toggle(); }
  // Elke frame: menu bijwerken met beide handen als aanwijzer.
  function updateMenu(dt) {
    if (!menu.open) return;
    const m = lastPad || {};
    const hands = [];
    for (const s of slots) {
      if (!s.source) continue;
      const left = s.source.handedness === 'left';
      hands.push({ slot: s, trigEdge: !!(left ? m.trigLEdge : m.trigREdge) });
    }
    menu.update(dt, { hands, headLocal, headYaw: headYawL, headWorld });
  }

  // ---------------------------------------------------------- ENTER VR-knoppen

  const buttons = ['btnVRLobby', 'btnVRHud'].map($).filter(Boolean);
  let supported = false;
  function labelButtons() {
    const txt = VC.vrText(ctx.getLang ? ctx.getLang() : 'en', 'enter');
    for (const b of buttons) if (b.textContent !== txt) b.textContent = txt;
  }
  function showButtons(on) { for (const b of buttons) b.classList.toggle('hidden', !on); }
  showButtons(false);
  if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      supported = !!ok;
      labelButtons();
      showButtons(supported && !active);
    }).catch(() => { supported = false; showButtons(false); });
  }
  setInterval(labelButtons, 1000);
  for (const b of buttons) {
    b.addEventListener('pointerdown', (e) => e.stopPropagation());   // niet de pointer lock van de HUD
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); enterVR(); });
  }

  async function enterVR() {
    if (active || starting || !supported) return;
    starting = true;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await renderer.xr.setSession(session);
    } catch (err) {
      console.warn('VR kon niet starten:', err);
    } finally {
      starting = false;
    }
  }

  renderer.xr.addEventListener('sessionstart', onStart);
  renderer.xr.addEventListener('sessionend', onEnd);

  function onStart() {
    active = true;
    savedFov = camera.fov;
    scene.add(rig);
    scene.add(dot);
    scene.add(menu.group);
    rig.add(camera);
    camera.add(comfort);
    camera.position.set(0, 1.6, 0);
    camera.quaternion.identity();
    mode = null;
    lastMe = null;
    lastLookYaw = NaN;
    padState = VC.initialPadState();
    VC.blink(fade);
    showButtons(false);
    try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ }
  }

  function onEnd() {
    active = false;
    menu.close();
    restoreMuzzle();
    releaseGrip();
    camera.userData.vrShot = null;
    camera.remove(comfort);
    rig.remove(camera);
    scene.remove(rig);
    scene.remove(dot);
    scene.remove(menu.group);
    camera.fov = savedFov;
    camera.zoom = 1;
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    camera.userData.vrOrigin = null;
    input.fire = false; input.jx = 0; input.jy = 0;
    mode = null;
    showButtons(supported);
  }

  // ---------------------------------------------------------- invoer

  function readPose() {
    const frame = renderer.xr.getFrame();
    const ref = renderer.xr.getReferenceSpace();
    if (!frame || !ref) return;
    const pose = frame.getViewerPose(ref);
    if (!pose) return;                     // tracking even kwijt: laatste stand houden
    const p = pose.transform.position, o = pose.transform.orientation;
    headLocal.set(p.x, p.y, p.z);
    headQuatL.set(o.x, o.y, o.z, o.w);
    headYawL = VC.yawFromQuaternion(o);
  }

  function readPads(dt) {
    const L = hand('left'), R = hand('right');
    const m = VC.mapControllers(L && L.source ? L.source.gamepad : null, R && R.source ? R.source.gamepad : null,
      padState, VC.padOptions(settings), dt);
    padState = m.state;
    lastPad = m;
    const lang = ctx.getLang ? ctx.getLang() : 'en';
    // Y lang = menu open/dicht (werkt altijd); de rest niet zolang het menu open is
    if (m.openMenu) { toggleMenu(); pulse(hand('left'), 0.35, 30); }
    if (menu.open) {
      m.moveX = 0; m.moveY = 0; m.turn = 0; m.fire = false; m.moving = false;
      m.takeover = false; m.start = false; m.toggleTurn = false; m.toggleVignette = false;
      m.jump = false; m.toggleProne = false;   // bewegingsfase: niet springen/liggen terwijl het menu open is
    }
    if (fireLock && !m.fire) fireLock = false;
    if (fireLock) m.fire = false;
    if (m.toggleTurn) {
      setVr({ ...settings, snap: !settings.snap });
      showToast(VC.vrText(lang, settings.snap ? 'snapOn' : 'snapOff', { a: settings.snapDeg }));
    }
    if (m.toggleVignette) {
      setVr({ ...settings, vignette: !settings.vignette });
      showToast(VC.vrText(lang, settings.vignette ? 'vigOn' : 'vigOff'));
    }
    return m;
  }

  // Rig op een grondpunt zetten (+ zittend/hoogte-instelling).
  function setRig(p) { rig.position.set(p.x, p.y + VC.rigLift(settings), p.z); }

  function showToast(text) { toast = { text, until: performance.now() + 1800 }; }

  function pulse(slot, intensity, ms) {
    try {
      const ha = slot && slot.source && slot.source.gamepad && slot.source.gamepad.hapticActuators;
      if (ha && ha[0] && ha[0].pulse) {
        const p = ha[0].pulse(intensity, ms);
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }

  // Draai de rig om het hoofd (hoofd blijft op dezelfde plek in de wereld).
  function turnAroundHead(delta) {
    if (!delta) return;
    const hw = VC.headWorldFor(rig.position, rigYaw, headLocal);
    rigYaw = VC.wrapAngle(rigYaw + delta);
    const p = VC.rigPositionFor(hw.x, rig.position.y, hw.z, headLocal, rigYaw);
    rig.position.set(p.x, p.y, p.z);
  }

  function movable(me) {
    const ph = ctx.getPhase();
    return !!me && me.alive && (ph === 'playing' || ph === 'between');
  }

  // ---------------------------------------------------------- spectate (vaste plek, faden)

  let anchor = null;          // { x, y, z, yaw, target, fx, fz }
  let losBlockedFor = 0, nextLos = 0;

  function blockedFn() {
    const lvl = ctx.getLevelId();
    return (a, b) => {
      tmpV.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const d = tmpV.length();
      if (d < 0.5) return false;
      tmpV.divideScalar(d);
      return S.rayBlockDistance(lvl, a, tmpV, d) < d - 0.5;
    };
  }

  function placeSpectator(target, me) {
    const lvl = ctx.getLevelId();
    const heightAt = (x, z) => S.heightAt(lvl, x, z);
    const focus = target || me || { x: 0, z: 0, yaw: 0 };
    const los = blockedFn();
    // plek afkeuren als er dekking tussen zit of als hij midden in een boom/kist staat
    let trees = null;
    try { trees = S.getObstacles(lvl).trees; } catch (e) { trees = null; }
    const blocked = (from, to) => {
      const r = S.resolveCollision(lvl, from.x, from.z, 2.2);
      return Math.hypot(r.x - from.x, r.z - from.z) > 0.01 || los(from, to) || VC.crownsBlock(from, to, trees);
    };
    const a = VC.spectatorAnchor({ x: focus.x, z: focus.z, yaw: focus.yaw || 0 }, heightAt, blocked);
    anchor = { ...a, target: target || null, fx: focus.x, fz: focus.z };
    rigYaw = VC.rigYawFor(a.yaw, headYawL);
    setRig(VC.rigPositionFor(a.x, a.y, a.z, headLocal, rigYaw));
    losBlockedFor = 0;
  }

  // ---------------------------------------------------------- hooks

  function preUpdate(me, dt) {
    if (!active) return;
    readPose();
    const m = readPads(dt);
    const want = me && me.alive ? 'fp' : 'spec';

    if (want === 'fp') {
      const jumped = lastMe === me && Math.hypot(me.x - lastMeX, me.z - lastMeZ) > 3;
      const entering = mode !== 'fp';
      if (entering || me !== lastMe || jumped) {
        // nieuwe ronde, bot overgenomen of terug uit spectate: kort zwart en kijk zoals de game wil
        VC.blink(fade);
        mode = 'fp';
        rigYaw = VC.rigYawFor(look.yaw, headYawL);
        // me.y kan bij een nieuwe ronde nog 0 zijn: dan de grondhoogte nemen
        const gy = (typeof me.y === 'number' && me.y !== 0) ? me.y : S.heightAt(ctx.getLevelId(), me.x, me.z);
        setRig(VC.rigPositionFor(me.x, gy, me.z, headLocal, rigYaw));
      } else {
        if (look.yaw !== lastLookYaw) rigYaw = VC.rigYawFor(look.yaw, headYawL);   // game zette een nieuwe kijkrichting
        // Rondlopen in de kamer: het hoofd ging van de speler af -> speler loopt mee (met botsing).
        if (movable(me)) {
          const hw = VC.headWorldFor(rig.position, rigYaw, headLocal);
          let dx = hw.x - me.x, dz = hw.z - me.z;
          const d = Math.hypot(dx, dz);
          if (d > 1) { dx /= d; dz /= d; }
          if (d > 0.002 && !(me.ladder >= 0)) {
            const r = S.collideY
              ? S.collideY(ctx.getLevelId(), me.x + dx, me.z + dz, S.PLAYER_RADIUS, me.y, S.MOVE.HEIGHT[me.stance || 0])
              : S.resolveCollision(ctx.getLevelId(), me.x + dx, me.z + dz, S.PLAYER_RADIUS);
            me.x = r.x; me.z = r.z;
          }
        }
        turnAroundHead(m.turn);
      }
      input.jx = m.moveX;
      input.jy = m.moveY;
      input.fire = m.fire;
      // bewegingsfase: X = springen, linkerstick indrukken = liggen, echt bukken = gehurkt
      if (m.jump && ctx.jump) ctx.jump();
      if (m.toggleProne && ctx.toggleProne) ctx.toggleProne();
      crouched = VC.vrCrouching(headLocal.y + VC.rigLift(settings), crouched);   // met zit-/hoogte-correctie
      if (ctx.setCrouch) ctx.setCrouch(crouched);
      // DEUR-HOOK: A (levend) = deur open/dicht als je ervoor staat (anders niets; overnemen alleen als je dood bent)
      if (m.takeover && ctx.doorAction) ctx.doorAction();
      look.yaw = VC.wrapAngle(rigYaw + headYawL);
      lastLookYaw = look.yaw;
      vigTarget = settings.vignette && (m.moving || (!settings.snap && m.turn !== 0)) ? 0.9 : 0;
    } else {
      input.jx = 0; input.jy = 0; input.fire = false;
      if (crouched && ctx.setCrouch) { crouched = false; ctx.setCrouch(false); }
      vigTarget = 0;
      if (mode === 'fp' && fade.state !== 'out') {
        // uitgeschakeld: rustig naar zwart, dan naar een vaste meekijkplek
        VC.fadeTo(fade, () => { mode = 'spec'; anchor = null; });
      } else if (mode !== 'fp' && mode !== 'spec') {
        VC.blink(fade);
        mode = 'spec';
        anchor = null;
      }
      if (mode === 'spec') turnAroundHead(m.turn);
      if (m.takeover && ctx.doTakeover) ctx.doTakeover();
    }
    lastMe = me || null;
    if (me) { lastMeX = me.x; lastMeZ = me.z; }
  }

  function updateCamera(me, dt, now) {
    if (!active) return;
    VC.fadeStep(fade, dt);
    idleFloor.visible = false;

    const fp = mode === 'fp' && !!me;
    if (fp) {
      if (movable(me)) {
        // liggend: de vloer van de speelruimte zakt, zodat je ogen op ~0.5 m komen
        // (rekening houdend met de zit-/hoogte-correctie uit het VR-menu)
        const eyeY = headLocal.y + VC.rigLift(settings);
        const drop = me.stance === 2 ? Math.max(0, eyeY - S.MOVE.EYE[2]) : 0;
        setRig(VC.rigPositionFor(me.x, me.y - drop, me.z, headLocal, rigYaw));
      }
      me.group.visible = false;            // eigen lichaam niet in beeld
    } else if (mode === 'spec') {
      const target = ctx.getSpecTarget ? ctx.getSpecTarget() : null;
      const tNow = now || performance.now();
      if (target && tNow >= nextLos && anchor) {
        nextLos = tNow + 250;
        const hw = VC.headWorldFor(rig.position, rigYaw, headLocal);
        const ty = S.heightAt(ctx.getLevelId(), target.x, target.z);
        const to = { x: target.x, y: ty + 1.4, z: target.z };
        let trees = null;
        try { trees = S.getObstacles(ctx.getLevelId()).trees; } catch (e) { trees = null; }
        losBlockedFor = blockedFn()(hw, to) || VC.crownsBlock(hw, to, trees) ? losBlockedFor + 0.25 : 0;
      }
      const need = !anchor || (target && (anchor.target !== target ||
        Math.hypot(target.x - anchor.fx, target.z - anchor.fz) > 12 || losBlockedFor > 3));
      if (need) {
        if (!anchor) placeSpectator(target, me);
        else if (fade.state === 'idle') { VC.fadeTo(fade, () => placeSpectator(ctx.getSpecTarget ? ctx.getSpecTarget() : target, me)); losBlockedFor = 0; }
      }
    }
    rig.rotation.set(0, rigYaw, 0);
    rig.updateMatrixWorld(true);

    // Camera tijdelijk in wereldcoördinaten (labels, zon, geluid in game.js); renderer.render
    // zet hem daarna weer op de echte XR-houding.
    headWorld.copy(headLocal).applyMatrix4(rig.matrixWorld);
    camera.position.copy(headWorld);
    camera.quaternion.setFromAxisAngle(yAxis, rigYaw).multiply(headQuatL);

    updatePanels(me, dt);
    updateWeapon(me, fp, now || performance.now(), dt);
    updateMenu(dt);
    updateComfort(dt);
  }

  let originalMuzzle = null, muzzleOwner = null;
  function restoreMuzzle() {
    if (muzzleOwner && originalMuzzle) muzzleOwner.muzzle = originalMuzzle;
    muzzleOwner = null; originalMuzzle = null;
  }

  // Steunhand los (geen geweer, menu open, sessie voorbij).
  function releaseGrip() {
    grip2 = VC.initialGrip();
    grip2Blend = 0;
    glove.visible = false;
    gripRing.visible = false;
    for (const s of slots) if (s.model) s.model.visible = true;
  }

  /**
   * Geweerhouding: één hand (target-ray van de schiethand) of twee handen (loop van de schiethand
   * naar de steunhand, rol van de schiethand), met een korte overgang en lichte demping.
   * Alles in rig-coördinaten (controllers hangen in de rig).
   */
  function updateGunPose(D, Sup, dt) {
    const m = lastPad || {};
    qOne.copy(D.ray.quaternion);
    const gp = VC.gripPointFor(D.ray.position, D.ray.quaternion, gunWeapon);
    const supOk = !!(Sup && Sup.source);
    const supPos = supOk ? Sup.grip.position : null;
    const dGrip = supOk ? VC.dist3(supPos, gp) : Infinity;
    const squeeze = supOk && !!(supSide() === 'left' ? m.gripL : m.gripR);
    const r = VC.updateGrip(grip2, {
      mode: settings.grip, squeeze, near: dGrip < VC.GRAB_RADIUS,
      hands: supOk ? VC.dist3(D.grip.position, supPos) : NaN, allowed: supOk && !menu.open,
    });
    grip2 = r.state;
    if (r.event === 'grab') { pulse(Sup, 0.4, 35); pulse(D, 0.2, 20); }
    if (r.event === 'release') pulse(Sup, 0.25, 20);
    grip2Blend = VC.approach(grip2Blend, grip2.held ? 1 : 0, dt);
    if (grip2.held) {
      domUp.set(0, 1, 0).applyQuaternion(D.ray.quaternion);
      const aim = VC.twoHandAim(D.grip.position, supPos, domUp);
      if (aim) qTwo.set(aim.quat.x, aim.quat.y, aim.quat.z, aim.quat.w);
      else qTwo.copy(qOne);
    }
    if (grip2Blend > 0) {
      qWant.copy(qOne).slerp(qTwo, grip2Blend);
      gunRoot.quaternion.slerp(qWant, VC.smoothK(dt, VC.TWO_HAND_TAU * grip2Blend));
    } else {
      gunRoot.quaternion.copy(qOne);
    }
    gunRoot.position.copy(D.ray.position);
    gunRoot.updateMatrixWorld(true);
    // zichtbaarheid: handschoen op het voorhout i.p.v. de steuncontroller, ring als je dichtbij bent
    const two = grip2.held && grip2Blend > 0.3;
    glove.visible = two;
    glove.scale.x = settings.hand === 'left' ? -1 : 1;
    if (Sup && Sup.model) Sup.model.visible = !two;
    if (D.model) D.model.visible = true;
    const hint = supOk && !grip2.held && settings.grip !== 'off' && dGrip < VC.HINT_RADIUS;
    gripRing.visible = hint;
    if (hint) gripRing.material.opacity = dGrip < VC.GRAB_RADIUS ? 0.95 : 0.35;
  }

  let nextPulse = 0, prevHit = false, prevHurt = false;
  function updateWeapon(me, fp, now, dt) {
    const R = domHand();
    const Sup = supHand();
    const armed = fp && me.alive;
    if (armed && R && !menu.open) {
      if (gunWeapon !== me.weapon) buildGun(me.weapon);
      gunHolder.visible = true;
      updateGunPose(R, Sup, dt || 0);
      // Mondingsvuur/kogelsporen van eigen schoten vanaf het VR-geweer (game.js gebruikt e.muzzle).
      if (me.muzzle !== vrMuzzle) {
        restoreMuzzle();
        originalMuzzle = me.muzzle; muzzleOwner = me; me.muzzle = vrMuzzle;
      }
      vrMuzzle.getWorldPosition(aimOrigin);
      aimDir.set(0, 0, -1).transformDirection(gunRoot.matrixWorld);
    } else {
      gunHolder.visible = false;
      if (grip2.held || grip2Blend > 0 || glove.visible || gripRing.visible) releaseGrip();
      if (!armed) restoreMuzzle();
      // zonder controller in de schiethand: richten met het hoofd
      aimOrigin.copy(headWorld);
      aimDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    }

    // MENU-knop op de pols: richten met de schiethand (geweer of controller) + trekker.
    let wristHover = false;
    if (R && !menu.open && wrist.mesh.visible) {
      const useGun = armed && gunHolder.visible;
      if (useGun) tmpV.setFromMatrixPosition(gunRoot.matrixWorld);
      else { R.ray.updateWorldMatrix(true, false); tmpV.setFromMatrixPosition(R.ray.matrixWorld); }
      const dir = useGun ? aimDir : tmpV2.set(0, 0, -1).transformDirection(R.ray.matrixWorld);
      const m = lastPad || {};
      const wp = menu.wristPointer(R, tmpV, dir, domSide() === 'left' ? m.trigLEdge : m.trigREdge, true);
      wristHover = wp.hover;
      if (wp.hover) input.fire = false;           // niet schieten op je eigen pols
      if (wp.click) { menu.openMenu(); fireLock = true; }
    } else if (!menu.open) {
      menu.wristIdle();
    }

    if (armed && !menu.open) {
      const o = VC.clampOrigin(aimOrigin, me.x, me.y, me.z, 3);
      aimOrigin.set(o.x, o.y, o.z);
      camera.userData.dir = aimDir;
      camera.userData.vrOrigin = aimOrigin;
      camera.userData.vrShot = VC.shotFlags(grip2.held, grip2Blend, S.WEAPONS[me.weapon]);
      const lvl = ctx.getLevelId();
      const len = Math.max(0.3, Math.min(60, S.rayBlockDistance(lvl, aimOrigin, aimDir, 60)));
      laser.visible = !!R && !wristHover;
      laser.scale.set(1, 1, len);
      dot.visible = !!R && len < 59 && !wristHover;
      if (dot.visible) {
        dot.position.copy(aimOrigin).addScaledVector(aimDir, len - 0.03);
        dot.scale.setScalar(Math.max(1, len * 0.06));
      }
      // trilling bij schieten (zelfde ritme als tryFire)
      const w = S.WEAPONS[me.weapon];
      if (input.fire && ctx.getPhase() === 'playing' && now >= nextPulse && w) {
        nextPulse = now + w.interval * 1000;
        pulse(R, me.weapon === 'shotgun' ? 0.9 : 0.45, me.weapon === 'shotgun' ? 70 : 35);
      }
    } else {
      camera.userData.vrOrigin = null;
      camera.userData.vrShot = null;
      laser.visible = false;
      dot.visible = false;
    }

    const hit = !!($('hitmarker') && $('hitmarker').classList.contains('show'));
    if (hit && !prevHit) { laser.material.color.setHex(0xffffff); pulse(R, 0.3, 25); }
    if (!hit && prevHit) laser.material.color.setHex(0xff5a3c);
    prevHit = hit;
    const hurt = !!($('vignette') && $('vignette').classList.contains('show'));
    if (hurt && !prevHurt) { hurtNow = 1; pulse(Sup, 0.6, 60); pulse(R, 0.6, 60); }
    prevHurt = hurt;
  }

  // ---------------------------------------------------------- HUD-panelen

  const txt = (id) => { const el = $(id); return el ? el.textContent : ''; };
  const isHidden = (id) => { const el = $(id); return !el || el.classList.contains('hidden'); };
  let hudState = null, nextHudRead = 0;

  function readHudState() {
    const lang = ctx.getLang ? ctx.getLang() : 'en';
    const scr = ctx.getScreen ? ctx.getScreen() : 'hud';
    const st = { lang, mode: scr === 'hud' ? 'game' : scr === 'lobby' ? 'lobby' : 'menu' };
    if (toast && performance.now() < toast.until) st.toast = toast.text; else toast = null;
    if (st.mode === 'menu') { st.menuMsg = txt('menuMsg'); return st; }
    if (st.mode === 'lobby') {
      const names = [];
      const ul = $('playerList');
      if (ul) for (const li of ul.children) {
        const nm = li.querySelector('.nm');
        names.push((nm ? nm.textContent : li.textContent).trim());
      }
      st.lobby = { code: txt('roomCode'), players: names, host: !isHidden('btnStart') };
      return st;
    }
    st.hp = Number(txt('hpText')) || 0;
    st.alive = txt('hudAlive'); st.level = txt('hudLevel'); st.target = txt('hudTarget');
    st.protect = !isHidden('protect');
    const feed = $('feed');
    st.feed = feed ? [...feed.children].map((c) => c.textContent) : [];
    const b = $('banner');
    const parts = b ? [...b.children].map((c) => c.textContent) : [];
    st.banner = [parts[0] || '', parts[1] || ''];
    const kc = $('killConfirm');
    st.kill = kc && kc.classList.contains('show') ? txt('killName') : '';
    st.spectate = txt('spectateMsg');
    st.takeover = isHidden('btnTakeover') ? '' : txt('btnTakeover').replace(/\s*\[E\]\s*$/, '');
    if (!isHidden('matchEnd')) {
      const body = $('meBody');
      st.matchEnd = {
        tag: txt('meTag'), title: txt('meTitle'), back: txt('meBack'),
        rows: body ? [...body.rows].map((tr) => [...tr.cells].map((td) => td.textContent)) : [],
      };
      st.banner = ['', '']; st.takeover = ''; st.spectate = '';
    }
    return st;
  }

  function redraw(p, layout) {
    const key = VC.hudKey(hudState, layout);
    if (key === p.key) return;
    p.key = key;
    VC.drawHud(p.g, hudState, layout);
    p.tex.needsUpdate = true;
  }

  function updatePanels(me, dt) {
    const now = performance.now();
    if (now >= nextHudRead || !hudState) { hudState = readHudState(); nextHudRead = now + 100; }

    // groot paneel: volgt de kijkrichting traag (alleen als je ver weg draait), iets onder ooghoogte
    const want = VC.bannerHasContent(hudState) ? 1 : 0;
    banner.alpha += (want - banner.alpha) * Math.min(1, dt * 6);
    banner.mesh.visible = banner.alpha > 0.02;
    if (banner.mesh.visible) {
      redraw(banner, 'banner');
      const diff = VC.wrapAngle(headYawL - banner.yaw);
      if (Math.abs(diff) > 0.6 || banner.alpha < 0.1) banner.follow = true;
      if (banner.follow) {
        banner.yaw = VC.wrapAngle(banner.yaw + diff * Math.min(1, dt * (banner.alpha < 0.1 ? 60 : 3)));
        if (Math.abs(diff) < 0.05) banner.follow = false;
      }
      // in het spel duidelijk onder de kijklijn (vizier/meegekeken speler vrij), in de lobby hoger
      const drop = hudState && hudState.mode === 'game' && !hudState.matchEnd ? 0.6 : 0.25;
      banner.mesh.position.set(
        headLocal.x + Math.sin(banner.yaw) * 1.9, Math.max(0.6, headLocal.y - drop), headLocal.z + Math.cos(banner.yaw) * 1.9);
      banner.mesh.material.opacity = banner.alpha;
      banner.mesh.updateMatrixWorld();
      banner.mesh.lookAt(headWorld);
    }

    // polspaneel: boven de steunhand (normaal links), altijd naar je hoofd gedraaid; met MENU-knop
    const L = supHand();
    // (verborgen bij tweehandig vasthouden: dan zit de pols op het voorhout, midden in je zichtlijn)
    const showWrist = !!L && hudState && hudState.mode === 'game' && !menu.open && !grip2.held;
    wrist.mesh.visible = showWrist;
    if (showWrist) {
      redraw(wrist, 'wrist');
      L.grip.getWorldPosition(tmpV);
      tmpV.y += 0.1;
      const toPanel = tmpV2.copy(tmpV).sub(headWorld);
      const dist = toPanel.length();
      const fwd = tmpV3.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const looking = dist > 0 && fwd.dot(toPanel.divideScalar(dist)) > Math.cos(0.5);
      wrist.mesh.material.opacity = looking ? 1 : 0.45;
      rig.worldToLocal(tmpV);
      wrist.mesh.position.copy(tmpV);
      wrist.mesh.updateMatrixWorld();
      wrist.mesh.lookAt(headWorld);
    }
  }

  function updateComfort(dt) {
    vigNow += (vigTarget - vigNow) * Math.min(1, dt * 5);
    hurtNow = Math.max(0, hurtNow - dt * 3);
    comfortMat.uniforms.fade.value = fade.a;
    comfortMat.uniforms.vig.value = vigNow;
    comfortMat.uniforms.hurt.value = hurtNow;
    comfort.visible = fade.a > 0.001 || vigNow > 0.01 || hurtNow > 0.01;
  }

  // Lobby/menu in VR: game.js tekent dan niets, dus wij wel.
  function idle(dt, now) {
    if (!active) return;
    readPose();
    const m = readPads(dt);
    input.jx = 0; input.jy = 0; input.fire = false;
    if (mode !== 'idle') {
      VC.blink(fade);
      mode = 'idle';
      restoreMuzzle();
      const lvl = ctx.getLevelId();
      const gy = lvl ? S.heightAt(lvl, 0, 0) : 0;
      setRig(VC.rigPositionFor(0, gy, 0, headLocal, rigYaw));
      lastMe = null;
    }
    turnAroundHead(m.turn);
    if (m.start && ctx.getScreen && ctx.getScreen() === 'lobby' && !isHidden('btnStart')) {
      const b = $('btnStart');
      if (b) b.click();
    }
    VC.fadeStep(fade, dt);
    vigTarget = 0;
    rig.rotation.set(0, rigYaw, 0);
    rig.updateMatrixWorld(true);
    headWorld.copy(headLocal).applyMatrix4(rig.matrixWorld);
    camera.position.copy(headWorld);
    camera.quaternion.setFromAxisAngle(yAxis, rigYaw).multiply(headQuatL);
    idleFloor.visible = true;
    gunHolder.visible = false; laser.visible = false; dot.visible = false; wrist.mesh.visible = false;
    if (grip2.held || glove.visible) releaseGrip();
    camera.userData.vrOrigin = null;
    camera.userData.vrShot = null;
    updatePanels(null, dt);
    if (!menu.open) menu.wristIdle();
    updateMenu(dt);
    updateComfort(dt);
    if (ctx.sky) ctx.sky.position.copy(headWorld);
    renderer.render(scene, camera);
    afterRender();
  }

  function afterRender() {
    if (!active) return;
    // renderer.render heeft camera.position/quaternion lokaal (in de rig) gezet: terug naar wereld
    camera.matrixWorld.decompose(tmpV, tmpQ, tmpV2);
    camera.position.copy(tmpV);
    camera.quaternion.copy(tmpQ);
  }

  const api = {
    get active() { return active; },
    get supported() { return supported; },
    get mode() { return mode; },
    get settings() { return { ...settings }; },
    get menuOpen() { return menu.open; },
    enterVR, idle, preUpdate, updateCamera, afterRender,
    setSettings: setVr, toggleMenu,
    _internals: {
      rig, fade, slots, banner, wrist, comfort, gunHolder, gunRoot, vrMuzzle, menu, glove, gripRing, THREE,
      get hudState() { return hudState; },
      get grip() { return { ...grip2, blend: grip2Blend }; },
      domHand, supHand,
      // steunpunt van het huidige wapen voor de één-hand-houding (rig-coördinaten)
      gripPointLocal() { const D = domHand(); return D ? VC.gripPointFor(D.ray.position, D.ray.quaternion, gunWeapon || 'rifle') : null; },
    },
  };
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__vr = api;
  return api;
}
