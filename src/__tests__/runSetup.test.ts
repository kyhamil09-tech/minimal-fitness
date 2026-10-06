import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_RUN_KEY, clearLiveRun, goalSummary, goalUnitLabel, readLiveRun, readSavedGoal, readSetup, writeLiveRun, type LiveRun } from '../lib/runSetup';

// A tiny stand-in for the browser's storage.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

const now = Date.now();
const run = (over: Partial<LiveRun> = {}): LiveRun => ({
  v: 1,
  sport: 'Running',
  sessionStart: now - 40 * 60_000,
  pausedTotal: 0,
  pausedAt: null,
  laps: [],
  goal: null,
  goalHit: false,
  hr: [],
  geo: { points: [], distanceKm: 4, elevationGainM: 10, elevationLossM: 8, hr: [] },
  savedAt: now - 5_000,
  ...over,
});

test('a run in progress is offered back after a crash', () => {
  store.clear();
  writeLiveRun(run());
  assert.equal(readLiveRun()?.sport, 'Running');
  clearLiveRun();
  assert.equal(readLiveRun(), null);
});

test('only a recent run that really recorded something is offered', () => {
  store.clear();
  writeLiveRun(run({ savedAt: now - 13 * 3600_000, sessionStart: now - 14 * 3600_000 })); // too old
  assert.equal(readLiveRun(), null);
  writeLiveRun(run({ sessionStart: now - 30_000, savedAt: now - 5_000 })); // under a minute
  assert.equal(readLiveRun(), null);
  store.set(LIVE_RUN_KEY, JSON.stringify({ ...run(), v: 2 })); // an unknown format
  assert.equal(readLiveRun(), null);
  store.set(LIVE_RUN_KEY, 'not json');
  assert.equal(readLiveRun(), null);
});

test('setup and goals fall back safely when nothing or garbage is saved', () => {
  store.clear();
  assert.deepEqual(readSetup(), {});
  assert.deepEqual(readSavedGoal('Running'), { type: 'open' });
  store.set('kyfit_run_setup', '{oops');
  assert.deepEqual(readSetup(), {});
  store.set('kyfit_goal_Running', JSON.stringify({ type: 'distance', value: 10 }));
  assert.deepEqual(readSavedGoal('Running'), { type: 'distance', value: 10 });
});

test('goals read out in the person’s units', () => {
  assert.equal(goalUnitLabel('distance', false), 'km');
  assert.equal(goalUnitLabel('distance', true), 'mi');
  assert.equal(goalUnitLabel('open', false), '');
  assert.equal(goalSummary({ type: 'time', value: 30 }, false), '30 min');
  assert.equal(goalSummary({ type: 'calories', value: 300 }, true), '300 kcal');
  assert.equal(goalSummary({ type: 'distance', value: 5 }, false), '5 km');
});
