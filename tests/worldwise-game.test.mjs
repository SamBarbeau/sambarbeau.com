import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../worldwise/engine.js', import.meta.url), 'utf8');
const { generateGame, valueGap, scoreAnswers, formatValue, describeGap, unitLabel, MATCHUP_GAP_BAND, CATEGORY_LIMITS } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const data = JSON.parse(await readFile(new URL('../worldwise/data/world.json', import.meta.url), 'utf8'));

test('every round has moderate, distinct matchups with correct answers across 200 seeds', () => {
  const seenTopics = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const questions = generateGame(data, seed);
    assert.equal(questions.length, 10);
    assert.equal(new Set(questions.map(q => q.metric.id)).size, 10);
    const categories = questions.map(q => q.metric.category);
    for (const category of new Set(categories)) assert.ok(categories.filter(c => c === category).length <= (CATEGORY_LIMITS[category] || 3), category);
    assert.equal(new Set(questions.map(q => q.metric.family || q.metric.id)).size, 10, 'related topics should not repeat in a game');
    const pairs = new Set();
    for (const q of questions) {
      seenTopics.add(q.metric.id);
      assert.notEqual(q.countries[0].id, q.countries[1].id);
      const values = q.countries.map(c => q.metric.values[c.id]);
      assert.ok(values.every(v => Number.isFinite(v) && (q.metric.allowNegative || v >= 0)));
      const gap = valueGap(q.metric, ...values);
      const [min, max] = MATCHUP_GAP_BAND.map(multiplier => multiplier * q.metric.minGap);
      assert.ok(gap >= min - 1e-9 && gap <= max + 1e-9, `${q.metric.id}: ${gap} must stay between ${min} and ${max}`);
      assert.ok(values[q.winner] > values[1 - q.winner]);
      assert.notEqual(formatValue(q.metric, values[0]), formatValue(q.metric, values[1]), 'display must not round two answers to a tie');
      const key = q.countries.map(c => c.id).sort().join(':');
      assert.ok(!pairs.has(key), 'same country pair should not repeat');
      pairs.add(key);
    }
  }
  assert.equal(seenTopics.size, data.metrics.length, 'every topic must be reachable');
});
test('shared and daily seeds reproduce the same questions and option positions', () => {
  for (const seed of ['daily-2026-11-01', 'friend-123']) {
    assert.deepEqual(generateGame(data, seed), generateGame(data, seed));
    assert.notDeepEqual(generateGame(data, seed), generateGame(data, seed + '-other'));
  }
});
test('sparse data cannot force a near-tie or an enormous gap into the game', () => {
  const metric = data.metrics.find(m => m.id === 'forest');
  for (const values of [{AAA: 50, BBB: 50.1}, {AAA: 5, BBB: 95}]) {
    const metrics = data.metrics.map(m => ({...m, values, minGap: metric.minGap, gapKind: 'absolute'}));
    assert.throws(() => generateGame({countries: [{id: 'AAA'}, {id: 'BBB'}], metrics}, 'sparse'), /No valid matchups/);
  }
});
test('new units distinguish subscriptions from percentages and fertility from years', () => {
  const mobile = data.metrics.find(m => m.id === 'mobile');
  assert.equal(formatValue(mobile, 150), '150');
  assert.match(unitLabel(mobile), /100 people/);
  const metric = {...data.metrics.find(m => m.id === 'fertility'), values: {AAA: 1.5, BBB: 2}};
  assert.match(describeGap({metric, countries: [{id: 'AAA', name: 'A'}, {id: 'BBB', name: 'B'}], winner: 1}), /0.5 births per woman higher/);
  assert.equal(formatValue(data.metrics.find(m => m.id === 'land'), 2500000), '2.5M');
  assert.equal(formatValue(data.metrics.find(m => m.id === 'temperature'), -2.5), '-2.5°C');
  assert.equal(valueGap({allowNegative:true,gapKind:'absolute'}, -4, 1), 5);
});
test('score and streak describe actual answered questions, including misses', () => {
  assert.deepEqual(scoreAnswers([]), {correct: 0, points: 0, bestStreak: 0});
  assert.deepEqual(scoreAnswers([true, true, false, true, true, true, false].map(correct => ({correct}))), {correct: 5, points: 500, bestStreak: 3});
});
