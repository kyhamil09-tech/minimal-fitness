import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackPoint } from '../lib/geo';
import { mergeTracks } from '../lib/trackMerge';

const T0 = Date.UTC(2026, 9, 5, 7, 0, 0);
// About 11 m per 0.0001 degrees of latitude.
const pt = (sec: number, lat: number, d = 0): TrackPoint => ({ t: T0 + sec * 1000, lat, lng: 10, d });

test('a phone route without gaps is returned unchanged', () => {
  const phone = [pt(0, 50.0), pt(5, 50.0001, 0.011), pt(10, 50.0002, 0.022)];
  const watch = [pt(2, 50.00005), pt(7, 50.00015)];
  const r = mergeTracks(phone, watch);
  assert.equal(r.filled, 0);
  assert.equal(r.track, phone);
});

test('watch points fill a gap in the phone route and the distance grows to match', () => {
  const phone = [pt(0, 50.0), pt(5, 50.0005, 0.055), pt(65, 50.0065, 0.7), pt(70, 50.007, 0.76)];
  const watch = [pt(10, 50.001), pt(20, 50.002), pt(30, 50.003), pt(40, 50.004), pt(50, 50.005), pt(60, 50.006)];
  const r = mergeTracks(phone, watch);
  assert.ok(r.filled > 0);
  assert.equal(r.track.length, phone.length + r.filled);
  // times stay in order and distance never goes backwards
  for (let i = 1; i < r.track.length; i++) {
    assert.ok(r.track[i].t >= r.track[i - 1].t);
    assert.ok(r.track[i].d >= r.track[i - 1].d);
  }
  // 0.007 degrees of latitude is about 778 m, and the old route skipped most of it
  assert.ok(r.distanceKm > 0.75 && r.distanceKm < 0.82, `got ${r.distanceKm}`);
});

test('the phone points inside the route are always kept', () => {
  const phone = [pt(0, 50.0), pt(60, 50.006)];
  const watch = [pt(20, 50.002), pt(40, 50.004)];
  const r = mergeTracks(phone, watch);
  assert.ok(r.track.some((p) => p.t === phone[0].t && p.lat === phone[0].lat));
  assert.ok(r.track.some((p) => p.t === phone[1].t && p.lat === phone[1].lat));
});

test('an empty watch route changes nothing, and an empty phone route uses the watch', () => {
  const phone = [pt(0, 50.0), pt(60, 50.006, 0.67)];
  assert.equal(mergeTracks(phone, []).track, phone);
  const r = mergeTracks([], [pt(0, 50.0), pt(10, 50.001)]);
  assert.equal(r.track.length, 2);
  assert.ok(r.distanceKm > 0.1);
});

test('watch points before the first or after the last phone fix extend the route', () => {
  const phone = [pt(60, 50.006), pt(65, 50.0065, 0.05)];
  const watch = [pt(0, 50.0), pt(10, 50.001), pt(120, 50.012)];
  const r = mergeTracks(phone, watch);
  assert.equal(r.filled, 3);
  assert.equal(r.track[0].t, watch[0].t);
  assert.equal(r.track[r.track.length - 1].t, watch[2].t);
});

test('the watch route is matched to the phone workout by start time and fills its gap', async () => {
  const { fillTrackFromWatch } = await import('../lib/watchImport');
  const phoneTrack = [pt(0, 50.0), pt(5, 50.0005, 0.055), pt(65, 50.0065, 0.7), pt(70, 50.007, 0.76)];
  const workouts = [
    { id: 'w-1', startedAt: T0 + 1000, type: 'Running', track: phoneTrack, route: [], gpsTracked: true, distanceKm: 0.76 } as never,
  ];
  const watchTrack = [10, 20, 30, 40, 50, 60].map((s, i) => [T0 + s * 1000, 50.001 + i * 0.001, 10, null, 0]);
  const payload = { id: '1', type: 'Running', startedAt: T0, durationSec: 70, shared: true, track: watchTrack };
  const r = fillTrackFromWatch(workouts, payload);
  assert.equal(r.matched, true);
  assert.ok(r.filled > 0);
  assert.ok((r.workouts[0] as { distanceKm: number }).distanceKm > 0.75);
});

test('a watch route with no matching phone workout is reported as unmatched', async () => {
  const { fillTrackFromWatch } = await import('../lib/watchImport');
  const workouts = [{ id: 'w-1', startedAt: T0 + 3_600_000, type: 'Running', track: [] } as never];
  const r = fillTrackFromWatch(workouts, { id: '1', type: 'Running', startedAt: T0, durationSec: 70, shared: true, track: [] });
  assert.equal(r.matched, false);
  assert.equal(r.workouts, workouts);
});

test('a workout that came from the watch itself is never matched as the phone copy', async () => {
  const { fillTrackFromWatch } = await import('../lib/watchImport');
  const workouts = [{ id: 'w-watch-1', startedAt: T0, type: 'Running', track: [] } as never];
  assert.equal(fillTrackFromWatch(workouts, { id: '1', type: 'Running', startedAt: T0, durationSec: 70, shared: true, track: [] }).matched, false);
});
