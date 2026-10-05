import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUCKETS_PER_DAY, bucketHr, bucketSeries, bucketSteps, hrDayStats, mergeStates, replaceDays, restingFromBuckets } from '../lib/ownBuckets';
import { estimateNight, findSleepWindow, mergeEstimatedSleep } from '../lib/sleepEstimate';
import { SleepLogEntry } from '../types/health';

const MIN = 60_000;
const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime(); // October 2026, local time

test('heart rate readings are averaged into five-minute buckets, with 0 where nothing was read', () => {
  const b = bucketHr([
    [local(4, 6, 1), 60],
    [local(4, 6, 3), 64],
    [local(4, 6, 12), 70],
    [local(4, 6, 13), 12], // not a heart rate
  ]);
  const day = b['2026-10-04'];
  assert.equal(day.length, BUCKETS_PER_DAY);
  assert.equal(day[72], 62); // 06:00 to 06:05
  assert.equal(day[73], 0);
  assert.equal(day[74], 70);
});

test('step counts become steps per bucket and ignore resets and day changes', () => {
  const b = bucketSteps([
    [local(4, 8, 0), 1000],
    [local(4, 8, 4), 1100],
    [local(4, 8, 9), 1160],
    [local(4, 8, 14), 200], // the counter went back: skipped
    [local(4, 8, 19), 260],
    [local(3, 23, 58), 9000], // another day
  ]);
  const day = b['2026-10-04'];
  assert.equal(day[96], 100); // 08:00 to 08:05 gets the rise up to the 08:04 reading
  assert.equal(day[97], 60);
  assert.equal(day[98], 0);
  assert.equal(day[99], 60);
  assert.equal(b['2026-10-03'], undefined);
});

test('day statistics, resting estimate, replacing days and merging states', () => {
  const stats = hrDayStats([[local(4, 1, 0), 52], [local(4, 12, 0), 90], [local(4, 18, 0), 128]]);
  assert.deepEqual(stats['2026-10-04'], { hrMin: 52, hrAvg: 90, hrMax: 128 });
  const day = new Array(BUCKETS_PER_DAY).fill(0);
  for (let i = 0; i < 90; i++) day[i] = 50 + (i % 10); // a night between 50 and 59
  assert.ok((restingFromBuckets(day) ?? 0) >= 50 && (restingFromBuckets(day) ?? 99) <= 52);
  assert.equal(restingFromBuckets(new Array(BUCKETS_PER_DAY).fill(0)), undefined);
  assert.deepEqual(Object.keys(replaceDays({ a: [1], b: [2] }, { c: [3] }, 2)), ['b', 'c']);
  const now = local(4, 12);
  assert.deepEqual(mergeStates([[now - 1000, 2]], [[now - 1000, 3], [now - 500, 3], [now - 9 * 24 * 3600_000, 2]], now), [[now - 1000, 3], [now - 500, 3]]);
});

/** A night from 22:40 to 06:20 as the watch would see it: ninety-minute cycles of light, deep, light and REM sleep. */
const nightData = () => {
  const hr: [number, number][] = [];
  const steps: [number, number][] = [];
  const start = local(3, 22, 40);
  const bucketsInNight = 92; // 7h40m
  for (let i = 0; i < bucketsInNight; i++) {
    const cycle = Math.floor(i / 18);
    const k = i % 18; // position within the cycle
    let bpm: number;
    if (k < 4) bpm = 58 + (i % 2);
    else if (k < 9) bpm = 49 + (i % 2) * 0.5;
    else if (k < 12) bpm = 55 + (i % 2);
    else bpm = 60 + (k % 2 ? 5 : -2) + (cycle > 2 ? 1 : 0); // REM: higher and unsteady
    if (i === 40) bpm = 78; // woke up and moved
    hr.push([start + i * 5 * MIN + MIN, Math.round(bpm)]);
  }
  steps.push([start, 5000]);
  steps.push([start + 39 * 5 * MIN, 5000]);
  steps.push([start + 40 * 5 * MIN + 2 * MIN, 5040]); // 40 steps while awake
  steps.push([start + 92 * 5 * MIN, 5040]);
  return { hr, steps, start };
};

const baseInput = () => {
  const { hr, steps } = nightData();
  return {
    wakeDate: '2026-10-04',
    hr: bucketHr(hr),
    steps: bucketSteps(steps),
    states: [[local(3, 22, 40), 2], [local(4, 6, 20), 3]] as [number, number][],
    classify: [] as [number, number, number, number][],
    phoneSegments: [],
    now: local(4, 9, 0),
  };
};

test('a night is estimated from the watch asleep state, heart rate and movement', () => {
  const log = estimateNight(baseInput())!;
  assert.ok(log, 'a night was estimated');
  assert.equal(log.source, 'sensors');
  assert.equal(log.id, 'sensors-2026-10-04');
  assert.equal(log.detail!.stagesFrom, 'estimated');
  assert.equal(log.bedtime, '22:40');
  assert.equal(log.wakeTime, '06:20');
  assert.equal(log.detail!.inBedMinutes, 460);
  const asleep = log.deepSleepMinutes + log.remSleepMinutes + log.lightSleepMinutes;
  assert.equal(log.durationMinutes, asleep);
  assert.ok(asleep >= 400 && asleep <= 455, `asleep ${asleep}`);
  assert.ok(log.awakeMinutes >= 5, 'the movement at 02:00 counts as awake');
  assert.ok(log.detail!.awakenings >= 1);
  const deepPct = (log.deepSleepMinutes / asleep) * 100;
  const remPct = (log.remSleepMinutes / asleep) * 100;
  assert.ok(deepPct >= 9 && deepPct <= 27, `deep ${deepPct.toFixed(1)}%`);
  assert.ok(remPct >= 13 && remPct <= 29, `rem ${remPct.toFixed(1)}%`);
  // the timeline is gap-free and in order
  const seg = log.detail!.segments;
  assert.equal(seg[0][1], log.detail!.startMs);
  assert.equal(seg[seg.length - 1][2], log.detail!.endMs);
  for (let i = 1; i < seg.length; i++) assert.equal(seg[i][1], seg[i - 1][2]);
  assert.ok((log.detail!.hrMin ?? 99) <= 50 && (log.detail!.hrMax ?? 0) >= 70);
});

test('without any asleep state the quiet hours are found from heart rate and steps', () => {
  const input = baseInput();
  // add an active evening and morning around the night so the quiet stretch has edges
  const evening: [number, number][] = [];
  const eveningSteps: [number, number][] = [[local(3, 18, 0), 2000]];
  for (let i = 0; i < 48; i++) evening.push([local(3, 18, 0) + i * 5 * MIN + MIN, 88 + (i % 5)]);
  for (let i = 1; i <= 48; i++) eveningSteps.push([local(3, 18, 0) + i * 5 * MIN, 2000 + i * 60]);
  const morning: [number, number][] = [];
  const morningSteps: [number, number][] = [[local(4, 6, 30), 5040]];
  for (let i = 0; i < 40; i++) morning.push([local(4, 6, 30) + i * 5 * MIN + MIN, 86 + (i % 6)]);
  for (let i = 1; i <= 40; i++) morningSteps.push([local(4, 6, 30) + i * 5 * MIN, 5040 + i * 70]);
  const hr = bucketHr([...evening, ...nightData().hr, ...morning]);
  const steps = bucketSteps([...eveningSteps, ...nightData().steps.slice(1), ...morningSteps]);
  const from = local(3, 18);
  const to = local(4, 12);
  const n = (to - from) / (5 * MIN);
  const window = findSleepWindow({ ...input, hr, steps, states: [] }, from, to, bucketSeries(hr, from, from + n * 5 * MIN), bucketSeries(steps, from, from + n * 5 * MIN))!;
  assert.equal(window.basis, 'inferred');
  assert.ok(Math.abs(window.startMs - local(3, 22, 40)) <= 35 * MIN, 'start close to 22:40');
  assert.ok(Math.abs(window.endMs - local(4, 6, 20)) <= 35 * MIN, 'end close to 06:20');
});

test('the phone sleep segment is used when the watch has no asleep state', () => {
  const input = baseInput();
  const w = findSleepWindow(
    { ...input, states: [], phoneSegments: [{ start: local(3, 23, 0), end: local(4, 6, 0), status: 0 }] },
    local(3, 18),
    local(4, 12),
    [],
    []
  )!;
  assert.equal(w.basis, 'phone');
  assert.equal(w.startMs, local(3, 23, 0));
});

test('no readings, or a night still going, gives no estimate', () => {
  assert.equal(estimateNight({ ...baseInput(), hr: {}, steps: {}, states: [] }), null);
  // asleep since 22:40, no waking recorded, and it is 03:00 now
  assert.equal(estimateNight({ ...baseInput(), states: [[local(3, 22, 40), 2]], now: local(4, 3, 0) }), null);
});

const logOf = (id: string, dateIso: string, source: SleepLogEntry['source']): SleepLogEntry => ({
  id, dateIso, displayDate: dateIso, bedtime: '23:00', wakeTime: '07:00', durationMinutes: 420, qualityRating: 3, isManualEntry: source === 'manual',
  source, deepSleepMinutes: 60, remSleepMinutes: 80, lightSleepMinutes: 280, awakeMinutes: 20, efficiencyScore: 90,
});

test('estimated nights never replace hand-logged or Health Connect nights, but refresh phone-detected ones', () => {
  const existing = [logOf('m1', '2026-10-04', 'manual'), logOf('hc-1', '2026-10-03', 'health-connect'), logOf('sleepapi-1', '2026-10-02', 'sleep-api'), logOf('sensors-2026-10-01', '2026-10-01', 'sensors')];
  const merged = mergeEstimatedSleep(existing, [
    logOf('sensors-2026-10-04', '2026-10-04', 'sensors'),
    logOf('sensors-2026-10-03', '2026-10-03', 'sensors'),
    logOf('sensors-2026-10-02', '2026-10-02', 'sensors'),
    logOf('sensors-2026-10-01', '2026-10-01', 'sensors'),
  ]);
  assert.deepEqual(merged.map((l) => l.id), ['m1', 'hc-1', 'sensors-2026-10-02', 'sensors-2026-10-01']);
  // a deleted estimate stays deleted
  assert.equal(mergeEstimatedSleep([], [logOf('sensors-2026-10-04', '2026-10-04', 'sensors')], (id) => id === 'sensors-2026-10-04').length, 0);
});
