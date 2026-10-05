import test from 'node:test';
import assert from 'node:assert/strict';
import { Encoder, Profile } from '@garmin/fitsdk';
import { gzipSync, zipSync, strToU8 } from 'fflate';
import { parseGpx, parseGpxRoute, parseTcx } from '../lib/importers/xmlActivities';
import { parseFit } from '../lib/importers/fitActivity';
import { looksLikeNike, parseFitbitExercise, parseFitbitSleep, parseNikeActivity } from '../lib/importers/jsonExports';
import { activityToWorkout, mapSport } from '../lib/importers/convert';
import { mergeImportedNights, mergeImportedWorkouts } from '../lib/importers/merge';
import { importFiles, parseCsv, stravaMeta } from '../lib/importers';
import { UserProfile } from '../types/tracking';
import { WorkoutSession } from '../types/health';

const profile: UserProfile = { name: 'T', age: 30, sex: 'other', heightCm: 175, weightKg: 70, activityLevel: 'moderate', units: 'metric', restingHr: 55, onboarded: true };

const T0 = Date.UTC(2024, 4, 12, 7, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

/** A 40-minute run due north at 3.3 m/s with a heart rate of 150. */
const gpxRun = (type = 'running', extra = '') => {
  const pts: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const lat = 51 + (i * 10 * 3.3) / 111_195;
    pts.push(`<trkpt lat="${lat.toFixed(6)}" lon="-0.100000"><ele>${(20 + i * 0.05).toFixed(1)}</ele><time>${iso(T0 + i * 10_000)}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${150 + (i % 5)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="x"><metadata><name>Morning run</name></metadata><trk><name>Morning run</name><type>${type}</type>${extra}<trkseg>${pts.join('')}</trkseg></trk></gpx>`;
};

test('GPX: track points, time, elevation and heart rate are read', () => {
  const [a] = parseGpx(gpxRun());
  assert.equal(a.points.length, 241);
  assert.equal(a.name, 'Morning run');
  assert.equal(a.sport, 'running');
  assert.equal(a.start, T0);
  assert.equal(a.points[0].hr, 150);
  assert.equal(a.points[10].alt, 20.5);
  assert.ok(Math.abs((a.distanceKm ?? 0) - 7.92) < 0.1, String(a.distanceKm));
  assert.equal(parseGpx('<gpx></gpx>').length, 0);
  assert.equal(parseGpx('not xml at all').length, 0);
});

test('GPX routes and waypoints work as a route to follow', () => {
  const route = `<gpx><rte><name>Loop</name><rtept lat="51.5" lon="-0.1"/><rtept lat="51.51" lon="-0.1"/><rtept lat="51.51" lon="-0.09"/></rte></gpx>`;
  const r = parseGpxRoute(route)!;
  assert.equal(r.name, 'Loop');
  assert.equal(r.points.length, 3);
  assert.deepEqual(r.points[0], [51.5, -0.1]);
  assert.equal(parseGpxRoute('<gpx></gpx>'), null);
});

test('TCX: sport, laps, heart rate and positions are read', () => {
  const tp = (i: number) => `<Trackpoint><Time>${iso(T0 + i * 10_000)}</Time><Position><LatitudeDegrees>${(51 + i * 0.0003).toFixed(6)}</LatitudeDegrees><LongitudeDegrees>-0.1</LongitudeDegrees></Position><AltitudeMeters>30</AltitudeMeters><DistanceMeters>${i * 33}</DistanceMeters><HeartRateBpm><Value>${140 + (i % 4)}</Value></HeartRateBpm></Trackpoint>`;
  const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>${iso(T0)}</Id><Lap StartTime="${iso(T0)}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>9900</DistanceMeters><Calories>310</Calories><Track>${Array.from({ length: 181 }, (_, i) => tp(i)).join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
  const [a] = parseTcx(tcx);
  assert.equal(a.sport, 'Biking');
  assert.equal(a.start, T0);
  assert.equal(a.elapsedSec, 1800);
  assert.ok(Math.abs((a.distanceKm ?? 0) - 9.9) < 0.01);
  assert.equal(a.calories, 310);
  assert.equal(a.points.length, 181);
  assert.equal(a.hr?.length, 181);
  assert.equal(mapSport(a.sport), 'Cycling');
});

const SEMI = 2 ** 31 / 180;
const asMesg = (m: Record<string, unknown>) => m as never;
const fitRun = (): Uint8Array => {
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, asMesg({ type: 'activity', manufacturer: 'development', product: 0, serialNumber: 1234, timeCreated: new Date(T0) }));
  for (let i = 0; i <= 120; i++) {
    enc.onMesg(Profile.MesgNum.RECORD, asMesg({
      timestamp: new Date(T0 + i * 10_000),
      positionLat: Math.round((51 + i * 0.0003) * SEMI),
      positionLong: Math.round(-0.1 * SEMI),
      heartRate: 155,
      distance: i * 33,
      altitude: 40,
    }));
  }
  enc.onMesg(Profile.MesgNum.SESSION, asMesg({ timestamp: new Date(T0 + 1_200_000), startTime: new Date(T0), totalElapsedTime: 1200, totalTimerTime: 1190, totalDistance: 3960, sport: 'running', subSport: 'generic', avgHeartRate: 155, maxHeartRate: 168, totalCalories: 280, totalAscent: 12 }));
  return enc.close();
};

test('FIT: a real encoded activity decodes to positions, heart rate and the session summary', () => {
  const [a] = parseFit(fitRun());
  assert.ok(a, 'expected an activity');
  assert.equal(a.sport, 'running');
  assert.equal(a.start, T0);
  assert.equal(a.points.length, 121);
  assert.ok(Math.abs(a.points[0].lat - 51) < 1e-5);
  assert.ok(Math.abs(a.points[0].lng + 0.1) < 1e-5);
  assert.equal(a.points[5].hr, 155);
  assert.equal(a.distanceKm, 3.96);
  assert.equal(a.calories, 280);
  assert.equal(a.ascentM, 12);
  assert.deepEqual(parseFit(new Uint8Array([1, 2, 3, 4])), []);
});

const nikeJson = () => ({
  id: 'abc-123',
  type: 'run',
  start_epoch_ms: T0,
  end_epoch_ms: T0 + 1_800_000,
  active_duration_ms: 1_780_000,
  summaries: [
    { metric: 'distance', value: 5.2, unit: 'km' },
    { metric: 'calories', value: 360, unit: 'kcal' },
  ],
  metrics: [
    { type: 'latitude', values: Array.from({ length: 60 }, (_, i) => ({ start_epoch_ms: T0 + i * 30_000, end_epoch_ms: T0 + i * 30_000 + 1000, value: 51 + i * 0.0006 })) },
    { type: 'longitude', values: Array.from({ length: 60 }, (_, i) => ({ start_epoch_ms: T0 + i * 30_000, end_epoch_ms: T0 + i * 30_000 + 1000, value: -0.1 })) },
    { type: 'elevation', values: Array.from({ length: 60 }, (_, i) => ({ start_epoch_ms: T0 + i * 30_000, end_epoch_ms: T0 + i * 30_000 + 1000, value: 25 + i * 0.1 })) },
    { type: 'heart_rate', values: Array.from({ length: 60 }, (_, i) => ({ start_epoch_ms: T0 + i * 30_000, end_epoch_ms: T0 + i * 30_000 + 1000, value: 148 + (i % 6) })) },
  ],
});

test('Nike Run Club JSON: summaries and metric streams become an activity', () => {
  const j = nikeJson();
  assert.equal(looksLikeNike(j), true);
  assert.equal(looksLikeNike({ foo: 1 }), false);
  const a = parseNikeActivity(j)!;
  assert.equal(a.sport, 'run');
  assert.equal(a.start, T0);
  assert.equal(a.distanceKm, 5.2);
  assert.equal(a.calories, 360);
  assert.equal(a.points.length, 60);
  assert.equal(a.points[3].hr, 151);
  assert.ok(a.points[10].alt && Math.abs(a.points[10].alt - 26) < 0.01);
  assert.equal(parseNikeActivity({ metrics: [] }), null);
  // miles are converted
  const mi = parseNikeActivity({ ...j, summaries: [{ metric: 'distance', value: 3, unit: 'mi' }] })!;
  assert.ok(Math.abs((mi.distanceKm ?? 0) - 4.828) < 0.01);
});

test('Fitbit Takeout: sleep with stages and exercise logs', () => {
  const sleep = [
    {
      logId: 111,
      dateOfSleep: '2024-05-12',
      startTime: '2024-05-11T23:10:00.000',
      endTime: '2024-05-12T07:02:00.000',
      minutesAsleep: 430,
      minutesAwake: 42,
      timeInBed: 472,
      efficiency: 94,
      type: 'stages',
      levels: {
        summary: { deep: { minutes: 80 }, light: { minutes: 250 }, rem: { minutes: 100 }, wake: { minutes: 42 } },
        data: [
          { dateTime: '2024-05-11T23:10:00.000', level: 'wake', seconds: 300 },
          { dateTime: '2024-05-11T23:15:00.000', level: 'light', seconds: 3600 },
          { dateTime: '2024-05-12T00:15:00.000', level: 'deep', seconds: 2400 },
          { dateTime: '2024-05-12T00:55:00.000', level: 'wake', seconds: 600 },
          { dateTime: '2024-05-12T01:05:00.000', level: 'rem', seconds: 1800 },
        ],
      },
    },
    { logId: 112, dateOfSleep: '2024-05-12', startTime: '2024-05-12T14:00:00.000', endTime: '2024-05-12T14:40:00.000', minutesAsleep: 38, timeInBed: 40, type: 'classic' },
  ];
  const nights = parseFitbitSleep(sleep);
  assert.equal(nights.length, 1); // the nap is left out
  const n = nights[0];
  assert.equal(n.source, 'import');
  assert.equal(n.deepSleepMinutes, 80);
  assert.equal(n.remSleepMinutes, 100);
  assert.equal(n.detail?.segments.length, 5);
  assert.equal(n.detail?.awakenings, 1);
  assert.equal(n.bedtime, '23:10');
  assert.equal(n.efficiencyScore, 94);

  const ex = parseFitbitExercise([{ logId: 9, activityName: 'Run', startTime: '2024-05-12T07:00:00.000Z', duration: 1_800_000, calories: 300, distance: 5, distanceUnit: 'Kilometer', averageHeartRate: 152 }]);
  assert.equal(ex.length, 1);
  assert.equal(ex[0].sport, 'Run');
  assert.equal(ex[0].distanceKm, 5);
  assert.equal(ex[0].elapsedSec, 1800);
});

test('sports map onto this app, and ones it has no place for are dropped', () => {
  assert.equal(mapSport('Run'), 'Running');
  assert.equal(mapSport('TrailRun'), 'Running');
  assert.equal(mapSport('Ride'), 'Cycling');
  assert.equal(mapSport('VirtualRide'), 'IndoorCycling');
  assert.equal(mapSport('WeightTraining'), 'Strength');
  assert.equal(mapSport('Hike'), 'Hiking');
  assert.equal(mapSport('running generic'), 'Running');
  assert.equal(mapSport('Swim'), null);
  assert.equal(mapSport('AlpineSki'), null);
  assert.equal(mapSport(undefined, false), null);
});

test('a GPX run becomes a full workout with route, heart rate, load and climb', () => {
  const [a] = parseGpx(gpxRun());
  const w = activityToWorkout(a, profile)!;
  assert.equal(w.type, 'Running');
  assert.equal(w.startedAt, T0);
  assert.equal(w.durationMinutes, 40);
  assert.ok(Math.abs((w.distanceKm ?? 0) - 7.92) < 0.1);
  assert.ok(w.track && w.track.length <= 800 && w.track.length > 100);
  assert.ok(w.route && w.route.length >= 2 && w.route.length <= 300);
  assert.ok(w.hrSeries && w.hrSeries.length > 100);
  assert.ok(w.avgHeartRate >= 150 && w.avgHeartRate <= 154);
  assert.ok((w.cardioLoadPoints ?? 0) > 0);
  assert.equal(w.gpsTracked, true);
  assert.equal(w.importedFrom, 'GPX file');
  // a swim is not supported; something under a minute is not a workout
  assert.equal(activityToWorkout({ ...a, sport: 'swimming' }, profile), null);
  assert.equal(activityToWorkout({ ...a, elapsedSec: 30, points: [] }, profile), null);
});

const workoutAt = (startedAt: number, km: number, id: string): WorkoutSession => ({ id, type: 'Running', timestamp: iso(startedAt), startedAt, durationMinutes: 30, distanceKm: km, avgHeartRate: 150, caloriesBurned: 300 });

test('merging skips workouts that are already there, from any source', () => {
  const existing = [workoutAt(T0, 5, 'mine')];
  const imported = [
    workoutAt(T0 + 60_000, 5.1, 'imp-a'), // same run, a minute later by another clock
    workoutAt(T0 + 86_400_000, 8, 'imp-b'), // a different day
    workoutAt(T0 + 86_400_000 + 30_000, 8, 'imp-c'), // the same one twice in the import
  ];
  const r = mergeImportedWorkouts(existing, imported);
  assert.equal(r.duplicates, 2);
  assert.equal(r.added.length, 1);
  assert.equal(r.added[0].id, 'imp-b');
  assert.equal(r.merged.length, 2);
  assert.equal(r.merged[0].id, 'imp-b'); // newest first
  // same time but a very different distance is a different workout
  const r2 = mergeImportedWorkouts(existing, [workoutAt(T0 + 30_000, 12, 'x')]);
  assert.equal(r2.added.length, 0 + (Math.abs(12 - 5) / 12 < 0.25 ? 0 : 1));
});

test('merging nights never replaces a night that is already there', () => {
  const night = (date: string, id: string, source: 'import' | 'health-connect') =>
    ({ id, dateIso: date, displayDate: date, bedtime: '23:00', wakeTime: '07:00', durationMinutes: 420, qualityRating: 4, isManualEntry: false, source, deepSleepMinutes: 1, remSleepMinutes: 1, lightSleepMinutes: 1, awakeMinutes: 1, efficiencyScore: 90 }) as import('../types/health').SleepLogEntry;
  const r = mergeImportedNights([night('2024-05-12', 'hc', 'health-connect')], [night('2024-05-12', 'i1', 'import'), night('2024-05-11', 'i2', 'import')]);
  assert.equal(r.added, 1);
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.merged.map((l) => l.id), ['hc', 'i2']);
});

test('CSV parsing handles quotes, commas and line breaks inside cells', () => {
  const rows = parseCsv('a,b,c\r\n1,"two, with comma","line\nbreak"\r\n"say ""hi""",,3\r\n');
  assert.deepEqual(rows[0], ['a', 'b', 'c']);
  assert.deepEqual(rows[1], ['1', 'two, with comma', 'line\nbreak']);
  assert.deepEqual(rows[2], ['say "hi"', '', '3']);
  const meta = stravaMeta('Activity ID,Activity Name,Activity Type,Filename\n1,"Lunch Run",Run,activities/1.gpx\n2,Evening ride,Ride,activities/2.fit.gz\n');
  assert.deepEqual(meta.get('1.gpx'), { type: 'Run', name: 'Lunch Run' });
  assert.equal(meta.get('2.fit')?.type, 'Ride');
});

test('a Strava-style zip imports through the whole pipeline', async () => {
  const zip = zipSync({
    'activities.csv': strToU8('Activity ID,Activity Name,Activity Type,Filename\n1,Lunch Run,Run,activities/1.gpx\n2,Evening spin,Ride,activities/2.fit.gz\n3,Lap swim,Swim,activities/3.gpx\n'),
    'activities/1.gpx': strToU8(gpxRun('9')),
    'activities/2.fit.gz': gzipSync(fitRun()),
    'activities/3.gpx': strToU8(gpxRun('swimming')),
    'media/photo.jpg': new Uint8Array(1000),
    '__MACOSX/._junk': new Uint8Array(10),
  });
  const file = new File([zip as BlobPart], 'export_123.zip');
  const seen: number[] = [];
  const out = await importFiles([file], profile, (p) => seen.push(p.seen));
  assert.equal(out.workouts.length, 2, JSON.stringify(out.skipped));
  const types = out.workouts.map((w) => w.type).sort();
  assert.deepEqual(types, ['Cycling', 'Running']);
  assert.ok(out.workouts.find((w) => w.notes === 'Lunch Run'));
  assert.equal(out.skipped.length, 1); // the swim
  assert.ok(seen.length > 0);
});

test('loose files and the Fitbit sleep JSON import too', async () => {
  const sleep = [{ logId: 5, dateOfSleep: '2024-05-12', startTime: '2024-05-11T23:00:00.000', endTime: '2024-05-12T07:00:00.000', minutesAsleep: 440, minutesAwake: 40, timeInBed: 480, efficiency: 92, type: 'stages', levels: { summary: { deep: { minutes: 70 }, light: { minutes: 270 }, rem: { minutes: 100 }, wake: { minutes: 40 } }, data: [] } }];
  const files = [new File([gpxRun()], 'run.gpx'), new File([JSON.stringify(sleep)], 'sleep-2024-05-12.json'), new File([JSON.stringify(nikeJson())], 'nike.json'), new File(['hello'], 'notes.txt')];
  const out = await importFiles(files, profile);
  assert.equal(out.workouts.length, 2);
  assert.equal(out.nights.length, 1);
  assert.equal(out.workouts.some((w) => w.importedFrom === 'Nike Run Club export'), true);
});
