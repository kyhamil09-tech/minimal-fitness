import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeriesInput, buildSeries, seriesStats } from '../lib/metricSeries';
import type { DayFitness } from '../lib/fitnessMetrics';

const TODAY = '2026-10-05';
const day = (date: string, rest: Partial<DayFitness>): DayFitness => ({ date, ...rest });

const input: SeriesInput = {
  days: [
    day('2026-10-03', { steps: 6000, restingHr: 58 }),
    day('2026-10-04', { steps: 9000, restingHr: 56, kcalActive: 400 }),
    day('2026-10-05', { steps: 3000, kcalTotal: 2100, kcalActive: 250 }),
  ],
  body: [
    { date: '2026-10-04', weightKg: 80.4 },
    { date: '2026-10-04', weightKg: 80.1 },
  ],
  food: [
    { date: '2026-10-05', calories: 500 },
    { date: '2026-10-05', calories: 700 },
  ],
  water: [
    { date: '2026-10-05', ml: 250 },
    { date: '2026-10-05', ml: 500 },
    { date: '2026-10-03', ml: 1000 },
  ],
};

test('a series has one point per day, oldest first, with gaps left empty', () => {
  const s = buildSeries('steps', input, 4, TODAY);
  assert.deepEqual(s.map((p) => p.date), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
  assert.deepEqual(s.map((p) => p.value), [undefined, 6000, 9000, 3000]);
});

test('calories burned fall back to active calories', () => {
  assert.deepEqual(buildSeries('kcal', input, 2, TODAY).map((p) => p.value), [400, 2100]);
});

test('weight uses the last weigh-in of the day, and food and water add up per day', () => {
  assert.equal(buildSeries('weight', input, 2, TODAY)[0].value, 80.1);
  assert.equal(buildSeries('eaten', input, 1, TODAY)[0].value, 1200);
  assert.deepEqual(buildSeries('water', input, 3, TODAY).map((p) => p.value), [1000, undefined, 750]);
});

test('stats skip empty days and find the best one', () => {
  const st = seriesStats(buildSeries('steps', input, 4, TODAY));
  assert.equal(st.count, 3);
  assert.equal(st.latest, 3000);
  assert.equal(st.latestDate, TODAY);
  assert.equal(st.avg, 6000);
  assert.equal(st.min, 3000);
  assert.equal(st.max, 9000);
  assert.equal(st.maxDate, '2026-10-04');
  assert.equal(st.total, 18000);
});

test('nothing recorded gives empty stats', () => {
  assert.deepEqual(seriesStats(buildSeries('hrv', input, 7, TODAY)), { total: 0, count: 0 });
});

test('the trend compares the newest week with the days before it', () => {
  const series = Array.from({ length: 14 }, (_, i) => ({ date: `d${i}`, value: i < 7 ? 100 : 150 }));
  assert.equal(seriesStats(series).trendPct, 50);
  // too little earlier data for a trend
  assert.equal(seriesStats(series.slice(-9)).trendPct, undefined);
});

test('macros add up per day, readings average per day and fasting hours add up', () => {
  const more: SeriesInput = {
    ...input,
    food: [
      { date: '2026-10-05', calories: 500, proteinG: 30, carbsG: 50, fatG: 10 },
      { date: '2026-10-05', calories: 700, proteinG: 20, carbsG: 40, fatG: 25 },
    ],
    log: [
      { date: '2026-10-05', systolic: 120, diastolic: 80 },
      { date: '2026-10-05', systolic: 130, diastolic: 84 },
      { date: '2026-10-04', mgdl: 95 },
    ],
    fasting: [{ date: '2026-10-04', hours: 16 }],
  };
  const last = (id: Parameters<typeof buildSeries>[0]) => buildSeries(id, more, 3, TODAY);
  assert.equal(last('protein')[2].value, 50);
  assert.equal(last('carbs')[2].value, 90);
  assert.equal(last('fat')[2].value, 35);
  assert.equal(last('systolic')[2].value, 125);
  assert.equal(last('glucose')[1].value, 95);
  assert.equal(last('fasting')[1].value, 16);
  assert.equal(buildSeries('systolic', input, 3, TODAY)[2].value, undefined);
});
