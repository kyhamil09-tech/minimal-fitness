import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, LIBRARY_GROUPS, MUSCLE_GROUPS } from '../data/exercises';
import { MOTIONS } from '../data/motions';

test('every exercise has a unique id and any animation it names exists', () => {
  const ids = new Set<string>();
  for (const x of EXERCISES) {
    assert.ok(!ids.has(x.id), `duplicate id ${x.id}`);
    ids.add(x.id);
    if (x.pattern) assert.ok(MOTIONS[x.pattern], `${x.name} names a missing animation`);
  }
});

test('warm-ups, cardio and stretches are in the library but not counted as muscle volume', () => {
  for (const g of ['Warm-up', 'Cardio', 'Stretch'] as const) {
    assert.ok(LIBRARY_GROUPS.includes(g));
    assert.ok(!MUSCLE_GROUPS.includes(g));
    assert.ok(EXERCISES.some((x) => x.muscle === g));
  }
});

test('every animation has frames and three cues', () => {
  for (const [id, m] of Object.entries(MOTIONS)) {
    assert.ok(m.frames.length > 0, id);
    assert.equal(m.cues.length, 3, id);
  }
});
