import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSleepMonth, earliestMonth, hoursShort, hoursText, levelFor } from '../lib/sleepCalendar';
import { SleepLogEntry } from '../types/health';

const night = (dateIso: string, durationMinutes: number, extra: Partial<SleepLogEntry> = {}): SleepLogEntry =>
  ({ id: `${dateIso}-${durationMinutes}`, dateIso, displayDate: dateIso, bedtime: '23:00', wakeTime: '07:00', durationMinutes, qualityRating: 4, isManualEntry: false, deepSleepMinutes: durationMinutes * 0.2, remSleepMinutes: durationMinutes * 0.22, lightSleepMinutes: durationMinutes * 0.5, awakeMinutes: durationMinutes * 0.08, efficiencyScore: 90, ...extra }) as SleepLogEntry;

test('colors follow the goal: well short, a little short, on target, long', () => {
  assert.equal(levelFor(300, 480), 'poor'); // 5 h
  assert.equal(levelFor(380, 480), 'short'); // 6 h 20
  assert.equal(levelFor(450, 480), 'good');
  assert.equal(levelFor(560, 480), 'good'); // 9 h 20 is still on target
  assert.equal(levelFor(600, 480), 'long');
});

test('a month is whole weeks with the nights on their dates and the right numbers', () => {
  const logs = [night('2026-10-05', 450), night('2026-10-06', 330), night('2026-10-07', 500), night('2026-09-30', 420), night('2026-10-12', 460), night('2026-10-12', 300)];
  const m = buildSleepMonth(logs, 2026, 9, 480, '2026-10-20');
  assert.equal(m.cells.length % 7, 0);
  const oct = m.cells.filter((c) => c.inMonth);
  assert.equal(oct.length, 31);
  assert.equal(oct[0].date, '2026-10-01');
  const c12 = oct.find((c) => c.date === '2026-10-12')!;
  assert.equal(c12.records, 2);
  assert.equal(c12.log!.durationMinutes, 460); // the longer one
  assert.equal(oct.find((c) => c.date === '2026-10-06')!.level, 'poor'); // 5 h 30 is under 70 % of 8 h
  // the 30 September night shows in the grid's leading days but is not counted in October
  assert.equal(m.summary.nights, 4);
  assert.equal(m.summary.avgMin, Math.round((450 + 330 + 500 + 460) / 4));
  assert.deepEqual(m.summary.best, { date: '2026-10-07', minutes: 500 });
  assert.deepEqual(m.summary.shortest, { date: '2026-10-06', minutes: 330 });
  assert.equal(m.summary.shortNights, 1);
  assert.ok(m.cells.find((c) => c.date === '2026-10-20')!.isToday);
  assert.ok(m.cells.find((c) => c.date === '2026-10-25')!.isFuture);
});

test('an empty month is fine, and the earliest month comes from the oldest night', () => {
  const m = buildSleepMonth([], 2026, 1, 480, '2026-10-20');
  assert.equal(m.summary.nights, 0);
  assert.equal(m.summary.best, null);
  assert.equal(m.summary.avgScore, null);
  assert.deepEqual(earliestMonth([night('2026-03-14', 400), night('2026-07-01', 420)], '2026-10-20'), { year: 2026, month: 2 });
  assert.deepEqual(earliestMonth([], '2026-10-20'), { year: 2026, month: 9 });
});

test('hours read naturally', () => {
  assert.equal(hoursText(465), '7h 45m');
  assert.equal(hoursText(420), '7h');
  assert.equal(hoursShort(465), '7h45');
  assert.equal(hoursShort(425), '7h05');
});
