import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPackagedResults, offRecord } from '../lib/barcode';
import { amountText, curatedFoods, nutrientsFor } from '../lib/foodDb';

const product = {
  code: '5000112637922',
  product_name: 'Cola Zero',
  brands: 'Fizzco, Other',
  serving_quantity: 330,
  serving_size: '330 ml',
  nutriments: { 'energy-kcal_100g': 0.4, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0, sugars_100g: 0, salt_100g: 0.02 },
};

test('an Open Food Facts product becomes a full record with brand, serving and sodium', () => {
  const snack = { code: '123456789012', product_name: 'Oat bar', brands: 'Bakeco', serving_quantity: 40, serving_size: '1 bar (40 g)', nutriments: { 'energy-kcal_100g': 420, proteins_100g: 8, carbohydrates_100g: 60, fat_100g: 16, fiber_100g: 7.26, sugars_100g: 22.4, sodium_100g: 0.35 } };
  const r = offRecord(snack)!;
  assert.equal(r.src, 'off');
  assert.equal(r.brand, 'Bakeco');
  assert.equal(r.barcode, '123456789012');
  assert.equal(r.kcal, 420);
  assert.equal(r.fiber, 7.3);
  assert.equal(r.sugar, 22.4);
  assert.equal(r.sodium, 350);
  assert.equal(r.portions[0].g, 40);
  // 1 serving = 40 g = 168 kcal
  assert.equal(nutrientsFor(r, 'p0', 1).kcal, 168);
  assert.match(amountText(r, 'p0', 2), /^2 × .*\(80 g\)$/);
});

test('salt is turned into sodium when only salt is listed, and nameless or empty products are skipped', () => {
  const r = offRecord({ ...product, nutriments: { ...product.nutriments, 'energy-kcal_100g': 42 } })!;
  assert.equal(r.sodium, 8);
  assert.equal(offRecord({ ...product, product_name: '' }), null);
  assert.equal(offRecord({ product_name: 'Nothing', nutriments: {} }), null);
});

test('search results are capped, deduplicated and drop zero-calorie rows', () => {
  const items = [
    { ...product, product_name: 'Water', nutriments: { 'energy-kcal_100g': 0 } },
    { ...product, product_name: 'Bar', code: '1', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 5 } },
    { ...product, product_name: 'Bar', code: '2', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 5 } },
  ];
  const r = mapPackagedResults({ products: items });
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'Bar');
});

test('hand-picked foods with a weight can be logged by the gram', () => {
  const yogurt = curatedFoods().find((f) => f.name.startsWith('Greek yogurt'))!;
  assert.equal(yogurt.perServing, undefined);
  assert.equal(nutrientsFor(yogurt, 'p0', 1).kcal, 100);
  assert.equal(nutrientsFor(yogurt, 'g', 85).kcal, 50);
  const egg = curatedFoods().find((f) => f.name === 'Egg, large')!;
  assert.equal(egg.perServing, true);
  assert.equal(amountText(egg, 'p0', 1), '1 egg');
});
