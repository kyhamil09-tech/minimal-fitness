import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_PLANS, getPlan, planHasFocus } from '../data/plans';
import { INTERVAL_WORKOUTS } from '../data/intervals';
import { EXERCISES } from '../data/exercises';
import { planDaysForWeek } from '../lib/planBuilder';

const exerciseIds = new Set(EXERCISES.map((e) => e.id));
const intervalIds = new Set(INTERVAL_WORKOUTS.map((i) => i.id));

test('every built-in plan is well formed: unique ids, seven days a week, real exercises and intervals', () => {
  assert.equal(new Set(BUILT_IN_PLANS.map((p) => p.id)).size, BUILT_IN_PLANS.length);
  for (const p of BUILT_IN_PLANS) {
    const weeks = p.weekly && p.weekly.length > 0 ? p.weekly : [p.days];
    if (p.weekly) assert.equal(p.weekly.length, p.weeks, `${p.id}: weekly has ${p.weekly.length} weeks, plan says ${p.weeks}`);
    for (const w of weeks) {
      assert.deepEqual(w.map((d) => d.day), [0, 1, 2, 3, 4, 5, 6], `${p.id}: days must be Monday to Sunday`);
      for (const d of w) {
        if (d.kind === 'strength') {
          assert.ok(d.exerciseIds && d.exerciseIds.length >= 3, `${p.id} ${d.title}: needs exercises`);
          for (const id of d.exerciseIds ?? []) assert.ok(exerciseIds.has(id), `${p.id} ${d.title}: unknown exercise ${id}`);
        } else if (d.kind !== 'rest') {
          assert.ok((d.targetMinutes ?? 0) > 0, `${p.id} ${d.title}: needs minutes`);
        }
        if (d.intervalId) assert.ok(intervalIds.has(d.intervalId), `${p.id}: unknown interval ${d.intervalId}`);
      }
    }
    assert.deepEqual(p.days, weeks[0], `${p.id}: days is week one`);
  }
});

test('the month of walks has a walk on every one of the 28 days, getting longer each week', () => {
  const p = getPlan('plan-walk-month')!;
  assert.equal(p.weeks, 4);
  let total = 0;
  const weekTotals: number[] = [];
  for (let w = 1; w <= 4; w++) {
    const days = planDaysForWeek(p, w);
    assert.equal(days.filter((d) => d.kind === 'cardio' && d.cardioType === 'Walking').length, 7);
    const sum = days.reduce((s, d) => s + (d.targetMinutes ?? 0), 0);
    weekTotals.push(sum);
    total += days.length;
  }
  assert.equal(total, 28);
  assert.ok(weekTotals[0] < weekTotals[1] && weekTotals[1] < weekTotals[2] && weekTotals[2] < weekTotals[3], weekTotals.join());
});

test('filters: walking plans and strength plans overlap where they should', () => {
  assert.ok(planHasFocus(getPlan('plan-walk-month')!, 'walk'));
  assert.ok(!planHasFocus(getPlan('plan-walk-month')!, 'strength'));
  const both = getPlan('plan-walk-strength')!;
  assert.ok(planHasFocus(both, 'walk') && planHasFocus(both, 'strength'));
  assert.ok(planHasFocus(getPlan('plan-cycle-base')!, 'cycle'));
  assert.ok(planHasFocus(getPlan('plan-mobility-14')!, 'mobility'));
  assert.ok(planHasFocus(getPlan('plan-walk-to-run')!, 'run'));
  assert.ok(BUILT_IN_PLANS.length >= 15);
});

import { planHeadline, plannedSport } from '../lib/planToday';

test('Home names today\'s session and opens the right activity', () => {
  const walk = planDaysForWeek(getPlan('plan-walk-month')!, 1)[0];
  assert.equal(plannedSport(walk), 'Walking');
  assert.equal(planHeadline(walk), 'Time for a walk');
  assert.equal(planHeadline(undefined), 'Ready to run?');
  assert.equal(planHeadline({ day: 2, title: 'Rest', kind: 'rest' }), 'Rest day');
  assert.equal(plannedSport({ day: 0, title: 'Push', kind: 'strength', exerciseIds: ['a', 'b', 'c'] }), null);
  assert.equal(plannedSport({ day: 1, title: 'Easy ride', kind: 'cardio', cardioType: 'Cycling', targetMinutes: 40 }), 'Cycling');
});
