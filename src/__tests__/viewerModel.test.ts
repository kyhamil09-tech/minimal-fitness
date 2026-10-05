import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { buildModel, dailyToCsv, dayTotals, gpxZip, readBackupText, rollingMean, sleepToCsv, weeklySums } from '../../viewer/model';
import { encryptWithPassphrase } from '../lib/cryptoBackup';

const workout = (id: string, startedAt: number, km: number, withTrack = false) => ({
  id, type: 'Running', timestamp: new Date(startedAt).toISOString(), startedAt, durationMinutes: 30, distanceKm: km, avgHeartRate: 140, caloriesBurned: 300, cardioLoadPoints: 50,
  ...(withTrack ? { track: [{ t: startedAt, lat: 1, lng: 1, d: 0 }, { t: startedAt + 60000, lat: 1.001, lng: 1.001, d: 0.15 }] } : {}),
});

const backupText = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'ky-fitness', version: 1, exportedAt: '2026-10-04T10:00:00Z',
    data: {
      kyfit_workouts: JSON.stringify([workout('b', Date.parse('2026-03-10T08:00:00'), 5, true), workout('a', Date.parse('2026-03-09T08:00:00'), 3)]),
      kyfit_sleep_logs: JSON.stringify([{ id: 's', dateIso: '2026-03-10', displayDate: 'x', bedtime: '23:00', wakeTime: '07:00', durationMinutes: 480, qualityRating: 4, isManualEntry: true, deepSleepMinutes: 80, remSleepMinutes: 90, lightSleepMinutes: 280, awakeMinutes: 30, efficiencyScore: 92 }]),
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, JSON.stringify(v)])),
    },
  });

test('reads a plain backup, sorted oldest first', async () => {
  const m = buildModel(await readBackupText(backupText()), new Date('2026-10-04T12:00:00'));
  assert.deepEqual(m.workouts.map((w) => w.id), ['a', 'b']);
  assert.equal(m.firstDay, '2026-03-09');
  assert.equal(m.sleep.length, 1);
});

test('reads an encrypted backup and rejects a wrong passphrase', async () => {
  const sealed = await encryptWithPassphrase(backupText(), 'correct horse');
  await assert.rejects(() => readBackupText(sealed), /encrypted/);
  await assert.rejects(() => readBackupText(sealed, 'nope nope'), /Wrong passphrase/);
  const b = await readBackupText(sealed, 'correct horse');
  assert.equal(buildModel(b).workouts.length, 2);
});

test('rolling mean, day totals and weekly sums', () => {
  assert.deepEqual(rollingMean([[0, 2], [1, 4], [2, 6]], 2), [[0, 2], [1, 3], [2, 5]]);
  const t = dayTotals([workout('a', Date.parse('2026-03-09T08:00:00'), 3), workout('b', Date.parse('2026-03-09T18:00:00'), 2)] as never);
  assert.equal(t.get('2026-03-09')?.km, 5);
  assert.equal(t.get('2026-03-09')?.count, 2);
  const weeks = weeklySums(t, '2026-03-09', '2026-03-20', (x) => x.km);
  assert.deepEqual(weeks.map((w) => [w.week, w.value]), [['2026-03-09', 5], ['2026-03-16', 0]]);
});

test('exports: csv has a row per night and GPX zip holds only routed workouts', async () => {
  const m = buildModel(await readBackupText(backupText()), new Date('2026-10-04T12:00:00'));
  assert.equal(sleepToCsv(m.sleep).split('\n').length, 2);
  assert.match(dailyToCsv(m), /2026-03-10,1,5/);
  const zip = gpxZip(m.workouts);
  assert.ok(zip);
  const names = Object.keys(unzipSync(zip));
  assert.equal(names.length, 1);
  assert.match(names[0], /\.gpx$/);
});
