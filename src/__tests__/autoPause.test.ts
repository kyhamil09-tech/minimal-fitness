import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoPauseAction, AutoPauseDetector, isWalkLike } from '../lib/autoPause';

const T0 = 1_700_000_000_000;
const at = (s: number) => T0 + s * 1000;
const make = (over: Partial<{ enabled: boolean; walkLike: boolean }> = {}) => new AutoPauseDetector({ enabled: true, walkLike: false, beganAt: T0, ...over });

/** One speed reading a second from `from` to `to`; the second of the first `want` action, or -1. */
const feed = (d: AutoPauseDetector, from: number, to: number, speed: number | null, want: AutoPauseAction) => {
  for (let s = from; s <= to; s++) if (d.onSpeed(at(s), speed) === want) return s;
  return -1;
};

test('pauses after six seconds standing still, counted from the first slow reading', () => {
  const d = make();
  assert.equal(feed(d, 0, 30, 2.5, 'pause'), -1);
  assert.equal(feed(d, 31, 60, 0, 'pause'), 37);
  assert.equal(d.isAutoPaused, true);
});

test('a stop shorter than six seconds does not pause', () => {
  const d = make();
  feed(d, 0, 30, 2.5, 'pause');
  assert.equal(feed(d, 31, 35, 0, 'pause'), -1);
  assert.equal(feed(d, 36, 60, 2.5, 'pause'), -1);
  assert.equal(d.isAutoPaused, false);
});

test('resumes after two seconds of real movement, not after shuffling about', () => {
  const d = make();
  feed(d, 0, 20, 2.5, 'pause');
  assert.equal(feed(d, 21, 40, 0, 'pause'), 27);
  assert.equal(feed(d, 28, 40, 0.5, 'resume'), -1);
  assert.equal(feed(d, 41, 50, 2, 'resume'), 43);
  assert.equal(d.isAutoPaused, false);
});

test('a walker resumes at a slower speed than a runner', () => {
  const walker = make({ walkLike: true });
  const runner = make({ walkLike: false });
  for (const d of [walker, runner]) {
    feed(d, 0, 20, 1.5, 'pause');
    feed(d, 21, 40, 0, 'pause');
    assert.equal(d.isAutoPaused, true);
  }
  assert.ok(feed(walker, 41, 50, 1.1, 'resume') > 0);
  assert.equal(feed(runner, 41, 50, 1.1, 'resume'), -1);
  assert.equal(isWalkLike('Walking'), true);
  assert.equal(isWalkLike('Hiking'), true);
  assert.equal(isWalkLike('Running'), false);
});

test('does not pause while the first position settles, or when switched off', () => {
  assert.equal(feed(make(), 0, 9, 0, 'pause'), -1);
  assert.equal(feed(make({ enabled: false }), 0, 120, 0, 'pause'), -1);
});

test('a manual pause is left alone and a manual resume starts over', () => {
  const d = make();
  feed(d, 0, 20, 2.5, 'pause');
  d.setManualPaused(true);
  assert.equal(feed(d, 21, 60, 0, 'pause'), -1);
  assert.equal(feed(d, 61, 80, 2.5, 'resume'), -1);
  d.setManualPaused(false);
  assert.equal(feed(d, 81, 100, 0, 'pause'), 87);
});

test('an unknown speed changes nothing', () => {
  const d = make();
  feed(d, 0, 20, 2.5, 'pause');
  assert.equal(feed(d, 21, 60, null, 'pause'), -1);
  assert.equal(d.isAutoPaused, false);
});

const METER = 1 / 111_195;

test('position wobble inside the accuracy circle counts as standing still', () => {
  const d = make();
  let pausedAt = -1;
  for (let s = 0; s <= 40 && pausedAt < 0; s++) {
    const wobble = ((s % 4) - 1.5) * 2.5 * METER;
    if (d.onFix(at(s), 52 + wobble, 4 + wobble, 8, null) === 'pause') pausedAt = s;
  }
  assert.ok(pausedAt > 0 && pausedAt <= 25, `paused at ${pausedAt}`);
});

test('a steady walk with no receiver speed does not pause', () => {
  const d = make({ walkLike: true });
  for (let s = 0; s <= 120; s++) assert.equal(d.onFix(at(s), 52 + 1.3 * s * METER, 4, 6, null), null);
  assert.equal(d.isAutoPaused, false);
});
