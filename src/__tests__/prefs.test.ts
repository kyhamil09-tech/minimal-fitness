import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, sanitizePrefs, voiceStepKm } from '../lib/prefs';
import { setWeekStartsOnSunday, startOfMondayWeek, startOfWeek } from '../lib/dates';

test('missing or invalid preferences fall back to the defaults', () => {
  assert.deepEqual(sanitizePrefs({}), DEFAULT_PREFS);
  const p = sanitizePrefs({ beatVolume: 900, voiceMinutes: -4, weekStart: 'friday' as never, swipeTabs: 'yes' as never, voiceMode: 'time' });
  assert.equal(p.beatVolume, 100);
  assert.equal(p.voiceMinutes, 1);
  assert.equal(p.weekStart, 'mon');
  assert.equal(p.swipeTabs, true);
  assert.equal(p.voiceMode, 'time');
});

test('the background glow defaults to tab changes and rejects unknown values', () => {
  assert.equal(DEFAULT_PREFS.glow, 'tabs');
  assert.equal(sanitizePrefs({ glow: 'always' }).glow, 'always');
  assert.equal(sanitizePrefs({ glow: 'off' }).glow, 'off');
  assert.equal(sanitizePrefs({ glow: 'strobe' as never }).glow, 'tabs');
});

test('spoken update spacing converts miles to kilometers', () => {
  assert.equal(voiceStepKm({ ...DEFAULT_PREFS, voiceDistance: 2 }, false), 2);
  assert.ok(Math.abs(voiceStepKm({ ...DEFAULT_PREFS, voiceDistance: 1 }, true) - 1.609344) < 1e-9);
});

test('the week can start on Sunday while plans stay on Monday', () => {
  const wed = new Date(2026, 9, 7, 15, 0).getTime(); // Wednesday 7 October 2026
  setWeekStartsOnSunday(false);
  assert.equal(startOfWeek(wed).getDay(), 1);
  setWeekStartsOnSunday(true);
  assert.equal(startOfWeek(wed).getDay(), 0);
  assert.equal(startOfWeek(wed).getDate(), 4);
  assert.equal(startOfMondayWeek(wed).getDay(), 1);
  assert.equal(startOfMondayWeek(wed).getDate(), 5);
  setWeekStartsOnSunday(false);
});

test('interval cue settings keep to the choices offered', async () => {
  const { sanitizePrefs, DEFAULT_PREFS } = await import('../lib/prefs');
  const d = sanitizePrefs({});
  assert.equal(d.intervalVoice, true);
  assert.equal(d.intervalWarnSec, 10);
  assert.equal(d.intervalCountdown, true);
  assert.equal(d.intervalVoiceName, '');
  assert.equal(sanitizePrefs({ intervalWarnSec: 12 }).intervalWarnSec, DEFAULT_PREFS.intervalWarnSec);
  assert.equal(sanitizePrefs({ intervalWarnSec: 0 }).intervalWarnSec, 0);
  assert.equal(sanitizePrefs({ intervalWarnSec: 30, intervalVoice: false, intervalVoiceName: 'en-us-x-abc-local' }).intervalVoiceName, 'en-us-x-abc-local');
});

test('Health Connect is receive-only by default: saving data back needs its own switch', () => {
  assert.equal(DEFAULT_PREFS.useHealthConnect, true);
  assert.equal(DEFAULT_PREFS.writeHealthConnect, false);
  assert.equal(sanitizePrefs({}).writeHealthConnect, false);
  assert.equal(sanitizePrefs({ writeHealthConnect: true }).writeHealthConnect, true);
  // Junk is ignored, so a damaged setting can never switch sending on.
  assert.equal(sanitizePrefs({ writeHealthConnect: 'yes' as unknown as boolean }).writeHealthConnect, false);
});

test('the sleep tracker choices fall back to automatic when the stored value is junk', () => {
  assert.equal(sanitizePrefs({}).sleepSource, 'auto');
  assert.equal(sanitizePrefs({}).sleepSecondary, 'auto');
  assert.equal(sanitizePrefs({ sleepSource: 'com.fitbit.FitbitMobile' }).sleepSource, 'com.fitbit.FitbitMobile');
  assert.equal(sanitizePrefs({ sleepSource: '<script>' }).sleepSource, 'auto');
  assert.equal(sanitizePrefs({ sleepSecondary: 'none' }).sleepSecondary, 'none');
});
