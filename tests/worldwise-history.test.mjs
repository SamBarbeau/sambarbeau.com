import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateGame, scoreAnswers} from '../worldwise/engine.js';
import {createDailyHistory, dailyRecord, restoreDaily, DAILY_HISTORY_KEY, HISTORY_BYTES, historyBytes,
  createSessionHistory, SESSION_KEY, SESSION_LIMIT} from '../worldwise/history.js';
import {parseRoute, validDailyDate, gameRoute} from '../worldwise/routes.js';

const data = JSON.parse(await readFile(new URL('../worldwise/data/world.json', import.meta.url)));
const questions = generateGame(data, `${data.edition}:daily-2026-11-01`);
const stateFor = date => ({screen: 'results', seed: `daily-${date}`, daily: true, index: 9, questions,
  answers: questions.map((q, i) => ({choice: i % 2, correct: i % 2 === q.winner}))});
function memoryStorage(limit = Infinity) {
  const values = new Map();
  return {getItem: k => values.get(k) ?? null, setItem(k, v) {
    if ((k.length + v.length) * 2 > limit) throw new Error('Quota exceeded');
    values.set(k, v);
  }};
}

test('daily dates are real UTC calendar dates from launch through today', () => {
  for (const date of ['2026-11-01', '2026-11-30']) assert.ok(validDailyDate(date, '2026-11-30'));
  for (const date of ['2026-10-31', '2026-12-01', '2026-11-31', '2026-11-1', '2026-11-01junk', '', null]) {
    assert.equal(validDailyDate(date, '2026-11-30'), false, String(date));
  }
  assert.equal(validDailyDate('2027-02-29', '2028-03-01'), false);
  assert.equal(validDailyDate('2028-02-29', '2028-03-01'), true);
});

test('daily and random routes are distinct, canonical, and preserve old seeds', () => {
  for (const query of ['?date=2026-11-01', '?seed=daily-2026-11-01', '?seed=2026-11-01']) {
    const r = parseRoute(query, '2026-11-01');
    assert.equal(r.kind, 'daily'); assert.equal(r.seed, 'daily-2026-11-01');
    assert.equal(r.search, '?date=2026-11-01');
  }
  assert.deepEqual(parseRoute('?seed=1z141z3'), {kind: 'challenge', seed: '1z141z3', version: '1', search: '?seed=1z141z3'});
  assert.equal(parseRoute('?seed=ab12cd34').search, '?challenge=ab12cd34&v=1');
  assert.equal(parseRoute('?challenge=ab12cd34').seed, 'ab12cd34');
  assert.equal(gameRoute('ab12cd34'), '?challenge=ab12cd34&v=1');
  assert.equal(parseRoute('').kind, 'home');
  for (const query of ['?date=2026-11-02', '?date=2026-10-31', '?date=2026-11-31', '?seed=daily-nope',
    '?challenge=daily-2026-11-01', '?date=2026-11-01&challenge=abc', '?date=2026-11-01&date=2026-11-01',
    '?seed=', '?seed=fsdklfjsljfs3ru023r023239', '?challenge=abc', '?challenge=AB12CD34', '?challenge=abcd-123',
    '?challenge=<script>', '?challenge=ab12cd34&v=999', '?date=2026-11-01&v=999',
    '?challenge=ab12cd34&v=1&v=1', '?challenge=' + 'a'.repeat(51)]) {
    const r = parseRoute(query, '2026-11-01'); assert.equal(r.kind, 'invalid', query); assert.equal(r.search, '');
  }
});

test('daily snapshots restore exact scores and review values without the current dataset', () => {
  const original = stateFor('2026-11-01'), record = dailyRecord(original);
  const store = createDailyHistory(memoryStorage(), () => '2026-11-01');
  assert.ok(store.save(record).saved);
  const restored = restoreDaily(store.get('2026-11-01'));
  assert.deepEqual(restored.answers, original.answers);
  assert.deepEqual(scoreAnswers(restored.answers), scoreAnswers(original.answers));
  for (let i = 0; i < questions.length; i++) {
    assert.equal(Object.keys(record.questions[i].metric.values).length, 2);
    for (const c of questions[i].countries) assert.equal(restored.questions[i].metric.values[c.id], questions[i].metric.values[c.id]);
    assert.equal(restored.questions[i].metric.definition, questions[i].metric.definition);
  }
  assert.ok(historyBytes([record]) < 16000, 'a daily snapshot should stay small');
});

test('first completed daily attempt wins, including a second browser tab', () => {
  const storage = memoryStorage(), first = createDailyHistory(storage, () => '2026-11-01');
  const second = createDailyHistory(storage, () => '2026-11-01');
  const record = dailyRecord(stateFor('2026-11-01'));
  first.save(record);
  const changed = {...record, choices: record.choices.map(c => 1 - c)};
  assert.deepEqual(second.save(changed).record.choices, record.choices);
  assert.deepEqual(first.get(record.date).choices, record.choices);
});

test('daily history expires after 30 calendar days and prunes persisted records', () => {
  const storage = memoryStorage(); let today = '2026-11-30';
  const store = createDailyHistory(storage, () => today);
  for (let day = 1; day <= 30; day++) {
    today = `2026-11-${String(day).padStart(2, '0')}`;
    store.save(dailyRecord(stateFor(today)));
  }
  assert.equal(store.all().length, 30);
  assert.ok(historyBytes(store.all()) <= HISTORY_BYTES);
  today = '2026-12-01';
  assert.equal(store.get('2026-11-01'), undefined);
  assert.equal(store.all().length, 29);
  today = '2027-01-01';
  assert.deepEqual(store.all(), []);
  assert.equal(storage.getItem(DAILY_HISTORY_KEY), '[]');
});

test('playing an older daily today saves it for 30 days from completion', () => {
  let today = '2026-12-15';
  const store = createDailyHistory(memoryStorage(), () => today);
  assert.ok(store.save(dailyRecord(stateFor('2026-11-01'))).saved);
  today = '2027-01-13'; assert.ok(store.get('2026-11-01'));
  today = '2027-01-14'; assert.equal(store.get('2026-11-01'), undefined);
});

test('byte limit and browser quotas evict oldest results without growing indefinitely', () => {
  const storage = memoryStorage(), store = createDailyHistory(storage, () => '2026-11-30');
  for (let day = 1; day <= 30; day++) {
    const record = dailyRecord(stateFor(`2026-11-${String(day).padStart(2, '0')}`));
    record.questions = structuredClone(record.questions);
    record.questions.forEach(q => { q.metric.definition = 'Long source explanation. '.repeat(150); });
    store.save(record);
  }
  assert.ok(store.all().length < 30);
  assert.ok(store.get('2026-11-30'));
  assert.ok(historyBytes(store.all()) <= HISTORY_BYTES);
  const quota = createDailyHistory(memoryStorage(20000), () => '2026-11-30');
  assert.ok(quota.save(dailyRecord(stateFor('2026-11-29'))).saved);
  assert.ok(quota.save(dailyRecord(stateFor('2026-11-30'))).saved);
  assert.equal(quota.all().length, 1);
  assert.ok(quota.get('2026-11-30'));
});

test('corrupt, incomplete, unsafe, or unavailable storage never prevents play', () => {
  const storage = memoryStorage(), store = createDailyHistory(storage, () => '2026-11-01');
  for (const raw of ['not json', '{}', '[null]', '[{"date":"2026-11-01"}]']) {
    storage.setItem(DAILY_HISTORY_KEY, raw); assert.deepEqual(store.all(), []);
  }
  const record = dailyRecord(stateFor('2026-11-01'));
  assert.equal(store.save({...record, choices: [0]}).saved, false);
  const unsafe = structuredClone(record); unsafe.questions[0].metric.sourceUrl = 'javascript:alert(1)';
  assert.equal(store.save(unsafe).saved, false);
  const blocked = createDailyHistory({getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}}, () => '2026-11-01');
  assert.deepEqual(blocked.all(), []);
  assert.equal(blocked.save(record).saved, false);
});

test('tab checkpoints restore question/reveal position and are bounded and edition-aware', () => {
  const storage = memoryStorage(), sessions = createSessionHistory(storage, data.edition);
  const progress = {...stateFor('2026-11-01'), screen: 'game', index: 2};
  progress.answers = progress.answers.slice(0, 3); // Third answer already revealed.
  sessions.save(progress);
  const restored = createSessionHistory(storage, data.edition).get(progress.seed, true);
  assert.equal(restored.index, 2); assert.equal(restored.choices.length, 3);
  assert.equal(createSessionHistory(storage, 'new-edition').get(progress.seed, true), undefined);
  for (let i = 0; i < 20; i++) sessions.save({...progress, seed: `game-${i}`, daily: false});
  assert.equal(JSON.parse(storage.getItem(SESSION_KEY)).length, SESSION_LIMIT);
  assert.equal(sessions.get('game-0', false), undefined);
  assert.ok(sessions.get('game-19', false));
  const blocked = createSessionHistory({getItem() {throw Error();}, setItem() {throw Error();}}, data.edition);
  blocked.save(progress); assert.equal(blocked.get(progress.seed, true).index, 2);
});
