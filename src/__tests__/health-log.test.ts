import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBp, classifyGlucose, mergeImportedLogs, mgdlToMmol, recentNames } from '../lib/healthLog';
import { mapSearchResults } from '../lib/barcode';
import { HealthLogEntry } from '../types/tracking';

test('blood pressure categories', () => {
  assert.equal(classifyBp(115, 75).label, 'Normal');
  assert.equal(classifyBp(124, 78).label, 'Elevated');
  assert.equal(classifyBp(134, 78).label, 'High (stage 1)');
  assert.equal(classifyBp(118, 85).label, 'High (stage 1)');
  assert.equal(classifyBp(150, 95).label, 'High (stage 2)');
  assert.equal(classifyBp(190, 100).tone, 'high');
  assert.equal(classifyBp(85, 55).tone, 'low');
});

test('glucose ranges depend on the relation to a meal', () => {
  assert.equal(classifyGlucose(90, 'fasting').tone, 'good');
  assert.equal(classifyGlucose(110, 'fasting').tone, 'watch');
  assert.equal(classifyGlucose(130, 'fasting').tone, 'high');
  assert.equal(classifyGlucose(130, 'after').tone, 'good');
  assert.equal(classifyGlucose(190, 'after').tone, 'high');
  assert.equal(classifyGlucose(60, 'general').tone, 'low');
  assert.equal(mgdlToMmol(90), 5);
});

const entry = (id: string, kind: HealthLogEntry['kind'], at: number, name?: string): HealthLogEntry => ({ id, kind, at, name });

test('imported readings never duplicate', () => {
  const a = [entry('a', 'bp', 100)];
  const merged = mergeImportedLogs(a, [entry('a', 'bp', 100), entry('b', 'bp', 200)]);
  assert.deepEqual(merged.map((e) => e.id), ['b', 'a']);
  assert.equal(mergeImportedLogs(merged, [entry('b', 'bp', 200)]), merged);
});

test('recent medication names are unique and newest first', () => {
  const list = [entry('1', 'med', 1, 'Vitamin D'), entry('2', 'med', 3, 'Ibuprofen'), entry('3', 'med', 2, 'Vitamin D'), entry('4', 'symptom', 5, 'Headache')];
  assert.deepEqual(recentNames(list, 'med'), ['Ibuprofen', 'Vitamin D']);
});

test('online search results map and skip empty items', () => {
  const out = mapSearchResults({
    products: [
      { product_name: 'Oat bar', brands: 'Acme, Other', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 8, carbohydrates_100g: 60, fat_100g: 12 }, serving_quantity: '40' },
      { product_name: '', nutriments: { 'energy-kcal_100g': 100 } },
      { product_name: 'No nutrition', nutriments: {} },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Oat bar (Acme)');
  assert.equal(out[0].servingG, 40);
});
