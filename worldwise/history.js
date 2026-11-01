import { ROUND_COUNT, GAME_VERSION } from './engine.js?rev=3';
import { todayUTC, validDailyDate } from './routes.js?rev=3';

export const DAILY_HISTORY_KEY = 'worldwise-daily-history-v1';
export const HISTORY_DAYS = 30;
export const HISTORY_BYTES = 512 * 1024;
const DAY_MS = 86400000;
const metricFields = ['id', 'label', 'question', 'definition', 'sourceUrl', 'year', 'unit', 'format', 'precision', 'valueLabel', 'gapKind', 'gapLabel'];

// Store only the two compared values, not the full country dataset or chart.
// The review retains its original wording and figures across data refreshes.
export function dailyRecord(state) {
  return {
    date: state.seed.slice(6),
    questions: state.questions.map(q => ({
      metric: {...Object.fromEntries(metricFields.filter(k => q.metric[k] !== undefined).map(k => [k, q.metric[k]])),
        values: Object.fromEntries(q.countries.map(c => [c.id, q.metric.values[c.id]]))},
      countries: q.countries.map(({id, iso2, name}) => ({id, iso2, name})),
    })),
    choices: state.answers.map(a => a.choice),
  };
}

function validQuestion(q) {
  if (!q || !Array.isArray(q.countries) || q.countries.length !== 2 || q.countries[0]?.id === q.countries[1]?.id) return false;
  if (!q.countries.every(c => c && /^[A-Z]{3}$/.test(c.id) && /^[A-Z]{2}$/.test(c.iso2)
    && typeof c.name === 'string' && c.name.length > 0 && c.name.length <= 100)) return false;
  const m = q.metric;
  if (!m || !['id', 'label', 'question', 'definition', 'unit', 'sourceUrl'].every(k => typeof m[k] === 'string' && m[k].length > 0 && m[k].length <= 5000)) return false;
  if (!Number.isInteger(m.year) || m.year < 1900 || m.year > 9999 || !['ratio', 'absolute'].includes(m.gapKind)) return false;
  if (!['compact', 'decimal', 'integer', 'percent'].includes(m.format) || (m.precision !== undefined && (!Number.isInteger(m.precision) || m.precision < 0 || m.precision > 6))) return false;
  if (['valueLabel', 'gapLabel'].some(k => m[k] !== undefined && (typeof m[k] !== 'string' || m[k].length > 200))) return false;
  try { if (new URL(m.sourceUrl).protocol !== 'https:') return false; } catch { return false; }
  const values = q.countries.map(c => m.values?.[c.id]);
  return values.every(Number.isFinite) && values[0] !== values[1] && (m.gapKind !== 'ratio' || Math.min(...values) > 0);
}

function validRecord(record, today) {
  const cutoff = todayUTC(new Date(Date.parse(`${today}T00:00:00Z`) - (HISTORY_DAYS - 1) * DAY_MS));
  const completedOn = record?.completedOn || record?.date;
  return record && validDailyDate(record.date, today) && validDailyDate(completedOn, today) && completedOn >= record.date && completedOn >= cutoff
    && Array.isArray(record.questions) && record.questions.length === ROUND_COUNT && record.questions.every(validQuestion)
    && Array.isArray(record.choices) && record.choices.length === ROUND_COUNT && record.choices.every(c => c === 0 || c === 1);
}

export function restoreDaily(record) {
  const questions = record.questions.map(q => ({...q, winner: q.metric.values[q.countries[0].id] > q.metric.values[q.countries[1].id] ? 0 : 1}));
  return {screen: 'results', archived: true, daily: true, seed: `daily-${record.date}`, questions,
    answers: record.choices.map((choice, i) => ({choice, correct: choice === questions[i].winner})), index: ROUND_COUNT - 1};
}

export const historyBytes = records => (DAILY_HISTORY_KEY.length + JSON.stringify(records).length) * 2;

function bounded(records, today) {
  const seen = new Set();
  const kept = records.filter(r => validRecord(r, today)).sort((a, b) => (b.completedOn || b.date).localeCompare(a.completedOn || a.date) || b.date.localeCompare(a.date)).filter(r => {
    if (seen.has(r.date)) return false;
    seen.add(r.date); return true;
  }).slice(0, HISTORY_DAYS);
  while (kept.length && historyBytes(kept) > HISTORY_BYTES) kept.pop();
  return kept;
}

// Storage is injected so disabled storage, quota failures, corrupt records,
// and retention limits can be tested without a browser.
export function createDailyHistory(storage, today = todayUTC) {
  function read() {
    let records = [], raw = null;
    try {
      raw = storage.getItem(DAILY_HISTORY_KEY);
      if (raw && raw.length * 2 <= HISTORY_BYTES) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) records = parsed;
      }
    } catch { /* No usable history; play remains available. */ }
    const kept = bounded(records, today());
    if (raw !== null && JSON.stringify(kept) !== raw) {
      try { storage.setItem(DAILY_HISTORY_KEY, JSON.stringify(kept)); } catch { /* Read-only or full storage. */ }
    }
    return kept;
  }
  return {
    all: read,
    get: date => read().find(r => r.date === date),
    save(record) {
      const records = read(), existing = records.find(r => r.date === record.date);
      if (existing) return {record: existing, saved: true}; // First completed attempt wins, including across tabs.
      record = {...record, completedOn: today()};
      if (!validRecord(record, today())) return {record, saved: false};
      const kept = bounded([record, ...records], today());
      while (kept.some(r => r.date === record.date)) {
        try {
          storage.setItem(DAILY_HISTORY_KEY, JSON.stringify(kept));
          return {record, saved: true};
        } catch { kept.pop(); } // Free our own oldest entries if the origin is near quota.
      }
      return {record, saved: false};
    },
  };
}

export const SESSION_KEY = 'worldwise-session-v1';
export const SESSION_LIMIT = 8;
// A few hundred characters per game. These checkpoints last only in this tab,
// and are rebuilt from the matching dataset rather than saving full charts.
export function createSessionHistory(storage, edition) {
  let memory = [], loaded = false;
  function read() {
    if (loaded) return memory;
    loaded = true;
    try {
      const raw = storage.getItem(SESSION_KEY);
      const parsed = raw && raw.length < 10000 ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) memory = parsed.filter(s => s && typeof s.edition === 'string' && s.edition.length <= 100 && s.version === GAME_VERSION
        && typeof s.seed === 'string' && /^[a-z0-9-]{1,50}$/i.test(s.seed) && typeof s.daily === 'boolean'
        && Array.isArray(s.choices) && s.choices.length <= ROUND_COUNT && s.choices.every(c => c === 0 || c === 1)
        && Number.isInteger(s.index) && s.index >= 0 && s.index < ROUND_COUNT && s.index <= s.choices.length
        && ['game', 'results'].includes(s.screen) && (s.screen !== 'results' || s.choices.length === ROUND_COUNT)).slice(0, SESSION_LIMIT);
    } catch { /* Keep this tab's in-memory checkpoint when storage is unavailable. */ }
    return memory;
  }
  return {
    get: (seed, daily, dataEdition = edition) => read().find(s => s.seed === seed && s.daily === daily && s.edition === dataEdition),
    save(state) {
      const record = {edition: state.edition || edition, version: GAME_VERSION, seed: state.seed, daily: state.daily, index: state.index,
        screen: state.screen, choices: state.answers.map(a => a.choice)};
      memory = [record, ...read().filter(s => s.seed !== state.seed || s.daily !== state.daily || s.edition !== record.edition)].slice(0, SESSION_LIMIT);
      try { storage.setItem(SESSION_KEY, JSON.stringify(memory)); } catch { /* Back/Forward still work in memory. */ }
    },
  };
}
