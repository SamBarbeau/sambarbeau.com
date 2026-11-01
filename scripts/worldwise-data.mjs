// Validate and join API records by stable ISO3 code, never display name.
export function valuesForYear(rows, indicator, year, countryIds, {allowNegative = false} = {}) {
  const allowed = new Set(countryIds), seen = new Set(), values = {};
  for (const row of rows) {
    if (Number(row.date) !== year || !allowed.has(row.countryiso3code)) continue;
    const id = row.countryiso3code;
    if (row.indicator?.id !== indicator) throw new Error(`Wrong indicator for ${id}/${year}`);
    if (seen.has(id)) throw new Error(`Duplicate observation for ${indicator}/${id}/${year}`);
    seen.add(id);
    if (row.value === null) continue;
    if (!Number.isFinite(row.value) || (!allowNegative && row.value < 0)) throw new Error(`Invalid value for ${indicator}/${id}/${year}`);
    values[id] = row.value;
  }
  return values;
}

export function selectYear(definition, rows, denominatorRows, countryIds, newestYear, oldestYear, minCountries = definition.minCountries || 90) {
  for (let year = newestYear; year >= oldestYear; year--) {
    const numerator = valuesForYear(rows, definition.indicator, year, countryIds, definition);
    const denominator = definition.denominator
      ? valuesForYear(denominatorRows, definition.denominator, year, countryIds) : null;
    const values = {};
    for (const [id, raw] of Object.entries(numerator)) {
      if (denominator && !(denominator[id] > 0)) continue;
      const value = denominator ? raw / denominator[id] * definition.multiplier : raw;
      if (!Number.isFinite(value) || (definition.unit === 'percent' && !definition.allowOver100 && value > 100.001)
        || (definition.scale === 'log' && value <= 0)) throw new Error(`Out-of-range value for ${definition.id}/${id}/${year}`);
      values[id] = value;
    }
    if (Object.keys(values).length >= minCountries) {
      const result = {year, values};
      if (denominator) result.components = Object.fromEntries(Object.keys(values).map(id => [id, {numerator: numerator[id], denominator: denominator[id]}]));
      return result;
    }
  }
  throw new Error(`Insufficient recent same-year coverage for ${definition.id}`);
}
