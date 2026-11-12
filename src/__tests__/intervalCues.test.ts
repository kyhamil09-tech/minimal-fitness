import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RUN_WALK,
  FRESH_CUES,
  buildRunWalk,
  clampRunWalk,
  plannedSeconds,
  spokenSeconds,
  spokenStep,
  stepCue,
  warnText,
} from '../data/intervals';

test('a run/walk you set up alternates run and walk for the rounds you chose, ending on a run', () => {
  const steps = buildRunWalk({ rounds: 3, runSec: 90, walkSec: 45, warmupMin: 2, cooldownMin: 3 });
  assert.deepEqual(
    steps.map((s) => [s.label, s.durationSec]),
    [['Brisk walk', 120], ['Run', 90], ['Walk', 45], ['Run', 90], ['Walk', 45], ['Run', 90], ['Cool down', 180]]
  );
  assert.equal(plannedSeconds(steps), 120 + 3 * 90 + 2 * 45 + 180);
});

test('no warm-up or cool-down means none is added', () => {
  const steps = buildRunWalk({ rounds: 2, runSec: 30, walkSec: 30, warmupMin: 0, cooldownMin: 0 });
  assert.deepEqual(steps.map((s) => s.label), ['Run', 'Walk', 'Run']);
});

test('odd values are kept inside the limits', () => {
  const c = clampRunWalk({ rounds: 999, runSec: 1, walkSec: Number.NaN, warmupMin: -4, cooldownMin: 100 });
  assert.equal(c.rounds, 40);
  assert.equal(c.runSec, 5);
  assert.equal(c.walkSec, DEFAULT_RUN_WALK.walkSec);
  assert.equal(c.warmupMin, 0);
  assert.equal(c.cooldownMin, 30);
  assert.deepEqual(clampRunWalk(undefined), DEFAULT_RUN_WALK);
});

test('steps are spoken as plain commands', () => {
  assert.equal(spokenStep({ kind: 'work', label: 'Run', durationSec: 60 }, false), 'Run for 1 minute.');
  assert.equal(spokenStep({ kind: 'recover', label: 'Walk', durationSec: 90 }, false), 'Walk for 1 minute 30 seconds.');
  assert.equal(spokenStep({ kind: 'work', label: 'Interval 2 of 8', distanceKm: 0.4 }, false), 'Interval 2 of 8. 400 meters.');
  assert.equal(spokenSeconds(45), '45 seconds');
  assert.equal(warnText({ kind: 'recover', label: 'Walk', durationSec: 120 }, 10), 'Walk in 10 seconds.');
});

test('a 60 second step warns at 10 seconds left, then counts 3, 2, 1, each once', () => {
  let st = FRESH_CUES;
  const cues: string[] = [];
  for (let left = 60; left >= 1; left--) {
    const d = stepCue(left, 60, 10, true, st);
    st = d.state;
    if (d.cue === 'warn') cues.push(`warn@${left}`);
    if (d.cue === 'count') cues.push(`count${d.count}`);
    // the same second asked again gives nothing new
    assert.equal(stepCue(left, 60, 10, true, st).cue, null);
  }
  assert.deepEqual(cues, ['warn@10', 'count3', 'count2', 'count1']);
});

test('the warning can be turned off, the countdown too, and short steps are left alone', () => {
  assert.equal(stepCue(10, 60, 0, true, FRESH_CUES).cue, null);
  assert.equal(stepCue(3, 60, 0, false, FRESH_CUES).cue, null);
  assert.equal(stepCue(8, 12, 10, true, FRESH_CUES).cue, null);
  assert.equal(stepCue(2, 5, 10, true, FRESH_CUES).cue, null);
  // a 20 second step still gets its warning
  assert.equal(stepCue(10, 20, 10, true, FRESH_CUES).cue, 'warn');
});
test('run and walk times step by amounts that suit their length and stay in range', async () => {
  const { nudgeSec, clockSec, stepForSec, totalMinutes } = await import('../components/RunWalkBuilder');
  const lim = [5, 1800] as const;
  assert.equal(nudgeSec(60, 1, lim), 65);
  assert.equal(nudgeSec(60, -1, lim), 55);
  assert.equal(nudgeSec(120, 1, lim), 125);
  assert.equal(nudgeSec(125, -1, lim), 120);
  assert.equal(nudgeSec(300, 1, lim), 315);
  assert.equal(nudgeSec(5, -1, lim), 5);
  assert.equal(nudgeSec(1800, 1, lim), 1800);
  assert.equal(stepForSec(900), 60);
  assert.equal(clockSec(90), '1:30');
  assert.equal(clockSec(5), '0:05');
  assert.equal(totalMinutes({ rounds: 8, runSec: 60, walkSec: 120, warmupMin: 5, cooldownMin: 5 }), 5 + 8 + 14 + 5);
});

test('a workout reads as a short outline, with repeated efforts and rests gathered into one line', async () => {
  const { summarizeSteps, INTERVAL_WORKOUTS, shortTime } = await import('../data/intervals');
  const runWalk = INTERVAL_WORKOUTS.find((w) => w.id === 'run-walk')!;
  assert.deepEqual(
    summarizeSteps(runWalk.steps).map((l) => l.text),
    ['Brisk walk 5 min', '8 × Run 1 min, Walk 2 min', 'Cool down 5 min']
  );
  const track = INTERVAL_WORKOUTS.find((w) => w.id === '8x400')!;
  assert.deepEqual(summarizeSteps(track.steps).map((l) => l.text), ['Warm up 10 min', '8 × Effort 400 m, Recover 1 min 30 s', 'Cool down 8 min']);
  assert.equal(summarizeSteps(track.steps, true)[1].text, '8 × Effort 0.25 mi, Recover 1 min 30 s');
  // a pyramid has different lengths, so every step stays on its own line
  const pyramid = INTERVAL_WORKOUTS.find((w) => w.id === 'pyramid')!;
  assert.ok(summarizeSteps(pyramid.steps).length > 5);
  assert.equal(shortTime(150), '2 min 30 s');
  assert.equal(shortTime(45), '45 s');
});

test('the outline of every preset adds up to the same planned time as its steps', async () => {
  const { summarizeSteps, INTERVAL_WORKOUTS, plannedSeconds } = await import('../data/intervals');
  for (const w of INTERVAL_WORKOUTS) {
    assert.equal(summarizeSteps(w.steps).reduce((a, l) => a + l.seconds, 0), plannedSeconds(w.steps), w.id);
  }
});
