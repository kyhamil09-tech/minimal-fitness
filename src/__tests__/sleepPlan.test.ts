import test from 'node:test';
import assert from 'node:assert/strict';
import { SleepLogEntry } from '../types/health';
import { DEFAULT_SLEEP_PREFS, normalizeSleepPrefs, repayPerNight, sleepDebt, typicalBedtime, windDownAt } from '../lib/sleepPlan';

const night = (dateIso: string, durationMinutes: number, bedtime = '23:00'): SleepLogEntry => ({
  id: `s-${dateIso}`, dateIso, displayDate: dateIso, bedtime, wakeTime: '07:00', durationMinutes, qualityRating: 4, isManualEntry: true, deepSleepMinutes: 0, remSleepMinutes: 0, lightSleepMinutes: 0, awakeMinutes: 0,
} as SleepLogEntry);

test('sleep debt adds up only the short nights that were logged', () => {
  const logs = [night('2026-10-21', 360), night('2026-10-20', 480), night('2026-10-19', 420), night('2026-10-18', 540), night('2026-10-01', 100)];
  const d = sleepDebt(logs, 480, '2026-10-21', 7);
  assert.equal(d.logged, 4);
  assert.equal(d.debtMin, 120 + 60);
  assert.equal(d.surplusMin, 60);
  assert.equal(d.shortNights, 2);
  assert.equal(d.avgMin, Math.round((360 + 480 + 420 + 540) / 4));
  assert.equal(d.nights.length, 4);
  assert.equal(d.nights[0].date, '2026-10-18');
  assert.equal(sleepDebt([], 480, '2026-10-21').logged, 0);
});

test('a night you did not track is not a debt, and repaying is gentle', () => {
  assert.equal(sleepDebt([night('2026-10-21', 480)], 480, '2026-10-21').debtMin, 0);
  assert.equal(repayPerNight(0), 0);
  assert.equal(repayPerNight(180), 30);
  assert.equal(repayPerNight(2000), 60);
});

test('the typical bedtime averages across midnight and needs three nights', () => {
  assert.equal(typicalBedtime([night('2026-10-21', 480, '23:30'), night('2026-10-20', 480, '00:30'), night('2026-10-19', 480, '23:30')]), '23:50');
  assert.equal(typicalBedtime([night('2026-10-21', 480)]), null);
});

test('the wind-down nudge comes before bed, even across midnight', () => {
  assert.deepEqual(windDownAt('22:30', 30), { hour: 22, minute: 0 });
  assert.deepEqual(windDownAt('00:15', 30), { hour: 23, minute: 45 });
  assert.deepEqual(windDownAt('00:10', 60), { hour: 23, minute: 10 });
});

test('saved sleep settings are made whole', () => {
  assert.deepEqual(normalizeSleepPrefs(undefined), DEFAULT_SLEEP_PREFS);
  assert.equal(normalizeSleepPrefs({ goalMin: 452 }).goalMin, 450);
  assert.equal(normalizeSleepPrefs({ goalMin: 30 }).goalMin, 480);
  const w = normalizeSleepPrefs({ windDown: { on: true, bed: '99:99', lead: 20 } }).windDown;
  assert.deepEqual(w, { on: true, bed: '22:30', lead: 30 });
});
