import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptPlanDay, isHardDay } from '../lib/planAdapt';
import { cleanStarts, cycleStatus, usualLength } from '../lib/cycle';
import { PlanDay } from '../types/tracking';

const hardRun: PlanDay = { day: 1, title: 'Tempo run', kind: 'cardio', cardioType: 'Running', targetMinutes: 50, targetKm: 10, intervalId: '5x3' };
const easyRun: PlanDay = { day: 2, title: 'Easy run', kind: 'cardio', cardioType: 'Running', targetMinutes: 30, targetKm: 5 };
const rest: PlanDay = { day: 3, title: 'Rest', kind: 'rest' };
const r = (score: number) => ({ score, label: score >= 70 ? 'Ready' : score >= 50 ? 'Moderate' : score >= 30 ? 'Take it easy' : 'Recover' }) as { score: number; label: 'Ready' };

test('hard days are recognised', () => {
  assert.equal(isHardDay(hardRun), true);
  assert.equal(isHardDay(easyRun), false);
  assert.equal(isHardDay({ ...easyRun, targetMinutes: 75 }), true);
  assert.equal(isHardDay(rest), false);
});

test('the plan adapts to readiness without ever changing a rest day', () => {
  assert.equal(adaptPlanDay(hardRun, null).action, 'keep');
  assert.equal(adaptPlanDay(rest, r(10)).action, 'keep');
  assert.equal(adaptPlanDay(hardRun, r(88)).action, 'keep');
  assert.equal(adaptPlanDay(hardRun, r(60)).action, 'ease');
  assert.equal(adaptPlanDay(easyRun, r(60)).action, 'keep');
  const swap = adaptPlanDay(hardRun, r(40));
  assert.equal(swap.action, 'swap-easy');
  assert.equal(swap.adjusted?.targetMinutes, 25);
  assert.equal(swap.adjusted?.targetKm, 5);
  assert.equal(adaptPlanDay(easyRun, r(40)).action, 'ease');
  assert.equal(adaptPlanDay(easyRun, r(40)).adjusted?.targetMinutes, 22.5);
  assert.equal(adaptPlanDay(hardRun, r(12)).action, 'rest');
});

test('period dates are cleaned and the usual cycle length is learned', () => {
  assert.deepEqual(cleanStarts(['2026-02-01', '2026-01-04', '2026-01-04', '2026-01-10', 'junk']), ['2026-01-04', '2026-02-01']);
  assert.deepEqual(usualLength(['2026-01-01']), { length: 28, personal: false });
  const starts = ['2026-01-01', '2026-01-31', '2026-03-02', '2026-04-01']; // 30-day cycles
  assert.deepEqual(usualLength(starts), { length: 30, personal: true });
});

test('the phase follows the day of the cycle', () => {
  const starts = ['2026-09-06'];
  assert.equal(cycleStatus([], '2026-09-10'), null);
  const d1 = cycleStatus(starts, '2026-09-06')!;
  assert.equal(d1.day, 1);
  assert.equal(d1.phase, 'menstrual');
  assert.equal(cycleStatus(starts, '2026-09-12')!.phase, 'follicular'); // day 7
  assert.equal(cycleStatus(starts, '2026-09-19')!.phase, 'ovulation'); // day 14
  const luteal = cycleStatus(starts, '2026-09-28')!; // day 23
  assert.equal(luteal.phase, 'luteal');
  assert.ok(luteal.readinessNote);
  assert.equal(luteal.nextPeriod, '2026-10-04');
  assert.equal(luteal.daysToNext, 6);
  assert.equal(luteal.personal, false);
  // far past the expected next period with nothing logged: unknown
  assert.equal(cycleStatus(starts, '2026-12-25'), null);
});
