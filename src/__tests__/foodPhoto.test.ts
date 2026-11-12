import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestFoods } from '../lib/foodPhoto';
import { FoodRecord } from '../lib/foodDb';

const rec = (id: string, name: string) => ({ id, name }) as unknown as FoodRecord;
const db: Record<string, FoodRecord[]> = {
  pizza: [rec('p1', 'Pizza, cheese'), rec('p2', 'Pizza, pepperoni')],
  salad: [rec('s1', 'Salad, garden')],
  tomato: [rec('t1', 'Tomato, raw'), rec('p1', 'Pizza, cheese')],
  banana: [],
};
const find = (q: string) => db[q] ?? [];

test('generic words are skipped, the most confident come first, and no food appears twice', () => {
  const r = suggestFoods(
    [
      { text: 'Food', confidence: 0.98 },
      { text: 'Tomato', confidence: 0.6 },
      { text: 'Pizza', confidence: 0.9 },
      { text: 'Plate', confidence: 0.8 },
      { text: 'Banana', confidence: 0.7 },
      { text: 'Salad', confidence: 0.5 },
      { text: 'pizza', confidence: 0.4 },
    ],
    find
  );
  assert.deepEqual(r.map((s) => s.label), ['Pizza', 'Tomato', 'Salad']);
  assert.deepEqual(r[0].foods.map((f) => f.id), ['p1', 'p2']);
  assert.deepEqual(r[1].foods.map((f) => f.id), ['t1']); // the pizza was already offered above
});

test('nothing useful in the photo gives no suggestions', () => {
  assert.deepEqual(suggestFoods([{ text: 'Food', confidence: 0.9 }, { text: 'Tableware', confidence: 0.8 }], find), []);
  assert.deepEqual(suggestFoods([], find), []);
});
