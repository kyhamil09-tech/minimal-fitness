import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMoves, movesFor, planReshuffle } from '../lib/planReshuffle';
import { PlanDay } from '../types/tracking';

const day = (d: number, title: string, kind: PlanDay['kind'], extra: Partial<PlanDay> = {}): PlanDay => ({ day: d as PlanDay['day'], title, kind, ...extra });
// Mon easy run, Tue intervals (hard), Wed rest, Thu easy run, Fri rest, Sat long run (hard), Sun rest
const week: PlanDay[] = [
  day(0, 'Easy run', 'cardio', { targetMinutes: 30 }),
  day(1, 'Intervals', 'cardio', { intervalId: '5x3' }),
  day(2, 'Rest', 'rest'),
  day(3, 'Easy run', 'cardio', { targetMinutes: 30 }),
  day(4, 'Rest', 'rest'),
  day(5, 'Long run', 'cardio', { targetKm: 16 }),
  day(6, 'Rest', 'rest'),
];

test('a missed hard day is offered a rest day that is not next to another hard day', () => {
  // it is Wednesday, Tuesday's intervals were not done
  const r = planReshuffle(week, [0], 2)!;
  assert.equal(r.missed.title, 'Intervals');
  // Wednesday itself (today) is the rest day right after the missed day: not next to a hard session, so it is chosen
  assert.equal(r.to, 2);
  // On Thursday Friday sits right before Saturday's long run and Sunday right after it, so there is nowhere to put it
  const later = planReshuffle(week, [0], 3)!;
  assert.equal(later.to, null);
});

test('with no suitable rest day the advice is to let it go, and easy misses are left alone', () => {
  const tight: PlanDay[] = [day(0, 'Intervals', 'cardio', { intervalId: 'x' }), day(1, 'Easy', 'cardio', { targetMinutes: 30 }), day(2, 'Long', 'cardio', { targetKm: 15 }), day(3, 'Easy', 'cardio', { targetMinutes: 30 })];
  const r = planReshuffle(tight, [], 1)!;
  assert.equal(r.to, null);
  assert.equal(planReshuffle(week, [1], 2), null); // done
  assert.equal(planReshuffle(week, [], 0), null); // nothing earlier in the week yet
  const easyMissed = planReshuffle([day(0, 'Easy run', 'cardio', { targetMinutes: 30 }), day(1, 'Rest', 'rest')], [], 1);
  assert.equal(easyMissed, null);
});

test('applying a move swaps the days and only for that week', () => {
  const moved = applyMoves(week, [{ week: '2026-10-12', from: 1, to: 2 }]);
  assert.equal(moved.find((d) => d.day === 1)!.kind, 'rest');
  assert.match(moved.find((d) => d.day === 2)!.title, /Intervals \(from Tuesday\)/);
  assert.equal(moved.length, 7);
  assert.equal(movesFor([{ week: '2026-10-12', from: 1, to: 2 }], '2026-10-19').length, 0);
  // once moved, the intervals are no longer "missed"
  assert.equal(planReshuffle(moved, [0], 2), null);
});
