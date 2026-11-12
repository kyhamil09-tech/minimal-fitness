import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesToRepeat, mealForHour, mealForQuick, quickFoods, summarize, yesterdayOf } from '../lib/quickFood';
import { FoodEntry, MealType } from '../types/tracking';

let n = 0;
const f = (date: string, name: string, calories: number, meal: MealType = 'Breakfast', amount?: string): FoodEntry => ({ id: `f${n++}`, date, meal, name, calories, proteinG: 5, carbsG: 20, fatG: 3, ...(amount ? { amount } : {}) });

test('the meal for a time of day', () => {
  assert.equal(mealForHour(7), 'Breakfast');
  assert.equal(mealForHour(10.4), 'Breakfast');
  assert.equal(mealForHour(10.5), 'Lunch');
  assert.equal(mealForHour(14.9), 'Lunch');
  assert.equal(mealForHour(18), 'Dinner');
  assert.equal(mealForHour(21), 'Snack');
  assert.equal(mealForHour(2), 'Breakfast', 'very early is the start of the day, not a snack');
});

test('the foods you log most come first, with the recent ones ahead of old habits', () => {
  const log = [
    ...['2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09'].map((d) => f(d, 'Oatmeal', 150, 'Breakfast', '1 cup')),
    f('2026-10-02', 'Pizza', 600, 'Dinner'),
    f('2026-09-30', 'Pizza', 600, 'Dinner'),
    f('2026-10-12', 'Banana', 105, 'Snack'),
  ];
  const q = quickFoods(log, '2026-10-12');
  assert.equal(q[0].entry.name, 'Oatmeal');
  assert.equal(q[0].count, 4);
  assert.equal(q[0].meal, 'Breakfast');
  assert.deepEqual(q.map((x) => x.entry.name).sort(), ['Banana', 'Oatmeal', 'Pizza']);
  assert.equal(quickFoods(log, '2026-10-12', 2).length, 2);
});

test('the same food in a different amount is a different quick food, and old or empty entries are ignored', () => {
  const log = [f('2026-10-11', 'Rice', 200, 'Dinner', '1 cup'), f('2026-10-10', 'Rice', 400, 'Dinner', '2 cups'), f('2026-01-01', 'Ancient', 300), f('2026-10-11', 'Water', 0)];
  const q = quickFoods(log, '2026-10-12');
  assert.equal(q.length, 2);
  assert.ok(q.every((x) => x.entry.name === 'Rice'));
  assert.ok(!q.some((x) => x.entry.name === 'Ancient' || x.entry.name === 'Water'));
  assert.equal(quickFoods([f('2026-10-13', 'Future', 100)], '2026-10-12').length, 0, 'a date after today is ignored');
});

test('a quick food keeps its nutrition and drops its id, date and meal; the usual meal is the most common one', () => {
  const log = [f('2026-10-11', 'Yogurt', 120, 'Snack'), f('2026-10-10', 'Yogurt', 120, 'Snack'), f('2026-10-09', 'Yogurt', 120, 'Breakfast')];
  const [y] = quickFoods(log, '2026-10-12');
  assert.equal(y.meal, 'Snack');
  assert.equal(y.entry.calories, 120);
  assert.equal(y.entry.proteinG, 5);
  assert.ok(!('id' in y.entry) && !('date' in y.entry) && !('meal' in y.entry));
});

test('repeating a day or a meal copies the entries without their ids and dates', () => {
  const log = [f('2026-10-11', 'Oatmeal', 150, 'Breakfast'), f('2026-10-11', 'Salad', 300, 'Lunch'), f('2026-10-11', 'Soup', 200, 'Lunch'), f('2026-10-10', 'Other', 100)];
  assert.equal(entriesToRepeat(log, '2026-10-11').length, 3);
  const lunch = entriesToRepeat(log, '2026-10-11', 'Lunch');
  assert.deepEqual(lunch.map((e) => e.name), ['Salad', 'Soup']);
  assert.ok(lunch.every((e) => !('id' in e) && !('date' in e) && e.meal === 'Lunch'));
  assert.deepEqual(entriesToRepeat(log, '2026-10-09'), []);
  assert.equal(yesterdayOf('2026-10-01'), '2026-09-30');
  assert.deepEqual(summarize(lunch), { count: 2, kcal: 500 });
});

test('a one-tap food goes where you usually have it when that is a clear habit, else by the clock', () => {
  const evening = new Date(2026, 9, 12, 19, 0);
  const oats = quickFoods([f('2026-10-11', 'Oatmeal', 150, 'Breakfast'), f('2026-10-10', 'Oatmeal', 150, 'Breakfast'), f('2026-10-09', 'Oatmeal', 150, 'Breakfast')], '2026-10-12')[0];
  assert.equal(oats.share, 1);
  assert.equal(mealForQuick(oats, evening), 'Breakfast');
  const mixed = quickFoods([f('2026-10-11', 'Nuts', 180, 'Snack'), f('2026-10-10', 'Nuts', 180, 'Lunch'), f('2026-10-09', 'Nuts', 180, 'Dinner')], '2026-10-12')[0];
  assert.equal(mealForQuick(mixed, evening), 'Dinner', 'no clear habit: the time of day');
  const rare = quickFoods([f('2026-10-11', 'Cake', 400, 'Snack')], '2026-10-12')[0];
  assert.equal(mealForQuick(rare, new Date(2026, 9, 12, 8, 0)), 'Breakfast', 'one time is not a habit');
});
