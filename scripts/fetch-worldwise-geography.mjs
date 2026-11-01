import {readFile, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chooseRings, makeSilhouette, displayExtents} from './worldwise-geography.mjs';
const run = promisify(execFile);
const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const localFile = process.argv[2];
const content = localFile ? await readFile(localFile, 'utf8') : (await run('curl', ['-fsSL', '--max-time', '90', url], {maxBuffer: 30 * 1024 * 1024})).stdout;
const geo = JSON.parse(content);
const data = JSON.parse(await readFile(new URL('../worldwise/data/world.json', import.meta.url), 'utf8'));
const target = new URL('../worldwise/data/geography.json', import.meta.url);
const previous = JSON.parse(await readFile(target, 'utf8'));
const shapes = {};
for (const country of data.countries) {
  const feature = geo.features.find(f => ['ISO_A3_EH', 'ISO_A3', 'ADM0_A3'].some(key => f.properties[key] === country.id));
  if (!feature) throw new Error(`Missing country outline: ${country.id}`);
  shapes[country.id] = makeSilhouette(chooseRings(feature.geometry, country.id));
}
const result = {
  source: 'Natural Earth, public domain. Simplified 1:50m country silhouettes; 1:110m globe dots. Some silhouettes show the mainland or main islands for readability. Shapes are not to a shared scale.',
  sourceUrl: 'https://www.naturalearthdata.com/', geometryUrl: url,
  displayExtents, shapes, land: previous.land,
};
await writeFile(target, JSON.stringify(result) + '\n');
console.log(`Saved ${Object.keys(shapes).length} silhouettes, including Singapore.`);
