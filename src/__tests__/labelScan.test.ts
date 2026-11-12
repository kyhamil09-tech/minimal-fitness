import test from 'node:test';
import assert from 'node:assert/strict';
import { TextLine, mainFound, parseLabel, rowsFromLines } from '../lib/labelScan';

const line = (text: string, left: number, top: number): TextLine => ({ text, left, top, right: left + text.length * 10, bottom: top + 20 });

test('pieces of text at the same height become one row, left to right', () => {
  const rows = rowsFromLines([line('8g', 300, 102), line('Total Fat', 20, 100), line('Calories', 20, 60), line('230', 300, 62), line('10%', 400, 101)]);
  assert.deepEqual(rows, ['Calories 230', 'Total Fat 8g 10%']);
});

const us = [
  'Nutrition Facts',
  '8 servings per container',
  'Serving size 2/3 cup (55g)',
  'Amount per serving',
  'Calories 230',
  'Total Fat 8g 10%',
  'Saturated Fat 1g 5%',
  'Trans Fat 0g',
  'Cholesterol 0mg 0%',
  'Sodium 160mg 7%',
  'Total Carbohydrate 37g 13%',
  'Dietary Fiber 4g 14%',
  'Total Sugars 12g',
  'Includes 10g Added Sugars 20%',
  'Protein 3g',
  'Vitamin D 2mcg 10%',
  'Calcium 260mg 20%',
  'Iron 8mg 45%',
  'Potassium 235mg 6%',
];

test('a US label is read: serving, calories, macros, sodium and the vitamins listed', () => {
  const p = parseLabel(us);
  assert.equal(p.basis, 'serving');
  assert.equal(p.servingG, 55);
  assert.equal(p.servingText, '2/3 cup');
  assert.equal(p.kcal, 230);
  assert.equal(p.fatG, 8);
  assert.equal(p.satFatG, 1);
  assert.equal(p.carbsG, 37);
  assert.equal(p.fiberG, 4);
  assert.equal(p.sugarG, 12);
  assert.equal(p.proteinG, 3);
  assert.equal(p.sodiumMg, 160);
  assert.equal(p.micros.vitD, 2);
  assert.equal(p.micros.calcium, 260);
  assert.equal(p.micros.iron, 8);
  assert.equal(p.micros.potassium, 235);
  assert.equal(mainFound(p), 4);
});

test('a European label per 100 g: kcal from the energy row, salt turned into sodium', () => {
  const p = parseLabel(['Nutrition declaration', 'Typical values per 100 g', 'Energy 1046 kJ / 250 kcal', 'Fat 8,5 g', 'of which saturates 1,2 g', 'Carbohydrate 37 g', 'of which sugars 12 g', 'Fiber 4,1 g', 'Protein 3,2 g', 'Salt 0,4 g']);
  assert.equal(p.basis, '100g');
  assert.equal(p.kcal, 250);
  assert.equal(p.fatG, 8.5);
  assert.equal(p.satFatG, 1.2);
  assert.equal(p.carbsG, 37);
  assert.equal(p.sugarG, 12);
  assert.equal(p.fiberG, 4.1);
  assert.equal(p.proteinG, 3.2);
  assert.equal(p.sodiumMg, 160);
});

test('energy in kilojoules only is converted', () => {
  assert.equal(parseLabel(['Energy 1046 kJ']).kcal, 250);
});

test('common text-recognition slips are forgiven and a blurry photo gives little, not nonsense', () => {
  const p = parseLabel(['Calories 1O0', 'Total Fat Sg', 'Protein Og']);
  assert.equal(p.kcal, 100);
  assert.equal(p.fatG, 5);
  assert.equal(p.proteinG, 0);
  const none = parseLabel(['hello', 'world 12']);
  assert.equal(mainFound(none), 0);
  assert.deepEqual(none.found, []);
});

test('added sugars are not taken for total sugars', () => {
  const p = parseLabel(['Includes 10g Added Sugars 20%', 'Total Sugars 12g']);
  assert.equal(p.sugarG, 12);
});
