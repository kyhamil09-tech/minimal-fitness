import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOBAL_FOODS } from '../data/foodsGlobal';
import { FOOD_DATABASE } from '../data/foods';

test('every added food has a name, a serving and calories that roughly match its macros', () => {
  for (const f of GLOBAL_FOODS) {
    assert.ok(f.name.length > 2 && f.serving.length > 1, f.name);
    const fromMacros = f.proteinG * 4 + f.carbsG * 4 + f.fatG * 9;
    // Fiber, sugar alcohols and rounding make the match loose, but a big gap means a typo.
    assert.ok(Math.abs(fromMacros - f.calories) <= Math.max(35, f.calories * 0.28), `${f.name}: ${f.calories} kcal vs ${Math.round(fromMacros)} from macros`);
  }
});

test('added foods are in the food list and no name is listed twice', () => {
  const names = FOOD_DATABASE.map((f) => f.name.toLowerCase());
  for (const f of GLOBAL_FOODS) assert.ok(names.includes(f.name.toLowerCase()), f.name);
  assert.equal(new Set(names).size, names.length, 'duplicate food names');
});
