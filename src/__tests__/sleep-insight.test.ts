import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSleepInsight, formatHM } from '../lib/sleepInsight';
import { SleepLogEntry } from '../types/health';

const day = (offset: number) => {
  const d = new Date('2026-10-10T12:00:00');
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

const night = (offset: number, bedtime: string, wakeTime: string, durationMinutes: number, qualityRating = 4): SleepLogEntry => ({
  id: `s-${offset}`,
  dateIso: day(offset),
  displayDate: day(offset),
  bedtime,
  wakeTime,
  durationMinutes,
  qualityRating,
  isManualEntry: true,
  deepSleepMinutes: 0,
  remSleepMinutes: 0,
  lightSleepMinutes: 0,
  awakeMinutes: 0,
  efficiencyScore: 85,
});

const steady = (from = 1, count = 5) => Array.from({ length: count }, (_, i) => night(from + i, '23:00', '07:00', 480));
const sentences = (s: string) => s.split(/(?<=\.)\s+/).filter(Boolean);

test('no logs gives no insight', () => {
  assert.equal(buildSleepInsight([], day(0)), null);
});

test('formatHM', () => {
  assert.equal(formatHM(385), '6h 25m');
  assert.equal(formatHM(45), '45m');
  assert.equal(formatHM(-65), '1h 05m');
});

test('first nights explain that the baseline is still building', () => {
  const one = buildSleepInsight([night(0, '23:00', '07:00', 480)], day(0))!;
  assert.match(one.text, /Slept 8h 00m; a baseline comparison unlocks after 2 more logged nights\./);
  assert.equal(one.baselineNights, 0);
  const two = buildSleepInsight([night(0, '23:00', '07:00', 480), night(1, '23:00', '07:00', 470)], day(0))!;
  assert.match(two.text, /after 1 more logged night\./);
});

test('a short night is compared with the average and flagged as a warning', () => {
  const logs = [night(0, '01:00', '06:30', 330), ...steady()];
  const r = buildSleepInsight(logs, day(0))!;
  assert.match(r.text, /^Slept 5h 30m, 2h 30m below your 5-night average of 8h 00m\./);
  assert.match(r.text, /Under 6 hours/);
  assert.equal(r.tone, 'warn');
  assert.equal(r.durationDeltaMin, -150);
  assert.equal(r.deltaLabel, '2h 30m below avg');
});

test('output is at most two sentences and has no filler', () => {
  const cases = [
    [night(0, '23:00', '07:00', 480), ...steady()],
    [night(0, '00:10', '07:00', 410), ...steady()],
    [night(0, '23:00', '07:00', 480, 2), ...steady()],
    [night(0, '23:00', '07:00', 540), ...steady()],
  ];
  for (const logs of cases) {
    const r = buildSleepInsight(logs, day(0))!;
    assert.ok(sentences(r.text).length <= 2, r.text);
    assert.doesNotMatch(r.text, /^(here|hello|hi|great|good morning)/i);
  }
});

test('a normal night reports consistency', () => {
  const r = buildSleepInsight([night(0, '23:05', '07:05', 480), ...steady()], day(0))!;
  assert.match(r.text, /in line with your 5-night average of 8h 00m\./);
  assert.match(r.text, /Bedtime and wake time were consistent with your baseline\./);
  assert.equal(r.tone, 'good');
  assert.equal(r.deltaLabel, 'In line with avg');
});

test('a late bedtime is called out, handling nights that cross midnight', () => {
  const r = buildSleepInsight([night(0, '01:00', '08:00', 420), ...steady()], day(0))!;
  assert.match(r.text, /Bedtime was 2h 00m later than your usual 23:00\./);
  assert.equal(r.bedtimeDeltaMin, 120);
});

test('quality change is reported when timing is steady', () => {
  const r = buildSleepInsight([night(0, '23:00', '07:00', 480, 2), ...steady()], day(0))!;
  assert.match(r.text, /Self-rated quality was down 2\.0 stars versus your average\./);
});

test('a stale latest log is labelled with its date', () => {
  const logs = [night(5, '23:00', '07:00', 480), ...steady(6)];
  const r = buildSleepInsight(logs, day(0))!;
  assert.match(r.text, /^Last logged night \(/);
});

test('only the 7 most recent earlier nights form the baseline', () => {
  const old = Array.from({ length: 6 }, (_, i) => night(20 + i, '23:00', '07:00', 200)); // very old, very short
  const logs = [night(0, '23:00', '07:00', 480), ...steady(1, 7), ...old];
  const r = buildSleepInsight(logs, day(0))!;
  assert.equal(r.baselineNights, 7);
  assert.match(r.text, /7-night average of 8h 00m/);
});
