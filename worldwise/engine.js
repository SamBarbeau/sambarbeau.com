// Pure game rules. No network, DOM, or country-specific question bank.
export const ROUND_COUNT = 10;
export const GAME_VERSION = 'v4';
// Bounds relative to each indicator's minimum meaningful difference.
// Keep every round in the same range; variety never overrides these limits.
export const MATCHUP_GAP_BAND = [1.25, 3];
export const CATEGORY_LIMITS = {food: 2, agriculture: 1, energy: 2};
export function hashSeed(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function valueGap(metric, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || (!metric.allowNegative && (a < 0 || b < 0))) return 0;
  if (metric.gapKind === 'ratio') return Math.min(a, b) > 0 ? Math.abs(a - b) / Math.min(a, b) : 0;
  return Math.abs(a - b);
}
const familiar = new Set('USA CAN MEX BRA ARG CHL COL PER GBR FRA DEU ITA ESP PRT NLD SWE NOR FIN POL GRC TUR EGY MAR ZAF NGA KEN IND CHN JPN KOR IDN THA VNM AUS NZL SAU PAK BGD RUS'.split(' '));
export function generateGame(data, seed) {
  const random = seededRandom(hashSeed(`${seed}:${GAME_VERSION}`));
  const order = shuffle(data.metrics, random);
  // A relatable opening, then ten distinct topics, at most three per subject.
  const first = order.findIndex(m => ['population', 'forest', 'urban', 'density', 'land', 'rainfall', 'children'].includes(m.id));
  if (first > 0) [order[0], order[first]] = [order[first], order[0]];
  const metrics = [], categories = new Map(), topicIds = new Set(), families = new Set();
  for (const metric of order) {
    if (topicIds.has(metric.id) || families.has(metric.family || metric.id)
      || (categories.get(metric.category) || 0) >= (CATEGORY_LIMITS[metric.category] || 3)) continue;
    metrics.push(metric);
    topicIds.add(metric.id);
    families.add(metric.family || metric.id);
    categories.set(metric.category, (categories.get(metric.category) || 0) + 1);
    if (metrics.length === ROUND_COUNT) break;
  }
  if (metrics.length < ROUND_COUNT) throw new Error('Not enough distinct, varied topics');
  const usedPairs = new Set(), usedCountries = new Map();
  return metrics.slice(0, ROUND_COUNT).map((metric, index) => {
    const eligible = data.countries.filter(c => Number.isFinite(metric.values[c.id]));
    const displayed = new Map(eligible.map(c => [c.id, formatValue(metric, metric.values[c.id])]));
    const candidates = [];
    for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i], b = eligible[j], pair = [a.id, b.id].sort().join(':');
      const gap = valueGap(metric, metric.values[a.id], metric.values[b.id]) / metric.minGap;
      if (gap < MATCHUP_GAP_BAND[0] || gap > MATCHUP_GAP_BAND[1] || usedPairs.has(pair)) continue;
      if (displayed.get(a.id) === displayed.get(b.id)) continue;
      const repetition = (usedCountries.get(a.id) || 0) + (usedCountries.get(b.id) || 0);
      const unfamiliar = index < 3 ? Number(!familiar.has(a.id)) + Number(!familiar.has(b.id)) : 0;
      candidates.push({a, b, pair, gap, penalty: repetition * 20 + unfamiliar * 10});
    }
    if (!candidates.length) throw new Error(`No valid matchups for ${metric.id}`);
    const minPenalty = Math.min(...candidates.map(c => c.penalty));
    const pool = candidates.filter(c => c.penalty <= minPenalty + .5);
    const picked = pool[Math.floor(random() * pool.length)];
    const countries = shuffle([picked.a, picked.b], random);
    usedPairs.add(picked.pair);
    countries.forEach(c => usedCountries.set(c.id, (usedCountries.get(c.id) || 0) + 1));
    return {metric, countries, winner: countries[0].id === picked.a.id
      ? (metric.values[picked.a.id] > metric.values[picked.b.id] ? 0 : 1)
      : (metric.values[picked.b.id] > metric.values[picked.a.id] ? 0 : 1)};
  });
}
const numberFormats = new Map();
export function formatValue(metric, value, long = false) {
  const precision = metric.precision ?? 1;
  const key = `${metric.format}:${precision}:${long}`;
  if (!numberFormats.has(key)) numberFormats.set(key, new Intl.NumberFormat('en-US', metric.format === 'compact'
    ? (long ? {maximumFractionDigits: 0} : {notation: 'compact', maximumFractionDigits: 1})
    : {maximumFractionDigits: metric.format === 'integer' ? 0 : precision}));
  const number = numberFormats.get(key).format(value);
  return metric.unit === 'percent' ? `${number}%` : metric.unit === 'celsius' ? `${number}°C` : number;
}
export function unitLabel(metric) {
  return metric.valueLabel || ({people: 'people', percent: 'percent', years: 'years', density: 'people / km²'})[metric.unit] || '';
}
export function describeGap(question) {
  const {metric, countries, winner} = question;
  const high = metric.values[countries[winner].id], low = metric.values[countries[1 - winner].id];
  const name = countries[winner].name;
  const possessive = `${name}${name.endsWith('s') ? '’' : '’s'}`;
  if (metric.gapKind === 'ratio') return `${possessive} figure is ${(high / low).toFixed(1)} times as high.`;
  const difference = formatValue({format: 'decimal', precision: metric.precision ?? 1}, high - low);
  return `${possessive} figure is ${difference} ${metric.unit === 'percent' ? 'percentage points' : metric.gapLabel || unitLabel(metric)} higher.`;
}
export function scoreAnswers(answers) {
  let streak = 0, bestStreak = 0;
  for (const a of answers) { streak = a.correct ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak); }
  return {correct: answers.filter(a => a.correct).length, points: answers.filter(a => a.correct).length * 100, bestStreak};
}
