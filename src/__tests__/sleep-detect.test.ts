import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissSleepId, mergeDetectedSleep, segmentsToLogs } from '../lib/sleepDetect';
import { mergeImportedSleep } from '../lib/healthConnect';
import { SleepLogEntry } from '../types/health';

const at = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m).getTime();

test('a night becomes a log dated the day you woke up', () => {
  const [log] = segmentsToLogs([{ start: at(1, 23, 10), end: at(2, 6, 40), status: 0 }]);
  assert.equal(log.dateIso, '2026-06-02');
  assert.equal(log.bedtime, '23:10');
  assert.equal(log.wakeTime, '06:40');
  assert.equal(log.durationMinutes, 450);
  assert.equal(log.source, 'sleep-api');
  assert.equal(log.deepSleepMinutes + log.remSleepMinutes + log.lightSleepMinutes, 450);
});

test('naps, very long spans and periods with missing data are skipped', () => {
  assert.equal(segmentsToLogs([{ start: at(2, 13), end: at(2, 14), status: 0 }]).length, 0);
  assert.equal(segmentsToLogs([{ start: at(1, 1), end: at(2, 12), status: 0 }]).length, 0);
  assert.equal(segmentsToLogs([{ start: at(1, 23), end: at(2, 7), status: 1 }]).length, 0);
});

test('the longest period wins when two end on the same day', () => {
  const logs = segmentsToLogs([
    { start: at(1, 23), end: at(2, 3), status: 0 },
    { start: at(2, 3, 30), end: at(2, 7), status: 0 },
  ]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].durationMinutes, 240);
});

const entry = (over: Partial<SleepLogEntry>): SleepLogEntry => ({
  id: 'x',
  dateIso: '2026-06-02',
  displayDate: '',
  bedtime: '23:00',
  wakeTime: '07:00',
  durationMinutes: 480,
  qualityRating: 4,
  isManualEntry: true,
  deepSleepMinutes: 0,
  remSleepMinutes: 0,
  lightSleepMinutes: 480,
  awakeMinutes: 0,
  efficiencyScore: 90,
  ...over,
});

test('hand-logged and watch nights are never replaced by detected ones', () => {
  const detected = segmentsToLogs([{ start: at(1, 23), end: at(2, 7), status: 0 }]);
  const hand = entry({ id: 'hand', source: 'manual' });
  assert.deepEqual(mergeDetectedSleep([hand], detected).map((l) => l.id), ['hand']);
  const watch = entry({ id: 'hc-1', source: 'health-connect' });
  assert.deepEqual(mergeDetectedSleep([watch], detected).map((l) => l.id), ['hc-1']);
  assert.equal(mergeDetectedSleep([], detected).length, 1);
});

test('a watch night replaces a detected one for the same date', () => {
  const detected = entry({ id: 'sleepapi-1', source: 'sleep-api' });
  const watch = entry({ id: 'hc-1', source: 'health-connect', isManualEntry: false });
  const merged = mergeImportedSleep([detected], [watch]);
  assert.deepEqual(merged.map((l) => l.id), ['hc-1']);
});

test('a deleted detected night stays gone', () => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) };
  const detected = segmentsToLogs([{ start: at(1, 23), end: at(2, 7), status: 0 }]);
  dismissSleepId(detected[0].id);
  assert.equal(mergeDetectedSleep([], detected).length, 0);
  delete (globalThis as any).localStorage;
});
