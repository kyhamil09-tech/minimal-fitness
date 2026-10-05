import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countAwakenings, hm, lastNights, sleepSchedule, sleepScore, stageSummary, toSegments } from '../lib/sleepMetrics';
import { applyVitals, applyVitalsToLogs, mergeImportedSleep, nightsNeedingVitals, sessionToLog } from '../lib/healthConnect';
import { SleepLogEntry } from '../types/health';

const MIN = 60_000;
const t0 = Date.UTC(2026, 9, 3, 22, 0);

const night = (dateIso: string, over: Partial<SleepLogEntry> = {}): SleepLogEntry => ({
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
  ...over,
});

test('toSegments maps Health Connect stages, merges touching ones and drops unknown', () => {
  const seg = toSegments([
    [4, t0 + 30 * MIN, t0 + 60 * MIN], // light
    [2, t0, t0 + 30 * MIN], // generic sleeping counts as light and touches the next one
    [0, t0 + 60 * MIN, t0 + 70 * MIN], // unknown: dropped
    [5, t0 + 70 * MIN, t0 + 100 * MIN], // deep
    [7, t0 + 100 * MIN, t0 + 110 * MIN], // awake in bed
    [6, t0 + 110 * MIN, t0 + 140 * MIN], // rem
  ]);
  assert.deepEqual(seg, [
    [1, t0, t0 + 60 * MIN],
    [2, t0 + 70 * MIN, t0 + 100 * MIN],
    [0, t0 + 100 * MIN, t0 + 110 * MIN],
    [3, t0 + 110 * MIN, t0 + 140 * MIN],
  ]);
});

test('awakenings only count real wake-ups in the middle of the night', () => {
  const seg = toSegments([
    [1, t0, t0 + 10 * MIN], // awake before sleep: not a wake-up
    [4, t0 + 10 * MIN, t0 + 100 * MIN],
    [1, t0 + 100 * MIN, t0 + 108 * MIN], // wake-up
    [4, t0 + 108 * MIN, t0 + 200 * MIN],
    [1, t0 + 200 * MIN, t0 + 201 * MIN], // one minute: ignored
    [5, t0 + 201 * MIN, t0 + 300 * MIN],
    [1, t0 + 300 * MIN, t0 + 320 * MIN], // final waking: not counted
  ]);
  // stage type 1 is "awake" in Health Connect, so the first segment above is awake and the rest are stages
  assert.equal(countAwakenings(seg), 1);
});

test('stage summary gives minutes, shares of sleep and efficiency', () => {
  const s = stageSummary(night('2026-10-04', { detail: { startMs: 0, endMs: 0, segments: [], awakenings: 1, inBedMinutes: 480, stagesFrom: 'measured' } }));
  assert.equal(s.asleep, 450);
  assert.equal(s.inBed, 480);
  assert.equal(s.efficiency, 94); // 450 / 480
  assert.equal(s.deepPct, 18);
  assert.equal(s.remPct, 22);
  assert.equal(s.lightPct, 60);
  assert.equal(s.awakePct, 6);
});

test('the sleep score rewards a long, deep, unbroken night and skips hand-logged ones', () => {
  const good = sleepScore(night('2026-10-04'))!;
  assert.ok(good.score >= 85, `score ${good.score}`);
  assert.ok(['Excellent', 'Good'].includes(good.label));
  const poor = sleepScore(night('2026-10-03', { deepSleepMinutes: 10, remSleepMinutes: 20, lightSleepMinutes: 160, awakeMinutes: 90 }))!;
  assert.ok(poor.score < 60, `score ${poor.score}`);
  assert.equal(poor.label, 'Poor');
  assert.equal(sleepScore(night('2026-10-02', { isManualEntry: true, source: 'manual' })), null);
});

test('lastNights keeps one night per date, the longest, oldest first', () => {
  const logs = [night('2026-10-03', { id: 'a', durationMinutes: 300 }), night('2026-10-03', { id: 'b', durationMinutes: 440 }), night('2026-10-01'), night('2026-10-02')];
  const r = lastNights(logs, 3);
  assert.deepEqual(r.map((l) => l.dateIso), ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(r[2].id, 'b');
  assert.equal(lastNights(logs, 2).length, 2);
});

test('schedule averages bedtimes across midnight and grades consistency', () => {
  const logs = [night('2026-10-01', { bedtime: '23:30', wakeTime: '07:00' }), night('2026-10-02', { bedtime: '00:30', wakeTime: '07:10' }), night('2026-10-03', { bedtime: '00:00', wakeTime: '06:50' })];
  const s = sleepSchedule(logs)!;
  assert.equal(s.avgBedtime, '00:00');
  assert.equal(s.label, 'Very consistent');
  assert.equal(sleepSchedule(logs.slice(0, 2)), null);
  const messy = [night('2026-10-01', { bedtime: '21:30' }), night('2026-10-02', { bedtime: '02:30' }), night('2026-10-03', { bedtime: '23:00' })];
  assert.equal(sleepSchedule(messy)!.label, 'Irregular');
});

test('hm formats minutes', () => {
  assert.equal(hm(432), '7h 12m');
  assert.equal(hm(45), '45m');
  assert.equal(hm(-5), '0m');
});

const session = {
  id: 'x',
  start: t0,
  end: t0 + 480 * MIN,
  offsetSeconds: 0,
  stages: [
    [4, t0, t0 + 200 * MIN],
    [5, t0 + 200 * MIN, t0 + 290 * MIN],
    [4, t0 + 290 * MIN, t0 + 300 * MIN],
    [1, t0 + 300 * MIN, t0 + 312 * MIN], // woke up
    [6, t0 + 312 * MIN, t0 + 420 * MIN],
    [4, t0 + 420 * MIN, t0 + 480 * MIN],
  ] as [number, number, number][],
};

test('a Health Connect session becomes a night with its stage timeline', () => {
  const log = sessionToLog(session)!;
  assert.ok(log.detail);
  assert.equal(log.detail!.stagesFrom, 'measured');
  assert.equal(log.detail!.awakenings, 1);
  assert.equal(log.detail!.inBedMinutes, 480);
  assert.equal(log.detail!.segments.length, 6);
  assert.equal(log.detail!.hrAvg, undefined, 'overnight readings are looked up separately');
  assert.equal(log.detail!.vitalsAt, undefined);
});

const vitals = { id: 'x', hrAvg: 54, hrMin: 47, hrMax: 71, hrvAvg: 52.4, hrvCount: 40, respAvg: 14.8, spo2Avg: 96.2, spo2Min: 92, skinDelta: -0.3 };

test('overnight readings are added to a night once looked up', () => {
  const log = applyVitals(sessionToLog(session)!, vitals, 12345);
  assert.equal(log.detail!.hrMin, 47);
  assert.equal(log.detail!.hrvMs, 52.4);
  assert.equal(log.detail!.respRate, 14.8);
  assert.equal(log.detail!.spo2Min, 92);
  assert.equal(log.detail!.skinDelta, -0.3);
  assert.equal(log.detail!.vitalsAt, 12345);
  assert.equal(applyVitalsToLogs([log, night('2026-10-01')], [{ id: 'nope' }]).length, 2);
});

test('a refreshed import keeps the readings already looked up for that night', () => {
  const withVitals = applyVitals(sessionToLog(session)!, vitals, 999);
  const merged = mergeImportedSleep([withVitals], [sessionToLog(session)!]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].detail!.hrAvg, 54);
  assert.equal(merged[0].detail!.vitalsAt, 999);
});

test('only a few recent nights without readings are looked up at a time, and fresh nights are asked again later', () => {
  const now = t0 + 480 * MIN + 2 * 3_600_000; // two hours after the night ended
  const base = sessionToLog(session)!;
  const mk = (n: number, vitalsAt?: number): SleepLogEntry => {
    const shift = -n * 86_400_000;
    return { ...base, id: `hc-n${n}`, detail: { ...base.detail!, startMs: base.detail!.startMs + shift, endMs: base.detail!.endMs + shift, vitalsAt } };
  };
  const logs = [mk(0), mk(1), mk(2), mk(3), mk(20)];
  const ask = nightsNeedingVitals(logs, now);
  assert.deepEqual(ask.map((a) => a.id), ['n0', 'n1', 'n2']); // newest first, three at most, none older than two weeks
  // already looked up: older nights are left alone; tonight's is asked again only after 90 minutes
  const done = [mk(0, now - 30 * 60_000), mk(1, now - 3600_000), mk(2, now - 3 * 3_600_000)];
  assert.deepEqual(nightsNeedingVitals(done, now), []);
  assert.deepEqual(nightsNeedingVitals([mk(0, now - 100 * 60_000)], now).map((a) => a.id), ['n0']);
  assert.deepEqual(nightsNeedingVitals([{ ...mk(0), source: 'sensors' }], now), []);
});