import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../worldwise/chart.js', import.meta.url), 'utf8');
const {chartAxis} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const data = JSON.parse(await readFile(new URL('../worldwise/data/world.json', import.meta.url)));
test('every observation and chart tick is finite and inside the visible axis', () => {
  for (const metric of data.metrics) {
    const values = Object.values(metric.values), axis = chartAxis(metric, values);
    assert.ok(axis.max > axis.min, metric.id);
    assert.ok(axis.ticks.length <= 5, metric.id);
    for (const value of values) {
      const t = axis.transform(value);
      assert.ok(Number.isFinite(t) && t >= axis.min - 1e-9 && t <= axis.max + 1e-9, `${metric.id}: ${value}`);
    }
    for (const tick of axis.ticks) assert.ok(Number.isFinite(tick.t) && tick.t >= axis.min - 1e-9 && tick.t <= axis.max + 1e-9, metric.id);
  }
});
test('signed percentages retain negatives and zero-inclusive log charts retain zero', () => {
  const signed = chartAxis({scale:'linear',unit:'percent'}, [-3,1,5]);
  assert.ok(signed.min <= -3 && signed.max >= 5);
  const zero = chartAxis({scale:'log1p'}, [0,100,1000000]);
  assert.equal(zero.transform(0), 0);
  assert.equal(zero.ticks[0].value, 0);
  assert.equal(zero.ticks.at(-1).value, 1000000);
});
