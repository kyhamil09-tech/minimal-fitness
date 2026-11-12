import test from 'node:test';
import assert from 'node:assert/strict';
import { amountFor, ingredientLines, parseIngredientLine, parseServings } from '../lib/recipeText';
import type { FoodRecord } from '../lib/foodDb';

const flour: FoodRecord = { id: 'f', name: 'Flour', group: 6, src: 'sr', kcal: 364, p: 10, c: 76, f: 1, fiber: 2.7, sugar: 0.3, sodium: 2, portions: [{ label: '1 cup', g: 125 }, { label: '1 tbsp', g: 8 }] };
const egg: FoodRecord = { id: 'e', name: 'Egg', group: 2, src: 'sr', kcal: 143, p: 12.6, c: 0.7, f: 9.5, fiber: 0, sugar: 0.4, sodium: 142, portions: [{ label: '1 large', g: 50 }, { label: '1 medium', g: 44 }] };
const clove: FoodRecord = { id: 'g', name: 'Garlic', group: 9, src: 'sr', kcal: 149, p: 6, c: 33, f: 0.5, fiber: 2, sugar: 1, sodium: 17, portions: [{ label: '1 clove', g: 3 }, { label: '1 tsp', g: 2.8 }] };

test('amounts, units and names are pulled out of a line', () => {
  const a = parseIngredientLine('2 cups all-purpose flour, sifted');
  assert.deepEqual([a.qty, a.unit, a.name], [2, 'cup', 'all-purpose flour']);
  const b = parseIngredientLine('1 1/2 tbsp olive oil');
  assert.deepEqual([b.qty, b.unit, b.name], [1.5, 'tbsp', 'olive oil']);
  const c = parseIngredientLine('½ teaspoon salt');
  assert.deepEqual([c.qty, c.unit, c.name], [0.5, 'tsp', 'salt']);
  const d = parseIngredientLine('• 200 g chicken breast, diced');
  assert.deepEqual([d.qty, d.unit, d.name], [200, 'g', 'chicken breast']);
});

test('counts, sizes and ranges', () => {
  const a = parseIngredientLine('3 large eggs');
  assert.deepEqual([a.qty, a.unit, a.size, a.name], [3, 'each', 'large', 'eggs']);
  const b = parseIngredientLine('2-3 cloves garlic, minced');
  assert.deepEqual([b.qty, b.unit, b.name], [2.5, 'each', 'garlic']);
  const c = parseIngredientLine('1 onion, finely chopped');
  assert.deepEqual([c.qty, c.unit, c.name], [1, 'each', 'onion']);
});

test('a size in brackets multiplies the count', () => {
  const a = parseIngredientLine('2 (14 oz) cans diced tomatoes');
  assert.equal(a.qty, 28);
  assert.equal(a.unit, 'oz');
  assert.equal(a.name, 'tomatoes');
});

test('no amount means it is left out of the totals unless chosen', () => {
  assert.equal(parseIngredientLine('Salt and pepper, to taste').noAmount, true);
  assert.equal(parseIngredientLine('2 cups flour').noAmount, false);
});

test('servings are read from the usual wordings', () => {
  assert.equal(parseServings('Serves 4'), 4);
  assert.equal(parseServings('Yield: 6 servings'), 6);
  assert.equal(parseServings('Makes 12 muffins'), 12);
  assert.equal(parseServings('Serves 4-6'), 5);
  assert.equal(parseServings('no number here'), undefined);
});

test('grams come from the food\'s own portion sizes', () => {
  assert.equal(amountFor(flour, parseIngredientLine('2 cups flour')).grams, 250);
  assert.ok(Math.abs(amountFor(flour, parseIngredientLine('2 tbsp flour')).grams - 16) < 0.5);
  assert.equal(amountFor(flour, parseIngredientLine('100 g flour')).grams, 100);
  assert.ok(Math.abs(amountFor(flour, parseIngredientLine('1 lb flour')).grams - 453.592) < 0.01);
  assert.equal(amountFor(egg, parseIngredientLine('3 large eggs')).grams, 150);
  assert.equal(amountFor(egg, parseIngredientLine('2 medium eggs')).grams, 88);
  assert.equal(amountFor(clove, parseIngredientLine('4 cloves garlic')).grams, 12);
});

test('with no portion to go by, a volume is a guess and says so', () => {
  const water: FoodRecord = { ...flour, portions: [] };
  const a = amountFor(water, parseIngredientLine('1 cup stock'));
  assert.equal(a.grams, 240);
  assert.equal(a.approx, true);
});

test('the lines of a pasted recipe skip headings', () => {
  const lines = ingredientLines('Ingredients\n2 cups flour\n\nServes 4\n1 tsp salt\nDirections:\n');
  assert.deepEqual(lines, ['2 cups flour', '1 tsp salt']);
});

test('a weight of a per-serving food counts as one serving, not hundreds', () => {
  const rec = { id: 'x', name: 'Butter', perServing: true, portions: [], group: 0 } as unknown as Parameters<typeof amountFor>[0];
  const a = amountFor(rec, { qty: 200, unit: 'g', name: 'butter' });
  assert.equal(a.servings, 1);
  assert.equal(a.approx, true);
  assert.equal(amountFor(rec, { qty: 2, unit: 'each', name: 'butter' }).servings, 2);
});
