import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveTdee } from '../lib/adaptiveTdee';
import { addDays } from '../lib/dates';

const TODAY = '2026-11-30';
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(TODAY, -(n - 1 - i)));

/** A person who eats `eat` a day and burns `burn`: weight moves by the difference, with scale noise on top. */
const person = (n: number, eat: number, burn: number, startKg = 80, noise = 0.4) => {
  const body = days(n).map((date, i) => ({ date, weightKg: startKg + ((eat - burn) * i) / 7700 + (i % 2 ? noise : -noise) }));
  const intake: Record<string, number> = {};
  for (const d of days(n)) intake[d] = eat;
  return { body, intake };
};

test('with too little logged it keeps calibrating and says how far along it is', () => {
  const { body, intake } = person(6, 2300, 2300);
  const r = adaptiveTdee(body, intake, TODAY, 2500);
  assert.equal(r.confidence, 'calibrating');
  assert.equal(r.maintenanceKcal, undefined);
  assert.ok(r.foodDays > 0 && r.weighIns === 6);
  assert.equal(adaptiveTdee([], {}, TODAY, 2500).trend.length, 0);
});

test('the trend is steadier than the scale', () => {
  const { body, intake } = person(30, 2400, 2400, 80, 0.8);
  const r = adaptiveTdee(body, intake, TODAY, 2400);
  const scale = r.trend.map((p) => p.scaleKg as number);
  const swing = (a: number[]) => Math.max(...a.slice(-10)) - Math.min(...a.slice(-10));
  assert.ok(swing(r.trend.map((p) => p.trendKg)) < swing(scale) / 2);
});

test('someone holding steady is measured at what they eat', () => {
  const { body, intake } = person(30, 2400, 2400);
  const r = adaptiveTdee(body, intake, TODAY, 2500);
  assert.equal(r.confidence, 'locked');
  assert.ok(Math.abs((r.maintenanceKcal as number) - 2400) <= 60, String(r.maintenanceKcal));
});

test('losing weight on a given intake means a higher maintenance than the intake', () => {
  const { body, intake } = person(30, 2000, 2500);
  const r = adaptiveTdee(body, intake, TODAY, 2500);
  assert.equal(r.confidence, 'locked');
  assert.ok((r.maintenanceKcal as number) > 2150 && (r.maintenanceKcal as number) < 2650, String(r.maintenanceKcal));
  assert.ok((r.weeklyChangeKg as number) < 0);
});

test('days with only part of a day logged are left out, and an odd result is held near the formula', () => {
  const { body, intake } = person(30, 2400, 2400);
  const partial = { ...intake };
  for (const d of days(14).slice(0, 6)) partial[d] = 300;
  assert.equal(adaptiveTdee(body, partial, TODAY, 2400).foodDays, 8);
  assert.equal(adaptiveTdee(body, partial, TODAY, 2400).confidence, 'calibrating');
  const wild = person(30, 5200, 5200);
  const r = adaptiveTdee(wild.body, wild.intake, TODAY, 2400);
  assert.equal(r.clamped, true);
  assert.ok((r.maintenanceKcal as number) <= 2400 * 1.6 + 5);
});
