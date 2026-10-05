import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutSession } from '../types/health';
import { TrackPoint } from '../lib/geo';
import { matchSegment, segmentEfforts, segmentFromTrack, standingsFor } from '../lib/segments';
import { parseBackup } from '../lib/backup';
import { allBests } from '../lib/bestRecords';
import { recentReadiness } from '../lib/readiness';
import { adaptWeek } from '../lib/planWeek';
import { EXERCISES, getExercise } from '../data/exercises';
import { MOTIONS } from '../data/motions';
import { poseAt, solve, L } from '../lib/figure';

/** A straight road heading north: a point every ~11 m, `secPerStep` seconds apart. */
const road = (steps: number, secPerStep: number, opts: { lng?: number; reverse?: boolean; t0?: number } = {}): TrackPoint[] => {
  const pts: TrackPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const k = opts.reverse ? steps - 1 - i : i;
    pts.push({ t: (opts.t0 ?? 1_700_000_000_000) + i * secPerStep * 1000, lat: 51 + k * 0.0001, lng: opts.lng ?? 0, d: i * 0.01112 });
  }
  return pts;
};

const run = (id: string, track: TrackPoint[], type: WorkoutSession['type'] = 'Running'): WorkoutSession => ({
  id,
  type,
  timestamp: new Date(track[0].t).toISOString(),
  startedAt: track[0].t,
  durationMinutes: 10,
  avgHeartRate: 140,
  caloriesBurned: 100,
  distanceKm: track[track.length - 1].d,
  gpsTracked: true,
  track,
});

test('a segment is timed on every pass through it, fastest first', () => {
  const base = run('a', road(200, 3));
  const seg = segmentFromTrack(base.track!, 0.5, 1.0, 'Hill', 'Running')!;
  assert.ok(seg.km > 0.45 && seg.km < 0.55);
  const slow = run('b', road(200, 4, { t0: 1_700_100_000_000 }));
  const fast = run('c', road(200, 2.5, { t0: 1_700_200_000_000 }));
  const efforts = segmentEfforts([base, slow, fast], seg);
  assert.deepEqual(efforts.map((e) => e.workoutId), ['c', 'a', 'b']);
  assert.deepEqual(efforts.map((e) => e.rank), [1, 2, 3]);
  assert.ok(efforts[0].seconds < efforts[1].seconds && efforts[1].seconds < efforts[2].seconds);
});

test('a segment ignores the other direction, another road and another sport', () => {
  const base = run('a', road(200, 3));
  const seg = segmentFromTrack(base.track!, 0.5, 1.0, 'Hill', 'Running')!;
  assert.equal(matchSegment(run('rev', road(200, 3, { reverse: true })), seg), null);
  assert.equal(matchSegment(run('far', road(200, 3, { lng: 0.01 })), seg), null);
  assert.equal(matchSegment(run('ride', road(200, 3), 'Cycling'), seg), null);
  assert.equal(matchSegment({ ...base, track: undefined }, seg), null);
});

test('a too-short segment is refused and standings find a workout among the rest', () => {
  const base = run('a', road(200, 3));
  assert.equal(segmentFromTrack(base.track!, 1, 1.05, 'Tiny', 'Running'), null);
  const seg = segmentFromTrack(base.track!, 0.5, 1.0, 'Hill', 'Running')!;
  const other = run('b', road(200, 4, { t0: 1_700_100_000_000 }));
  const s = standingsFor([other], base, [seg]);
  assert.equal(s.length, 1);
  assert.equal(s[0].effort.rank, 1);
  assert.equal(s[0].of, 2);
});

test('a backup carries photos, and bad photo entries are dropped', () => {
  const text = JSON.stringify({
    app: 'ky-fitness',
    version: 1,
    exportedAt: '2026-10-05',
    data: { kyfit_goals: '{}' },
    photos: [
      { id: 'p1', date: '2026-10-01', pose: 'front', data: 'data:image/jpeg;base64,AAAA' },
      { id: 'p2', date: '2026-10-02', pose: 'sideways', data: 'data:image/jpeg;base64,AAAA' },
      { id: 'p3', date: '2026-10-03', pose: 'back', data: 'https://evil.example/x.jpg' },
      { id: 4, date: '2026-10-04', pose: 'back', data: 'data:image/jpeg;base64,AAAA' },
    ],
  });
  const parsed = parseBackup(text);
  assert.deepEqual(parsed.photos?.map((p) => p.id), ['p1']);
  assert.equal(parseBackup(JSON.stringify({ app: 'ky-fitness', version: 1, data: {} })).photos, undefined);
});

test('a ride without a GPS track is marked as logged, a tracked one is not', () => {
  const typed: WorkoutSession = { id: 'r1', type: 'Cycling', timestamp: '2026-10-01T10:00:00Z', startedAt: 1_700_000_000_000, durationMinutes: 60, distanceKm: 12, avgHeartRate: 130, caloriesBurned: 500 };
  const tracked = run('r2', road(1200, 3), 'Cycling');
  const list = allBests([typed, tracked], 'metric');
  assert.equal(list.find((r) => r.id === 'ride-longest')?.workoutId, 'r2');
  assert.equal(allBests([typed], 'metric').find((r) => r.id === 'ride-longest')?.estimated, true);
  assert.equal(allBests([tracked], 'metric').find((r) => r.id === 'ride-longest')?.estimated, undefined);
  assert.ok(allBests([tracked], 'metric').some((r) => r.id === 'ride-best-10'), 'a 10 km stretch is timed from the track');
});

test('recent readiness skips mornings it cannot work out', () => {
  const none = recentReadiness({ sleepLogs: [], days: [], loadFor: () => ({ id: 'none', chronicWeekly: 0, daily: [] }) }, '2026-10-05', 3);
  assert.deepEqual(none, []);
});

test('the week plan looks at a trend: one bad night does not trigger easing, three do', () => {
  const week = [0, 1, 2, 3, 4].map((d) => ({ day: d as 0 | 1 | 2 | 3 | 4, title: `Day ${d}`, kind: 'cardio' as const, targetMinutes: 40 }));
  const base = { days: week, doneDays: [], todayIdx: 0, load: { id: 'productive' as const, ratio: 1 } };
  assert.equal(adaptWeek({ ...base, readiness: [85, 85, 40] })?.tone, 'good');
  assert.equal(adaptWeek({ ...base, readiness: [40, 38, 35] })?.tone, 'warn');
});

test('every exercise with a pattern has a motion, ids are unique, and the library is large', () => {
  assert.ok(EXERCISES.length >= 180);
  assert.equal(new Set(EXERCISES.map((x) => x.id)).size, EXERCISES.length);
  for (const x of EXERCISES) {
    if (x.pattern) assert.ok(MOTIONS[x.pattern], `${x.id} -> ${x.pattern}`);
  }
  for (const id of ['bench-press', 'squat', 'deadlift', 'ohp', 'pull-up', 'plank']) assert.ok(getExercise(id)?.pattern, id);
});

test('the figure keeps its limb lengths and keeps its pinned joint still while it moves', () => {
  for (const [id, m] of Object.entries(MOTIONS)) {
    for (const f of m.frames) {
      const j = solve(f);
      const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      assert.ok(Math.abs(d(j.hip, j.knee) - L.thigh) < 0.01, `${id} thigh`);
      assert.ok(Math.abs(d(j.knee, j.ankle) - L.shin) < 0.01, `${id} shin`);
      assert.ok(Math.abs(d(j.shoulder, j.elbow) - L.ua) < 0.01, `${id} upper arm`);
    }
    if (m.frames.length > 1 && (m.frames[0].root ?? 'ankle') === (m.frames[1].root ?? 'ankle') && !m.oneWay) {
      const root = (m.frames[0].root ?? 'ankle') === 'wrist' ? 'wrist' : (m.frames[0].root ?? 'ankle') === 'hip' ? 'hip' : 'ankle';
      const a = solve(poseAt(m.frames, 1000, 300))[root];
      const b = solve(poseAt(m.frames, 1000, 700))[root];
      if (m.frames[0].at === undefined || JSON.stringify(m.frames[0].at) === JSON.stringify(m.frames[1].at)) {
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01, `${id} pinned joint moved`);
      }
    }
  }
});
