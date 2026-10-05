import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFood, mealFor, parseVoice } from '../lib/voiceLog';

const at = (h: number) => new Date(2026, 9, 4, h, 0, 0);

test('foods and quantities are understood', () => {
  const r = parseVoice('two eggs and a banana', at(8));
  assert.equal(r.foods.length, 2);
  assert.match(r.foods[0].item.name, /^Egg/);
  assert.equal(r.foods[0].qty, 2);
  assert.equal(r.foods[1].item.name, 'Banana');
  assert.equal(r.foods[1].qty, 1);
  assert.equal(r.meal, 'Breakfast');
  assert.equal(r.unmatched.length, 0);
});

test('water in different units', () => {
  assert.deepEqual(parseVoice('500 ml water').water.map((w) => w.ml), [500]);
  assert.deepEqual(parseVoice('a glass of water').water.map((w) => w.ml), [250]);
  assert.deepEqual(parseVoice('two bottles of water').water.map((w) => w.ml), [1000]);
  assert.deepEqual(parseVoice('1 liter of water').water.map((w) => w.ml), [1000]);
  assert.deepEqual(parseVoice('16 oz water').water.map((w) => w.ml), [473]);
  const mixed = parseVoice('a glass of water and an apple');
  assert.equal(mixed.water.length, 1);
  assert.equal(mixed.foods[0].item.name, 'Apple');
});

test('toast maps to bread, the meal can be named, and unknown things are handed back', () => {
  const r = parseVoice('for lunch I had 3 slices of toast and a flibbertigibbet', at(8));
  assert.equal(r.meal, 'Lunch');
  assert.equal(r.foods[0].qty, 3);
  assert.match(r.foods[0].item.name, /bread/i);
  assert.deepEqual(r.unmatched, ['a flibbertigibbet']);
  assert.equal(matchFood([]), null);
  assert.equal(parseVoice('').foods.length, 0);
});

test('the meal falls back to the time of day', () => {
  assert.equal(mealFor('an apple', at(7)), 'Breakfast');
  assert.equal(mealFor('an apple', at(13)), 'Lunch');
  assert.equal(mealFor('an apple', at(19)), 'Dinner');
  assert.equal(mealFor('an apple', at(22)), 'Snack');
  assert.equal(mealFor('a snack', at(8)), 'Snack');
});
