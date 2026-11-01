// Refresh scripts retain source definitions and derivation inputs in provenance/.
// The browser downloads only this small projection needed to play and chart.
import {readFile, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {countryNames} from './worldwise-countries.mjs';
import {definitions} from './worldwise-metrics.mjs';
const dir = new URL('../worldwise/data/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, dir), 'utf8'));
const [worldbank, food, energy] = await Promise.all(['provenance/worldbank.json', 'provenance/food.json', 'provenance/energy.json'].map(read));
const records = [...worldbank.metrics, ...food, ...energy.metrics];
const foodDefinitions = JSON.parse(await readFile(new URL('./worldwise-sources/food.json', import.meta.url), 'utf8'));
const curated = new Map([...definitions, ...foodDefinitions].map(m => [m.id, m]));
const countries = worldbank.countries.map(({id, iso2}) => ({id, iso2, name: countryNames[id]})).sort((a,b) => a.name.localeCompare(b.name));
const ids = new Set(countries.map(c => c.id)), metricIds = new Set();
const fields = ['id','indicator','label','question','definition','category','family','unit','format','precision','valueLabel','gapLabel','minGap','gapKind','scale','allowNegative','allowOver100','minCountries','year','timeLabel','asOf','provider','sourceUrl','providerUrl','license','licenseUrl','denominatorSourceUrl','values'];
const source = await readFile(new URL('../worldwise/engine.js', import.meta.url), 'utf8');
const {valueGap, formatValue} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const metrics = records.map(record => {
  const definition = curated.get(record.id);
  if (definition && definition.indicator !== record.indicator) throw new Error(`Refresh required after changing indicator: ${record.id}`);
  const m = {...record, ...definition, license: record.license || record.sourceLicense, licenseUrl: record.licenseUrl || record.sourceLicenseUrl};
  m.family ||= m.id;
  m.providerUrl ||= m.sourceUrl;
  if (m.id === 'temperature') m.provider = 'Copernicus / OWID';
  if (metricIds.has(m.id)) throw new Error(`Duplicate topic: ${m.id}`);
  metricIds.add(m.id);
  for (const key of ['question','definition','valueLabel','sourceName','sourceDefinition','sourceUrl','license','licenseUrl','provider']) if (!m[key]) throw new Error(`Missing ${m.id}/${key}`);
  if (!m.sourceUrl.startsWith('https://') || !m.licenseUrl.startsWith('https://')) throw new Error(`Invalid source URL: ${m.id}`);
  const pairs = Object.entries(m.values);
  if (pairs.length < (m.minCountries || 90)) throw new Error(`Insufficient coverage: ${m.id}`);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(m.year) || m.year < currentYear - 5 || m.year > currentYear - 1 + Number(Boolean(m.asOf))) throw new Error(`Invalid year: ${m.id}`);
  let playable = 0;
  for (const [id, value] of pairs) {
    if (!ids.has(id) || !Number.isFinite(value) || (!m.allowNegative && value < 0)
      || (m.scale === 'log' && value <= 0) || (m.scale === 'log1p' && value < 0)
      || (m.unit === 'percent' && !m.allowOver100 && value > 100.001)) throw new Error(`Invalid observation: ${m.id}/${id}`);
  }
  const displayed = pairs.map(([, value]) => formatValue(m, value));
  for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) {
    const gap = valueGap(m, pairs[a][1], pairs[b][1]) / m.minGap;
    if (gap >= 1.25 && gap <= 3 && displayed[a] !== displayed[b]) playable++;
  }
  if (playable < 100) throw new Error(`Too few fair matchups: ${m.id} (${playable})`);
  return Object.fromEntries(fields.filter(key => m[key] !== undefined).map(key => [key, m[key]]));
});
const edition = createHash('sha256').update(JSON.stringify({countries,metrics})).digest('hex').slice(0,12);
const snapshot = {generatedAt: new Date().toISOString(), edition, countries, metrics};
const output = new URL('world.json', dir), temp = new URL('world.json.tmp', dir);
await writeFile(temp, JSON.stringify(snapshot) + '\n');
await rename(temp, output);
console.log(`Built ${metrics.length} topics, ${metrics.reduce((sum,m) => sum + Object.keys(m.values).length, 0)} observations. Edition ${edition}.`);
