import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_DIET } from '../eat/diet';
import { COMMON_PANTRY, Candidate, IDEAS, addToPantry, coreWords, covers, isStaple, rankMeals } from '../eat/pantry';

const ideaCands: Candidate[] = IDEAS.map((i) => ({ kind: 'idea', id: i.id, name: i.name, ingredients: i.ingredients, idea: i }));

test('the words of an ingredient line, and what a pantry item covers', () => {
  assert.deepEqual(coreWords('2 large eggs'), ['egg']);
  assert.deepEqual(coreWords('1 cup canned tomatoes, chopped'), ['tomato']);
  assert.deepEqual(coreWords('Chicken breast (cooked)'), ['chicken', 'breast']);
  assert.equal(covers('eggs', '2 large eggs'), true);
  assert.equal(covers('chicken', 'chicken breast'), true);
  assert.equal(covers('chicken breast', 'chicken'), true);
  assert.equal(covers('tomato', 'canned tomatoes'), true);
  assert.equal(covers('milk', 'coconut milk'), true);
  assert.equal(covers('rice', 'eggs'), false);
  assert.equal(covers('', 'eggs'), false);
  assert.equal(isStaple('salt'), true);
  assert.equal(isStaple('olive oil'), true);
  assert.equal(isStaple('eggs'), false);
});

test('every built-in idea has real ingredients, sensible numbers and consistent diet flags', () => {
  assert.ok(IDEAS.length >= 18);
  const ids = new Set<string>();
  for (const i of IDEAS) {
    assert.ok(!ids.has(i.id), i.id);
    ids.add(i.id);
    assert.ok(i.ingredients.length >= 2 && i.calories >= 150 && i.calories <= 700 && i.proteinG > 0, i.id);
    // 4 / 4 / 9 calories per gram should land near the stated calories.
    const est = i.proteinG * 4 + i.carbsG * 4 + i.fatG * 9;
    assert.ok(Math.abs(est - i.calories) <= i.calories * 0.25, `${i.id}: ${est} vs ${i.calories}`);
    if (i.vegan) assert.ok(i.vegetarian && i.dairyFree, `${i.id} vegan must be vegetarian and dairy-free`);
  }
  assert.ok(COMMON_PANTRY.length >= 15);
});

test('what you could make: ranked by how much you have, with what is missing', () => {
  const r = rankMeals(['eggs', 'bell pepper', 'onion', 'cheese', 'tomatoes'], ideaCands, NO_DIET);
  assert.deepEqual(r.slice(0, 2).map((x) => x.candidate.id).sort(), ['omelet', 'shakshuka']);
  assert.ok(r[0].score === 1 && r[1].score === 1 && r[0].missing.length === 0);
  const shak = r.find((x) => x.candidate.id === 'shakshuka');
  assert.ok(shak && shak.have.length >= 3);
  assert.deepEqual(rankMeals([], ideaCands, NO_DIET), []);
  assert.deepEqual(rankMeals(['unicorn'], ideaCands, NO_DIET), []);
});

test('your own meals come before ideas on a tie, and staples are never missing', () => {
  const mine: Candidate = { kind: 'saved', id: 'm', name: 'My omelet', ingredients: ['eggs', 'cheese', 'salt', 'pepper'] };
  const r = rankMeals(['eggs', 'cheese'], [...ideaCands, mine], NO_DIET);
  assert.equal(r[0].candidate.id, 'm');
  assert.deepEqual(r[0].missing, []);
});

test('the diet filters ideas by their flags and your own meals by their ingredients', () => {
  const pantry = ['eggs', 'bread', 'avocado', 'chicken breast', 'rice', 'broccoli', 'banana', 'peanut butter'];
  const vegan = rankMeals(pantry, ideaCands, { ...NO_DIET, vegan: true });
  assert.ok(vegan.every((x) => x.candidate.idea?.vegan));
  assert.ok(!vegan.some((x) => x.candidate.id === 'omelet'));
  const gf = rankMeals(pantry, ideaCands, { ...NO_DIET, glutenFree: true });
  assert.ok(gf.every((x) => x.candidate.idea?.glutenFree));
  const mineMeat: Candidate = { kind: 'saved', id: 'cb', name: 'Chicken bowl', ingredients: ['chicken breast', 'rice'] };
  assert.equal(rankMeals(pantry, [mineMeat], NO_DIET).length, 1);
  assert.equal(rankMeals(pantry, [mineMeat], { ...NO_DIET, vegetarian: true }).length, 0);
  assert.equal(rankMeals(pantry, [mineMeat], { ...NO_DIET, avoid: 'rice' }).length, 0);
  const noPeanut = rankMeals(pantry, ideaCands, { ...NO_DIET, nutFree: true });
  assert.ok(!noPeanut.some((x) => x.candidate.id === 'pb-toast'));
});

test('a meal needs at least half of its ingredients, or to be short of two or fewer', () => {
  const c: Candidate = { kind: 'saved', id: 'x', name: 'X', ingredients: ['a1', 'b2', 'c3', 'd4', 'e5'] };
  assert.equal(rankMeals(['a1'], [c], NO_DIET).length, 0);
  assert.equal(rankMeals(['a1', 'b2', 'c3'], [c], NO_DIET).length, 1);
  assert.equal(rankMeals(['a1', 'b2'], [c], NO_DIET).length, 0);
});

test('the pantry list is tidy', () => {
  assert.deepEqual(addToPantry([], '  Eggs '), ['eggs']);
  assert.deepEqual(addToPantry(['eggs'], 'EGGS'), ['eggs']);
  assert.deepEqual(addToPantry(['eggs'], '   '), ['eggs']);
  assert.equal(addToPantry(Array.from({ length: 80 }, (_, i) => `item${i}`), 'one more').length, 80);
});
