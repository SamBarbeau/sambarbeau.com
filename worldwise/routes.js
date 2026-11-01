import {dailyEdition, findEdition} from './editions.js?rev=2';

export const LAUNCH_DATE = '2026-11-01';
export const todayUTC = (now = new Date()) => now.toISOString().slice(0, 10);

export function validDailyDate(date, today = todayUTC()) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < LAUNCH_DATE || date > today) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && todayUTC(parsed) === date;
}

export function gameRoute(seed, daily = false, version = '1') {
  if (daily) return `?date=${seed.slice(6)}`;
  // The first release generated 1–7 base-36 characters. Keep those published
  // links intact without admitting arbitrary long keys to the new URL format.
  return /^[a-z0-9]{1,7}$/.test(seed) ? `?seed=${seed}` : `?challenge=${encodeURIComponent(seed)}&v=${version}`;
}

export function parseRoute(search, today = todayUTC()) {
  const params = new URLSearchParams(search);
  const keys = ['date', 'challenge', 'seed'].filter(key => params.has(key));
  const invalid = {kind: 'invalid', search: '', message: 'That game link isn’t valid. Choose a new game below.'};
  if (!keys.length) return params.has('v') ? invalid : {kind: 'home', search: ''};
  if (keys.length !== 1 || params.getAll(keys[0]).length !== 1) return invalid;
  if (params.getAll('v').length > 1 || (params.has('v') && !findEdition(params.get('v')))) return invalid;
  const key = keys[0], value = params.get(key);
  const date = key === 'date' ? value : key === 'seed' && value.startsWith('daily-') ? value.slice(6)
    : key === 'seed' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (date !== null) {
    if (!validDailyDate(date, today)) return {...invalid, message: 'Daily games run from November 1, 2026 through today (UTC).'};
    const version = dailyEdition(date)?.id;
    if (!version || (params.has('v') && params.get('v') !== version)) return invalid;
    return {kind: 'daily', seed: `daily-${date}`, date, version, search: `?date=${date}`};
  }
  if (!/^[a-z0-9]{8}$/.test(value) && !(key === 'seed' && /^[a-z0-9]{1,7}$/.test(value))) return invalid;
  const version = params.get('v') || '1'; // Unversioned links always belong to launch, even after future updates.
  if (key === 'seed' && value.length < 8 && version !== '1') return invalid;
  return {kind: 'challenge', seed: value, version, search: gameRoute(value, false, version)};
}
