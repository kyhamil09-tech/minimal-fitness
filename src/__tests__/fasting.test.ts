import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastingByDay, fastingStats } from '../lib/fasting';
import { FastingSession } from '../types/health';

const HOUR = 3600 * 1000;
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime();

const fast = (endDay: string, hours: number, target = 16, id = `${endDay}-${hours}`): FastingSession => {
  const end = at(endDay, 9);
  return {
    id, startTimestamp: end - hours * HOUR, startTimeIso: '', endTimestamp: end, endTimeIso: '',
    targetDurationHours: target, actualHours: hours, isCompleted: true, fastProtocolName: '16:8',
  };
};

test('fastingStats summarises completed fasts', () => {
  const s = fastingStats([fast('2026-10-03', 17), fast('2026-10-02', 12), fast('2026-10-01', 18)], '2026-10-03');
  assert.equal(s.total, 3);
  assert.equal(s.goalMet, 2);
  assert.equal(s.successRate, 67);
  assert.equal(s.longestHours, 18);
  assert.equal(s.avgHours, 15.7);
  assert.equal(s.totalHours, 47);
});

test('streak counts consecutive days with a goal met and survives an unfinished today', () => {
  const sessions = [fast('2026-10-02', 17), fast('2026-10-01', 16), fast('2026-09-30', 20), fast('2026-09-28', 18)];
  assert.equal(fastingStats(sessions, '2026-10-03').streakDays, 3); // today not done yet: counts back from yesterday
  assert.equal(fastingStats([...sessions, fast('2026-10-03', 16)], '2026-10-03').streakDays, 4);
  assert.equal(fastingStats([fast('2026-10-02', 10)], '2026-10-03').streakDays, 0); // goal missed
});

test('an active fast is not counted in history stats', () => {
  const active: FastingSession = { id: 'a', startTimestamp: 1, startTimeIso: '', targetDurationHours: 16, isCompleted: false, fastProtocolName: '16:8' };
  assert.equal(fastingStats([active], '2026-10-03').total, 0);
});

test('fastingByDay returns one entry per day, oldest first', () => {
  const days = fastingByDay([fast('2026-10-03', 16), fast('2026-10-01', 14)], '2026-10-03', 5);
  assert.deepEqual(days.map((d) => d.key), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
  assert.deepEqual(days.map((d) => d.hours), [0, 0, 14, 0, 16]);
});