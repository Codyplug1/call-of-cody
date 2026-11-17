'use strict';
/*
 * Controleert de wapentabel in public/shared.js:
 * alle velden aanwezig, modellen bestaan (< 300 KB) en tijd-tot-uitschakelen per wapen.
 * Gebruik: node tools/test_weapons.js
 */
const fs = require('fs');
const path = require('path');
const Shared = require('../public/shared.js');

let fail = 0;
function check(ok, msg) {
  if (!ok) { fail++; console.log('FOUT:', msg); }
}

const MODELS = path.join(__dirname, '..', 'public', 'models');
console.log('wapen     schade  interval  bereik  min. TTK (100 hp)');
for (const id of Shared.WEAPON_IDS) {
  const w = Shared.WEAPONS[id];
  check(w.id === id, id + ': id klopt niet');
  check(w.name && w.name.nl && w.name.en, id + ': naam NL/EN ontbreekt');
  for (const k of ['damage', 'interval', 'pellets', 'spread', 'range', 'botRange', 'speed']) {
    check(typeof w[k] === 'number' && w[k] > 0, id + ': ' + k + ' moet een positief getal zijn');
  }
  check(Array.isArray(w.muzzle) && w.muzzle.length === 3 && w.muzzle.every(Number.isFinite), id + ': muzzle [x,y,z]');
  check(typeof w.sound === 'string', id + ': sound ontbreekt');
  check(w.zoom === undefined || (w.zoom > 5 && w.zoom < 70), id + ': zoom-FOV buiten bereik');
  check(w.speed <= 1.6, id + ': speed hoger dan de anti-cheat toestaat');
  const file = path.join(MODELS, w.model + '.glb');
  check(fs.existsSync(file), id + ': model ontbreekt ' + file);
  if (fs.existsSync(file)) check(fs.statSync(file).size < 300 * 1024, id + ': model groter dan 300 KB');
  const shots = Math.ceil(100 / (w.damage * w.pellets));
  const ttk = (shots - 1) * w.interval;
  check(ttk >= 0.7 && ttk <= 1.5, id + ': TTK ' + ttk.toFixed(2) + 's valt buiten 0.7-1.5s');
  console.log(id.padEnd(9), String(w.damage + (w.pellets > 1 ? 'x' + w.pellets : '')).padEnd(7),
    String(w.interval).padEnd(9), String(w.range).padEnd(7), ttk.toFixed(2) + 's (' + shots + ' treffers)');
}
// De oorspronkelijke wapens mogen niet veranderen.
const r = Shared.WEAPONS.rifle, s = Shared.WEAPONS.shotgun;
check(r.damage === 12 && r.interval === 0.13 && r.pellets === 1 && r.spread === 0.015 && r.range === 120, 'rifle-waarden gewijzigd');
check(s.damage === 11 && s.interval === 0.8 && s.pellets === 8 && s.spread === 0.065 && s.range === 38, 'shotgun-waarden onverwacht gewijzigd');
{
  const D = (d) => Shared.pelletDamage(s, d);
  check(Math.abs(D(2) - 17.6) < 1e-9 && Math.abs(D(5) - 17.6) < 1e-9, 'shotgun dichtbij: x1.6 per kogeltje');
  check(D(9.5) > 11 && D(9.5) < 17.6, 'shotgun tussen 5 en 14 m: lineair af');
  check(D(14) === 11 && D(20) === 11 && D(38) === 11, 'shotgun op afstand ongewijzigd (11)');
  check(8 * D(3) * 6 / 8 >= 100, 'shotgun dichtbij: 6 van 8 kogeltjes doden (100 hp)');
  check(8 * D(14) < 100, 'shotgun op 14 m nog steeds geen one-shot');
  check(Shared.pelletDamage(r, 3) === r.damage, 'andere wapens ongewijzigd');
}

console.log(fail ? fail + ' FOUT(EN)' : 'ALL OK');
process.exit(fail ? 1 : 0);
