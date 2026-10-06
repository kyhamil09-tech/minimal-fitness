import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePendingWater, waterButtonAmounts } from '../lib/waterPending';

const NOW = new Date('2026-10-05T12:00:00').getTime();
const HOUR = 3_600_000;

test('good entries are filed under the day they were drunk', () => {
  const yesterday = NOW - 20 * HOUR;
  const out = sanitizePendingWater([[NOW - HOUR, 250], [yesterday, 500]], NOW);
  assert.deepEqual(out, [
    { date: '2026-10-05', ml: 250 },
    { date: '2026-10-04', ml: 500 },
  ]);
});

test('malformed, future, stale and implausible entries are dropped', () => {
  const out = sanitizePendingWater(
    [
      'x',
      [1],
      ['a', 250],
      [NOW - HOUR, 'b'],
      [NOW - HOUR, 0],
      [NOW - HOUR, -250],
      [NOW - HOUR, 5000], // not a drink
      [NOW + 10 * HOUR, 250], // from the future
      [NOW - 3 * 86_400_000, 250], // too old to trust
      [NOW - HOUR, NaN],
      [NOW - HOUR, 330],
    ],
    NOW
  );
  assert.deepEqual(out, [{ date: '2026-10-05', ml: 330 }]);
});

test('anything that is not a list gives nothing', () => {
  assert.deepEqual(sanitizePendingWater(null, NOW), []);
  assert.deepEqual(sanitizePendingWater({}, NOW), []);
  assert.deepEqual(sanitizePendingWater('[]', NOW), []);
});

test('the button amounts follow the units', () => {
  assert.deepEqual(waterButtonAmounts(false), [250, 500]);
  assert.deepEqual(waterButtonAmounts(true), [237, 473]);
});
