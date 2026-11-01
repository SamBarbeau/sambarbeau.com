import { countryIds, countryNames } from './worldwise-countries.mjs';
import { definitions } from './worldwise-metrics.mjs';
import { selectYear } from './worldwise-data.mjs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

// A deliberately recognizable country pool. World Bank regions, income groups,
// and dependent territories are never answer options.



async function get(path) {
  const url = `https://api.worldbank.org/v2/${path}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // curl honors the host's HTTP proxy configuration; no npm dependencies.
      const { stdout } = await run('curl', ['-fsSL', '--max-time', '60', '-A', 'Worldwise/1.0', url], { maxBuffer: 20 * 1024 * 1024 });
      const json = JSON.parse(stdout);
      if (!Array.isArray(json) || !Array.isArray(json[1])) throw new Error(`Unexpected API response for ${url}`);
      if (json[0].pages > 1) throw new Error(`Incomplete pagination for ${url}`);
      return json[1];
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
}

const metadata = await get('country?format=json&per_page=400');
const countries = metadata.filter(c => countryIds.includes(c.id) && c.region.id !== 'NA').map(c => ({
  id: c.id, iso2: c.iso2Code, name: countryNames[c.id], region: c.region.value,
  lat: Number(c.latitude), lon: Number(c.longitude), capital: c.capitalCity,
})).sort((a, b) => a.name.localeCompare(b.name));
if (countries.length !== countryIds.length || new Set(countries.map(c => c.id)).size !== countryIds.length) throw new Error('Some countries are missing, duplicated, or aggregate regions.');

const metrics = [];
const newestYear = new Date().getUTCFullYear() - 1, oldestYear = newestYear - 4;
const rowRequests = new Map();
function getRows(indicator) {
  if (!rowRequests.has(indicator)) rowRequests.set(indicator, get(`country/${countryIds.join(';')}/indicator/${indicator}?source=2&date=${oldestYear}:${newestYear}&format=json&per_page=20000`));
  return rowRequests.get(indicator);
}
async function fetchMetric(definition) {
  const [rows, meta, denominatorRows] = await Promise.all([
    getRows(definition.indicator),
    get(`indicator/${definition.indicator}?source=2&format=json&per_page=100`),
    definition.denominator ? getRows(definition.denominator) : null,
  ]);
  const selected = selectYear(definition, rows, denominatorRows, countryIds, newestYear, oldestYear);
  const details = meta.find(m => m.id === definition.indicator);
  if (!details?.sourceNote || !details?.sourceOrganization) throw new Error(`Missing provenance for ${definition.id}`);
  console.log(`${definition.id}: ${selected.year}, ${Object.keys(selected.values).length} countries`);
  return {...definition, ...selected, sourceUrl: `https://data.worldbank.org/indicator/${definition.indicator}`, sourceName: details.sourceOrganization, sourceDefinition: details.sourceNote,
    provider: 'World Bank', providerUrl: 'https://data.worldbank.org/', license: 'CC BY 4.0', licenseUrl: 'https://datacatalog.worldbank.org/public-licenses#cc-by',
    ...(definition.denominator ? {denominatorSourceUrl: `https://data.worldbank.org/indicator/${definition.denominator}`} : {})};
}
// Limit concurrent requests while preserving the curated topic order.
for (let i = 0; i < definitions.length; i += 3) {
  metrics.push(...await Promise.all(definitions.slice(i, i + 3).map(fetchMetric)));
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  source: { name: 'World Bank — World Development Indicators', url: 'https://data.worldbank.org/', api: 'https://api.worldbank.org/v2/', license: 'CC BY 4.0', licenseUrl: 'https://datacatalog.worldbank.org/public-licenses#cc-by' },
  notes: ['Each indicator uses a single year with at least 90 countries.', 'Missing values are omitted; the game never fills or interpolates them. Sources may publish modeled estimates.', 'Derived rates join numerator and population by ISO3 country code and the exact same year.', 'Precipitation is a long-term average, not weather observed in the source year.', 'Country coordinates refer to capital locations from the World Bank country API.', 'The question pool is a curated selection of countries, not every country in the world.', 'Data can be revised by the source; this game uses a fixed snapshot.'],
  countries, metrics,
};
const output = fileURLToPath(new URL('../worldwise/data/provenance/worldbank.json', import.meta.url));
await mkdir(fileURLToPath(new URL('../worldwise/data/provenance/', import.meta.url)), { recursive: true });
// An incomplete fetch never replaces the playable dataset.
await writeFile(output + '.tmp', JSON.stringify(snapshot, null, 2) + '\n');
await rename(output + '.tmp', output);
console.log(`Saved ${countries.length} countries and ${metrics.length} metrics to ${output}`);
