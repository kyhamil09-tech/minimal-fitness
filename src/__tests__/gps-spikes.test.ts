import test from 'node:test';
import assert from 'node:assert/strict';
import { Fix, TrackBuilder, decimateTrack, maxSpeedKmhFor, trackSegments } from '../lib/geo';

const T0 = 1_700_000_000_000;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((51 * Math.PI) / 180);

/** A fix `northM` meters north and `eastM` meters east of a starting point, `sec` seconds into the walk. */
const at = (sec: number, northM: number, eastM = 0, extra: Partial<Fix> = {}): Fix => ({
  ts: T0 + sec * 1000,
  lat: 51 + northM / M_PER_DEG_LAT,
  lng: eastM / M_PER_DEG_LNG,
  acc: 6,
  ...extra,
});

/** A steady walk north at 1.4 m/s, one fix a second. */
const walk = (b: TrackBuilder, from: number, to: number, extra: (sec: number) => Partial<Fix> = () => ({})) => {
  for (let s = from; s < to; s++) b.add(at(s, s * 1.4, 0, extra(s)));
};

const maxEastM = (b: TrackBuilder) => Math.max(...b.points.map((p) => Math.abs(p.lng * M_PER_DEG_LNG)));

test('a glitch that jumps away and straight back is taken out of the route', () => {
  const b = new TrackBuilder({ smooth: true, maxSpeedKmh: maxSpeedKmhFor('Walking') });
  walk(b, 0, 30);
  // one wild fix 30 m to the side, with a poor accuracy, then the walk carries on where it should be
  b.add(at(30, 30 * 1.4, 30, { acc: 18 }));
  walk(b, 31, 60);
  assert.ok(maxEastM(b) < 6, `the route strayed ${maxEastM(b).toFixed(1)} m to the side`);
  // 59 s at 1.4 m/s is about 83 m; a spike would add 60 m or more
  assert.ok(b.distanceKm > 0.07 && b.distanceKm < 0.1, `distance was ${b.distanceKm}`);
});

test('a jump too fast for a walker is turned away before it can pull the line sideways', () => {
  const b = new TrackBuilder({ smooth: true, maxSpeedKmh: maxSpeedKmhFor('Walking') });
  walk(b, 0, 20);
  // 80 m in one second is not a walk
  assert.equal(b.add(at(20, 20 * 1.4, 80)), false);
  walk(b, 21, 40);
  assert.ok(maxEastM(b) < 6, `the route strayed ${maxEastM(b).toFixed(1)} m to the side`);
});

test('a fix that arrives out of order or twice is ignored', () => {
  const b = new TrackBuilder({ smooth: false });
  walk(b, 0, 10);
  const before = b.points.length;
  assert.equal(b.add(at(5, 7)), false, 'an older fix');
  assert.equal(b.add(at(9, 12.6)), false, 'the same moment again');
  assert.equal(b.points.length, before);
});

test('while good fixes keep coming, a poorer one is left out', () => {
  const b = new TrackBuilder({ smooth: false });
  walk(b, 0, 12);
  const n = b.points.length;
  assert.equal(b.add(at(12, 12 * 1.4 + 20, 0, { acc: 35 })), false);
  assert.equal(b.points.length, n);
});

test('after the signal is lost, the first fix back has to be a good one', () => {
  const b = new TrackBuilder({ smooth: false });
  walk(b, 0, 20);
  // 25 seconds of silence, then a fix that claims 30 m accuracy
  assert.equal(b.add(at(45, 45 * 1.4, 0, { acc: 30 })), false);
  // a good one a few seconds later is accepted
  assert.equal(b.add(at(48, 48 * 1.4, 0, { acc: 6 })), true);
});

test('a long silence followed by a far jump starts a new stretch: no line, no distance', () => {
  const b = new TrackBuilder({ smooth: true, maxSpeedKmh: maxSpeedKmhFor('Walking') });
  walk(b, 0, 20);
  const km = b.distanceKm;
  // 60 seconds with nothing, then a good fix 150 m on (9 km/h: possible, but not the stroll it was): believed, but not drawn or counted
  assert.equal(b.add(at(80, 28 + 150, 0, { acc: 5 })), true);
  assert.equal(b.points[b.points.length - 1].gap, true);
  assert.equal(b.distanceKm, km, 'the unseen stretch adds no distance');
  const stretches = trackSegments(b.points);
  assert.equal(stretches.length, 2, 'the map draws two separate lines, not one across the gap');
});

test('several fixes that agree with each other and not with the route start a new stretch', () => {
  const b = new TrackBuilder({ smooth: false, maxSpeedKmh: maxSpeedKmhFor('Walking') });
  walk(b, 0, 20);
  const km = b.distanceKm;
  // five fixes in a row at one place 200 m away, a second apart: the route's last point was the wrong one
  const results = [20, 21, 22, 23, 24, 25].map((s) => b.add(at(s, 200, 150, { acc: 5 })));
  assert.ok(results.some(Boolean), 'the new place is taken up');
  assert.ok(b.points.some((p) => p.gap));
  assert.equal(b.distanceKm, km);
});

test('sports have their own speed limit', () => {
  assert.ok(maxSpeedKmhFor('Walking') < maxSpeedKmhFor('Running'));
  assert.ok(maxSpeedKmhFor('Running') < maxSpeedKmhFor('Cycling'));
  assert.equal(maxSpeedKmhFor(undefined), 45);
});

test('thinning a long track keeps the points around a gap', () => {
  const pts = Array.from({ length: 2000 }, (_, i) => ({ t: i, lat: 51 + i * 1e-5, lng: 0, d: i / 1000, ...(i === 1001 ? { gap: true } : {}) }));
  const out = decimateTrack(pts, 100);
  assert.ok(out.length <= 103);
  assert.ok(out.some((p) => p.gap), 'the gap point survives');
  assert.ok(trackSegments(out).length === 2);
});
