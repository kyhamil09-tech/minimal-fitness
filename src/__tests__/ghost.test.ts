import test from 'node:test';
import assert from 'node:assert/strict';
import { gapSec, gapText, ghostChoices, ghostFromPace, ghostFromTrack, ghostTimeAt } from '../lib/ghost';
import { TrackPoint } from '../lib/geo';
import { WorkoutSession } from '../types/health';

// 5 min/km for 3 km, one point every 30 s
const steady = (secPerKm: number, km = 3, start = 0): TrackPoint[] => {
  const pts: TrackPoint[] = [];
  for (let s = 0; s <= km * secPerKm; s += 30) pts.push({ t: start + s * 1000, lat: 40, lng: -75, d: s / secPerKm });
  return pts;
};

test('a ghost from a track knows when it reached each distance', () => {
  const g = ghostFromTrack('Last run', steady(300))!;
  assert.ok(Math.abs(ghostTimeAt(g, 1) - 300) < 1);
  assert.ok(Math.abs(ghostTimeAt(g, 2.5) - 750) < 1);
  assert.ok(Math.abs(ghostTimeAt(g, 4) - 1200) < 1); // carries on at its average pace
});

test('a pause in the old run does not slow the ghost', () => {
  const t = steady(300);
  const paused = t.map((p, i) => (i > 10 ? { ...p, t: p.t + 600_000, gap: i === 11 ? true : undefined } : p));
  const g = ghostFromTrack('x', paused)!;
  assert.ok(Math.abs(ghostTimeAt(g, 2) - 600) < 31);
});

test('ahead and behind, in seconds', () => {
  const g = ghostFromPace('5:00 pace', 300);
  assert.equal(gapSec(g, 290, 1), 10); // reached 1 km in 4:50: ahead
  assert.equal(gapSec(g, 312, 1), -12); // 5:12: behind
  assert.equal(gapSec(g, 5, 0.01), 0); // too early to say
  assert.deepEqual(gapText(12), { state: 'ahead', text: '0:12' });
  assert.deepEqual(gapText(-75), { state: 'behind', text: '1:15' });
  assert.equal(gapText(0).state, 'level');
});

test('a track too short to race gives no ghost', () => {
  assert.equal(ghostFromTrack('x', undefined), null);
  assert.equal(ghostFromTrack('x', steady(300, 0.1)), null);
});

const wk = (id: string, daysAgo: number, secPerKm: number, type = 'Running'): WorkoutSession =>
  ({ id, type, timestamp: '', startedAt: 1_000_000_000_000 - daysAgo * 86_400_000, durationMinutes: Math.round((secPerKm * 3) / 60), durationSec: secPerKm * 3, distanceKm: 3, caloriesBurned: 200, avgHeartRate: 140, track: steady(secPerKm) }) as unknown as WorkoutSession;

test('choices: the latest run and the quickest one', () => {
  const c = ghostChoices([wk('old-fast', 20, 270), wk('last', 1, 320), wk('walk', 0, 600, 'Walking')], 'Running');
  assert.equal(c.last?.id, 'last');
  assert.equal(c.fastest?.id, 'old-fast');
  assert.equal(ghostChoices([wk('only', 1, 300)], 'Running').fastest, undefined);
  assert.deepEqual(ghostChoices([], 'Running'), {});
});
