import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chooseRings, makeSilhouette} from '../scripts/worldwise-geography.mjs';
const data = JSON.parse(await readFile(new URL('../worldwise/data/world.json', import.meta.url)));
const geo = JSON.parse(await readFile(new URL('../worldwise/data/geography.json', import.meta.url)));
const rectangle = (x0, y0, x1, y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
test('France keeps metropolitan France and Corsica without French Guiana shrinking the card', () => {
  const mainland = rectangle(-4,42,8,51), corsica = rectangle(8.5,41.5,9.5,43), guiana = rectangle(-54,2,-52,6);
  const rings = chooseRings({type:'MultiPolygon',coordinates:[[mainland],[corsica],[guiana]]}, 'FRA');
  assert.deepEqual(rings, [mainland, corsica]);
});
test('date-line fragments use the short longitude span', () => {
  const rings = chooseRings({type:'MultiPolygon',coordinates:[[rectangle(170,60,180,70)],[rectangle(-180,60,-170,70)]]}, 'TEST');
  const xs = rings.flat().map(p => p[0]);
  assert.equal(Math.max(...xs) - Math.min(...xs), 20);
  assert.ok(!makeSilhouette(rings).includes('NaN'));
});
test('every playable country has a finite silhouette inside the card frame', () => {
  for (const country of data.countries) {
    const path = geo.shapes[country.id];
    assert.ok(path?.startsWith('M'), country.id);
    assert.match(path, /^[MLZ\d., -]+$/, country.id);
    const pairs = [...path.matchAll(/([\d.-]+),([\d.-]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    assert.ok(pairs.length >= 4, country.id);
    for (const [x,y] of pairs) assert.ok(x >= 0 && x <= 240 && y >= 0 && y <= 160, country.id);
  }
});
