import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caloriesFromHeartRate, estimateCalories, estimateWorkoutCalories, heartRateZone, pickRestingHr, setZoneConfig, zoneStarts } from '../lib/calc';
import { zoneSeconds } from '../lib/workoutStats';
import { trainingLoadStatus } from '../lib/trainingLoad';
import { estimateVo2Max, vo2FromRun } from '../lib/vo2Estimate';
import { principalAxis, strokeRate, summarizeStrokes } from '../lib/strokeRate';

test('zones can follow your heart-rate reserve instead of a share of max', () => {
  // max 190, resting 60: reserve is 130. 140 bpm is 61% of max but 62% of reserve -> zone 2 only in reserve terms.
  assert.equal(heartRateZone(140, 190, 60, 'max'), 3); // 74% of max
  assert.equal(heartRateZone(140, 190, 60, 'reserve'), 2); // 62% of reserve
  assert.deepEqual(zoneStarts(190, 60, 'reserve'), [138, 151, 164, 177]);
  assert.deepEqual(zoneStarts(190, 60, 'max'), [114, 133, 152, 171]);
  // the app-wide setting is what the default arguments use
  setZoneConfig('reserve', 60);
  assert.equal(heartRateZone(140, 190), 2);
  assert.equal(zoneSeconds([[0, 140], [10_000, 140]], 190)[1] > 0, true);
  setZoneConfig('max', 60);
  assert.equal(heartRateZone(140, 190), 3);
});

test('the resting heart rate comes from a measurement when there is one', () => {
  assert.equal(pickRestingHr(60, undefined, 52), 52);
  assert.equal(pickRestingHr(60, 12, undefined), 60); // not a believable reading
  assert.equal(pickRestingHr(60), 60);
});

test('calories use the measured heart rate when it is in the exercise range, and the MET figure otherwise', () => {
  const man = { weightKg: 80, age: 30, sex: 'male' as const };
  const woman = { weightKg: 60, age: 30, sex: 'female' as const };
  // Keytel: 150 bpm for 30 minutes, 80 kg man, age 30
  assert.equal(caloriesFromHeartRate(150, 30, man), Math.round(((-55.0969 + 0.6309 * 150 + 0.1988 * 80 + 0.2017 * 30) / 4.184) * 30));
  assert.ok(caloriesFromHeartRate(150, 30, woman) < caloriesFromHeartRate(150, 30, { ...woman, weightKg: 60, sex: 'male' }));
  const met = estimateCalories('Running', 30, 80);
  assert.equal(estimateWorkoutCalories('Running', 30, man, 160, false), met, 'estimated heart rate is not used');
  assert.equal(estimateWorkoutCalories('Running', 30, man, 70, true), met, 'resting-range heart rate is not used');
  const hr = estimateWorkoutCalories('Running', 30, man, 160, true);
  assert.ok(hr >= met * 0.5 && hr <= met * 2);
  assert.equal(estimateWorkoutCalories('Running', 30, man, 400, true), Math.round(met * 2), 'one absurd reading is limited');
});

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
const wk = (daysAgo: number, load: number) => ({ startedAt: new Date(2026, 9, 31 - daysAgo, 8).getTime(), cardioLoadPoints: load });

test('training load flags a big jump, a steady week and a light week', () => {
  const today = day(31);
  const usual = [27, 24, 21, 18, 15, 12, 9, 6, 3].map((d) => wk(d, 100)); // about 300 a week for a month
  const steady = trainingLoadStatus([...usual, wk(0, 100)], today); // one more session on the usual every-third-day rhythm
  assert.equal(steady.id, 'productive');
  const spike = trainingLoadStatus([...[27, 20, 13].map((d) => wk(d, 100)), ...[6, 5, 4, 3, 2, 1, 0].map((d) => wk(d, 150))], today);
  assert.equal(spike.id, 'overreaching');
  assert.ok((spike.ratio ?? 0) > 1.5);
  const light = trainingLoadStatus([...[27, 24, 21, 18, 15, 12, 9].map((d) => wk(d, 120)), wk(1, 40)], today);
  assert.equal(light.id, 'detraining');
  assert.equal(steady.daily.length, 28);
});

test('training load needs a baseline first and handles no data', () => {
  assert.equal(trainingLoadStatus([], day(31)).id, 'none');
  const fresh = trainingLoadStatus([wk(3, 80), wk(1, 90)], day(31));
  assert.equal(fresh.id, 'building');
  assert.equal(fresh.acute, 170);
  const quiet = trainingLoadStatus([wk(60, 100), wk(59, 100)], day(31));
  assert.equal(quiet.id, 'rest');
});

const run = (over: Record<string, unknown> = {}) => ({
  type: 'Running' as const,
  startedAt: Date.UTC(2026, 9, 25),
  durationSec: 30 * 60,
  durationMinutes: 30,
  distanceKm: 5,
  avgHeartRate: 160,
  hrFromSensor: true,
  elevationGainM: 0,
  ...over,
});

test('VO2 max is estimated from steady runs with a measured heart rate', () => {
  // 5 km in 30 min = 166.7 m/min; needs 36.8 ml/kg/min; at 78% of reserve (max 190, rest 55) -> about 46
  const v = vo2FromRun(run(), 190, 55)!;
  assert.ok(v > 44 && v < 48, `vo2 ${v}`);
  assert.equal(vo2FromRun(run({ hrFromSensor: false }), 190, 55), null);
  assert.equal(vo2FromRun(run({ distanceKm: 1.5, durationSec: 600 }), 190, 55), null);
  assert.equal(vo2FromRun(run({ avgHeartRate: 100 }), 190, 55), null, 'too easy to say');
  assert.equal(vo2FromRun(run({ type: 'Walking' }), 190, 55), null);
  const now = Date.UTC(2026, 9, 31);
  const est = estimateVo2Max([run(), run({ startedAt: Date.UTC(2026, 9, 20), avgHeartRate: 165 }), run({ startedAt: Date.UTC(2026, 3, 1) })], 190, 55, now)!;
  assert.equal(est.runs, 2, 'a run from months ago is not used');
  assert.ok(est.value > 40 && est.value < 50);
  assert.equal(estimateVo2Max([], 190, 55, now), null);
});

const wave = (spm: number, seconds: number, fs = 25, second = 0.5, noise = 0.15) => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  return Array.from({ length: Math.round(seconds * fs) }, (_, i) => {
    const t = i / fs;
    const f = spm / 60;
    return Math.sin(2 * Math.PI * f * t) + second * Math.sin(2 * Math.PI * 2 * f * t + 1) + noise * rnd() * 2;
  });
};

test('stroke rate is found from the rhythm of the movement', () => {
  for (const spm of [18, 24, 30, 36]) {
    const r = strokeRate(wave(spm, 24), 25)!;
    assert.ok(r, `a rate for ${spm}`);
    assert.ok(Math.abs(r.spm - spm) <= 1, `${spm} found as ${r.spm}`);
    assert.ok(r.strength >= 0.3);
  }
  // a strong second harmonic must not be mistaken for the stroke itself
  const odd = strokeRate(wave(24, 24, 25, 2), 25)!;
  assert.ok(Math.abs(odd.spm - 24) <= 1, `harmonic case found ${odd.spm}`);
});

test('no stroke rate without movement, rhythm or enough data', () => {
  assert.equal(strokeRate(new Array(600).fill(0.3), 25), null);
  assert.equal(strokeRate(wave(24, 4), 25), null, 'under eight seconds');
  let seed = 3;
  const noise = Array.from({ length: 600 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5);
  assert.equal(strokeRate(noise, 25), null);
  assert.deepEqual(summarizeStrokes([24, 25, 26, 24, 25, 90]), { avg: 25, max: 26 });
  assert.equal(summarizeStrokes([24, 25]), null);
});

test('the stroke rhythm is found whichever way the phone is held', () => {
  const fs = 25;
  const dir = [0.6, 0.64, 0.48]; // the phone swings along a slanted line, as it would in a pocket
  let seed = 11;
  const noise = () => (((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5) * 0.3;
  const stroke = (t: number, spm: number) => Math.sin(2 * Math.PI * (spm / 60) * t) + 0.6 * Math.sin(2 * Math.PI * 2 * (spm / 60) * t + 1);
  for (const spm of [18, 22, 28]) {
    const n = fs * 24;
    const a = Array.from({ length: n }, (_, i) => stroke(i / fs, spm));
    const x = a.map((v) => v * dir[0] + noise());
    const y = a.map((v) => v * dir[1] + noise());
    const z = a.map((v) => v * dir[2] + noise() + 9.81 * 0); // gravity is already removed
    const r = strokeRate(principalAxis(x, y, z), fs)!;
    assert.ok(r && Math.abs(r.spm - spm) <= 1, `${spm} found as ${r?.spm}`);
  }
  assert.deepEqual(principalAxis([], [], []), []);
});