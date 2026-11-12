import test from 'node:test';
import assert from 'node:assert/strict';
import { cusumUp, ewma, hampel, madScale, median, robustZ, tPValue, welch } from '../lib/robust';
import { GpsKalman, smoothFixes } from '../lib/kalman';
import { douglasPeucker, simplifyToMax } from '../lib/simplify';
import { predictRaces, riegel, timeFromVdot, vdotFromEffort } from '../lib/racePrediction';
import { banister, formState } from '../lib/banister';
import { cardiacDrift, driftLabel, gradeAdjustedPaceSec, minettiCost } from '../lib/efficiency';
import { Fix, TrackBuilder, TrackPoint, haversineKm } from '../lib/geo';
import { sleepRegularityIndex } from '../lib/sleepMetrics';
import { SleepLogEntry } from '../types/health';

test('median and robust spread ignore outliers', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  const clean = [60, 61, 59, 60, 62, 58, 60];
  const dirty = [...clean, 200];
  assert.ok(Math.abs(median(dirty) - median(clean)) < 1);
  assert.ok(madScale(dirty) < 5);
  assert.ok(robustZ(75, clean, 1) > 3);
  assert.equal(robustZ(75, [1, 2]), 0);
});

test('Hampel removes a heart-rate spike and leaves clean data alone', () => {
  const hr = [140, 141, 142, 141, 140, 210, 141, 142, 143, 142, 141];
  const { values, replaced } = hampel(hr);
  assert.equal(replaced, 1);
  assert.ok(values[5] >= 140 && values[5] <= 143);
  const smooth = Array.from({ length: 40 }, (_, i) => 130 + Math.round(8 * Math.sin(i / 6)));
  assert.equal(hampel(smooth).replaced, 0);
  // a genuine steady climb is not mistaken for spikes
  const ramp = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
  assert.equal(hampel(ramp).replaced, 0);
});

test('EWMA follows the data', () => {
  const out = ewma([10, 10, 10, 20], 0.5);
  assert.equal(out[0], 10);
  assert.equal(out[3], 15);
});

test('CUSUM catches a slow drift that no single day flags', () => {
  const calm = Array.from({ length: 14 }, () => 0);
  const drift = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4];
  const r = cusumUp([...calm, ...drift]);
  assert.ok(r.alarmAt !== null && r.alarmAt >= 14);
  assert.equal(cusumUp(calm).alarmAt, null);
});

test('Welch t-test and p-values match known values', () => {
  // t = 2.228 with 10 degrees of freedom is the 5% two-sided point
  assert.ok(Math.abs(tPValue(2.228, 10) - 0.05) < 0.002);
  assert.ok(Math.abs(tPValue(2.0, 20) - 0.0593) < 0.002);
  assert.ok(tPValue(10, 30) < 1e-6);
  assert.ok(Math.abs(tPValue(0, 12) - 1) < 1e-9);
  const w = welch([10, 11, 12, 11, 10, 12], [14, 15, 13, 14, 15, 14])!;
  assert.ok(w.t < -5 && tPValue(w.t, w.df) < 0.01);
  assert.equal(welch([1], [1, 2]), null);
});

const fixAt = (i: number, lat: number, lng: number, acc = 10): Fix => ({ ts: 1_700_000_000_000 + i * 1000, lat, lng, acc });
// 1 degree of latitude is about 111.2 km; 0.000027 degrees is about 3 m
const stepLat = 0.000027;

const pathKm = (pts: { lat: number; lng: number }[]) => {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineKm([pts[i - 1].lat, pts[i - 1].lng], [pts[i].lat, pts[i].lng]);
  return d;
};

test('Kalman smoothing cuts the distance GPS jitter adds to a straight run', () => {
  // run due north at 3 m/s with a repeatable +-6 m sideways zig-zag
  const zig = [0, 6, -6, 4, -5, 7, -4, 5, -6, 3];
  const raw: Fix[] = Array.from({ length: 200 }, (_, i) => fixAt(i, 51 + i * stepLat, -0.1 + (zig[i % zig.length] / 111_000) * 1.6));
  const smooth = smoothFixes(raw);
  const trueKm = (199 * 3) / 1000;
  const rawKm = pathKm(raw);
  const smoothKm = pathKm(smooth);
  assert.ok(rawKm > trueKm * 1.2, `raw ${rawKm} true ${trueKm}`);
  assert.ok(smoothKm < rawKm * 0.85);
  assert.ok(Math.abs(smoothKm - trueKm) < Math.abs(rawKm - trueKm));
});

test('TrackBuilder with smoothing records a shorter, truer distance than without', () => {
  const zig = [0, 6, -6, 4, -5, 7, -4, 5, -6, 3];
  const raw: Fix[] = Array.from({ length: 300 }, (_, i) => fixAt(i, 51 + i * stepLat, -0.1 + (zig[i % zig.length] / 111_000) * 1.6, 8));
  const plain = new TrackBuilder();
  const smooth = new TrackBuilder({ smooth: true });
  raw.forEach((f) => {
    plain.add(f);
    smooth.add(f);
  });
  const trueKm = (299 * 3) / 1000;
  assert.ok(plain.distanceKm > trueKm * 1.15);
  assert.ok(smooth.distanceKm < plain.distanceKm);
  assert.ok(Math.abs(smooth.distanceKm - trueKm) < Math.abs(plain.distanceKm - trueKm));
  // pausing resets the filter: the first fix after a pause is not dragged back toward the old position
  const b = new TrackBuilder({ smooth: true });
  b.add(fixAt(0, 51, -0.1));
  b.pause(fixAt(1, 51, -0.1).ts);
  b.resume(fixAt(100, 51, -0.1).ts);
  b.add(fixAt(101, 51.01, -0.1));
  assert.ok(Math.abs(b.points[b.points.length - 1].lat - 51.01) < 1e-9);
});

test('Kalman filter returns the first fix unchanged and follows real movement', () => {
  const k = new GpsKalman();
  assert.equal(k.ready, false);
  const first = k.update(fixAt(0, 10, 20));
  assert.deepEqual(first, { lat: 10, lng: 20 });
  // an accurate reading after a long gap moves the estimate almost all the way
  const later = k.update({ ts: 1_700_000_000_000 + 600_000, lat: 10.01, lng: 20, acc: 3 });
  assert.ok(Math.abs(later.lat - 10.01) < 0.0001);
  k.reset();
  assert.equal(k.ready, false);
});

test('Douglas-Peucker keeps corners and drops straight stretches', () => {
  const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [51 + i * 0.0001, -0.1]);
  assert.equal(douglasPeucker(line, 2).length, 2);
  const ell: [number, number][] = [...line, ...Array.from({ length: 50 }, (_, i): [number, number] => [51 + 49 * 0.0001, -0.1 + (i + 1) * 0.0001])];
  const s = douglasPeucker(ell, 2);
  assert.equal(s.length, 3);
  assert.deepEqual(s[1], ell[49]);
  // a wavy route fitted to a point limit keeps the limit and the end points
  const wave: [number, number][] = Array.from({ length: 1000 }, (_, i) => [51 + i * 0.00005, -0.1 + 0.0008 * Math.sin(i / 20)]);
  const fit = simplifyToMax(wave, 120);
  assert.ok(fit.length <= 120 && fit.length > 30);
  assert.deepEqual(fit[0], wave[0]);
  assert.deepEqual(fit[fit.length - 1], wave[999]);
  assert.equal(simplifyToMax(wave.slice(0, 50), 100).length, 50);
});

test('VDOT and race predictions match Daniels tables', () => {
  // Daniels: a 19:57 5K is VDOT 50
  assert.ok(Math.abs(vdotFromEffort(5000, 19 * 60 + 57) - 50) < 0.6);
  // VDOT 50 equivalents: 10K 41:21, marathon 3:10:49
  assert.ok(Math.abs(timeFromVdot(50, 10000) - (41 * 60 + 21)) < 30);
  assert.ok(Math.abs(timeFromVdot(50, 42195) - (3 * 3600 + 10 * 60 + 49)) < 150);
  assert.ok(Math.abs(riegel(1200, 5000, 10000) - 2503) < 3);
  const p = predictRaces([
    { distanceM: 1609, seconds: 330 },
    { distanceM: 5000, seconds: 20 * 60 },
  ])!;
  assert.equal(p.basis.confidence, 'good');
  assert.equal(p.predictions.length, 4);
  const [k5, k10, half, full] = p.predictions.map((x) => x.seconds);
  assert.ok(k5 < k10 && k10 < half && half < full);
  assert.equal(predictRaces([{ distanceM: 800, seconds: 200 }]), null);
  assert.equal(predictRaces([]), null);
  assert.equal(predictRaces([{ distanceM: 2000, seconds: 500 }])!.basis.confidence, 'rough');
});

test('Banister model: steady training settles, a hard block lowers form, rest raises it', () => {
  const days = (n: number, load: number, start = 0) => Array.from({ length: n }, (_, i) => ({ date: `d${start + i}`, load }));
  const steady = banister(days(200, 60));
  const end = steady[steady.length - 1];
  assert.ok(Math.abs(end.fitness - 60) < 1 && Math.abs(end.fatigue - 60) < 0.5 && Math.abs(end.form) < 1);
  const block = banister([...days(60, 40), ...days(7, 120, 60)]);
  assert.ok(block[block.length - 1].form < -10);
  assert.ok(block[block.length - 1].fatigue > block[block.length - 1].fitness);
  const rest = banister([...days(60, 40), ...days(7, 120, 60), ...days(7, 0, 67)]);
  assert.ok(rest[rest.length - 1].form > block[block.length - 1].form);
  assert.equal(formState(-40, 40).id, 'overreaching');
  assert.equal(formState(8, 40).id, 'ready');
  assert.equal(formState(0, 40).id, 'neutral');
});

const trackFor = (minutes: number, speedMs: number): TrackPoint[] =>
  Array.from({ length: minutes * 6 + 1 }, (_, i) => ({ t: 1_700_000_000_000 + i * 10_000, lat: 51, lng: -0.1, d: (i * 10 * speedMs) / 1000 }));

test('cardiac drift is near zero for a steady run and positive when heart rate climbs', () => {
  const track = trackFor(50, 3);
  const flat: [number, number][] = track.map((p) => [p.t, 150]);
  const d0 = cardiacDrift(track, flat)!;
  assert.ok(Math.abs(d0.decouplingPct) < 0.5);
  assert.equal(driftLabel(d0.decouplingPct).label, 'Steady');
  const climbing: [number, number][] = track.map((p, i) => [p.t, 140 + (i / track.length) * 22]);
  const d1 = cardiacDrift(track, climbing)!;
  assert.ok(d1.decouplingPct > 6, `drift ${d1.decouplingPct}`);
  assert.ok(['Some drift', 'High drift'].includes(driftLabel(d1.decouplingPct).label));
  // too short or no heart rate: nothing to say
  assert.equal(cardiacDrift(trackFor(10, 3), flat), null);
  assert.equal(cardiacDrift(track, undefined), null);
});

const sleepNight = (dayIdx: number, bedHour: number, wakeHour: number): SleepLogEntry => {
  const base = new Date(2026, 8, 1 + dayIdx, 0, 0, 0).getTime();
  const startMs = base - (24 - bedHour) * 3_600_000; // the evening before
  const endMs = base + wakeHour * 3_600_000;
  const iso = new Date(endMs).toISOString().slice(0, 10);
  return { id: 's' + dayIdx, dateIso: iso, displayDate: iso, bedtime: '23:00', wakeTime: '07:00', durationMinutes: 400, qualityRating: 4, isManualEntry: false, deepSleepMinutes: 70, remSleepMinutes: 90, lightSleepMinutes: 240, awakeMinutes: 20, efficiencyScore: 92, detail: { startMs, endMs, segments: [], awakenings: 0, inBedMinutes: 420, stagesFrom: 'measured' } };
};

test('Sleep Regularity Index is high for a fixed schedule and falls with a shifting one', () => {
  const regular = Array.from({ length: 14 }, (_, i) => sleepNight(i, 23, 7));
  const r = sleepRegularityIndex(regular)!;
  assert.ok(r.sri >= 95, `regular ${r.sri}`);
  assert.equal(r.label, 'Very regular');
  const shifting = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? sleepNight(i, 22, 6) : sleepNight(i, 2, 11)));
  const s = sleepRegularityIndex(shifting)!;
  assert.ok(s.sri < r.sri - 30, `shifting ${s.sri}`);
  assert.equal(sleepRegularityIndex(regular.slice(0, 3)), null);
});

test('grade adjustment: hills cost more going up, so the adjusted pace is faster', () => {
  assert.ok(Math.abs(minettiCost(0) - 3.6) < 1e-9);
  assert.ok(minettiCost(0.08) > minettiCost(0));
  assert.ok(minettiCost(-0.08) < minettiCost(0));
  const flat = gradeAdjustedPaceSec(360, 0, 1);
  const up = gradeAdjustedPaceSec(360, 60, 1); // 6% climb over a kilometer
  assert.equal(flat, 360);
  assert.ok(up < 330 && up > 250, `up ${up}`);
  const down = gradeAdjustedPaceSec(360, -30, 1);
  assert.ok(down > 360);
});
