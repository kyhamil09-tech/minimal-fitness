import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPROX_LIMIT_CHARS, biggestEntries, megabytes, storageLevel, storageUsage, usedChars } from '../lib/storageHealth';

const fake = (entries: Record<string, string>) => {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
};

test('only the app’s own entries are counted, key and value', () => {
  const s = fake({ kyfit_a: 'x'.repeat(100), aegis_b: 'y'.repeat(50), other: 'z'.repeat(9999) });
  assert.equal(usedChars(s), 'kyfit_a'.length + 100 + 'aegis_b'.length + 50);
});

test('the biggest entries come first, without the prefix', () => {
  const s = fake({ kyfit_small: 'x', kyfit_workouts: 'x'.repeat(5000), kyfit_food: 'x'.repeat(300) });
  assert.deepEqual(biggestEntries(s, 2).map((r) => r.key), ['workouts', 'food']);
});

test('levels: fine, warning at 80%, full at 95% or after a refused save', () => {
  assert.equal(storageLevel(0.5, false), 'ok');
  assert.equal(storageLevel(0.8, false), 'warn');
  assert.equal(storageLevel(0.94, false), 'warn');
  assert.equal(storageLevel(0.95, false), 'full');
  assert.equal(storageLevel(0.1, true), 'full');
});

test('usage ties the numbers together', () => {
  const s = fake({ kyfit_workouts: 'x'.repeat(4_100_000) });
  const u = storageUsage(s, false);
  assert.equal(u.limit, APPROX_LIMIT_CHARS);
  assert.equal(u.level, 'warn');
  assert.ok(u.fraction > 0.8 && u.fraction < 0.9);
  assert.equal(megabytes(3_240_000), '3.2 MB');
});
