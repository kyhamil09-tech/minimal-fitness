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

test('spoken update spacing converts miles to kilometres', () => {
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
