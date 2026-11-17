import * as THREE from 'three';
import * as MC from './vr-menu-core.js';
import { vrBridge } from './settings.js';

/* ============================================================
 * VR-menu (fase VR2): instellingen/pauzemenu als paneel in de wereld.
 *
 * vr.js maakt het menu één keer aan (createVRMenu) en roept per frame menu.update(...) aan.
 *  - Openen/sluiten: Y lang ingedrukt (vr.js) of de MENU-knop boven het polspaneel
 *    (richten met de schiethand + trekker, zie wristPointer).
 *  - Het paneel staat ~1 m voor je op borsthoogte en blijft daar staan (hangt in de rig,
 *    beweegt dus niet met je hoofd mee).
 *  - Bediening: laser uit beide controllers, trekker = klikken, trilling bij hover/klik.
 *  - Instellingen die het pc-menu ook heeft (graphics, volume, taal, spel verlaten) gaan via
 *    settings.js (vrBridge): zelfde opslag (cc_settings) en dezelfde apply-functies.
 *    VR-instellingen (draaien, schiethand, twee handen, zittend/hoogte) beheert vr.js via
 *    o.getVr()/o.setVr().
 * ============================================================ */

/**
 * o: { rig, slots: [{ ray, source }], getLang(), getVr(), setVr(next), pulse(slot, intensity, ms),
 *      exitVR(), onOpen(), onClose() }
 */
export function createVRMenu(o) {
  const { rig } = o;
  let open = false;
  let needPlace = false;
  let tab = 'comfort';
  let confirm = false;
  let layout = null;
  let drawnKey = '';
  const hover = new Set();
  const hoverBy = new Map();             // slot -> item-id

  // ---------------------------------------------------------- paneel
  const canvas = document.createElement('canvas');
  canvas.width = MC.MENU_W; canvas.height = MC.MENU_H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(MC.MENU_M, MC.MENU_M * MC.MENU_H / MC.MENU_W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  panel.name = 'vrMenu';
  panel.renderOrder = 30;
  panel.frustumCulled = false;
  panel.visible = false;
  rig.add(panel);
  const halfW = MC.MENU_M / 2, halfH = MC.MENU_M * MC.MENU_H / MC.MENU_W / 2;

  // ---------------------------------------------------------- lasers en stippen (wereldruimte)
  const group = new THREE.Group();     // vr.js hangt deze in de scene tijdens een sessie
  group.name = 'vrMenuPointers';
  const zAxis = new THREE.Vector3(0, 0, 1);
  function makePointer() {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]),
      new THREE.LineBasicMaterial({ color: 0xffb455, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false }));
    line.renderOrder = 31; line.frustumCulled = false; line.visible = false;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    dot.renderOrder = 32; dot.frustumCulled = false; dot.visible = false;
    group.add(line, dot);
    return { line, dot };
  }
  const pointers = new Map();          // slot -> { line, dot }
  function pointerFor(slot) {
    let p = pointers.get(slot);
    if (!p) { p = makePointer(); pointers.set(slot, p); }
    return p;
  }
  function showPointer(slot, origin, dir, len, hit) {
    const p = pointerFor(slot);
    p.line.visible = true;
    p.line.position.copy(origin);
    p.line.quaternion.setFromUnitVectors(zAxis, dir);
    p.line.scale.set(1, 1, Math.max(0.01, len));
    p.line.material.color.setHex(hit ? 0xffffff : 0xffb455);
    p.dot.visible = !!hit;
    if (hit) p.dot.position.copy(origin).addScaledVector(dir, len);
  }
  function hidePointer(slot) {
    const p = pointers.get(slot);
    if (p) { p.line.visible = false; p.dot.visible = false; }
  }
  function hideAllPointers() { for (const s of pointers.keys()) hidePointer(s); }

  // ---------------------------------------------------------- MENU-knop boven het polspaneel
  const wcv = document.createElement('canvas');
  wcv.width = MC.WBTN_W; wcv.height = MC.WBTN_H;
  const wg = wcv.getContext('2d');
  const wtex = new THREE.CanvasTexture(wcv);
  wtex.colorSpace = THREE.SRGBColorSpace;
  const WB_W = 0.08, WB_H = WB_W * MC.WBTN_H / MC.WBTN_W;
  const wristButton = new THREE.Mesh(new THREE.PlaneGeometry(WB_W, WB_H),
    new THREE.MeshBasicMaterial({ map: wtex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  wristButton.name = 'vrMenuWristButton';
  wristButton.renderOrder = 22;
  wristButton.frustumCulled = false;
  // plek t.o.v. het polspaneel (0.2 x 0.1 m): rechtsboven, net erboven
  wristButton.position.set(0.06, 0.05 + WB_H / 2 + 0.006, 0.001);
  let wristKey = '';
  let wristHover = false;
  function drawWrist() {
    const key = wristHover ? 'h' : 'n';
    if (key === wristKey) return;
    wristKey = key;
    MC.drawWristButton(wg, 'MENU', wristHover);   // zelfde woord in NL en EN
    wtex.needsUpdate = true;
  }
  drawWrist();

  const tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3();
  const pc = new THREE.Vector3(), pn = new THREE.Vector3(), pr = new THREE.Vector3(), pu = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  // Basis van een vlak (mesh, normaal = lokale +Z) in wereldruimte.
  function planeBasis(mesh) {
    mesh.getWorldPosition(pc);
    mesh.getWorldQuaternion(tmpQ);
    pn.set(0, 0, 1).applyQuaternion(tmpQ);
    pr.set(1, 0, 0).applyQuaternion(tmpQ);
    pu.set(0, 1, 0).applyQuaternion(tmpQ);
  }

  /**
   * Richten op de MENU-knop van de pols (alleen als het menu dicht is).
   * slot = schiethand, origin/dir = straal in wereldruimte, trigEdge = trekker net ingedrukt,
   * laser = eigen laser tonen. Geeft { hover, click }.
   */
  function wristPointer(slot, origin, dir, trigEdge, laser) {
    let hit = null;
    if (!open && wristButton.parent && wristButton.parent.visible && origin && dir) {
      wristButton.updateWorldMatrix(true, false);
      planeBasis(wristButton);
      hit = MC.rayPanelHit(origin, dir, pc, pn, pr, pu, WB_W / 2 + 0.008, WB_H / 2 + 0.008, 1.5);
    }
    const was = wristHover;
    wristHover = !!hit;
    if (wristHover && !was && slot) o.pulse(slot, 0.15, 12);
    drawWrist();
    if (hit && laser !== false) showPointer(slot, origin, dir, hit.t, true);
    else if (!open && slot) hidePointer(slot);
    return { hover: !!hit, click: !!hit && !!trigEdge };
  }
  function wristIdle() {
    if (wristHover) { wristHover = false; drawWrist(); }
    if (!open) hideAllPointers();
  }

  // ---------------------------------------------------------- openen / sluiten

  function view() {
    return {
      lang: o.getLang ? o.getLang() : 'en', tab, confirm, vr: o.getVr(),
      quality: vrBridge.quality, effectiveQuality: vrBridge.effectiveQuality, volume: vrBridge.volume,
    };
  }

  function openMenu() {
    if (open) return;
    open = true;
    confirm = false;
    needPlace = true;
    hover.clear(); hoverBy.clear();
    drawnKey = '';
    wristHover = false; drawWrist();
    if (o.onOpen) o.onOpen();
  }
  function close() {
    if (!open) return;
    open = false;
    confirm = false;
    panel.visible = false;
    hover.clear(); hoverBy.clear();
    hideAllPointers();
    if (o.onClose) o.onClose();
  }
  function toggle() { if (open) close(); else openMenu(); }

  function click(item, px, slot) {
    const a = item.action;
    o.pulse(slot, 0.45, 25);
    switch (a.type) {
      case 'tab': tab = a.tab; break;
      case 'vr': case 'vrStep': {
        const next = MC.applyVrAction(o.getVr(), a);
        if (next) o.setVr(next);
        break;
      }
      case 'quality': vrBridge.setQuality(a.value); break;
      case 'volume': vrBridge.setVolume(MC.sliderValueAt(item, px)); break;
      case 'volStep': vrBridge.setVolume(MC.stepVolume(vrBridge.volume, a.delta)); break;
      case 'lang': vrBridge.setLang(a.value); break;
      case 'resume': close(); break;
      case 'exitvr': close(); if (o.exitVR) o.exitVR(); break;
      case 'leave': confirm = true; break;
      case 'confirmLeave': close(); vrBridge.leaveGame(); break;
      case 'cancel': confirm = false; break;
      default:
    }
  }

  /**
   * Elke frame (ook als het menu dicht is; dan doet het bijna niets).
   * f: { hands: [{ slot, trigEdge }], headLocal, headYaw, headWorld }
   */
  function update(dt, f) {
    if (!open) return;
    if (needPlace && f.headLocal) {
      const p = MC.menuPlacement(f.headLocal, f.headYaw || 0, 1.0, 0.3);
      panel.position.set(p.x, p.y, p.z);
      panel.updateMatrixWorld(true);
      if (f.headWorld) panel.lookAt(f.headWorld);
      needPlace = false;
    }
    panel.visible = true;
    panel.updateWorldMatrix(true, false);
    layout = MC.buildMenu(view());
    planeBasis(panel);
    const seen = new Set();
    for (const h of f.hands || []) {
      const s = h.slot;
      if (!s || !s.source) continue;
      seen.add(s);
      s.ray.updateWorldMatrix(true, false);
      tmpO.setFromMatrixPosition(s.ray.matrixWorld);
      tmpD.set(0, 0, -1).transformDirection(s.ray.matrixWorld);
      const hit = MC.rayPanelHit(tmpO, tmpD, pc, pn, pr, pu, halfW, halfH, 6);
      let item = null, px = 0;
      if (hit) {
        px = hit.u * MC.MENU_W;
        item = MC.hitTest(layout, px, hit.v * MC.MENU_H);
      }
      showPointer(s, tmpO, tmpD, hit ? hit.t : 1.2, !!hit);
      const id = item ? item.id : null;
      if (id !== (hoverBy.get(s) || null)) {
        if (id) o.pulse(s, 0.12, 10);
        hoverBy.set(s, id);
      }
      if (item && h.trigEdge) {
        click(item, px, s);
        if (!open) return;
        layout = MC.buildMenu(view());
      }
    }
    for (const s of [...hoverBy.keys()]) if (!seen.has(s)) { hoverBy.delete(s); hidePointer(s); }
    hover.clear();
    for (const id of hoverBy.values()) if (id) hover.add(id);
    const key = MC.menuKey(view(), hover);
    if (key !== drawnKey) {
      drawnKey = key;
      MC.drawMenu(g, layout, hover);
      tex.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------- alleen voor tests (localhost)
  // Midden van een menu-item in rig-coördinaten (zelfde ruimte als de XR-referentieruimte).
  function itemPointLocal(id) {
    if (!layout) layout = MC.buildMenu(view());
    const it = layout.items.find((x) => x.id === id);
    if (!it) return null;
    const px = it.x + it.w / 2, py = it.y + it.h / 2;
    const v = new THREE.Vector3((px / MC.MENU_W - 0.5) * 2 * halfW, (0.5 - py / MC.MENU_H) * 2 * halfH, 0);
    panel.updateWorldMatrix(true, false);
    panel.localToWorld(v);
    rig.updateWorldMatrix(true, false);
    return rig.worldToLocal(v);
  }
  function wristPointLocal() {
    if (!wristButton.parent) return null;
    wristButton.updateWorldMatrix(true, false);
    const v = wristButton.getWorldPosition(new THREE.Vector3());
    return rig.worldToLocal(v);
  }

  return {
    get open() { return open; },
    get tab() { return tab; },
    get confirm() { return confirm; },
    get layout() { return layout; },
    panel, group, wristButton,
    openMenu, close, toggle, update, wristPointer, wristIdle,
    itemPointLocal, wristPointLocal,
  };
}
