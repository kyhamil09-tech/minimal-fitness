import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PlannedMeal,
  addPlanned,
  copyWeek,
  groceryKey,
  groceryList,
  groceryText,
  markLogged,
  mealTotals,
  plannedDayTotals,
  plannedIn,
  removePlanned,
  weekDates,
} from '../lib/mealPlan';
import type { SavedMeal } from '../types/tracking';

const item = (name: string, calories: number, proteinG = 0, carbsG = 0, fatG = 0) => ({ name, calories, proteinG, carbsG, fatG });
const oats: SavedMeal = { id: 'm1', name: 'Oats bowl', items: [item('Oats', 300, 10, 50, 5), item('Banana', 100, 1, 25, 0)] };
const eggs: SavedMeal = { id: 'm2', name: 'Eggs on toast', items: [item('Eggs', 200, 14, 1, 14), item('Toast', 150, 5, 28, 2), item('banana ', 100, 1, 25, 0)] };
const MEALS = [oats, eggs];
const WEEK = '2026-10-05'; // a Monday

test('a week is seven dates from its start', () => {
  assert.deepEqual(weekDates(WEEK), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
});

test('a saved meal adds up its items', () => {
  assert.deepEqual(mealTotals(oats), { calories: 400, proteinG: 11, carbsG: 75, fatG: 5 });
});

test('meals can be added to a slot, found, marked as logged and removed', () => {
  let plan: PlannedMeal[] = [];
  plan = addPlanned(plan, WEEK, 'Breakfast', 'm1', 'a');
  plan = addPlanned(plan, WEEK, 'Breakfast', 'm2', 'b');
  plan = addPlanned(plan, WEEK, 'Dinner', 'm2', 'c');
  assert.deepEqual(plannedIn(plan, WEEK, 'Breakfast').map((p) => p.id), ['a', 'b']);
  plan = markLogged(plan, 'a', 123);
  assert.equal(plan.find((p) => p.id === 'a')!.loggedAt, 123);
  assert.equal(plan.find((p) => p.id === 'b')!.loggedAt, undefined);
  plan = removePlanned(plan, 'b');
  assert.deepEqual(plan.map((p) => p.id), ['a', 'c']);
});

test('planned day totals add the meals of that day and ignore deleted meals', () => {
  const plan: PlannedMeal[] = [
    { id: 'a', date: WEEK, meal: 'Breakfast', savedMealId: 'm1' },
    { id: 'b', date: WEEK, meal: 'Dinner', savedMealId: 'm2' },
    { id: 'c', date: WEEK, meal: 'Snack', savedMealId: 'gone' },
    { id: 'd', date: '2026-10-06', meal: 'Dinner', savedMealId: 'm2' },
  ];
  assert.equal(plannedDayTotals(plan, MEALS, WEEK).calories, 400 + 450);
  assert.equal(plannedDayTotals(plan, MEALS, '2026-10-07').calories, 0);
});

test('the grocery list counts each food across the week and merges spellings', () => {
  const plan: PlannedMeal[] = [
    { id: 'a', date: '2026-10-05', meal: 'Breakfast', savedMealId: 'm1' },
    { id: 'b', date: '2026-10-06', meal: 'Breakfast', savedMealId: 'm1' },
    { id: 'c', date: '2026-10-07', meal: 'Breakfast', savedMealId: 'm2' },
    { id: 'd', date: '2026-10-20', meal: 'Breakfast', savedMealId: 'm1' }, // another week
  ];
  const list = groceryList(plan, MEALS, weekDates(WEEK));
  assert.deepEqual(list.map((i) => [i.name, i.count]), [['Banana', 3], ['Eggs', 1], ['Oats', 2], ['Toast', 1]]);
  assert.deepEqual(list.find((i) => i.key === 'banana')!.meals, ['Oats bowl', 'Eggs on toast']);
  assert.equal(groceryKey('  Greek   Yogurt '), 'greek yogurt');
});

test('copying a week keeps what is there and adds only what is missing', () => {
  const plan: PlannedMeal[] = [
    { id: 'a', date: '2026-10-05', meal: 'Breakfast', savedMealId: 'm1', loggedAt: 99 },
    { id: 'b', date: '2026-10-07', meal: 'Dinner', savedMealId: 'm2' },
    { id: 'x', date: '2026-10-12', meal: 'Breakfast', savedMealId: 'm1' }, // already planned next Monday
  ];
  let n = 0;
  const out = copyWeek(plan, '2026-10-05', '2026-10-12', () => `new${++n}`);
  assert.equal(out.length, 4);
  const added = out.find((p) => p.id === 'new1')!;
  assert.deepEqual([added.date, added.meal, added.savedMealId, added.loggedAt], ['2026-10-14', 'Dinner', 'm2', undefined]);
  assert.equal(copyWeek(out, '2026-10-05', '2026-10-12', () => 'z'), out); // nothing left to add
});

test('the shareable list marks ticked items and shows counts', () => {
  const items = [{ key: 'banana', name: 'Banana', count: 3, meals: [] }, { key: 'eggs', name: 'Eggs', count: 1, meals: [] }];
  const text = groceryText('Groceries', items, [{ id: 'e1', name: 'Coffee' }], { eggs: true, 'extra:e1': true });
  assert.equal(text, 'Groceries\n[ ] Banana x3\n[x] Eggs\n[x] Coffee');
});
