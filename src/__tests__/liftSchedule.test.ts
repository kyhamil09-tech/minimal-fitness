import test from 'node:test';
import assert from 'node:assert/strict';
import { androidWeekday, cleanDays, dayIndex, daysText, reminderPlan, reminderText, routinesForDay } from '../lib/liftSchedule';
import { Routine } from '../types/tracking';

const r = (id: string, name: string, days?: number[]): Routine => ({ id, name, exerciseIds: [], days });

test('days are cleaned, sorted and de-duplicated', () => {
  assert.deepEqual(cleanDays([3, 0, 3, 9, -1, 'x', 6]), [0, 3, 6]);
  assert.deepEqual(cleanDays(undefined), []);
});

test('monday is 0 and sunday is 6', () => {
  assert.equal(dayIndex(new Date(2026, 9, 12)), 0); // Mon 12 Oct 2026
  assert.equal(dayIndex(new Date(2026, 9, 18)), 6);
});

test('text and routines per day', () => {
  assert.equal(daysText([0, 3]), 'Mon · Thu');
  assert.equal(daysText([0, 1, 2, 3, 4, 5, 6]), 'Every day');
  const list = [r('a', 'Push', [0, 3]), r('b', 'Pull', [1]), r('c', 'Legs')];
  assert.deepEqual(routinesForDay(list, 0).map((x) => x.name), ['Push']);
  assert.deepEqual(reminderPlan(list), [
    { day: 0, names: ['Push'] },
    { day: 1, names: ['Pull'] },
    { day: 3, names: ['Push'] },
  ]);
});

test('android numbers Sunday as 1 and Monday as 2', () => {
  assert.equal(androidWeekday(6), 1);
  assert.equal(androidWeekday(0), 2);
  assert.equal(androidWeekday(5), 7);
});

test('reminder wording', () => {
  assert.equal(reminderText(['Push']).title, 'Push today');
  assert.match(reminderText(['Push', 'Pull']).body, /Push, Pull/);
});

test('the watch lists today\'s scheduled routine first', async () => {
  const { buildWatchRoutines } = await import('../lib/watchStrength');
  const mon = new Date(2026, 9, 12, 9).getTime(); // Monday
  const list = buildWatchRoutines({ routines: [{ id: 'b', name: 'Pull', exerciseIds: ['deadlift'], days: [1] }, { id: 'a', name: 'Push', exerciseIds: ['bench-press'], days: [0] }], activePlan: null, now: mon });
  assert.equal(list[0].name, 'Today: Push');
  assert.equal(list[0].id, 'r:a');
  assert.equal(list.filter((r) => r.id === 'r:a').length, 1);
  assert.ok(list.some((r) => r.name === 'Pull'));
});
