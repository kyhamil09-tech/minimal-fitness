import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestSteps, mergeImportedSleep, sessionToLog } from '../lib/healthConnect';
import { backupDue, backupFileName } from '../lib/backupAuto';
import { buildSleepInsight } from '../lib/sleepInsight';
import { SleepLogEntry } from '../types/health';

const MIN = 60000;
const t0 = Date.UTC(2026, 9, 3, 22, 30); // 22:30 UTC

test('sessionToLog reads measured stages and local times', () => {
  const log = sessionToLog({
    id: 'abc',
    start: t0,
    end: t0 + 480 * MIN,
    offsetSeconds: 2 * 3600, // phone was on UTC+2
    stages: [
      [4, t0, t0 + 200 * MIN], // light
      [5, t0 + 200 * MIN, t0 + 290 * MIN], // deep
      [6, t0 + 290 * MIN, t0 + 400 * MIN], // rem
      [1, t0 + 400 * MIN, t0 + 420 * MIN], // awake
      [4, t0 + 420 * MIN, t0 + 480 * MIN],
    ],
  })!;
  assert.equal(log.id, 'hc-abc');
  assert.equal(log.bedtime, '00:30'); // 22:30 UTC = 00:30 local
  assert.equal(log.wakeTime, '08:30');
  assert.equal(log.dateIso, '2026-10-04');
  assert.equal(log.deepSleepMinutes, 90);
  assert.equal(log.remSleepMinutes, 110);
  assert.equal(log.lightSleepMinutes, 260);
  assert.equal(log.awakeMinutes, 20);
  assert.equal(log.durationMinutes, 460);
  assert.equal(log.isManualEntry, false);
  assert.equal(log.source, 'health-connect');
  assert.equal(log.efficiencyScore, 96);
});

test('sessionToLog ignores naps and marks stage-less sessions as estimated', () => {
  assert.equal(sessionToLog({ id: 'n', start: t0, end: t0 + 45 * MIN, offsetSeconds: 0, stages: [] }), null);
  const bare = sessionToLog({ id: 'b', start: t0, end: t0 + 420 * MIN, offsetSeconds: 0, stages: [] })!;
  assert.equal(bare.durationMinutes, 420);
  assert.equal(bare.isManualEntry, true);
});

const manual = (dateIso: string, id = `m-${dateIso}`): SleepLogEntry => ({
  id, dateIso, displayDate: dateIso, bedtime: '23:00', wakeTime: '07:00', durationMinutes: 480, qualityRating: 4,
  isManualEntry: true, deepSleepMinutes: 0, remSleepMinutes: 0, lightSleepMinutes: 0, awakeMinutes: 0, efficiencyScore: 85,
});
const imported = (dateIso: string, id: string, minutes = 450): SleepLogEntry => ({
  ...manual(dateIso, `hc-${id}`), isManualEntry: false, source: 'health-connect', durationMinutes: minutes,
});

test('mergeImportedSleep never overwrites a night logged by hand and refreshes earlier imports', () => {
  const existing = [manual('2026-10-03'), imported('2026-10-02', 'x', 400)];
  const merged = mergeImportedSleep(existing, [imported('2026-10-03', 'a'), imported('2026-10-02', 'x', 460), imported('2026-10-01', 'b')]);
  assert.deepEqual(merged.map((l) => l.dateIso), ['2026-10-03', '2026-10-02', '2026-10-01']);
  assert.equal(merged[0].id, 'm-2026-10-03'); // manual kept, import skipped
  assert.equal(merged.find((l) => l.dateIso === '2026-10-02')!.durationMinutes, 460); // refreshed
});

test('two imported sessions on one day keep the longer', () => {
  const merged = mergeImportedSleep([], [imported('2026-10-03', 'a', 300), imported('2026-10-03', 'b', 470)]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].durationMinutes, 470);
});

test('bestSteps takes the highest source and ignores junk', () => {
  assert.equal(bestSteps(4000, 5200, undefined, NaN, null), 5200);
  assert.equal(bestSteps(), 0);
});

test('backup naming and schedule', () => {
  assert.equal(backupFileName(new Date(2026, 9, 3)), 'ky-fitness-backup-2026-10-03.json');
  const now = 1_000_000_000_000;
  assert.equal(backupDue(null, 5, now), true);
  assert.equal(backupDue({ lastAt: now - 3600_000, workouts: 5 }, 5, now), false);
  assert.equal(backupDue({ lastAt: now - 25 * 3600_000, workouts: 5 }, 5, now), true);
  assert.equal(backupDue({ lastAt: now - 5 * 60_000, workouts: 5 }, 6, now), true); // new workout
  assert.equal(backupDue({ lastAt: now - 10_000, workouts: 5 }, 6, now), false); // too soon
});

test('imported nights do not feed the self-rated quality comparison', () => {
  const day = (o: number) => `2026-10-${String(10 - o).padStart(2, '0')}`;
  const logs = [{ ...imported(day(0), 'z', 480), qualityRating: 1 }, ...[1, 2, 3, 4].map((o) => manual(day(o)))];
  const r = buildSleepInsight(logs, day(0))!;
  assert.equal(r.qualityDelta, 0);
});