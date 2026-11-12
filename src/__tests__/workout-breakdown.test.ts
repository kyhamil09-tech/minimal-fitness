import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackBuilder, TrackPoint, decimate } from '../lib/geo';
import {
  computeSplits,
  downsampleHr,
  edwardsLoad,
  formatDuration,
  formatPaceSec,
  googleMapsRouteUrl,
  summarizeWorkout,
  toGpx,
  zoneSeconds,
} from '../lib/workoutStats';
import { WorkoutSession } from '../types/health';

/** Runs due north at a steady speed: `kmh` for `minutes`, one fix per second. */
const northRun = (kmh: number, minutes: number, startTs = 1_700_000_000_000) => {
  const fixes = [];
  const degPerKm = 1 / 111.195;
  const total = minutes * 60;
  for (let s = 0; s <= total; s++) {
    fixes.push({ ts: startTs + s * 1000, lat: 52 + ((kmh / 3600) * s) * degPerKm, lng: 4, alt: 10, acc: 5 });
  }
  return fixes;
};

test('TrackBuilder measures a straight run and records a timestamped track', () => {
  const b = new TrackBuilder();
  northRun(12, 10).forEach((f) => b.add(f)); // 12 km/h for 10 min = 2 km
  assert.ok(Math.abs(b.distanceKm - 2) < 0.03, `distance ${b.distanceKm}`);
  const snap = b.snapshot(100);
  assert.ok(snap.track.length <= 100);
  assert.equal(snap.track[0].d, 0);
  assert.ok(snap.track[snap.track.length - 1].d > 1.9);
});

test('TrackBuilder drops inaccurate and impossible fixes', () => {
  const b = new TrackBuilder();
  b.add({ ts: 0, lat: 52, lng: 4, acc: 5 });
  assert.equal(b.add({ ts: 1000, lat: 52.0001, lng: 4, acc: 120 }), false); // too inaccurate
  assert.equal(b.add({ ts: 2000, lat: 53, lng: 4, acc: 5 }), false); // 111 km in a second
  assert.equal(b.distanceKm, 0);
});

test('TrackBuilder ignores fixes recorded while paused and does not bridge the gap', () => {
  const b = new TrackBuilder();
  const run = northRun(10, 4);
  run.slice(0, 60).forEach((f) => b.add(f));
  const pausedAt = run[60].ts;
  b.pause(pausedAt);
  // walk 500 m while paused
  run.slice(60, 180).forEach((f) => assert.equal(b.add(f), false));
  b.resume(run[180].ts);
  run.slice(180).forEach((f) => b.add(f));
  // only 180 s of the 240 s were counted: 10 km/h * (240-120)/3600 h = 0.333 km
  assert.ok(Math.abs(b.distanceKm - 0.333) < 0.03, `distance ${b.distanceKm}`);
});

test('TrackBuilder counts climb only past a 3 m threshold', () => {
  const b = new TrackBuilder();
  const alts = [100, 101, 100.5, 102, 104, 108, 103];
  alts.forEach((alt, i) => b.add({ ts: i * 1000, lat: 52 + i * 0.0001, lng: 4, alt, acc: 5 }));
  assert.equal(Math.round(b.elevationGainM), 8); // 100 -> 108
  assert.equal(Math.round(b.elevationLossM), 5); // 108 -> 103
});

test('decimate keeps the first and last items', () => {
  const items = Array.from({ length: 1000 }, (_, i) => i);
  const out = decimate(items, 50);
  assert.equal(out.length, 50);
  assert.equal(out[0], 0);
  assert.equal(out[49], 999);
});

test('computeSplits gives per-km paces and a partial final split', () => {
  const b = new TrackBuilder();
  northRun(12, 15).forEach((f) => b.add(f)); // 3 km at 5:00/km
  const splits = computeSplits(b.snapshot(2000).track, 'metric');
  assert.equal(splits.filter((s) => !s.partial).length, 3);
  for (const s of splits.filter((x) => !x.partial)) assert.ok(Math.abs(s.paceSec - 300) < 8, `pace ${s.paceSec}`);
  assert.ok(Math.abs(splits[0].seconds - 300) < 8);
});

test('computeSplits converts to miles for imperial users', () => {
  const b = new TrackBuilder();
  northRun(12, 15).forEach((f) => b.add(f)); // 3 km = 1.86 mi at 8:03/mi
  const splits = computeSplits(b.snapshot(2000).track, 'imperial');
  assert.equal(splits.filter((s) => !s.partial).length, 1);
  assert.ok(Math.abs(splits[0].paceSec - 482.8) < 10, `pace ${splits[0].paceSec}`);
});

test('computeSplits excludes paused time from the split clock', () => {
  const track: TrackPoint[] = [
    { t: 0, lat: 0, lng: 0, d: 0 },
    { t: 120_000, lat: 0, lng: 0, d: 0.5 }, // 2 minutes for 500 m
    { t: 600_000, lat: 0, lng: 0, d: 0.5 }, // 8 minutes standing still (paused)
    { t: 720_000, lat: 0, lng: 0, d: 1.0 }, // 2 more minutes for the next 500 m
  ];
  const [s] = computeSplits(track, 'metric');
  assert.ok(Math.abs(s.seconds - 240) < 1, `seconds ${s.seconds}`);
});

test('computeSplits reports average heart rate inside each split', () => {
  const b = new TrackBuilder();
  const start = 1_700_000_000_000;
  northRun(12, 10, start).forEach((f) => b.add(f)); // 2 km, 5 min per km
  const hr: [number, number][] = [];
  for (let s = 0; s <= 600; s += 5) hr.push([start + s * 1000, s < 300 ? 140 : 170]);
  const splits = computeSplits(b.snapshot(2000).track, 'metric', hr);
  assert.ok(Math.abs((splits[0].avgHr ?? 0) - 140) <= 2);
  assert.ok(Math.abs((splits[1].avgHr ?? 0) - 170) <= 2);
});

test('zoneSeconds buckets time by percentage of max heart rate', () => {
  const t0 = 0;
  const hr: [number, number][] = [
    [t0, 100], // 50% -> zone 1
    [t0 + 10_000, 130], // 65% -> zone 2
    [t0 + 20_000, 190], // 95% -> zone 5
  ];
  const z = zoneSeconds(hr, 200);
  assert.equal(z[0], 10);
  assert.equal(z[1], 10);
  assert.equal(z[4], 5);
});

test('edwardsLoad weights each minute by its zone and ignores time under half of max', () => {
  // One reading per second for a minute at each level, max heart rate 200.
  const minute = (bpm: number, startMs: number): [number, number][] => Array.from({ length: 60 }, (_, s) => [startMs + s * 1000, bpm]);
  const hr = [
    ...minute(90, 0), // 45% -> counts nothing
    ...minute(110, 60_000), // 55% -> zone 1
    ...minute(130, 120_000), // 65% -> zone 2
    ...minute(150, 180_000), // 75% -> zone 3
    ...minute(170, 240_000), // 85% -> zone 4
    ...minute(190, 300_000), // 95% -> zone 5
  ];
  // The last reading covers 5 s, not a whole second, so the final minute is 59 s + 5 s long.
  const expected = 1 + 2 + 3 + 4 + 5 * (64 / 60);
  assert.equal(edwardsLoad(hr, 200), Math.round(expected));
  assert.equal(edwardsLoad(undefined, 200), 0);
  assert.equal(edwardsLoad(hr, 0), 0);
  // A gap in the data is not counted as exercise: two readings an hour apart add 15 s + 5 s at most.
  assert.ok(edwardsLoad([[0, 190], [3_600_000, 190]], 200) <= 2);
});

test('downsampleHr averages readings into 5 second buckets', () => {
  const series: [number, number][] = [];
  for (let s = 0; s < 30; s++) series.push([s * 1000, 100 + s]);
  const out = downsampleHr(series, 5000);
  assert.equal(out.length, 6);
  assert.equal(out[0][1], 102);
});

test('summarizeWorkout combines pace, heart rate and best split', () => {
  const b = new TrackBuilder();
  const start = 1_700_000_000_000;
  northRun(12, 10, start).forEach((f) => b.add(f));
  const snap = b.snapshot(2000);
  const w: WorkoutSession = {
    id: 'w-test',
    type: 'Running',
    timestamp: '',
    durationMinutes: 10,
    durationSec: 600,
    distanceKm: snap.distanceKm,
    avgHeartRate: 150,
    caloriesBurned: 100,
    track: snap.track,
    hrSeries: [
      [start, 140],
      [start + 5000, 160],
    ],
  };
  const s = summarizeWorkout(w, 'metric');
  assert.ok(Math.abs((s.avgPaceSec ?? 0) - 300) < 10);
  assert.equal(s.avgHr, 150);
  assert.equal(s.maxHr, 160);
  assert.ok(s.avgSpeed && Math.abs(s.avgSpeed - 12) < 0.5);
});

test('formatters', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatPaceSec(299.6), '5:00');
  assert.equal(formatPaceSec(0), '--:--');
});

test('toGpx writes track points with time, elevation and heart rate', () => {
  const w: WorkoutSession = {
    id: 'w-gpx',
    type: 'Running',
    timestamp: '',
    startedAt: 1_700_000_000_000,
    durationMinutes: 1,
    avgHeartRate: 0,
    caloriesBurned: 0,
    track: [
      { t: 1_700_000_000_000, lat: 52.1, lng: 4.2, alt: 3.5, d: 0 },
      { t: 1_700_000_005_000, lat: 52.1001, lng: 4.2, alt: 3.9, d: 0.011 },
    ],
    hrSeries: [[1_700_000_000_000, 120]],
  };
  const gpx = toGpx(w);
  assert.match(gpx, /<trkpt lat="52.1" lon="4.2">/);
  assert.match(gpx, /<ele>3.5<\/ele>/);
  assert.match(gpx, /<gpxtpx:hr>120<\/gpxtpx:hr>/);
  assert.match(gpx, /2023-11-14T22:13:20.000Z/);
});

test('googleMapsRouteUrl samples waypoints and picks the travel mode', () => {
  const track: TrackPoint[] = Array.from({ length: 100 }, (_, i) => ({ t: i, lat: 52 + i * 0.001, lng: 4, d: i }));
  const w = { id: 'a', type: 'Cycling', timestamp: '', durationMinutes: 1, avgHeartRate: 0, caloriesBurned: 0, track } as WorkoutSession;
  const url = googleMapsRouteUrl(w)!;
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(url, /travelmode=bicycling/);
  const params = new URL(url).searchParams;
  assert.equal(params.get('origin'), '52.00000,4.00000');
  assert.equal(params.get('waypoints')!.split('|').length, 8);
  assert.equal(googleMapsRouteUrl({ ...w, track: [], route: [] }), null);
});
