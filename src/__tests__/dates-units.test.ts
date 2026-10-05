import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, startOfWeek, toDateKey, weekdayIndex, formatTimestamp } from '../lib/dates';
import {
  cmToFtIn,
  displayToKg,
  formatPace,
  ftInToCm,
  kgToDisplay,
  kmToDisplay,
  mlToDisplay,
  displayToMl,
} from '../lib/units';

test('toDateKey uses local calendar date', () => {
  assert.equal(toDateKey(new Date(2026, 9, 3, 23, 59)), '2026-10-03');
  assert.equal(toDateKey(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('weeks start on Monday', () => {
  // 3 Oct 2026 is a Saturday
  assert.equal(toDateKey(startOfWeek(new Date(2026, 9, 3))), '2026-09-28');
  assert.equal(weekdayIndex(new Date(2026, 9, 3)), 5);
  assert.equal(weekdayIndex(new Date(2026, 9, 4)), 6); // Sunday
  assert.equal(toDateKey(startOfWeek(new Date(2026, 9, 5))), '2026-10-05'); // Monday
});

test('formatTimestamp labels today and yesterday', () => {
  const now = new Date(2026, 9, 3, 15, 0).getTime();
  assert.equal(formatTimestamp(new Date(2026, 9, 3, 7, 15).getTime(), now), 'Today, 7:15 AM');
  assert.equal(formatTimestamp(new Date(2026, 9, 2, 18, 5).getTime(), now), 'Yesterday, 6:05 PM');
  assert.equal(formatTimestamp(new Date(2026, 9, 1, 0, 30).getTime(), now), 'Oct 1, 12:30 AM');
});

test('weight and distance conversions', () => {
  assert.equal(kgToDisplay(100, 'metric'), 100);
  assert.equal(kgToDisplay(100, 'imperial'), 220.5);
  assert.ok(Math.abs(displayToKg(220.462, 'imperial') - 100) < 0.01);
  assert.equal(kmToDisplay(10, 'imperial'), 6.21);
});

test('height conversions', () => {
  assert.deepEqual(cmToFtIn(175.26), { ft: 5, inch: 9 });
  assert.deepEqual(cmToFtIn(182.88), { ft: 6, inch: 0 });
  assert.ok(Math.abs(ftInToCm(5, 9) - 175.26) < 0.01);
});

test('volume conversions round-trip closely', () => {
  assert.equal(mlToDisplay(2500, 'metric'), 2500);
  assert.equal(mlToDisplay(2957, 'imperial'), 100);
  assert.ok(Math.abs(displayToMl(100, 'imperial') - 2957) <= 1);
});

test('pace formatting', () => {
  assert.equal(formatPace(30, 5, 'metric'), '6:00');
  assert.equal(formatPace(25, 5, 'metric'), '5:00');
  assert.equal(formatPace(0, 5, 'metric'), '--:--');
  assert.equal(formatPace(30, 0, 'metric'), '--:--');
});
