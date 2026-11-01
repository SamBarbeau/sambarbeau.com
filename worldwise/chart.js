// Shared numerical rules for bounded, signed, and zero-inclusive distributions.
export function chartAxis(metric, values) {
  const log = metric.scale === 'log', zeroLog = metric.scale === 'log1p';
  const transform = log ? value => Math.log10(value) : zeroLog ? value => Math.log10(value + 1) : value => value;
  const low = Math.min(...values), high = Math.max(...values);
  let min, max, ticks = [];
  if (log || zeroLog) {
    const startExponent = log ? Math.floor(Math.log10(low)) : low > 0 ? Math.floor(Math.log10(low)) : 0;
    const endExponent = Math.ceil(Math.log10(high || 1));
    min = zeroLog ? transform(low > 0 ? 10 ** startExponent : 0) : startExponent;
    max = zeroLog ? transform(10 ** endExponent) : endExponent;
    if (max === min) max = min + 1;
    const stride = Math.max(1, Math.ceil((endExponent - startExponent) / 4));
    for (let exponent = startExponent; exponent <= endExponent; exponent += stride) {
      const value = zeroLog && low === 0 && exponent === startExponent ? 0 : 10 ** exponent;
      ticks.push({t: transform(value), value, exponent});
    }
    if (ticks.at(-1).exponent !== endExponent) {
      if (endExponent - ticks.at(-1).exponent < stride) ticks.pop();
      ticks.push({t: transform(10 ** endExponent), value: 10 ** endExponent});
    }
  } else {
    const rawStep = (high - low) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
    const step = [1, 2, 2.5, 5, 10].find(n => n * magnitude >= rawStep) * magnitude;
    min = Math.floor(low / step) * step;
    if (metric.unit === 'percent') min = Math.min(min, 0);
    max = Math.ceil(high / step) * step;
    if (max === min) max = min + 1;
    for (let i = 0; i <= 4; i++) { const t = min + (max - min) * i / 4; ticks.push({t, value: t}); }
  }
  return {min, max, transform, ticks,
    label: log ? 'logarithmic scale' : zeroLog ? 'logarithmic scale · includes zero' : '',
    note: log ? 'Equal steps on this axis represent multiplication, not addition.'
      : zeroLog ? 'A logarithmic scale compresses large values; adding one lets zero appear too.' : ''};
}
