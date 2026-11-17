// [FPS] Tests voor de pure eerste-persoonsfuncties (public/fps-core.js). Draaien: node tools/test_fps.mjs
import { createRequire } from 'module';
import * as FC from '../public/fps-core.js';
import * as VC from '../public/vr-core.js';

const require = createRequire(import.meta.url);
const S = require('../public/shared.js');

let fails = 0, passes = 0;
function check(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL', msg); } }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---- camerastand
check(FC.parseMode('first') === 'first' && FC.parseMode('third') === 'third', 'parseMode geldig');
check(FC.parseMode(undefined) === 'third' && FC.parseMode('x') === 'third' && FC.parseMode(1) === 'third', 'parseMode standaard derde persoon');
check(FC.nextMode('third') === 'first' && FC.nextMode('first') === 'third' && FC.nextMode(null) === 'first', 'nextMode wisselt');
const me = { alive: true }, bot = { alive: true };
check(FC.wantFirstPerson({ mode: 'first', vr: false, me, focus: me }) === true, 'eerste persoon: levend, eigen speler');
check(FC.wantFirstPerson({ mode: 'third', vr: false, me, focus: me }) === false, 'derde persoon blijft derde persoon');
check(FC.wantFirstPerson({ mode: 'first', vr: true, me, focus: me }) === false, 'nooit in VR');
check(FC.wantFirstPerson({ mode: 'first', vr: false, me: { alive: false }, focus: bot }) === false, 'meekijken = derde persoon');
{
  const dead = { alive: false };
  check(FC.wantFirstPerson({ mode: 'first', vr: false, me: dead, focus: dead }) === false, 'dood zonder meekijkdoel = derde persoon');
}
check(FC.wantFirstPerson({ mode: 'first', vr: false, me: null, focus: null }) === false, 'geen speler');
check(FC.wantFirstPerson(null) === false, 'null');
check(FC.MODES.length === 2 && FC.MODES[0] === 'third', 'MODES: derde persoon eerst (standaard)');

// ---- ooghoogte
const EYE = S.MOVE.EYE;
check(FC.eyeHeight(EYE, 0, false, true) === EYE[0], 'oog staand');
check(FC.eyeHeight(EYE, 1, false, true) === EYE[1], 'oog gehurkt');
check(FC.eyeHeight(EYE, 2, false, true) === EYE[2], 'oog liggend');
check(FC.eyeHeight(EYE, 2, true, true) === EYE[0], 'op de ladder staand oog');
check(FC.eyeHeight(EYE, 1, false, false) === EYE[0], 'dood: staand oog (meekijken)');
check(EYE[0] > EYE[1] && EYE[1] > EYE[2], 'oog daalt met de houding');

// ---- treden zacht bijschuiven
{
  let st = FC.stepSmooth(null, 0, true, 0.016);
  check(st.off === 0 && st.lastY === 0, 'stepSmooth start');
  st = FC.stepSmooth(st, 0.35, true, 0.016);          // trede op een kist
  check(st.off < 0 && st.off > -0.35, 'trede op: camera blijft eerst achter');
  let s2 = st;
  for (let i = 0; i < 30; i++) s2 = FC.stepSmooth(s2, 0.35, true, 0.016);
  check(Math.abs(s2.off) < 0.01, 'trede: na ~0.5 s bijgeschoven');
  // springen: y volgt exact (niet op de grond)
  let j = FC.stepSmooth(null, 0, true, 0.016);
  j = FC.stepSmooth(j, 0.12, false, 0.016);
  check(j.off === 0, 'springen: geen vertraging');
  // langzame helling (kleine stapjes): geen correctie
  let h = FC.stepSmooth(null, 0, true, 0.016);
  h = FC.stepSmooth(h, 0.03, true, 0.016);
  check(h.off === 0, 'helling: geen correctie');
  // teleport: geen correctie
  let tp = FC.stepSmooth(null, 0, true, 0.016);
  tp = FC.stepSmooth(tp, 6, true, 0.016);
  check(tp.off === 0, 'teleport (toren/overnemen): direct');
}

// ---- viewmodel-poses
for (const id of S.WEAPON_IDS) {
  const p = FC.viewmodelPose(id, {});
  check(FC.HIP[id], id + ': heup-pose bestaat');
  check(p.x > 0.05 && p.x < 0.3, id + ': wapen rechts van het midden');
  check(p.y < -0.08 && p.y > -0.3, id + ': wapen onder het oog');
  check(p.z < -0.2 && p.z > -0.6, id + ': wapen voor het oog');
  check(p.scale === 1, id + ': schaal 1 op pc');
  const muzzleZ = p.z - S.WEAPONS[id].muzzle[2];
  check(muzzleZ < -0.6 && muzzleZ > -1.6, id + ': loop eindigt 0.6-1.6 m voor het oog');
  const c = FC.viewmodelPose(id, { compact: true });
  check(c.scale < 1 && c.x < p.x, id + ': telefoon kleiner en meer naar het midden');
  const cr = FC.viewmodelPose(id, { stanceK: [1, 0] });
  check(cr.y < p.y, id + ': gehurkt iets lager');
  const pr = FC.viewmodelPose(id, { stanceK: [0, 1] });
  check(pr.rz > p.rz, id + ': liggend gekanteld');
  const ld = FC.viewmodelPose(id, { ladder: 1 });
  check(ld.y < p.y - 0.2 && ld.rx < -0.5, id + ': ladder = wapen omlaag');
  const ads = FC.viewmodelPose(id, { ads: 1 });
  if (S.WEAPONS[id].zoom) {
    check(FC.ADS[id], id + ': zoomwapen heeft een vizier-pose');
    check(near(ads.x, 0) && ads.y < 0, id + ': vizier = gecentreerd, onder het oog');
  } else {
    check(near(ads.x, p.x) && near(ads.y, p.y), id + ': zonder zoom geen vizier-pose');
  }
  const half = FC.viewmodelPose(id, { ads: 0.5 });
  if (FC.ADS[id]) check(half.x < p.x && half.x > 0, id + ': vizier half = halverwege');
}
check(FC.viewmodelPose('onbekend', {}).x === FC.viewmodelPose('rifle', {}).x, 'onbekend wapen = geweer');
{
  const a = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, b = { x: 1, y: 2, z: 3, rx: 4, ry: 5, rz: 6 };
  const l = FC.lerpPose(a, b, 0.5);
  check(near(l.x, 0.5) && near(l.rz, 3), 'lerpPose');
  check(near(FC.lerpPose(a, b, 2).x, 1) && near(FC.lerpPose(a, b, -1).x, 0), 'lerpPose begrensd');
  const s = FC.addPose(a, b, 0.5);
  check(near(s.y, 1) && near(s.rx, 2), 'addPose met factor');
}
check(FC.VM_FOV >= 45 && FC.VM_FOV <= 75 && FC.VM_FOV_COMPACT >= FC.VM_FOV, 'viewmodel-FOV');

// ---- bob / sway / terugslag
check(FC.advanceBob(0, 0, 0.016) === 0, 'stilstaan: geen bob-fase');
check(near(FC.advanceBob(0, 7, 1), 7 * FC.BOB_RATE), 'bob-fase per meter');
check(FC.advanceBob(2e4, 1, 0.1) < Math.PI * 2, 'bob-fase blijft klein');
check(FC.bobAmp(0, 0, false, 0) === 0, 'bob stil = 0');
check(near(FC.bobAmp(7, 0, false, 0), 1) && near(FC.bobAmp(14, 0, false, 0), 1), 'bob max 1');
check(FC.bobAmp(7, 1, false, 0) < 1 && FC.bobAmp(7, 2, false, 0) < FC.bobAmp(7, 1, false, 0), 'bob kleiner gehurkt/liggend');
check(FC.bobAmp(7, 0, true, 0) === 0, 'geen bob in de lucht');
check(FC.bobAmp(7, 0, false, 1) < 0.2, 'bijna geen bob door het vizier');
{
  let mx = 0, my = 0;
  for (let ph = 0; ph < Math.PI * 2; ph += 0.05) {
    const o = FC.bobOffset(ph, 1);
    mx = Math.max(mx, Math.abs(o.x)); my = Math.max(my, Math.abs(o.y));
  }
  check(mx <= 0.012 && my <= 0.008 && mx > 0.005, 'bob mild (~1 cm)');
  const z = FC.bobOffset(1.3, 0);
  check(z.x === 0 && z.y === 0 && z.rz === 0, 'bob amp 0 = geen beweging');
}
{
  const s = FC.swayTarget(0.02, 0, 0.016);
  check(s.x > 0 && s.x <= FC.SWAY_MAX.x, 'links draaien -> wapen naar rechts (begrensd)');
  const s2 = FC.swayTarget(-5, 5, 0.016);
  check(near(s2.x, -FC.SWAY_MAX.x) && near(s2.y, -FC.SWAY_MAX.y), 'sway begrensd');
  const s3 = FC.swayTarget(0, 0, 0);
  check(s3.x === 0 && s3.y === 0, 'sway zonder draaien = 0 (ook dt 0)');
}
{
  let r = FC.kickRecoil(0, 'rifle');
  check(near(r, FC.RECOIL.rifle), 'terugslag geweer');
  check(FC.kickRecoil(0, 'sniper') > FC.kickRecoil(0, 'smg'), 'sniper schopt harder dan smg');
  for (let i = 0; i < 20; i++) r = FC.kickRecoil(r, 'lmg');
  check(r <= FC.RECOIL_MAX, 'terugslag begrensd');
  let d = 1;
  for (let i = 0; i < 30; i++) d = FC.decayRecoil(d, 0.016);
  check(d < 0.01, 'terugslag dooft in ~0.5 s');
  check(FC.decayRecoil(1e-5, 0.016) === 0, 'terugslag klemt naar 0');
  const o = FC.recoilOffset(1);
  check(o.z > 0 && o.rx > 0 && o.z < 0.08, 'terugslag: naar achteren en loop omhoog');
  for (const id of S.WEAPON_IDS) check(FC.RECOIL[id] > 0, id + ': terugslag gedefinieerd');
}

// ---- handen
for (const id of S.WEAPON_IDS) {
  check(JSON.stringify(FC.SUPPORT_GRIPS[id]) === JSON.stringify(VC.SUPPORT_GRIPS[id]), id + ': steunpunt gelijk aan vr-core');
  const g = FC.supportHandView(id);
  check(g.z < -0.2 && g.z > -0.5 && near(g.x, 0), id + ': linkerhand voor de greep, onder de loop');
}
{
  const v = FC.gunToView([0.1, 0.2, 0.3]);
  check(near(v.x, -0.1) && near(v.y, 0.2) && near(v.z, -0.3), 'gunToView spiegelt x en z');
}

// ---- teksten
for (const l of ['nl', 'en']) {
  for (const k of ['camMode', 'camThird', 'camFirst', 'cCamera', 'tCamera', 'camBtn']) {
    check(typeof FC.FPS_TEXT[l][k] === 'string' && FC.FPS_TEXT[l][k].length > 0, 'tekst ' + l + '.' + k);
  }
}
check(FC.FPS_TEXT.nl.camThird === 'Derde persoon' && FC.FPS_TEXT.nl.camFirst === 'Eerste persoon', 'NL-teksten');
check(FC.FPS_TEXT.en.camThird === 'Third person' && FC.FPS_TEXT.en.camFirst === 'First person', 'EN-teksten');

// ---- server: schietpunt = oog ligt binnen de controle (4 m, y tussen voeten-1 en voeten+6)
for (let st = 0; st < 3; st++) {
  const feet = 3.2, oy = feet + EYE[st];
  check(oy >= feet - 1 && oy <= feet + 6, 'oog houding ' + st + ' binnen de servercontrole');
}

console.log(fails ? fails + ' FAIL, ' + passes + ' ok' : 'alle ' + passes + ' FPS-tests ok');
process.exit(fails ? 1 : 0);
