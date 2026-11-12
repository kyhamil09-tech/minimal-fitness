import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptPlanDay, isHardDay } from '../lib/planAdapt';
import { PlanDay } from '../types/tracking';

const hardRun: PlanDay = { day: 1, title: 'Tempo run', kind: 'cardio', cardioType: 'Running', targetMinutes: 50, targetKm: 10, intervalId: '5x3' };
const easyRun: PlanDay = { day: 2, title: 'Easy run', kind: 'cardio', cardioType: 'Running', targetMinutes: 30, targetKm: 5 };
const rest: PlanDay = { day: 3, title: 'Rest', kind: 'rest' };
const r = (score: number) => ({ score, label: score >= 70 ? 'Ready' : score >= 50 ? 'Moderate' : score >= 30 ? 'Take it easy' : 'Recover' }) as { score: number; label: 'Ready' };

test('hard days are recognized', () => {
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
