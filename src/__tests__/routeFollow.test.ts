import test from 'node:test';
import assert from 'node:assert/strict';
import { RouteFollower, bearingDeg, headingFrom, relativeTurn, turnAdvice, turnText } from '../lib/routeFollow';
import { routeFromGpx, routeFromWorkout, sanitizeRoute, upsertRoute } from '../lib/savedRoutes';
import { LatLng } from '../lib/geo';
import { WorkoutSession } from '../types/health';

// 1 m of latitude is about 1 / 111195 degrees
const M = 1 / 111_195;
const north = (lat: number, m: number) => lat + m * M;
const east = (lat: number, lng: number, m: number) => lng + (m * M) / Math.cos((lat * Math.PI) / 180);

/** A route 1 km north then 1 km east, as points every 20 m. */
const lRoute = (): LatLng[] => {
  const out: LatLng[] = [];
  for (let m = 0; m <= 1000; m += 20) out.push([north(51, m), -0.1]);
  const corner = north(51, 1000);
  for (let m = 20; m <= 1000; m += 20) out.push([corner, east(corner, -0.1, m)]);
  return out;
};

test('bearings and turns', () => {
  assert.ok(Math.abs(bearingDeg([51, 0], [52, 0]) - 0) < 0.01);
  assert.ok(Math.abs(bearingDeg([51, 0], [51, 1]) - 90) < 0.5);
  assert.ok(Math.abs(bearingDeg([51, 0], [50, 0]) - 180) < 0.01);
  assert.equal(relativeTurn(350, 10), 20);
  assert.equal(relativeTurn(10, 350), -20);
  assert.equal(relativeTurn(0, 180), 180);
  assert.equal(turnAdvice(5), 'straight');
  assert.equal(turnAdvice(-30), 'slight-left');
  assert.equal(turnAdvice(80), 'right');
  assert.equal(turnAdvice(-100), 'left');
  assert.equal(turnAdvice(170), 'turn-around');
  assert.equal(turnText('turn-around'), 'turn around');
});

test('staying on the route reports progress and no warning', () => {
  const f = new RouteFollower(lRoute());
  assert.ok(Math.abs(f.totalKm - 2) < 0.02);
  const mid = f.update([north(51, 500), -0.1 + 3 * M]); // a few meters off the line
  assert.equal(mid.isOff, false);
  assert.ok(Math.abs(mid.progressKm - 0.5) < 0.03);
  assert.ok(Math.abs(mid.remainingKm - 1.5) < 0.03);
  assert.ok(mid.offRouteM < 8);
  assert.equal(mid.finished, false);
  const later = f.update([north(51, 1000), east(north(51, 1000), -0.1, 400)]);
  assert.ok(Math.abs(later.progressKm - 1.4) < 0.04);
  assert.ok(Math.abs(bearingDeg([north(51, 1000), -0.1], [north(51, 1000), east(north(51, 1000), -0.1, 100)]) - 90) < 1);
});

test('going off the line takes a few readings to flag, and coming back clears it', () => {
  const f = new RouteFollower(lRoute());
  const off: LatLng = [north(51, 300), east(51, -0.1, 70)]; // 70 m east of the northbound leg
  const a = f.update(off);
  const b = f.update(off);
  assert.equal(a.isOff, false);
  assert.equal(b.isOff, false);
  const c = f.update(off);
  assert.equal(c.isOff, true);
  assert.ok(c.offRouteM > 60 && c.offRouteM < 80);
  // the line is to the west of you
  assert.ok(Math.abs(c.bearingToRoute - 270) < 15, String(c.bearingToRoute));
  assert.equal(turnAdvice(relativeTurn(0, c.bearingToRoute)), 'left'); // heading north, the line is on your left
  // a short way back is not enough, being close again is
  assert.equal(f.update([north(51, 310), east(51, -0.1, 30)]).isOff, true);
  assert.equal(f.update([north(51, 320), east(51, -0.1, 8)]).isOff, false);
});

test('an out-and-back does not jump to the wrong half', () => {
  const there: LatLng[] = [];
  for (let m = 0; m <= 1000; m += 20) there.push([north(51, m), -0.1]);
  const back: LatLng[] = [];
  for (let m = 1000; m >= 0; m -= 20) back.push([north(51, m), east(51, -0.1, 6)]);
  const f = new RouteFollower([...there, ...back]);
  let p = f.update(there[10]);
  assert.ok(p.progressKm < 0.3);
  p = f.update(there[40]);
  p = f.update([north(51, 990), east(51, -0.1, 3)]);
  assert.ok(Math.abs(p.progressKm - 1) < 0.1);
  // on the way back the progress is past the halfway mark, even though the nearest point could be on the way out
  p = f.update([north(51, 700), east(51, -0.1, 6)]);
  assert.ok(p.progressKm > 1.2, `progress ${p.progressKm}`);
});

test('the finish and the way back to the start', () => {
  const route = lRoute();
  const f = new RouteFollower(route);
  f.update([north(51, 900), -0.1]);
  const s = f.update(route[route.length - 1]);
  assert.equal(s.finished, true);
  assert.ok(s.toStartKm > 1.3 && s.toStartKm < 1.5);
  // start is south-west of the finish
  assert.ok(s.bearingToStart > 180 && s.bearingToStart < 270, String(s.bearingToStart));
  f.reset();
  assert.equal(f.update(route[0]).progressKm < 0.01, true);
});

test('heading comes from recent movement, and is null when you have barely moved', () => {
  const pts: LatLng[] = [[51, -0.1], [north(51, 10), -0.1], [north(51, 20), -0.1]];
  assert.ok(Math.abs((headingFrom(pts) ?? -1) - 0) < 0.5);
  assert.equal(headingFrom([[51, -0.1], [north(51, 1), -0.1]]), null);
  assert.equal(headingFrom([[51, -0.1]]), null);
});

test('saved routes are cleaned, thinned and built from GPX or a workout', () => {
  assert.equal(sanitizeRoute({ id: 'x', points: [[1, 1]] }), null);
  assert.equal(sanitizeRoute({ id: 'x', points: [[91, 0], [0, 0]] }), null);
  assert.equal(sanitizeRoute(null), null);
  const long = Array.from({ length: 5000 }, (_, i) => [51 + i * 0.00002, -0.1 + 0.0003 * Math.sin(i / 50)]);
  const r = sanitizeRoute({ id: 'long', name: '  My loop  ', points: long, source: 'gpx' })!;
  assert.ok(r.points.length <= 1200);
  assert.equal(r.name, 'My loop');
  assert.ok(r.km > 9 && r.km < 12);

  const gpx = `<gpx><trk><name>Park lap</name><trkseg><trkpt lat="51.5" lon="-0.1"/><trkpt lat="51.51" lon="-0.1"/><trkpt lat="51.51" lon="-0.09"/></trkseg></trk></gpx>`;
  const g = routeFromGpx(gpx, 'park.gpx', 123)!;
  assert.equal(g.name, 'Park lap');
  assert.equal(g.points.length, 3);
  assert.equal(routeFromGpx('<gpx></gpx>', 'empty.gpx'), null);

  const w = { id: 'w1', type: 'Running', timestamp: '', startedAt: Date.UTC(2026, 5, 1), durationMinutes: 20, avgHeartRate: 0, caloriesBurned: 0, route: [[51, -0.1], [51.01, -0.1], [51.01, -0.09]] } as WorkoutSession;
  const fw = routeFromWorkout(w)!;
  assert.equal(fw.source, 'workout');
  assert.match(fw.name, /Running/);
  assert.equal(routeFromWorkout({ ...w, route: undefined }), null);
  assert.deepEqual(upsertRoute([g], { ...g, name: 'renamed' }).map((x) => x.name), ['renamed']);
});
