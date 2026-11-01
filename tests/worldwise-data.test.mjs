import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectYear, valuesForYear } from '../scripts/worldwise-data.mjs';
import { definitions } from '../scripts/worldwise-metrics.mjs';
import { countryNames } from '../scripts/worldwise-countries.mjs';

const data = JSON.parse(await readFile(new URL('../worldwise/data/world.json', import.meta.url), 'utf8'));
const wb = JSON.parse(await readFile(new URL('../worldwise/data/provenance/worldbank.json', import.meta.url), 'utf8'));
const food = JSON.parse(await readFile(new URL('../worldwise/data/provenance/food.json', import.meta.url), 'utf8'));
const energy = JSON.parse(await readFile(new URL('../worldwise/data/provenance/energy.json', import.meta.url), 'utf8'));
const auditMetrics = [...wb.metrics, ...food, ...energy.metrics];

test('snapshot has uniquely identified countries and source provenance', () => {
  assert.ok(data.countries.length >= 60);
  assert.equal(new Set(data.countries.map(c => c.id)).size, data.countries.length);
  assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
  assert.match(data.edition, /^[a-f0-9]{12}$/);
  for (const country of data.countries) {
    assert.match(country.id, /^[A-Z]{3}$/);
    assert.match(country.iso2, /^[A-Z]{2}$/);
    assert.equal(country.name, countryNames[country.id]);
  }
});

test('each metric uses valid same-year values and adequate country coverage', () => {
  const ids = new Set(data.countries.map(c => c.id));
  assert.equal(data.metrics.length, 100);
  assert.equal(new Set(data.metrics.map(m => m.id)).size, data.metrics.length);
  assert.deepEqual(wb.metrics.map(m => m.id), definitions.map(m => m.id));
  assert.ok(!data.metrics.some(m => m.id === 'airlines'));
  assert.equal(data.countries.find(c => c.id === 'VNM').name, 'Vietnam');
  for (const metric of data.metrics) {
    assert.ok(Number.isInteger(metric.year) && metric.year >= 2021 && metric.year <= new Date().getUTCFullYear() - 1 + Number(Boolean(metric.asOf)));
    assert.ok((metric.minCountries || 90) >= 60);
    assert.ok(Object.keys(metric.values).length >= (metric.minCountries || 90), metric.id);
    assert.ok(metric.definition && metric.valueLabel && metric.category && metric.provider && metric.license);
    assert.ok(metric.sourceUrl.startsWith('https://') && metric.licenseUrl.startsWith('https://'));
    const original = auditMetrics.find(m => m.id === metric.id);
    assert.ok(original.sourceDefinition && original.sourceName, metric.id);
    assert.deepEqual(metric.values, original.values);
    assert.ok(!('sourceDefinition' in metric) && !('components' in metric), 'initial download contains only runtime data');
    for (const [id, value] of Object.entries(metric.values)) {
      assert.ok(ids.has(id), `${metric.id} includes unknown country ${id}`);
      assert.ok(Number.isFinite(value) && (metric.allowNegative || value >= 0), `${metric.id}/${id}`);
      if (metric.unit === 'percent' && !metric.allowOver100) assert.ok(value <= 100.001, `${metric.id}/${id} exceeds 100%`);
      if (metric.scale === 'log') assert.ok(value > 0, `${metric.id}/${id} cannot be plotted on a log axis`);
    }
  }
});

test('every metric has enough meaningfully different pairs for varied rounds', () => {
  for (const metric of data.metrics) {
    const values = Object.values(metric.values);
    let playable = 0;
    for (let a = 0; a < values.length; a++) {
      for (let b = a + 1; b < values.length; b++) {
        const gap = metric.gapKind === 'ratio' ? Math.abs(values[a] - values[b]) / Math.min(values[a], values[b]) : Math.abs(values[a] - values[b]);
        if (gap >= metric.minGap * 1.25 && gap <= metric.minGap * 3) playable++;
      }
    }
    assert.ok(playable >= 100, `${metric.id} has too few fair pairs`);
  }
});

const row = (countryiso3code, date, value, indicator = 'numerator') => ({countryiso3code, date: String(date), value, indicator: {id: indicator}});
test('imports omit nulls, retain real zeros, and reject duplicate or invalid records', () => {
  assert.deepEqual(valuesForYear([row('AAA', 2024, 0), row('BBB', 2024, null), row('WLD', 2024, 10)], 'numerator', 2024, ['AAA', 'BBB']), {AAA: 0});
  assert.throws(() => valuesForYear([row('AAA', 2024, 1), row('AAA', 2024, 2)], 'numerator', 2024, ['AAA']), /Duplicate/);
  assert.throws(() => valuesForYear([row('AAA', 2024, '2')], 'numerator', 2024, ['AAA']), /Invalid/);
  assert.throws(() => valuesForYear([row('AAA', 2024, 2, 'wrong')], 'numerator', 2024, ['AAA']), /Wrong indicator/);
});
test('derived rates join country codes and years, never nearby observations or zeros', () => {
  const metric = {id: 'test', indicator: 'numerator', denominator: 'population', multiplier: 1000000};
  const numerator = [row('AAA', 2025, 50), row('AAA', 2024, 20), row('BBB', 2024, 100), row('CCC', 2024, 3)];
  const denominator = [row('AAA', 2024, 1000000, 'population'), row('BBB', 2023, 1000000, 'population'), row('CCC', 2024, 0, 'population')];
  const selected = selectYear(metric, numerator, denominator, ['AAA', 'BBB', 'CCC'], 2025, 2024, 1);
  assert.equal(selected.year, 2024);
  assert.deepEqual(selected.values, {AAA: 20});
  assert.deepEqual(selected.components, {AAA: {numerator: 20, denominator: 1000000}});
  assert.throws(() => selectYear(metric, numerator, denominator, ['AAA', 'BBB', 'CCC'], 2025, 2024, 2), /Insufficient/);
});
test('saved derived values can be reproduced from their source components', () => {
  for (const metric of auditMetrics.filter(m => m.denominator)) {
    assert.equal(Object.keys(metric.components).length, Object.keys(metric.values).length);
    for (const [id, value] of Object.entries(metric.values)) {
      const {numerator, denominator} = metric.components[id];
      assert.ok(denominator > 0);
      assert.equal(value, numerator / denominator * metric.multiplier);
    }
  }
});
