import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeImportedSleep } from '../lib/healthConnect';
import { applyPreference, chooseVersion, combineNight, nightSourceLabel, sourceName, sourcesIn, swapVersion } from '../lib/sleepSources';
import { SleepLogEntry } from '../types/health';

const FITBIT = 'com.fitbit.FitbitMobile';
const WATCH = 'com.google.android.apps.wear.companion';

const night = (id: string, app: string, minutes: number, stages = true, date = '2026-10-09'): SleepLogEntry => ({
  id: `hc-${id}`,
  dateIso: date,
  displayDate: date,
  bedtime: '23:00',
  wakeTime: '07:00',
  durationMinutes: minutes,
  qualityRating: 4,
  isManualEntry: !stages,
  source: 'health-connect',
  originApp: app,
  deepSleepMinutes: stages ? 80 : 0,
  remSleepMinutes: stages ? 90 : 0,
  lightSleepMinutes: stages ? 250 : 0,
  awakeMinutes: 20,
  efficiencyScore: 92,
  detail: { startMs: 0, endMs: 1, segments: stages ? [[1, 0, 1]] : [], awakenings: 1, inBedMinutes: minutes + 20, stagesFrom: 'measured' },
});

test('known trackers get their name and unknown ones a readable one', () => {
  assert.equal(sourceName(FITBIT), 'Fitbit');
  assert.equal(sourceName('com.kyfitness.app'), 'This app');
  assert.equal(sourceName('com.acme.sleepring'), 'Sleepring');
  assert.equal(sourceName(undefined), 'Unknown app');
});

test('the best measured version wins: stages beat no stages, then the longer record', () => {
  const noStages = night('a', WATCH, 480, false);
  const stages = night('b', FITBIT, 450, true);
  assert.equal(chooseVersion([noStages, stages]).id, 'hc-b');
  assert.equal(chooseVersion([night('c', WATCH, 400), night('d', FITBIT, 460)]).id, 'hc-d');
});

test('a preferred tracker beats the best one, unless it did not record that night', () => {
  const watch = night('w', WATCH, 480);
  const fitbit = night('f', FITBIT, 400);
  assert.equal(chooseVersion([watch, fitbit], FITBIT).id, 'hc-f');
  assert.equal(chooseVersion([watch, fitbit], 'com.other.app').id, 'hc-w'); // not there that night: best available
  assert.equal(chooseVersion([watch, fitbit], 'auto').id, 'hc-w');
  // A night you switched by hand outranks the preference.
  assert.equal(chooseVersion([watch, fitbit], FITBIT, WATCH).id, 'hc-w');
});

test('two trackers on one night: one is shown and the other is kept beside it', () => {
  const merged = mergeImportedSleep([], [night('w', WATCH, 470), night('f', FITBIT, 440)]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].originApp, WATCH);
  assert.deepEqual(merged[0].alternates?.map((a) => a.originApp), [FITBIT]);
  // With a preference the other one is shown.
  const preferred = mergeImportedSleep([], [night('w', WATCH, 470), night('f', FITBIT, 440)], { preferred: FITBIT });
  assert.equal(preferred[0].originApp, FITBIT);
  assert.equal(preferred[0].alternates?.[0].originApp, WATCH);
});

test('switching a night by hand sticks through the next sync', () => {
  const first = mergeImportedSleep([], [night('w', WATCH, 470), night('f', FITBIT, 440)]);
  const switched = swapVersion(first[0], 'hc-f');
  assert.equal(switched.originApp, FITBIT);
  assert.equal(switched.pinned, true);
  assert.deepEqual(switched.alternates?.map((a) => a.originApp), [WATCH]);
  // The same sessions arrive again, and even a new preference does not undo the switch.
  const again = mergeImportedSleep([switched], [night('w', WATCH, 470), night('f', FITBIT, 440)], { preferred: WATCH });
  assert.equal(again.length, 1);
  assert.equal(again[0].originApp, FITBIT);
  assert.equal(again[0].pinned, true);
});

test('changing the preference re-picks nights that were not switched by hand', () => {
  const merged = mergeImportedSleep([], [night('w', WATCH, 470), night('f', FITBIT, 440)]);
  const toFitbit = applyPreference(merged, FITBIT);
  assert.equal(toFitbit[0].originApp, FITBIT);
  assert.equal(toFitbit[0].pinned, undefined);
  assert.equal(applyPreference(toFitbit, 'auto')[0].originApp, WATCH);
  // Nothing to change: the same array comes back.
  assert.equal(applyPreference(merged, 'auto'), merged);
  // A night switched by hand is left alone.
  const pinned = swapVersion(merged[0], 'hc-f');
  assert.equal(applyPreference([pinned], WATCH)[0].originApp, FITBIT);
});

test('the log lists the trackers it has seen, and each night says where it came from', () => {
  const merged = mergeImportedSleep([], [night('w', WATCH, 470), night('f', FITBIT, 440), night('w2', WATCH, 460, true, '2026-10-08')]);
  assert.deepEqual(sourcesIn(merged).map((s) => [s.name, s.nights]), [['Pixel Watch', 2], ['Fitbit', 1]]);
  assert.equal(nightSourceLabel(merged[0]), 'Recorded by Pixel Watch');
  assert.equal(nightSourceLabel({ ...merged[0], originApp: undefined, source: 'sensors' }), 'Estimated by this app from your watch');
  assert.equal(nightSourceLabel({ ...merged[0], originApp: undefined, source: undefined }), 'Logged by you');
});

test('a night logged by hand is still never replaced by an import', () => {
  const mine: SleepLogEntry = { ...night('m', WATCH, 500), id: 'm-1', source: 'manual', originApp: undefined, isManualEntry: true };
  const merged = mergeImportedSleep([mine], [night('w', WATCH, 470), night('f', FITBIT, 440)]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'm-1');
});

// ---- one night recorded by two trackers that cover different parts of it ----
const H = 3_600_000;
/** A night from `startH` to `endH` (hours from a fixed midnight), with stages or just the times. */
const span = (id: string, app: string, startH: number, endH: number, stages: boolean): SleepLogEntry => {
  const base = 1_800_000_000_000;
  const start = base + startH * H;
  const end = base + endH * H;
  const mid = start + Math.round((end - start) / 2);
  const minutes = Math.round((end - start) / 60_000);
  return {
    ...night(id, app, minutes, stages),
    bedtime: '23:00',
    wakeTime: '06:44',
    detail: {
      startMs: start,
      endMs: end,
      segments: stages ? [[1, start, mid], [2, mid, end]] : [],
      awakenings: 0,
      inBedMinutes: minutes,
      stagesFrom: 'measured',
    },
  };
};

test('a watch that came off early is stitched with the band that kept going, so the night is not cut short', () => {
  const watch = span('w', WATCH, 0, 7.73, true); // to 6:44 if the night starts at 23:00
  const fitbit = span('f', FITBIT, 0.2, 9.57, false); // to 8:34, no stages
  const merged = mergeImportedSleep([], [watch, fitbit]);
  assert.equal(merged.length, 1);
  const night0 = merged[0];
  assert.deepEqual(night0.mergedFrom, [WATCH, FITBIT]);
  assert.equal(night0.detail!.endMs, fitbit.detail!.endMs);
  assert.equal(night0.detail!.startMs, watch.detail!.startMs);
  // The watch's stages are kept, and the extra stretch after it is light sleep from the band.
  assert.ok(night0.durationMinutes > watch.durationMinutes);
  assert.equal(night0.durationMinutes, Math.round((fitbit.detail!.endMs - watch.detail!.startMs) / 60_000));
  assert.ok(night0.lightSleepMinutes > watch.lightSleepMinutes);
  assert.equal(night0.deepSleepMinutes, Math.round((watch.detail!.endMs - watch.detail!.startMs) / 2 / 60_000));
  assert.equal(nightSourceLabel(night0), 'Combined from Pixel Watch and Fitbit');
  // Each tracker's own record stays available, and the stitched night is not counted as a tracker.
  assert.deepEqual(merged[0].alternates?.map((a) => a.id).sort(), ['hc-f', 'hc-w~solo']);
  assert.deepEqual(sourcesIn(merged).map((x) => [x.name, x.nights]).sort(), [['Fitbit', 1], ['Pixel Watch', 1]]);
});

test('a band that covers more of the night with stages of its own supplies those stages for the stretch the watch missed', () => {
  const watch = span('w', WATCH, 0, 7.7, true);
  const fitbit = span('f', FITBIT, 0, 9.5, true);
  const combined = combineNight(watch, [fitbit]);
  assert.equal(combined.detail!.endMs, fitbit.detail!.endMs);
  const tail = combined.detail!.segments.filter((seg) => seg[1] >= watch.detail!.endMs);
  assert.ok(tail.length > 0);
  // The tail comes from the band's stages (its second half is deep sleep), not an invented light stretch.
  assert.ok(tail.some((seg) => seg[0] === 2));
});

test('trackers that agree within fifteen minutes, or only touch the night, are not stitched', () => {
  const watch = span('w', WATCH, 0, 7.7, true);
  assert.equal(combineNight(watch, [span('f', FITBIT, 0.05, 7.9, true)]), watch);
  // A nap an hour after the night ends does not extend it.
  assert.equal(combineNight(watch, [span('n', FITBIT, 8.5, 9.5, false)]), watch);
});

test('the main tracker is the base and the secondary fills in what it missed; secondary "none" shows the main one alone', () => {
  const watch = span('w', WATCH, 0, 7.73, true);
  const fitbit = span('f', FITBIT, 0.2, 9.57, false);
  // Main = watch, secondary any: the watch's night, extended by the band.
  const stitched = mergeImportedSleep([], [watch, fitbit], { preferred: WATCH });
  assert.deepEqual(stitched[0].mergedFrom, [WATCH, FITBIT]);
  assert.equal(stitched[0].detail!.endMs, fitbit.detail!.endMs);
  // Main = watch, secondary = none: the watch's own night, cut at 6:44 as it recorded it.
  const alone = mergeImportedSleep([], [watch, fitbit], { preferred: WATCH, secondary: 'none' });
  assert.equal(alone[0].mergedFrom, undefined);
  assert.equal(alone[0].originApp, WATCH);
  assert.equal(alone[0].detail!.endMs, watch.detail!.endMs);
  // Main = watch, secondary = a tracker that did not record that night: nothing to fill in with.
  const other = mergeImportedSleep([], [watch, fitbit], { preferred: WATCH, secondary: 'com.other.app' });
  assert.equal(other[0].mergedFrom, undefined);
  // Main = Fitbit (the longer record), secondary = watch: the watch's stages are added where it has them? The night already spans both, so it stays the band's own.
  const bandMain = mergeImportedSleep([], [watch, fitbit], { preferred: FITBIT, secondary: WATCH });
  assert.equal(bandMain[0].originApp, FITBIT);
});

test('you can step back to a tracker on its own and return to the stitched night', () => {
  const merged = mergeImportedSleep([], [span('w', WATCH, 0, 7.73, true), span('f', FITBIT, 0.2, 9.57, false)]);
  const solo = swapVersion(merged[0], 'hc-w~solo');
  assert.equal(solo.id, 'hc-w');
  assert.equal(solo.mergedFrom, undefined);
  assert.equal(solo.pinned, true);
  assert.ok(solo.alternates!.some((a) => a.id === 'hc-w~combined'));
  // A later sync keeps the pick.
  const again = mergeImportedSleep([solo], [span('w', WATCH, 0, 7.73, true), span('f', FITBIT, 0.2, 9.57, false)]);
  assert.equal(again[0].originApp, WATCH);
  assert.equal(again[0].mergedFrom, undefined);
  // And the stitched night comes back with one tap, unpinned so it keeps following new data.
  const back = swapVersion(solo, 'hc-w~combined');
  assert.deepEqual(back.mergedFrom, [WATCH, FITBIT]);
  assert.equal(back.pinned, undefined);
});

test('changing the preference back to automatic stitches the night again', () => {
  const merged = mergeImportedSleep([], [span('w', WATCH, 0, 7.73, true), span('f', FITBIT, 0.2, 9.57, false)]);
  const onFitbit = applyPreference(merged, FITBIT);
  assert.equal(onFitbit[0].originApp, FITBIT);
  assert.equal(onFitbit[0].mergedFrom, undefined);
  // The secondary setting re-picks too: with none, the watch's own night.
  const noFill = applyPreference(merged, WATCH, 'none');
  assert.equal(noFill[0].mergedFrom, undefined);
  assert.equal(noFill[0].originApp, WATCH);
  const auto = applyPreference(onFitbit, 'auto');
  assert.deepEqual(auto[0].mergedFrom, [WATCH, FITBIT]);
});
