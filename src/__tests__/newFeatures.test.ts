import test from 'node:test';
import assert from 'node:assert/strict';
import { readiness } from '../lib/readiness';
import { monthProgress, monthTotal, sanitizeMonthlyGoal } from '../lib/monthlyGoal';
import { changePct, weeklyRecap } from '../lib/weeklyRecap';
import { addCheckIn, endFast, feelingMap, removeCheckIn, startFast, stageIndexAt } from '../lib/fasting';
import { buildShareData, projectRoute, thin } from '../lib/shareCard';
import { SleepLogEntry, WorkoutSession } from '../types/health';
import { addDays } from '../lib/dates';

const night = (dateIso: string, over: Partial<SleepLogEntry> = {}, hrv?: number): SleepLogEntry => ({
  id: `n-${dateIso}`,
  dateIso,
  displayDate: dateIso,
  bedtime: '23:00',
  wakeTime: '07:00',
  durationMinutes: 450,
  qualityRating: 4,
  isManualEntry: false,
  source: 'health-connect',
  deepSleepMinutes: 80,
  remSleepMinutes: 100,
  lightSleepMinutes: 270,
  awakeMinutes: 30,
  efficiencyScore: 94,
  detail: { startMs: 0, endMs: 1, segments: [], awakenings: 1, inBedMinutes: 480, stagesFrom: 'measured', hrvMs: hrv },
  ...over,
});

const TODAY = '2026-10-04';
const daysBack = (n: number) => addDays(TODAY, -n);
const load = (id: 'productive' | 'high' | 'overreaching' | 'building' | 'detraining' = 'productive') => ({ id, chronicWeekly: 100, daily: [] as { date: string; load: number }[] });

test('readiness is high after a good night, steady heart rate and a normal week', () => {
  const logs = [night(TODAY, {}, 62), ...Array.from({ length: 8 }, (_, i) => night(daysBack(i + 1), {}, 60))];
  const days = Array.from({ length: 10 }, (_, i) => ({ date: daysBack(i), restingHr: 52, hrvMs: 60 }));
  const r = readiness({ sleepLogs: logs, days, load: load('productive'), today: TODAY });
  assert.ok(r);
  assert.ok(r!.score >= 80, `score ${r!.score}`);
  assert.equal(r!.parts.length, 4);
  assert.equal(r!.parts.reduce((s, p) => s + p.weight, 0), 100);
});

test('readiness drops when HRV falls, resting heart rate rises and load jumps', () => {
  const logs = [night(TODAY, { durationMinutes: 300, deepSleepMinutes: 40, remSleepMinutes: 50, lightSleepMinutes: 210, efficiencyScore: 80 }, 38), ...Array.from({ length: 8 }, (_, i) => night(daysBack(i + 1), {}, 60))];
  const days = [{ date: TODAY, restingHr: 64, hrvMs: 38 }, ...Array.from({ length: 9 }, (_, i) => ({ date: daysBack(i + 1), restingHr: 52, hrvMs: 60 }))];
  const r = readiness({ sleepLogs: logs, days, load: load('overreaching'), today: TODAY });
  assert.ok(r);
  assert.ok(r!.score < 40, `score ${r!.score}`);
  assert.ok(['Take it easy', 'Recover'].includes(r!.label));
});

test('readiness leaves out missing parts and shares their weight, and needs two parts', () => {
  const only = readiness({ sleepLogs: [night(TODAY)], days: [], load: load('building'), today: TODAY });
  assert.equal(only, null);
  const two = readiness({ sleepLogs: [night(TODAY)], days: [], load: load('productive'), today: TODAY });
  assert.ok(two);
  assert.equal(two!.parts.length, 2);
  assert.equal(two!.parts.reduce((s, p) => s + p.weight, 0), 100);
  assert.ok(two!.missing.length >= 2);
});

test('readiness ignores nights older than yesterday for the sleep part', () => {
  const r = readiness({ sleepLogs: [night(daysBack(3))], days: [], load: load('productive'), today: TODAY });
  assert.equal(r, null);
});

const run = (iso: string, km: number, min: number, loadPts = 50): WorkoutSession =>
  ({
    id: iso + km,
    type: 'Running',
    timestamp: `${iso}T08:00:00`,
    startedAt: new Date(`${iso}T08:00:00`).getTime(),
    durationMinutes: min,
    distanceKm: km,
    avgHeartRate: 150,
    caloriesBurned: km * 60,
    cardioLoadPoints: loadPts,
  }) as WorkoutSession;

test('monthly goal totals only this month and judges the pace', () => {
  const now = new Date('2026-10-15T12:00:00').getTime();
  const ws = [run('2026-09-30', 10, 60), run('2026-10-02', 10, 60), run('2026-10-10', 15, 90)];
  assert.equal(monthTotal(ws, 'distance', now), 25);
  assert.equal(monthTotal(ws, 'workouts', now), 2);
  assert.equal(monthTotal(ws, 'minutes', now), 150);
  const p = monthProgress(ws, { kind: 'distance', target: 50 }, now);
  assert.equal(p.pct, 50);
  assert.equal(p.daysInMonth, 31);
  assert.equal(p.daysLeft, 16);
  assert.equal(p.state, 'on-track');
  assert.ok(Math.abs(p.projected - 51.67) < 0.1);
  assert.equal(monthProgress(ws, { kind: 'distance', target: 20 }, now).state, 'done');
  assert.equal(monthProgress(ws, { kind: 'distance', target: 120 }, now).state, 'behind');
});

test('monthly goal settings are validated', () => {
  assert.deepEqual(sanitizeMonthlyGoal({ kind: 'distance', target: 80 }), { kind: 'distance', target: 80 });
  assert.equal(sanitizeMonthlyGoal({ kind: 'steps', target: 80 }), null);
  assert.equal(sanitizeMonthlyGoal({ kind: 'workouts', target: -2 }), null);
  assert.equal(sanitizeMonthlyGoal(null), null);
});

test('weekly recap compares the days so far with the same days of the week before', () => {
  // Monday 2026-09-28 .. Sunday 2026-10-04; today Wednesday 09-30 would be 3 days, here today is Sunday
  const ws = [run('2026-09-21', 5, 30), run('2026-09-23', 5, 30), run('2026-09-29', 10, 60), run('2026-10-01', 10, 60)];
  const logs = [night('2026-09-29', { durationMinutes: 420 }), night('2026-09-30', { durationMinutes: 480 }), night('2026-09-22', { durationMinutes: 360 })];
  const r = weeklyRecap(ws, logs, '2026-09-28', '2026-10-04');
  assert.equal(r.days, 7);
  assert.equal(r.current.workouts, 2);
  assert.equal(r.current.distanceKm, 20);
  assert.equal(r.previous.distanceKm, 10);
  assert.equal(r.current.sleepAvgMin, 450);
  assert.equal(r.previous.sleepAvgMin, 360);
  assert.equal(changePct(r.current.distanceKm, r.previous.distanceKm), 100);
  assert.match(r.headline, /up 100%/);
  // mid-week: only the days so far, and last week cut to the same length
  const mid = weeklyRecap(ws, logs, '2026-09-28', '2026-09-29');
  assert.equal(mid.days, 2);
  assert.equal(mid.current.workouts, 1);
  assert.equal(mid.prevTo, '2026-09-22');
});

test('weekly recap handles a week with no workouts', () => {
  const r = weeklyRecap([], [], '2026-09-28', '2026-10-04');
  assert.equal(r.current.workouts, 0);
  assert.match(r.headline, /No workouts/);
  assert.equal(r.longest, undefined);
});

test('fasting check-ins are added to the running fast, cleaned, and mapped to stages', () => {
  const t0 = new Date('2026-10-03T20:00:00').getTime();
  let sessions = startFast([], { targetHours: 16, protocolName: '16:8 Standard', now: t0 });
  assert.equal(sessions.length, 1);
  const h = (n: number) => t0 + n * 3_600_000;
  sessions = addCheckIn(sessions, ['hungry', 'bogus', 'hungry'], h(3));
  sessions = addCheckIn(sessions, ['energetic', 'focused'], h(14));
  sessions = addCheckIn(sessions, ['hungry'], h(13));
  sessions = addCheckIn(sessions, [], h(15));
  assert.equal(sessions[0].checkIns?.length, 3);
  assert.deepEqual(sessions[0].checkIns?.[0].tags, ['hungry']);
  sessions = endFast(sessions, h(17));
  assert.equal(sessions[0].isCompleted, true);
  assert.equal(sessions[0].actualHours, 17);
  const map = feelingMap(sessions);
  assert.equal(stageIndexAt(3), 0);
  assert.equal(stageIndexAt(12), 2);
  assert.equal(stageIndexAt(25), 4);
  assert.equal(map[0].checkIns, 1);
  assert.equal(map[0].tags[0].id, 'hungry');
  const fat = map.find((m) => m.stageId === 'fat')!;
  assert.equal(fat.checkIns, 2);
  assert.equal(fat.tags.find((t) => t.id === 'hungry')?.share, 50);
  const removed = removeCheckIn(sessions, sessions[0].id, h(14));
  assert.equal(removed[0].checkIns?.length, 2);
});

test('share card route is fitted into the box with its shape kept', () => {
  // A route twice as wide as tall (at the equator) in a square box: it fills the width, is centred, and keeps 2:1
  const route: [number, number][] = [[0, 0], [0, 2], [1, 2], [1, 0]];
  const pts = projectRoute(route, 400, 400, 20);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) - 20) < 0.01);
  assert.ok(Math.abs(Math.max(...xs) - 380) < 0.01);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(w / h - 2) < 0.01);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 200) < 0.01);
  assert.deepEqual(projectRoute([], 100, 100), []);
  // north is up: the higher latitude has the smaller y
  const north = projectRoute([[10, 0], [11, 0]], 100, 100);
  assert.ok(north[1][1] < north[0][1]);
  assert.equal(thin([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4).length, 4);
  assert.deepEqual(thin([1, 2, 3], 10), [1, 2, 3]);
});

test('share card data holds the stats worth showing', () => {
  const w = {
    ...run('2026-10-04', 5.2, 28, 60),
    avgHeartRate: 152,
    durationSec: 28 * 60,
    track: [
      { t: 0, lat: 51.5, lng: -0.1, alt: 10, d: 0 },
      { t: 1000, lat: 51.501, lng: -0.1, alt: 14, d: 2.6 },
      { t: 2000, lat: 51.502, lng: -0.1, alt: 18, d: 5.2 },
    ],
  } as WorkoutSession;
  const d = buildShareData(w, 'metric', { accent: '#cbff00', accent2: '#ff5a1f' });
  assert.equal(d.title, 'Running');
  assert.equal(d.route.length, 3);
  assert.equal(d.stats[0].label, 'Distance');
  assert.equal(d.stats[0].value, '5.2');
  assert.ok(d.stats.some((s) => s.label === 'Avg pace'));
  assert.ok(d.stats.some((s) => s.label === 'Avg heart rate' && s.value === '152'));
  assert.ok(d.stats.length <= 6);
  const indoor = buildShareData({ ...run('2026-10-04', 0, 30), type: 'Strength' } as WorkoutSession, 'metric', { accent: '#fff', accent2: '#000' });
  assert.equal(indoor.route.length, 0);
  assert.equal(indoor.stats[0].label, 'Time');
});

test('starting a fast drops an unfinished one but keeps finished ones', () => {
  let s = startFast([], { targetHours: 16, protocolName: 'a', now: 1000 });
  s = endFast(s, 1000 + 3_600_000);
  s = startFast(s, { targetHours: 18, protocolName: 'b', now: 9_000_000 });
  s = startFast(s, { targetHours: 20, protocolName: 'c', now: 10_000_000 });
  assert.equal(s.length, 2);
  assert.equal(s.filter((x) => !x.isCompleted).length, 1);
  assert.equal(s[0].fastProtocolName, 'c');
});
