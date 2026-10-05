import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeLegacySeedData } from '../lib/legacy';
import { watchStateLabel } from '../lib/watchLabels';

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

test('removeLegacySeedData strips old demo records but keeps the user\'s own', () => {
  const s = new FakeStorage();
  s.setItem('kyfit_workouts', JSON.stringify([{ id: 'w-1' }, { id: 'w-manual-123' }, { id: 'w-3' }]));
  s.setItem('kyfit_sleep_logs', JSON.stringify([{ id: 'sleep-today' }, { id: 'sleep-manual-9' }]));
  s.setItem('kyfit_fasting_sessions', JSON.stringify([{ id: 'fast-today' }, { id: 'fast-4days' }]));

  assert.equal(removeLegacySeedData(s), 5);
  assert.deepEqual(JSON.parse(s.getItem('kyfit_workouts')!), [{ id: 'w-manual-123' }]);
  assert.deepEqual(JSON.parse(s.getItem('kyfit_sleep_logs')!), [{ id: 'sleep-manual-9' }]);
  assert.deepEqual(JSON.parse(s.getItem('kyfit_fasting_sessions')!), []);
});

test('removeLegacySeedData is a no-op on a fresh install and on bad data', () => {
  const s = new FakeStorage();
  assert.equal(removeLegacySeedData(s), 0);
  s.setItem('kyfit_workouts', 'not json');
  s.setItem('kyfit_sleep_logs', '{"id":"sleep-today"}');
  assert.equal(removeLegacySeedData(s), 0);
  assert.equal(s.getItem('kyfit_workouts'), 'not json');
});

test('watchStateLabel describes each link state', () => {
  assert.match(watchStateLabel({ state: 'live', nodeName: 'Pixel Watch 3', bpm: 72 }), /Pixel Watch 3 · 72 bpm live/);
  assert.match(watchStateLabel({ state: 'no-watch', nodeName: '', bpm: null }), /No watch/);
  assert.match(watchStateLabel({ state: 'no-app', nodeName: 'Pixel Watch', bpm: null }), /install/);
});
