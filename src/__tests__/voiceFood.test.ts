import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../lib/foodSearch';
import { curatedFoods, loadUsda } from '../lib/foodDb';
import { parseSmart, readAmount, speechTokens } from '../lib/voiceFood';

const at = (h: number) => new Date(2026, 9, 4, h, 0, 0);
const read = (s: string) => readAmount(speechTokens(s));

// The same foods the app searches: the hand-picked list in front of the USDA list.
const index = async () => buildIndex([...curatedFoods(), ...(await loadUsda())]);

test('amounts and units are read from speech', () => {
  assert.deepEqual(read('2 cups of rice').spec, { qty: 2, unit: 'cups' });
  assert.deepEqual(read('two and a half cups of rice').spec, { qty: 2.5, unit: 'cups' });
  assert.deepEqual(read('1 1/2 cups rice').spec, { qty: 1.5, unit: 'cups' });
  assert.deepEqual(read('one and a half cups of rice').spec, { qty: 1.5, unit: 'cups' });
  assert.deepEqual(read('half a cup of oats').spec, { qty: 0.5, unit: 'cup' });
  assert.deepEqual(read('three quarters of a cup of milk').spec.qty, 0.75);
  assert.deepEqual(read('a tablespoon of olive oil').spec, { qty: 1, unit: 'tablespoon' });
  assert.deepEqual(read('100 grams of chicken').spec, { qty: 100, unit: 'grams' });
  assert.deepEqual(read('twenty five grams of almonds').spec, { qty: 25, unit: 'grams' });
  assert.deepEqual(read('a couple of eggs').spec, { qty: 2, unit: '' });
  assert.deepEqual(read('to cups of rice').spec, { qty: 2, unit: 'cups' });
  assert.deepEqual(read('a banana').spec, { qty: 1, unit: '' });
  assert.deepEqual(read('for lunch i had two eggs').spec.qty, 2);
});

test('two cups of rice is two cups of cooked rice, not rice cakes', async () => {
  const r = parseSmart('2 cups of rice', await index(), at(13));
  assert.equal(r.foods.length, 1);
  const f = r.foods[0];
  assert.match(f.record.name, /rice/i);
  assert.doesNotMatch(f.record.name, /cake|pudding|crisp|cereal/i);
  assert.ok(f.nutrients.kcal > 330 && f.nutrients.kcal < 480, `kcal was ${f.nutrients.kcal}`);
  assert.match(f.amount, /2/);
});

test('weights are used as weights', async () => {
  const r = parseSmart('100 grams of chicken breast', await index(), at(13));
  assert.equal(r.foods.length, 1);
  assert.match(r.foods[0].record.name, /chicken/i);
  const k = r.foods[0].nutrients.kcal;
  assert.ok(k > 100 && k < 230, `kcal was ${k}`);
  const oz = parseSmart('4 ounces of chicken breast', await index(), at(13)).foods[0];
  assert.ok(oz.nutrients.kcal > k, 'four ounces (113 g) is more than 100 g');
});

test('spoons, halves and counts use the food\'s own serving', async () => {
  const ix = await index();
  const oil = parseSmart('a tablespoon of olive oil', ix, at(8)).foods[0];
  assert.match(oil.record.name, /olive oil/i);
  assert.ok(oil.nutrients.kcal > 100 && oil.nutrients.kcal < 135, `oil ${oil.nutrients.kcal}`);
  const avo = parseSmart('half an avocado', ix, at(8)).foods[0];
  assert.match(avo.record.name, /avocado/i);
  assert.ok(avo.nutrients.kcal > 90 && avo.nutrients.kcal < 200, `avocado ${avo.nutrients.kcal}`);
  const eggs = parseSmart('two eggs', ix, at(8)).foods[0];
  assert.match(eggs.record.name, /egg/i);
  assert.ok(eggs.nutrients.kcal > 120 && eggs.nutrients.kcal < 220, `eggs ${eggs.nutrients.kcal}`);
});

test('a more is more: two cups is twice one cup', async () => {
  const ix = await index();
  const one = parseSmart('1 cup of rice', ix, at(13)).foods[0].nutrients.kcal;
  const two = parseSmart('2 cups of rice', ix, at(13)).foods[0].nutrients.kcal;
  assert.ok(Math.abs(two - 2 * one) <= 2, `${one} vs ${two}`);
});

test('several foods in one sentence, with a meal and water', async () => {
  const r = parseSmart('for lunch I had 2 cups of rice and 100 grams of chicken breast and a glass of water', await index(), at(8));
  assert.equal(r.meal, 'Lunch');
  assert.equal(r.foods.length, 2);
  assert.equal(r.water.length, 1);
  assert.equal(r.water[0].ml, 250);
  const same = parseSmart('two eggs and a banana', await index(), at(8));
  assert.equal(same.foods.length, 2);
});

test('what cannot be found is handed back', async () => {
  const r = parseSmart('a flibbertigibbet', await index(), at(8));
  assert.equal(r.foods.length, 0);
  assert.deepEqual(r.unmatched, ['a flibbertigibbet']);
  assert.equal(parseSmart('', await index()).foods.length, 0);
});
