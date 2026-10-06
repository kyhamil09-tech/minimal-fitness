import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNutrition, wholePercents } from '../lib/nutritionTrends';

const TODAY = '2026-10-05';
const f = (date: string, calories: number, proteinG = 0, carbsG = 0, fatG = 0) => ({ date, calories, proteinG, carbsG, fatG });
const goals = { dailyCalories: 2000, dailyProteinG: 150 };

test('days add up their entries, and unlogged days are flagged and left out of averages', () => {
  const s = buildNutrition([f('2026-10-05', 800, 40), f('2026-10-05', 1200, 60), f('2026-10-03', 1800, 120)], goals, 4, TODAY);
  assert.deepEqual(s.days.map((d) => [d.date, d.logged, d.calories]), [
    ['2026-10-02', false, 0],
    ['2026-10-03', true, 1800],
    ['2026-10-04', false, 0],
    ['2026-10-05', true, 2000],
  ]);
  assert.equal(s.loggedDays, 2);
  assert.equal(s.avgCalories, 1900);
  assert.equal(s.avgProteinG, 110);
  assert.equal(s.calorieDelta, -100);
});

test('on-target days: calories within ten percent of the goal, protein at ninety percent or more', () => {
  const s = buildNutrition(
    [
      f('2026-10-05', 2150, 140), // calories +7.5%: on target. protein 93%: on target
      f('2026-10-04', 2300, 100), // calories +15%: off. protein 67%: off
      f('2026-10-03', 1810, 136), // calories -9.5%: on. protein 91%: on
      f('2026-10-02', 1790, 150), // calories -10.5%: off. protein 100%: on
    ],
    goals,
    4,
    TODAY
  );
  assert.equal(s.daysOnCalories, 2);
  assert.equal(s.daysOnProtein, 3);
});

test('whole percentages always add up to one hundred', () => {
  assert.deepEqual(wholePercents([1, 1, 1]), [34, 33, 33]);
  assert.equal(wholePercents([0, 0, 0]), null);
  for (const parts of [[30, 50, 20], [7, 11, 13], [1, 0, 0], [333, 333, 334]] as [number, number, number][]) {
    assert.equal(wholePercents(parts)!.reduce((a, b) => a + b, 0), 100);
  }
});

test('calorie split uses 4, 4 and 9 calories per gram', () => {
  // 100 g protein (400), 200 g carbs (800), 100 g fat (900): 400/2100, 800/2100, 900/2100
  const s = buildNutrition([f('2026-10-05', 2100, 100, 200, 100)], goals, 1, TODAY);
  assert.deepEqual(s.split, { protein: 19, carbs: 38, fat: 43 });
});

test('with nothing logged there are no averages or split, and a missing goal gives no verdict', () => {
  const none = buildNutrition([], goals, 7, TODAY);
  assert.equal(none.loggedDays, 0);
  assert.equal(none.split, null);
  assert.equal(none.calorieDelta, undefined);
  const noGoal = buildNutrition([f('2026-10-05', 1500)], { dailyCalories: 0, dailyProteinG: 0 }, 7, TODAY);
  assert.equal(noGoal.calorieDelta, undefined);
  assert.equal(noGoal.daysOnCalories, 0);
});
