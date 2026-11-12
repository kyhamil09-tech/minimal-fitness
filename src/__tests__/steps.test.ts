import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  StepWindow,
  bucketsToSamples,
  migrateOldSteps,
  removedByDate,
  recordSource,
  resolveDay,
  resolveSteps,
  stepsAt,
  stepsInWindow,
  trimSamples,
  usesHealthConnect,
  usesPhone,
} from '../lib/steps';

const at = (hhmm: string, date = '2026-10-05') => new Date(`${date}T${hhmm}:00`).getTime();

test('a source keeps its highest reading and ignores empty ones', () => {
  let by = recordSource({}, '2026-10-05', 'phone', 4000);
  by = recordSource(by, '2026-10-05', 'phone', 3000);
  by = recordSource(by, '2026-10-05', 'watch', 0);
  by = recordSource(by, '2026-10-05', 'watch', NaN);
  assert.deepEqual(by, { '2026-10-05': { phone: 4000 } });
});

test('each source choice only counts its own steps', () => {
  const day = { phone: 5000, watch: 7000, hc: 6000 };
  assert.equal(resolveDay(day, 'auto'), 7000);
  assert.equal(resolveDay(day, 'phone'), 5000);
  assert.equal(resolveDay(day, 'watch'), 7000);
  assert.equal(resolveDay(day, 'health-connect'), 6000);
  assert.equal(resolveDay(undefined, 'auto'), 0);
});

test('history from before sources were separated counts under every choice', () => {
  const day = { old: 9000, phone: 100 };
  assert.equal(resolveDay(day, 'phone'), 9000);
  assert.equal(resolveDay(day, 'watch'), 9000);
});

test('a day you set beats every source, and zero deletes the day', () => {
  const by = { a: { phone: 5000 }, b: { phone: 6000 } };
  const out = resolveSteps(by, 'auto', { a: 0, c: 1200 });
  assert.equal(out.a, 0);
  assert.equal(out.b, 6000);
  assert.equal(out.c, 1200);
});

test('removing the override returns the automatic count', () => {
  const by = { a: { phone: 5000 } };
  assert.equal(resolveSteps(by, 'auto', {}).a, 5000);
});

test('old totals move across except for today', () => {
  const by = migrateOldSteps({ '2026-10-03': 8000, '2026-10-05': 3000 }, {}, '2026-10-05');
  assert.deepEqual(by, { '2026-10-03': { old: 8000 } });
});

test('only the sources that are chosen are read', () => {
  assert.equal(usesPhone('auto'), true);
  assert.equal(usesPhone('watch'), false);
  assert.equal(usesHealthConnect('phone'), false);
  assert.equal(usesHealthConnect('health-connect'), true);
});

test('steps so far are read between samples, with the day starting at zero', () => {
  const s: [number, number][] = [[at('08:00'), 800], [at('09:00'), 1400]];
  assert.equal(stepsAt(s, '2026-10-05', at('08:00')), 800);
  assert.equal(stepsAt(s, '2026-10-05', at('08:30')), 1100);
  assert.equal(stepsAt(s, '2026-10-05', at('04:00')), 400);
  assert.equal(stepsAt(s, '2026-10-05', at('23:00')), 1400);
  assert.equal(stepsAt([], '2026-10-05', at('08:30')), 0);
});

test('a drive is the difference of the counter across the period, per source', () => {
  const samples = {
    phone: [[at('08:00'), 1000], [at('08:15'), 1010], [at('08:45'), 1900], [at('09:00'), 1950]] as [number, number][],
    watch: [[at('08:00'), 1000], [at('09:00'), 1100]] as [number, number][],
    hc: [] as [number, number][],
  };
  const r = stepsInWindow(samples, '2026-10-05', at('08:15'), at('08:45'));
  assert.equal(r.phone, 890);
  assert.equal(r.watch, 50);
  assert.equal(r.hc, undefined); // no Health Connect samples that day: nothing is removed from it
  // the two ends can be given in either order
  assert.equal(stepsInWindow(samples, '2026-10-05', at('08:45'), at('08:15')).phone, 890);
});

test('removed steps come off each source before the best one is picked', () => {
  const by = { '2026-10-05': { phone: 5000, watch: 4200 } };
  const w: StepWindow = { id: 'w', date: '2026-10-05', fromMs: 0, toMs: 0, removed: { phone: 1200, watch: 100 } };
  assert.equal(resolveSteps(by, 'auto', {}, [w])['2026-10-05'], 4100);
  assert.equal(resolveSteps(by, 'phone', {}, [w])['2026-10-05'], 3800);
  assert.equal(resolveSteps(by, 'watch', {}, [w])['2026-10-05'], 4100);
  assert.equal(resolveSteps(by, 'auto', { '2026-10-05': 9000 }, [w])['2026-10-05'], 9000);
});

test('removal never goes below zero and leaves old history alone', () => {
  assert.equal(resolveDay({ phone: 300 }, 'phone', { phone: 900 }), 0);
  assert.equal(resolveDay({ old: 7000 }, 'auto', { phone: 900 }), 7000);
});

test('hourly Health Connect pieces become running totals per day', () => {
  const s = bucketsToSamples([
    [at('08:00'), at('09:00'), 300],
    [at('09:00'), at('10:00'), 500],
    [at('07:00', '2026-10-06'), at('08:00', '2026-10-06'), 200],
  ]);
  assert.deepEqual(s, [[at('09:00'), 300], [at('10:00'), 800], [at('08:00', '2026-10-06'), 200]]);
});

test('old samples are dropped', () => {
  const now = at('12:00');
  const out = trimSamples({ phone: [[now - 20 * 86_400_000, 1], [now - 1000, 2]], watch: [], hc: [] }, now);
  assert.deepEqual(out.phone, [[now - 1000, 2]]);
});

test('best of all ignores a source that could not be corrected for a removed period', () => {
  // Health Connect has the highest count, but it had no timed data for the drive, so it must not win with the drive still in it.
  const by = { '2026-10-04': { phone: 8800, watch: 7900, hc: 9100 } };
  const w: StepWindow = { id: 'w', date: '2026-10-04', fromMs: 0, toMs: 0, removed: { phone: 890, watch: 50 } };
  assert.equal(resolveSteps(by, 'auto', {}, [w])['2026-10-04'], 7910);
  // a day with no removed period is unchanged
  assert.equal(resolveSteps(by, 'auto', {}, [])['2026-10-04'], 9100);
});

test('a source counts for a day only if every removed period that day could be corrected for it', () => {
  const a: StepWindow = { id: 'a', date: 'd', fromMs: 0, toMs: 0, removed: { phone: 100, hc: 90 } };
  const b: StepWindow = { id: 'b', date: 'd', fromMs: 0, toMs: 0, removed: { phone: 50 } };
  assert.deepEqual(removedByDate([a, b]).d, { phone: 150 });
});
