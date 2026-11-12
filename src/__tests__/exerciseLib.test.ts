import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LibEntry, entryEquipment, entryGroup, findEntry, norm, searchLibrary } from '../lib/exerciseLib';
import { EXERCISES } from '../data/exercises';

const lib = JSON.parse(readFileSync(new URL('../data/exercisedb/library.json', import.meta.url), 'utf8')) as LibEntry[];

test('the library is bundled in compact form with steps and muscles', () => {
  assert.ok(lib.length > 800);
  const first = lib[0];
  assert.ok(first.n && first.i.length > 0 && first.p.length > 0);
});

test('groups and equipment map to the app\'s own', () => {
  const bench = lib.find((e) => e.n === 'Barbell Bench Press - Medium Grip')!;
  assert.equal(entryGroup(bench), 'Chest');
  assert.equal(entryEquipment(bench), 'Barbell');
  assert.equal(entryGroup(lib.find((e) => e.c === 'stretching')!), 'Stretch');
});

test('the lifts at the heart of the app find their library entry', () => {
  for (const id of ['squat', 'bench-press', 'deadlift', 'ohp', 'front-squat', 'barbell-row', 'pull-up']) {
    const ex = EXERCISES.find((e) => e.id === id);
    if (!ex) continue;
    const hit = findEntry(lib, ex);
    assert.ok(hit, `no library entry for ${ex.name}`);
  }
});

test('search hides what the app already has and finds by muscle', () => {
  const have = new Set([norm('Barbell Bench Press - Medium Grip')]);
  const res = searchLibrary(lib, 'bench press', have);
  assert.ok(res.length > 0);
  assert.ok(!res.some((e) => norm(e.n) === norm('Barbell Bench Press - Medium Grip')));
  assert.ok(searchLibrary(lib, 'biceps', new Set()).length > 10);
});
