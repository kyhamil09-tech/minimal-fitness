import test from 'node:test';
import assert from 'node:assert/strict';
import { findRoutes, resample, routeLabel, sameRoute, shapeOf, standingFor } from '../lib/routes';
import { WorkoutSession } from '../types/health';
import { LatLng } from '../lib/geo';

const T0 = Date.UTC(2026, 0, 1, 7, 0, 0);

/** A loop of roughly the given radius (km) round a centre, as a track. */
const loop = (lat0: number, lng0: number, radiusKm: number, jitterM = 0, seed = 1): { lat: number; lng: number; t: number; d: number }[] => {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5) * 2;
  const n = 120;
  const pts: { lat: number; lng: number; t: number; d: number }[] = [];
  let d = 0;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lat = lat0 + (radiusKm / 111.2) * Math.sin(a) + (rnd() * jitterM) / 111_200;
    const lng = lng0 + (radiusKm / (111.2 * Math.cos((lat0 * Math.PI) / 180))) * Math.cos(a) + (rnd() * jitterM) / 111_200;
    pts.push({ lat, lng, t: 0, d });
    d += (2 * Math.PI * radiusKm) / n;
  }
  return pts.map((p, i) => ({ ...p, t: T0 + i * 10_000 }));
};

let id = 0;
const run = (dayOffset: number, track: { lat: number; lng: number; t: number; d: number }[], minutes: number, type: WorkoutSession['type'] = 'Running'): WorkoutSession => {
  const startedAt = T0 + dayOffset * 86_400_000;
  // the track is spread over the workout's own length, so moving time matches the minutes given
  const shifted = track.map((p, i) => ({ ...p, t: startedAt + Math.round((i / (track.length - 1)) * minutes * 60_000) }));
  return { id: 'w' + ++id, type, timestamp: new Date(startedAt).toISOString(), startedAt, durationMinutes: minutes, durationSec: minutes * 60, distanceKm: shifted[shifted.length - 1].d, avgHeartRate: 150, caloriesBurned: 300, track: shifted, gpsTracked: true } as WorkoutSession;
};

test('resampling spreads points evenly along the line', () => {
  const line: LatLng[] = [[51, -0.1], [51.01, -0.1]];
  const r = resample(line, 5);
  assert.equal(r.length, 5);
  assert.ok(Math.abs(r[2][0] - 51.005) < 1e-9);
  assert.deepEqual(r[4], line[1]);
});

test('the same loop run twice (with GPS wobble) is one route; a different one is not', () => {
  const a = shapeOf(run(0, loop(51.5, -0.1, 0.8, 0), 25))!;
  const b = shapeOf(run(1, loop(51.5, -0.1, 0.8, 8, 3), 24))!;
  const elsewhere = shapeOf(run(2, loop(51.52, -0.1, 0.8, 0), 25))!;
  const bigger = shapeOf(run(3, loop(51.5, -0.1, 1.2, 0), 35))!;
  assert.equal(a.loop, true);
  assert.equal(sameRoute(a, b), true);
  assert.equal(sameRoute(a, elsewhere), false);
  assert.equal(sameRoute(a, bigger), false);
  // run the other way round
  const rev = run(4, loop(51.5, -0.1, 0.8, 0).reverse().map((p, i) => ({ ...p, t: T0 + i * 10_000, d: i * 0.0419 })), 25);
  assert.equal(sameRoute(a, shapeOf(rev)!), true);
});

test('findRoutes groups repeats, ranks attempts and finds the best', () => {
  const home = loop(51.5, -0.1, 0.8, 4, 5);
  const other = loop(52.0, 0.5, 1.0, 0, 9);
  const workouts = [
    run(0, home, 27),
    run(3, home, 25),
    run(6, home, 24),
    run(9, home, 26),
    run(12, home, 28),
    run(15, home, 29),
    run(2, other, 31), // only once: not a route
    run(5, home, 30, 'Cycling'), // another sport: not grouped with the runs
  ];
  const routes = findRoutes(workouts);
  assert.equal(routes.length, 1);
  const g = routes[0];
  assert.equal(g.attempts.length, 6);
  assert.equal(g.attempts[0].at > g.attempts[5].at, true);
  assert.equal(g.best.seconds, 24 * 60);
  assert.equal(g.loop, true);
  assert.ok(g.trendPct !== undefined && g.trendPct > 0); // recent three slower than the earlier three
  assert.match(routeLabel(g), /5\.0 km loop|5 km loop/);

  const best = standingFor(routes, workouts[2].id)!;
  assert.equal(best.rank, 1);
  assert.equal(best.isBest, true);
  const slowest = standingFor(routes, workouts[5].id)!;
  assert.equal(slowest.rank, 6);
  assert.equal(slowest.behindBestSec, 5 * 60);
  assert.equal(standingFor(routes, workouts[6].id), null);
});

test('workouts without a usable route are ignored', () => {
  const noTrack = { id: 'x', type: 'Running', timestamp: '', startedAt: T0, durationMinutes: 30, avgHeartRate: 0, caloriesBurned: 0 } as WorkoutSession;
  assert.equal(shapeOf(noTrack), null);
  assert.deepEqual(findRoutes([noTrack, noTrack]), []);
});
