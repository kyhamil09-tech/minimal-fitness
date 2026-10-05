import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMilestoneStory, buildStreakStory, buildWeeklyStory, weekDots } from '../lib/storyCards';
import { skinFrom, DARK_SKIN } from '../lib/cardSkin';
import { findBackdrop } from '../data/backdrops';
import { MODERN_THEMES } from '../data/themes';
import { contrast } from '../lib/colorMath';
import { weeklyRecap } from '../lib/weeklyRecap';
import { DEFAULT_GOALS } from '../data/defaults';

test('week dots mark the days with a workout and the current day', () => {
  const dots = weekDots('2026-10-05', new Set(['2026-10-05', '2026-10-07']), '2026-10-08');
  assert.equal(dots.length, 7);
  assert.deepEqual(dots.map((d) => d.done), [true, false, true, false, false, false, false]);
  assert.equal(dots[3].today, true);
  assert.equal(dots[0].label, 'M');
});

test('weekly story carries the numbers and goal', () => {
  const w = (day: string, km: number) => ({ id: day, type: 'Running', timestamp: '', startedAt: Date.parse(`${day}T08:00:00`), durationMinutes: 40, avgHeartRate: 140, caloriesBurned: 300, distanceKm: km, cardioLoadPoints: 50 }) as never;
  const recap = weeklyRecap([w('2026-10-05', 5), w('2026-10-07', 8)], [], '2026-10-05', '2026-10-08');
  const s = buildWeeklyStory(recap, DEFAULT_GOALS, 'metric', new Set(['2026-10-05', '2026-10-07']), '2026-10-08');
  assert.equal(s.kind, 'weekly');
  if (s.kind === 'weekly') {
    assert.equal(s.done, 2);
    assert.equal(s.goal, DEFAULT_GOALS.weeklyWorkouts);
    assert.equal(s.stats[0].value, '13');
    assert.equal(s.eyebrow, 'THIS WEEK SO FAR');
  }
});

test('milestone badge number and unit come from the achievement target', () => {
  const s = buildMilestoneStory({ title: 'Marathon Month', description: 'Run 100 km in total', progressLabel: '100/100 km' }, new Date('2026-10-04T10:00:00'));
  assert.equal(s.kind, 'milestone');
  if (s.kind === 'milestone') {
    assert.equal(s.big, '100');
    assert.equal(s.unit, 'km');
  }
  const t = buildMilestoneStory({ title: 'Warming Up', description: 'Work out 3 days in a row', progressLabel: '3/3 days' });
  if (t.kind === 'milestone') assert.equal(t.unit, 'days');
});

test('streak story picks a line for a record, a run and a restart', () => {
  const week = weekDots('2026-10-05', new Set(), '2026-10-05');
  const rec = buildStreakStory(9, 9, week);
  const run = buildStreakStory(4, 9, week);
  const one = buildStreakStory(1, 9, week);
  if (rec.kind === 'streak' && run.kind === 'streak' && one.kind === 'streak') {
    assert.match(rec.line, /longest/);
    assert.match(run.line, /4 days/);
    assert.match(one.line, /again/);
  }
});

test('card skins follow the chosen backdrop and stay readable', () => {
  const dark = skinFrom(findBackdrop('slate')!, MODERN_THEMES.high_energy);
  assert.equal(dark.bg, '#11151C');
  assert.equal(dark.accent, '#C8F135');
  const light = skinFrom(findBackdrop('cream')!, MODERN_THEMES.high_energy);
  assert.equal(light.light, true);
  assert.ok(contrast(light.accent, light.bg) >= 3);
  assert.ok(contrast(light.ink, light.bg) >= 7);
  assert.ok(contrast(DARK_SKIN.ink, DARK_SKIN.bg) >= 7);
});
