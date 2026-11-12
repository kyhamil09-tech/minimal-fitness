import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERVAL_WORKOUTS, buildCustomIntervals, describeStep, plannedSeconds, repeatSets, stepProgress } from '../data/intervals';
import { formatPaceSec, paceVerdict, zoneFor, zoneVerdict } from '../lib/targets';

test('repeatSets drops the final recovery', () => {
  const steps = repeatSets(3, { durationSec: 60 }, { durationSec: 30 });
  assert.equal(steps.length, 5);
  assert.equal(steps[steps.length - 1].kind, 'work');
});

test('every preset starts with a warm-up and ends with a cool-down', () => {
  for (const w of INTERVAL_WORKOUTS) {
    assert.ok(w.steps.length >= 3, w.id);
    assert.ok(w.steps[0].kind === 'warmup', w.id);
    assert.equal(w.steps[w.steps.length - 1].kind, 'cooldown', w.id);
    for (const s of w.steps) assert.ok(s.durationSec !== undefined || s.distanceKm !== undefined, `${w.id}: ${s.label}`);
  }
});

test('custom workout builds from reps and lengths', () => {
  const steps = buildCustomIntervals({ reps: 4, work: 2, workByDistance: false, recoverMin: 1, warmupMin: 5, cooldownMin: 5 });
  assert.equal(steps.length, 1 + 4 + 3 + 1);
  assert.equal(plannedSeconds(steps), 5 * 60 + 4 * 120 + 3 * 60 + 5 * 60);
  const byDistance = buildCustomIntervals({ reps: 3, work: 0.4, workByDistance: true, recoverMin: 0, warmupMin: 0, cooldownMin: 0 });
  assert.deepEqual(byDistance.map((s) => s.kind), ['work', 'work', 'work']);
});

test('step progress counts time and distance', () => {
  const timed = stepProgress({ kind: 'work', label: 'x', durationSec: 60 }, 45, 0);
  assert.equal(timed.done, false);
  assert.equal(timed.remainingSec, 15);
  assert.equal(stepProgress({ kind: 'work', label: 'x', durationSec: 60 }, 60, 0).done, true);
  const dist = stepProgress({ kind: 'work', label: 'x', distanceKm: 0.4 }, 0, 0.1);
  assert.equal(dist.done, false);
  assert.ok(Math.abs((dist.remainingKm ?? 0) - 0.3) < 1e-9);
  assert.equal(stepProgress({ kind: 'work', label: 'x', distanceKm: 0.4 }, 0, 0.41).done, true);
});

test('describeStep speaks time and distance', () => {
  assert.equal(describeStep({ kind: 'work', label: 'Run', durationSec: 90 }, false), 'Run. 1 minute 30 seconds.');
  assert.equal(describeStep({ kind: 'work', label: 'Rep', distanceKm: 0.4 }, false), 'Rep. 400 meters.');
});

test('pace verdict compares with the target', () => {
  // 5:00/km is 3.33 m/s
  assert.equal(paceVerdict(3.33, 300), 'ok');
  assert.equal(paceVerdict(2.8, 300), 'slow');
  assert.equal(paceVerdict(4.0, 300), 'fast');
  assert.equal(paceVerdict(0.2, 300), null);
  assert.equal(paceVerdict(null, 300), null);
});

test('zone verdict compares with the target zone', () => {
  assert.equal(zoneFor(150, 190), 3);
  assert.equal(zoneVerdict(150, 190, 3), 'ok');
  assert.equal(zoneVerdict(170, 190, 3), 'high');
  assert.equal(zoneVerdict(110, 190, 3), 'low');
  assert.equal(zoneVerdict(0, 190, 3), null);
});

test('formats pace', () => {
  assert.equal(formatPaceSec(305), '5:05');
});
