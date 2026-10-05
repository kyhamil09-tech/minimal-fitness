import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, buildRows, fastingInsights, insightReadiness, InsightInput } from '../lib/insights';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { addDays, toDateKey } from '../lib/dates';
import { TrackPoint } from '../lib/geo';

// Deterministic noise so the tests do not flake
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

const TODAY = '2026-10-04';
const DAYS = 120;
const dayKeys = Array.from({ length: DAYS }, (_, i) => addDays(TODAY, -(DAYS - 1 - i)));

const night = (dateIso: string, sleepMin: number, extra: { hrv?: number; deep?: number; eff?: number; bed?: string } = {}): SleepLogEntry => ({
  id: 'n-' + dateIso,
  dateIso,
  displayDate: dateIso,
  bedtime: extra.bed ?? '23:00',
  wakeTime: '07:00',
  durationMinutes: Math.round(sleepMin),
  qualityRating: 4,
  isManualEntry: false,
  source: 'health-connect',
  deepSleepMinutes: extra.deep ?? 70,
  remSleepMinutes: 90,
  lightSleepMinutes: Math.round(sleepMin) - 160,
  awakeMinutes: 20,
  efficiencyScore: extra.eff ?? 92,
  detail: { startMs: 0, endMs: 1, segments: [], awakenings: 1, inBedMinutes: Math.round(sleepMin) + 20, stagesFrom: 'measured', hrvMs: extra.hrv },
});

/** A 30 minute run at a steady pace and heart rate, built to have the given efficiency (m per beat). */
const runWithEf = (dateIso: string, ef: number, hour = 7): WorkoutSession => {
  const hr = 150;
  const speed = (ef * hr) / 60; // m/s
  const t0 = new Date(`${dateIso}T${String(hour).padStart(2, '0')}:00:00`).getTime();
  const track: TrackPoint[] = Array.from({ length: 181 }, (_, i) => ({ t: t0 + i * 10_000, lat: 51, lng: -0.1, d: (i * 10 * speed) / 1000 }));
  const hrSeries: [number, number][] = Array.from({ length: 360 }, (_, i) => [t0 + i * 5000, hr]);
  return { id: 'r-' + dateIso, type: 'Running', timestamp: new Date(t0).toISOString(), startedAt: t0, durationMinutes: 30, distanceKm: track[180].d, avgHeartRate: hr, caloriesBurned: 300, cardioLoadPoints: 50, track, hrSeries } as WorkoutSession;
};

const empty = (): InsightInput => ({ today: TODAY, workouts: [], sleepLogs: [], days: [], fasts: [] });

test('finds that short sleep makes you run slower at the same heart rate', () => {
  const r = rng(7);
  const input = empty();
  for (const d of dayKeys) {
    const sleep = 7.1 * 60 + gauss(r) * 55;
    input.sleepLogs.push(night(d, sleep));
    if (r() < 0.7) {
      const base = 1.35 * (sleep < 6.5 * 60 ? 0.9 : 1) * (1 + gauss(r) * 0.015);
      input.workouts.push(runWithEf(d, base));
    }
  }
  const sleepRun = buildInsights(input).find((i) => i.id === 'sleep-run');
  assert.ok(sleepRun, 'expected the sleep and running pattern');
  assert.match(sleepRun!.title, /slower/);
  const pctText = Number(/(\d+)%/.exec(sleepRun!.title)![1]);
  assert.ok(pctText >= 7 && pctText <= 13, `reported ${pctText}%`);
  assert.ok(['likely', 'strong'].includes(sleepRun!.confidence));
});

test('does not invent a pattern when there is none', () => {
  const r = rng(11);
  const input = empty();
  for (const d of dayKeys) {
    input.sleepLogs.push(night(d, 7.1 * 60 + gauss(r) * 55, { hrv: 60 + gauss(r) * 5 }));
    if (r() < 0.7) input.workouts.push(runWithEf(d, 1.35 * (1 + gauss(r) * 0.02)));
    input.days.push({ date: d, restingHr: Math.round(52 + gauss(r)), hrvMs: 60 + gauss(r) * 5, steps: Math.round(8000 + gauss(r) * 2500) });
  }
  const found = buildInsights(input).filter((i) => i.kind === 'pattern' && i.confidence !== 'early');
  assert.equal(found.length, 0, found.map((f) => f.title).join(' | '));
});

test('finds that fasted runs are less efficient', () => {
  const r = rng(21);
  const input = empty();
  for (const d of dayKeys.slice(-100)) {
    input.sleepLogs.push(night(d, 7 * 60 + gauss(r) * 30));
    if (r() < 0.6) {
      const fasted = r() < 0.4;
      const w = runWithEf(d, 1.4 * (fasted ? 0.93 : 1) * (1 + gauss(r) * 0.012));
      input.workouts.push(w);
      if (fasted) {
        const start = (w.startedAt as number) - 13 * 3_600_000;
        input.fasts.push({ id: 'f-' + d, startTimeIso: new Date(start).toISOString(), startTimestamp: start, endTimestamp: (w.startedAt as number) + 3_600_000, targetDurationHours: 16, isCompleted: true, actualHours: 15, fastProtocolName: '16:8 Standard' });
      }
    }
  }
  const ins = buildInsights(input).find((i) => i.id === 'fasted-run');
  assert.ok(ins, 'expected the fasted-run pattern');
  assert.match(ins!.title, /less efficient/);
});

test('finds the hard-day effect on the next morning resting heart rate', () => {
  const r = rng(33);
  const input = empty();
  const loads = new Map<string, number>();
  for (const d of dayKeys) {
    const hard = r() < 0.33;
    const easy = !hard && r() < 0.5;
    const load = hard ? 90 + gauss(r) * 8 : easy ? 25 + gauss(r) * 5 : 0;
    loads.set(d, load);
    if (load > 0) input.workouts.push({ ...runWithEf(d, 1.3), id: 'w-' + d, cardioLoadPoints: Math.round(load) });
  }
  dayKeys.forEach((d, i) => {
    const prev = loads.get(dayKeys[i - 1] ?? '') ?? 0;
    input.days.push({ date: d, restingHr: Math.round(52 + (prev >= 80 ? 4 : 0) + gauss(r) * 0.8), hrvMs: 60, steps: 8000 });
    input.sleepLogs.push(night(d, 7 * 60));
  });
  const ins = buildInsights(input).find((i) => i.id === 'load-rhr');
  assert.ok(ins, 'expected the hard-day pattern');
  assert.match(ins!.title, /higher/);
});

test('raises an alert when resting heart rate is up and HRV is down, and stays quiet otherwise', () => {
  const r = rng(5);
  const make = (rhrNow: number, hrvNow: number): InsightInput => {
    const input = empty();
    dayKeys.forEach((d, i) => {
      const recent = i >= DAYS - 2;
      input.days.push({ date: d, restingHr: Math.round((recent ? rhrNow : 52) + gauss(r) * 0.8), hrvMs: (recent ? hrvNow : 60) + gauss(r) * 2, steps: 8000 });
      input.sleepLogs.push(night(d, 7 * 60, { hrv: (recent ? hrvNow : 60) + gauss(r) * 2 }));
    });
    return input;
  };
  const strain = buildInsights(make(61, 42)).find((i) => i.kind === 'alert');
  assert.equal(strain?.id, 'strain');
  assert.equal(strain?.tone, 'bad');
  assert.equal(buildInsights(make(61, 60)).find((i) => i.kind === 'alert')?.id, 'rhr-up');
  assert.equal(buildInsights(make(52, 60)).filter((i) => i.kind === 'alert').length, 0);
});

test('fasting check-ins show when you feel best and worst', () => {
  const t0 = new Date('2026-09-01T20:00:00').getTime();
  const h = (n: number) => 3_600_000 * n;
  const fasts: FastingSession[] = Array.from({ length: 5 }, (_, i) => {
    const start = t0 + i * 86_400_000 * 2;
    return {
      id: 'f' + i,
      startTimeIso: new Date(start).toISOString(),
      startTimestamp: start,
      endTimestamp: start + h(17),
      targetDurationHours: 16,
      isCompleted: true,
      actualHours: 17,
      fastProtocolName: '16:8 Standard',
      checkIns: [
        { at: start + h(10.5), tags: ['hungry', 'craving'] },
        { at: start + h(14.5), tags: ['energetic', 'focused'] },
        { at: start + h(15), tags: ['clear'] },
      ],
    };
  });
  const out = fastingInsights(fasts);
  const best = out.find((i) => i.id === 'fast-best');
  const worst = out.find((i) => i.id === 'fast-worst');
  assert.ok(best && /hour 14/.test(best.title), best?.title);
  assert.ok(worst && /hour 10/.test(worst.title), worst?.title);
  assert.equal(fastingInsights(fasts.slice(0, 1)).length, 0);
});

test('rows join sleep, readings and training by day, and readiness of data is reported', () => {
  const input = empty();
  const d = dayKeys[DAYS - 1];
  input.sleepLogs.push(night(d, 420, { hrv: 55, bed: '23:30' }));
  input.days.push({ date: d, restingHr: 51, hrvMs: 50, steps: 9000 });
  input.workouts.push(runWithEf(d, 1.3));
  const row = buildRows(input).find((x) => x.date === d)!;
  assert.equal(row.sleepMin, 420);
  assert.equal(row.hrv, 55);
  assert.equal(row.rhr, 51);
  assert.equal(row.steps, 9000);
  assert.equal(row.load, 50);
  assert.ok(row.ef && Math.abs(row.ef - 1.3) < 0.02);
  assert.equal(row.bedMinAfter18, 330);
  assert.equal(insightReadiness(input).ready, false);
  assert.equal(toDateKey(new Date(`${d}T12:00:00`)), d);
});
