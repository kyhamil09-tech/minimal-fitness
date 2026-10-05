import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackBuilder, TrackPoint } from '../lib/geo';
import { bestEffortSeconds, bestEfforts, climbFromTrack, computeSplits, personalBests, summarizeWorkout, trimWorkout } from '../lib/workoutStats';
import { WorkoutSession } from '../types/health';

const START = 1_700_000_000_000;
const degPerKm = 1 / 111.195;

/** North-bound track made of (km/h, minutes) legs, one fix per second. */
const legs = (parts: [number, number][]) => {
  const fixes = [];
  let lat = 52;
  let ts = START;
  fixes.push({ ts, lat, lng: 4, alt: 5, acc: 5 });
  for (const [kmh, minutes] of parts) {
    for (let s = 0; s < minutes * 60; s++) {
      lat += (kmh / 3600) * degPerKm;
      ts += 1000;
      fixes.push({ ts, lat, lng: 4, alt: 5, acc: 5 });
    }
  }
  return fixes;
};

const buildTrack = (parts: [number, number][]): TrackPoint[] => {
  const b = new TrackBuilder();
  legs(parts).forEach((f) => b.add(f));
  return b.snapshot(3000).track;
};

const workout = (track: TrackPoint[], extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 'w-1',
  type: 'Running',
  timestamp: '',
  startedAt: track[0]?.t,
  durationMinutes: Math.round(((track[track.length - 1]?.t ?? 0) - (track[0]?.t ?? 0)) / 60000),
  durationSec: Math.round(((track[track.length - 1]?.t ?? 0) - (track[0]?.t ?? 0)) / 1000),
  distanceKm: track[track.length - 1]?.d,
  avgHeartRate: 150,
  caloriesBurned: 600,
  track,
  ...extra,
});

test('recentSpeedMs tells moving from standing still', () => {
  const b = new TrackBuilder();
  legs([[10, 1]]).forEach((f) => b.add(f)); // 10 km/h = 2.78 m/s
  assert.ok(Math.abs((b.recentSpeedMs() ?? 0) - 2.78) < 0.2);
  // now stand still for 12 s at the same place (tiny GPS jitter)
  const last = legs([[10, 1]]).pop()!;
  for (let s = 1; s <= 12; s++) b.add({ ...last, ts: last.ts + s * 1000, lat: last.lat + (s % 2) * 0.000002 });
  assert.ok((b.recentSpeedMs() ?? 9) < 0.5);
});

test('time spent standing still is not counted as moving time', () => {
  // 5 min at 12 km/h, then stand still 3 min, then 5 min more. Standing still adds no points (jitter < 4 m).
  const fixes = legs([[12, 5]]);
  const last = fixes[fixes.length - 1];
  const b = new TrackBuilder();
  fixes.forEach((f) => b.add(f));
  for (let s = 1; s <= 180; s++) b.add({ ...last, ts: last.ts + s * 1000, lat: last.lat + (s % 2) * 0.000001 });
  let lat = last.lat;
  for (let s = 181; s <= 180 + 300; s++) {
    lat += (12 / 3600) * degPerKm;
    b.add({ ts: last.ts + s * 1000, lat, lng: 4, alt: 5, acc: 5 });
  }
  const track = b.snapshot(3000).track;
  const w = workout(track);
  const s = summarizeWorkout(w, 'metric');
  assert.ok(Math.abs(s.totalSeconds - 780) < 2);
  assert.ok(Math.abs(s.movingSeconds - 600) < 5, `moving ${s.movingSeconds}`);
  // pace uses moving time: 12 km/h = 5:00 per km
  assert.ok(Math.abs((s.avgPaceSec ?? 0) - 300) < 8);
  const splits = computeSplits(track, 'metric');
  assert.ok(splits.filter((x) => !x.partial).every((x) => Math.abs(x.paceSec - 300) < 10));
});

test('bestEffortSeconds finds the fastest stretch, not the average', () => {
  // 1 km at 10 km/h (6:00), 1 km at 15 km/h (4:00), 1 km at 10 km/h (6:00)
  const track = buildTrack([[10, 6], [15, 4], [10, 6]]);
  assert.ok(Math.abs((bestEffortSeconds(track, 1) ?? 0) - 240) < 6);
  assert.ok(Math.abs((bestEffortSeconds(track, 2) ?? 0) - 600) < 10); // 4:00 + 6:00
  assert.equal(bestEffortSeconds(track, 5), null); // only ~3 km
});

test('bestEfforts lists only distances the run covered', () => {
  const track = buildTrack([[12, 26]]); // 5.2 km
  const ids = bestEfforts(workout(track)).map((e) => e.target.id);
  assert.deepEqual(ids, ['1k', '1mi', '5k']);
});

test('personalBests picks the fastest run per distance and ignores non-runs', () => {
  const slow = workout(buildTrack([[10, 31]]), { id: 'slow' }); // 5.2 km at 6:00/km
  const fast = workout(buildTrack([[12, 26]]), { id: 'fast' });
  const ride = workout(buildTrack([[30, 12]]), { id: 'ride', type: 'Cycling' });
  const pbs = personalBests([slow, fast, ride]);
  const fiveK = pbs.find((p) => p.target.id === '5k')!;
  assert.equal(fiveK.workoutId, 'fast');
  assert.ok(Math.abs(fiveK.seconds - 1500) < 15); // 25:00
  assert.ok(pbs.every((p) => p.workoutId !== 'ride'));
});

test('climbFromTrack uses a 3 m threshold', () => {
  const pts = [100, 101, 100.5, 104, 108, 103].map((alt, i): TrackPoint => ({ t: i, lat: 0, lng: 0, alt, d: i }));
  assert.deepEqual(climbFromTrack(pts), { gain: 8, loss: 5 });
});

test('trimWorkout drops a forgotten stop at the end and recomputes everything', () => {
  // 20 min run at 12 km/h (4 km) then 10 min standing at 0.5 km/h
  const b = new TrackBuilder();
  const fixes = legs([[12, 20]]);
  fixes.forEach((f) => b.add(f));
  let lat = fixes[fixes.length - 1].lat;
  let ts = fixes[fixes.length - 1].ts;
  for (let s = 0; s < 600; s++) {
    lat += (0.5 / 3600) * degPerKm * 4;
    ts += 1000;
    b.add({ ts, lat, lng: 4, alt: 5, acc: 5 });
  }
  const track = b.snapshot(3000).track;
  const hr: [number, number][] = [];
  for (let s = 0; s <= 1800; s += 5) hr.push([START + s * 1000, s <= 1200 ? 160 : 90]);
  const full = workout(track, { hrSeries: hr, avgHeartRate: 140, maxHeartRate: 160, caloriesBurned: 900 });

  const cutAt = START + 1200 * 1000;
  const trimmed = trimWorkout(full, track[0].t, cutAt);
  assert.ok(Math.abs((trimmed.distanceKm ?? 0) - 4) < 0.1, `distance ${trimmed.distanceKm}`);
  assert.ok(Math.abs((trimmed.durationSec ?? 0) - 1200) < 30, `duration ${trimmed.durationSec}`);
  assert.equal(trimmed.avgHeartRate, 160);
  assert.equal(trimmed.hrSeries!.every(([t]) => t <= cutAt), true);
  assert.ok(Math.abs(trimmed.caloriesBurned - 600) < 40);
  assert.ok(trimmed.track!.length < full.track!.length);
  assert.equal(trimmed.track![0].d, 0);
});

test('trimWorkout trims the start and rebases distance', () => {
  const track = buildTrack([[12, 20]]);
  const full = workout(track);
  const cutFrom = START + 600 * 1000; // drop the first 10 min (2 km)
  const t = trimWorkout(full, cutFrom, track[track.length - 1].t);
  assert.ok(Math.abs((t.distanceKm ?? 0) - 2) < 0.1);
  assert.ok(Math.abs(t.startedAt! - cutFrom) < 1500);
});

test('trimWorkout leaves a workout alone when there is nothing to cut or nothing would remain', () => {
  const noTrack: WorkoutSession = { id: 'm', type: 'Strength', timestamp: '', durationMinutes: 40, avgHeartRate: 100, caloriesBurned: 200 };
  assert.equal(trimWorkout(noTrack, 0, 1), noTrack);
  const track = buildTrack([[12, 5]]);
  const w = workout(track);
  assert.equal(trimWorkout(w, START - 5000, START - 1000), w);
});