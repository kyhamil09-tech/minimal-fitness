import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { gpxFiles, gpxZip } from '../lib/gpxBundle';
import { WorkoutSession } from '../types/health';

const run = (id: string, at: string, route: [number, number][] | undefined): WorkoutSession =>
  ({ id, type: 'Running', timestamp: '', startedAt: Date.parse(at), durationMinutes: 30, avgHeartRate: 140, caloriesBurned: 300, route }) as WorkoutSession;

test('one GPX per workout with a route, named by day and sport, repeats numbered', () => {
  const files = gpxFiles([
    run('a', '2026-10-01T08:00:00Z', [[40, -75], [40.001, -75]]),
    run('b', '2026-10-01T18:00:00Z', [[40, -75], [40.002, -75]]),
    run('c', '2026-10-02T08:00:00Z', undefined),
  ]);
  assert.deepEqual(Object.keys(files), ['2026-10-01-running.gpx', '2026-10-01-running-2.gpx']);
  assert.match(files['2026-10-01-running.gpx'], /<trkpt lat="40"/);
});

test('the zip opens and holds every file', () => {
  const zip = gpxZip([run('a', '2026-10-01T08:00:00Z', [[40, -75], [40.001, -75]])]);
  const out = unzipSync(zip);
  assert.equal(Object.keys(out).length, 1);
  assert.match(strFromU8(out['2026-10-01-running.gpx']), /<gpx version="1.1"/);
});
