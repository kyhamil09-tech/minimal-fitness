import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFitnessDays, summarize } from '../lib/fitnessMetrics';

const today = '2026-10-04';
const base = { days: 3, today, steps: {}, hcDaily: {}, hcFitness: {}, own: {}, workouts: [] };

test('sums take the largest source and readings prefer Health Connect', () => {
  const days = buildFitnessDays({
    ...base,
    steps: { '2026-10-04': 8000, '2026-10-03': 5000 },
    hcDaily: { '2026-10-04': { totalKcal: 2400.4, activeKcal: 610, distanceKm: 5.123, avgHr: 71 } },
    hcFitness: { '2026-10-04': { date: '2026-10-04', restingHr: 52, hrMin: 46, hrMax: 151, floors: 9, exerciseMin: 38, hrvMs: 48.26 } },
    own: { '2026-10-04': { steps: 8400, distanceKm: 6.2, restingHr: 55, hrAvg: 80, floors: 4 }, '2026-10-02': { steps: 3000 } },
  });
  assert.deepEqual(days.map((d) => d.date), ['2026-10-02', '2026-10-03', '2026-10-04']);
  const d = days[2];
  assert.equal(d.steps, 8400); // own sensors counted more
  assert.equal(d.distanceKm, 6.2);
  assert.equal(d.kcalTotal, 2400);
  assert.equal(d.kcalActive, 610);
  assert.equal(d.restingHr, 52); // Health Connect wins over the app's own estimate
  assert.equal(d.hrAvg, 71);
  assert.equal(d.floors, 9);
  assert.equal(d.hrvMs, 48.3);
  assert.equal(days[0].steps, 3000);
  assert.equal(days[1].restingHr, undefined);
});

test('logged workouts add exercise minutes and distance when no other source has them', () => {
  const at = new Date(2026, 9, 4, 8, 0).getTime();
  const days = buildFitnessDays({
    ...base,
    workouts: [
      { startedAt: at, durationMinutes: 40, distanceKm: 4, caloriesBurned: 300 },
      { startedAt: at + 3600_000, durationMinutes: 20, distanceKm: 0, caloriesBurned: 100 },
    ],
  });
  const d = days[2];
  assert.equal(d.exerciseMin, 60);
  assert.equal(d.distanceKm, 4);
  assert.equal(d.kcalActive, 400);
});

test('summarize reports the newest value, the average and the weekly trend', () => {
  const days = Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(21 + i).padStart(2, '0')}`, steps: i < 7 ? 4000 : 6000 }));
  const s = summarize(days, (d) => d.steps);
  assert.equal(s.latest, 6000);
  assert.equal(s.count, 14);
  assert.equal(s.avg, 5000);
  assert.equal(s.min, 4000);
  assert.equal(s.max, 6000);
  assert.equal(s.trendPct, 50);
  assert.deepEqual(summarize([{ date: today }], (d) => d.steps), { count: 0 });
});
