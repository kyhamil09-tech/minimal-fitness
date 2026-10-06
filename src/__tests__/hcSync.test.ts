import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markSynced, unsyncedWorkouts } from '../lib/hcSync';
import type { WorkoutSession } from '../types/health';

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const DAY = 86_400_000;
const w = (id: string, rest: Partial<WorkoutSession> = {}): WorkoutSession =>
  ({ id, type: 'Running', timestamp: '', startedAt: NOW - DAY, durationMinutes: 30, avgHeartRate: 0, caloriesBurned: 0, ...rest }) as WorkoutSession;

test('only recent workouts that were never sent are waiting, newest first', () => {
  const list = [
    w('old', { startedAt: NOW - 100 * DAY }),
    w('a', { startedAt: NOW - 3 * DAY }),
    w('b', { startedAt: NOW - 1 * DAY }),
    w('sent', { syncedToHc: true }),
  ];
  assert.deepEqual(unsyncedWorkouts(list, NOW).map((x) => x.id), ['b', 'a']);
});

test('workouts that came from elsewhere or are too short are never sent', () => {
  const list = [
    w('hc-1'),
    w('strava', { importedFrom: 'Strava archive' }),
    w('blip', { durationMinutes: 0, durationSec: 10 }),
    w('nostart', { startedAt: undefined }),
    w('ok'),
  ];
  assert.deepEqual(unsyncedWorkouts(list, NOW).map((x) => x.id), ['ok']);
});

test('marking leaves other workouts alone and returns the same list when nothing changes', () => {
  const list = [w('a'), w('b')];
  const out = markSynced(list, new Set(['a']));
  assert.equal(out[0].syncedToHc, true);
  assert.equal(out[1], list[1]);
  assert.equal(markSynced(out, new Set(['a'])), out);
  assert.equal(markSynced(list, new Set()), list);
});
