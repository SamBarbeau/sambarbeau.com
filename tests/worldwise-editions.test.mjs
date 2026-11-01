import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EDITIONS, dailyEdition} from '../worldwise/editions.js';
import {parseRoute} from '../worldwise/routes.js';

const dataBytes = await readFile(new URL('../worldwise/editions/v1.json', import.meta.url));
const launchData = JSON.parse(dataBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('launch data and generator remain byte-for-byte identical to the published release', async () => {
  assert.equal(hash(dataBytes), 'e764fb8902fae4d17bd2e13a1a25698bcd8c2b6c851f65ceca8160ffa12a70a3');
  assert.equal(hash(await readFile(new URL('../worldwise/editions/v1-engine.js', import.meta.url))), 'ee6ad4f92d8c653670d59809bce20307ec14bdb90ef5175d2e89b721f36ad5c3');
});

test('November 1 keeps its original ten topics, country positions, and winners', () => {
  const edition = dailyEdition('2026-11-01');
  assert.equal(edition.id, '1');
  const questions = edition.generateGame(launchData, `${launchData.edition}:daily-2026-11-01`);
  assert.deepEqual(questions.map(q => [q.metric.id, ...q.countries.map(c => c.id), q.winner]), [
    ['children', 'IND', 'FRA', 0], ['rice_harvest', 'ESP', 'TUR', 1], ['mobile', 'CAN', 'USA', 1],
    ['renewables', 'ROU', 'BEL', 0], ['urban', 'UGA', 'VNM', 1], ['density', 'SRB', 'POL', 1],
    ['researchers', 'EST', 'AUT', 1], ['forest', 'BGR', 'AGO', 1], ['hospitalbeds', 'AZE', 'FIN', 0],
    ['oliveoil_supply', 'MKD', 'DEU', 0],
  ]);
});

test('future editions only affect daily dates at or after their activation date', () => {
  const editions = [...EDITIONS, {id: 'future', dailyFrom: '2099-01-01'}];
  assert.equal(dailyEdition('2026-11-01', editions).id, '1');
  assert.equal(dailyEdition('2098-12-31', editions).id, EDITIONS.at(-1).id);
  assert.equal(dailyEdition('2099-01-01', editions).id, 'future');
  assert.equal(parseRoute('?seed=1z141z3').version, '1');
  assert.equal(parseRoute('?challenge=ab12cd34').version, '1');
  assert.equal(parseRoute('?challenge=ab12cd34&v=1').version, '1');
});

test('browser entry and mutable modules use the same cache revision', async () => {
  const html = await readFile(new URL('../worldwise/index.html', import.meta.url), 'utf8');
  const revision = html.match(/src="app\.js\?rev=(\d+)"/)?.[1];
  assert.ok(revision);
  for (const file of ['app.js', 'history.js', 'routes.js', 'editions.js']) {
    const source = await readFile(new URL(`../worldwise/${file}`, import.meta.url), 'utf8');
    for (const [, path] of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)) {
      if (path.startsWith('./editions/')) continue; // Frozen files are already versioned by path.
      assert.ok(path.endsWith(`?rev=${revision}`), `${file}: ${path} could reuse a stale module`);
    }
  }
});
