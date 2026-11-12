import test from 'node:test';
import assert from 'node:assert/strict';
import { addMicros, dayMicros, offMicros, microsFromList, scaleMicros } from '../lib/micros';
import { perServing, recipeToRecord, recipeTotals, Recipe } from '../lib/recipe';
import { cachedBarcode, rememberBarcode } from '../lib/barcodeCache';
import { offRecord } from '../lib/barcode';
import { nutrientsFor } from '../lib/foodDb';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test('Open Food Facts amounts (grams per 100 g) become mg and µg', () => {
  const m = offMicros({ 'vitamin-c_100g': 0.06, 'calcium_100g': 0.12, 'vitamin-d_100g': 0.000005, 'iron_100g': 0 })!;
  assert.equal(m.vitC, 60);
  assert.equal(m.calcium, 120);
  assert.equal(m.vitD, 5);
  assert.equal(m.iron, undefined);
});

test('an implausible amount (wrong unit in the source) is left out', () => {
  assert.equal(offMicros({ 'vitamin-c_100g': 50 }), undefined);
});

test('scaling and adding', () => {
  assert.deepEqual(scaleMicros({ vitC: 10, iron: 2 }, 2.5), { vitC: 25, iron: 5 });
  assert.deepEqual(addMicros({ vitC: 10 }, { vitC: 5, zinc: 1 }), { vitC: 15, zinc: 1 });
  assert.equal(scaleMicros(undefined, 2), undefined);
});

test('the USDA list of numbers reads back in order, zeros meaning unknown', () => {
  const m = microsFromList([12, 0, 0, 0, 0, 0, 0, 0, 120])!;
  assert.equal(m.vitC, 12);
  assert.equal(m.calcium, 120);
  assert.equal(m.vitD, undefined);
});

test('a food record scales its vitamins with the amount eaten', () => {
  const rec = offRecord({ code: '123456789', product_name: 'Orange juice', nutriments: { 'energy-kcal_100g': 45, proteins_100g: 0.7, carbohydrates_100g: 10, fat_100g: 0.2, 'vitamin-c_100g': 0.04 }, serving_quantity: 250 })!;
  assert.equal(rec.micros?.vitC, 40);
  const n = nutrientsFor(rec, 'g', 250);
  assert.equal(n.micros?.vitC, 100);
});

test('the day total says how many foods it could not count', () => {
  const d = dayMicros([{ micros: { vitC: 45 } }, {}, { micros: { vitC: 45, iron: 9 } }]);
  assert.equal(d.known, 2);
  assert.equal(d.unknown, 1);
  assert.equal(d.rows.find((r) => r.def.id === 'vitC')!.pct, 100);
  assert.equal(d.rows.find((r) => r.def.id === 'iron')!.pct, 50);
});

const stew: Recipe = {
  id: 'r1',
  name: 'Stew',
  servings: 4,
  ingredients: [
    { name: 'Beef', kcal: 800, p: 80, c: 0, f: 50, micros: { iron: 8 } },
    { name: 'Potato', kcal: 400, p: 8, c: 90, f: 1, fiber: 8, micros: { vitC: 40 } },
  ],
};

test('a recipe adds up and divides by servings', () => {
  const t = recipeTotals(stew);
  assert.equal(t.kcal, 1200);
  const s = perServing(stew);
  assert.equal(s.kcal, 300);
  assert.equal(s.p, 22);
  assert.equal(s.micros?.iron, 2);
  assert.equal(s.micros?.vitC, 10);
});

test('a recipe becomes one per-serving food', () => {
  const r = recipeToRecord(stew);
  assert.equal(r.perServing, true);
  assert.equal(r.kcal, 300);
  assert.equal(r.id, 'mine:recipe:r1');
  assert.equal(nutrientsFor(r, 'p0', 2).kcal, 600);
});

test('a scanned barcode is remembered, with the 12-digit and 13-digit forms matching', () => {
  const s = memory();
  const rec = offRecord({ code: '0123456789012', product_name: 'Crackers', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 8, carbohydrates_100g: 70, fat_100g: 10 } })!;
  assert.equal(cachedBarcode('123456789012', s), null);
  rememberBarcode(rec, s, 1);
  assert.equal(cachedBarcode('123456789012', s)?.name, 'Crackers');
  assert.equal(cachedBarcode('0123456789012', s)?.name, 'Crackers');
});

test('the bundled USDA list carries vitamins and minerals', async () => {
  const { readFileSync } = await import('node:fs');
  const data = JSON.parse(readFileSync(new URL('../data/usda/foods.json', import.meta.url), 'utf8')) as { foods: [string, ...unknown[]][] };
  const withMicros = data.foods.filter((f) => Array.isArray(f[11])).length;
  assert.ok(withMicros > data.foods.length * 0.9, `only ${withMicros} foods have them`);
  const orange = data.foods.find((f) => f[0] === 'Orange, raw')!;
  const m = microsFromList(orange[11])!;
  assert.ok(m.vitC! > 40 && m.vitC! < 70, 'vitamin C of an orange');
});
