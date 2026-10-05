import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FoodRecord, amountText, curatedFoods, defaultAmount, factorFor, nutrientsFor } from '../lib/foodDb';
import { buildIndex, highlight, searchFoods, tokensOf, withinEdits } from '../lib/foodSearch';

const rec = (name: string, extra: Partial<FoodRecord> = {}): FoodRecord => ({
  id: name, name, group: 0, src: 'fndds', kcal: 100, p: 1, c: 1, f: 1, fiber: 0, sugar: 0, sodium: 0, portions: [{ label: '1 cup', g: 200 }], ...extra,
});

const small = buildIndex([
  rec('Chicken breast, baked, skin not eaten'),
  rec('Chicken breast tenders, breaded, cooked, microwaved'),
  rec('Chicken, broilers or fryers, breast, meat only, cooked, roasted', { src: 'sr' }),
  rec('Banana'),
  rec('Banana bread, made with margarine, with nuts and frosting'),
  rec('Yogurt, Greek, plain, nonfat'),
  rec('Eggplant, cooked'),
  rec('Zucchini, raw'),
  rec('Potato chips, plain'),
  rec('Potato, baked, skin eaten'),
  rec('Oatmeal, cooked with water'),
  rec('Peanut butter', { src: 'curated' }),
]);

test('typing the start of words finds foods, plainer names first', () => {
  const r = searchFoods(small, 'bana');
  assert.equal(r[0].name, 'Banana');
  assert.ok(r.some((x) => x.name.startsWith('Banana bread')));
  assert.equal(searchFoods(small, 'chick breast')[0].name.startsWith('Chicken breast'), true);
});

test('a slipped letter and swapped letters still find the food', () => {
  assert.equal(searchFoods(small, 'chiken brest')[0].name.startsWith('Chicken breast'), true);
  assert.equal(searchFoods(small, 'bananna')[0].name, 'Banana');
  assert.equal(searchFoods(small, 'yogrut')[0].name.startsWith('Yogurt'), true);
});

test('British and American names find the same food', () => {
  assert.equal(searchFoods(small, 'aubergine')[0].name, 'Eggplant, cooked');
  assert.equal(searchFoods(small, 'courgette')[0].name, 'Zucchini, raw');
  assert.equal(searchFoods(small, 'yoghurt')[0].name.startsWith('Yogurt'), true);
  assert.equal(searchFoods(small, 'porridge')[0].name.startsWith('Oatmeal'), true);
});

test('hand-picked foods outrank the rest, and your own boost counts', () => {
  const ix = buildIndex([rec('Peanut butter cookie'), rec('Peanut butter', { src: 'curated' }), rec('Peanut butter, smooth', { src: 'sr' })]);
  assert.equal(searchFoods(ix, 'peanut butter')[0].name, 'Peanut butter');
  const boosted = searchFoods(ix, 'peanut butter', { boost: (r) => (r.name === 'Peanut butter, smooth' ? 10 : 0) });
  assert.equal(boosted[0].name, 'Peanut butter, smooth');
});

test('a word that matches nothing is dropped instead of showing an empty list', () => {
  assert.equal(searchFoods(small, 'banana xqzvw')[0].name, 'Banana');
  assert.deepEqual(searchFoods(small, 'xqzvw'), []);
  assert.deepEqual(searchFoods(small, '   '), []);
});

test('edit distance and tokens', () => {
  assert.ok(withinEdits('chiken', 'chicken', 1));
  assert.ok(withinEdits('brest', 'breast', 1));
  assert.ok(withinEdits('teh', 'the', 1));
  assert.ok(!withinEdits('banana', 'bandage', 1));
  assert.deepEqual(tokensOf('Crème brûlée & Jam!'), ['creme', 'brulee', 'and', 'jam']);
});

test('highlighting marks the matched words', () => {
  const h = highlight('Chicken breast, baked', 'chick bak');
  assert.deepEqual(h.filter((x) => x.hit).map((x) => x.text), ['Chicken', 'baked']);
});

test('amounts: portions, grams and ounces scale the numbers', () => {
  const r = rec('Rice', { kcal: 130, p: 2.7, c: 28, f: 0.3, portions: [{ label: '1 cup', g: 158 }] });
  assert.deepEqual(defaultAmount(r), { unit: 'p0', qty: 1 });
  assert.equal(nutrientsFor(r, 'p0', 1).kcal, Math.round(130 * 1.58));
  assert.equal(nutrientsFor(r, 'g', 100).kcal, 130);
  assert.ok(Math.abs(factorFor(r, 'oz', 1) - 0.283495) < 1e-6);
  assert.equal(amountText(r, 'g', 150), '150 g');
  assert.equal(amountText(r, 'p0', 2), '2 × 1 cup (316 g)');
  const serving = rec('Egg, large', { kcal: 72, perServing: true, portions: [{ label: '1 egg', g: 1 }] });
  assert.equal(nutrientsFor(serving, 'p0', 2).kcal, 144);
});

test('the bundled USDA database is large and well formed', () => {
  const j = JSON.parse(readFileSync(new URL('../data/usda/foods.json', import.meta.url), 'utf8')) as { foods: unknown[][]; groups: string[] };
  assert.ok(j.foods.length > 12000, `only ${j.foods.length} foods`);
  for (const f of j.foods.slice(0, 2000)) {
    assert.equal(typeof f[0], 'string');
    assert.ok((f[3] as number) >= 0 && (f[3] as number) < 950, String(f[0]));
    assert.ok(Array.isArray(f[10]));
  }
  assert.ok(curatedFoods().length > 100);
});

test('searching the real database finds everyday foods fast', () => {
  const j = JSON.parse(readFileSync(new URL('../data/usda/foods.json', import.meta.url), 'utf8')) as { foods: [string, number, number, number, number, number, number, number, number, number, [string, number][]][] };
  const recs: FoodRecord[] = [
    ...curatedFoods(),
    ...j.foods.map((r, i) => ({ id: `u${i}`, name: r[0], group: r[1], src: (r[2] === 1 ? 'fndds' : 'sr') as 'fndds' | 'sr', kcal: r[3], p: r[4], c: r[5], f: r[6], fiber: r[7], sugar: r[8], sodium: r[9], portions: r[10].map(([label, g]) => ({ label, g })) })),
  ];
  const t0 = Date.now();
  const ix = buildIndex(recs);
  const built = Date.now() - t0;
  const t1 = Date.now();
  const top = (q: string) => searchFoods(ix, q, { limit: 5 }).map((r) => r.name);
  const results = { banana: top('banana'), chicken: top('chicken breast'), typo: top('chiken brest'), yog: top('greek yoghurt'), pizza: top('pizza'), oat: top('porridge'), coke: top('cola') };
  const ran = Date.now() - t1;
  assert.match(results.banana[0], /banana/i);
  assert.match(results.chicken[0], /chicken/i);
  assert.match(results.typo[0], /chicken/i);
  assert.match(results.yog[0], /yogurt/i);
  assert.match(results.pizza[0], /pizza/i);
  assert.match(results.oat[0], /oat/i);
  assert.ok(results.coke.length > 0);
  assert.ok(built < 4000, `index took ${built} ms`);
  assert.ok(ran < 1500, `7 searches took ${ran} ms`);
});
