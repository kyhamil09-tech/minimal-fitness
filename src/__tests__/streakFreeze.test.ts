import test from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, longestStreak, setFrozenDays } from '../lib/calc';
import { addFreeze, freezeOffer, freezesLeft } from '../lib/streakFreeze';

const keys = (...k: string[]) => new Set(k);

test.afterEach(() => setFrozenDays([]));

test('a frozen day bridges a gap but is not counted', () => {
  const done = keys('2026-10-10', '2026-10-11', '2026-10-13', '2026-10-14');
  assert.equal(currentStreak(done, '2026-10-14'), 2);
  setFrozenDays(['2026-10-12']);
  assert.equal(currentStreak(done, '2026-10-14'), 4);
  assert.equal(longestStreak(done), 4);
});

test('today frozen keeps yesterday\'s streak running', () => {
  const done = keys('2026-10-10', '2026-10-11', '2026-10-12');
  assert.equal(currentStreak(done, '2026-10-13'), 3); // today still open: counts to yesterday
  setFrozenDays(['2026-10-13']);
  assert.equal(currentStreak(done, '2026-10-14'), 3); // today open again, yesterday is frozen
});

test('freezes: two a month', () => {
  assert.equal(freezesLeft([], '2026-10-14'), 2);
  assert.equal(freezesLeft(['2026-10-02'], '2026-10-14'), 1);
  assert.equal(freezesLeft(['2026-10-02', '2026-10-09'], '2026-10-14'), 0);
  assert.equal(freezesLeft(['2026-10-02', '2026-10-09'], '2026-11-01'), 2);
});

test('offer: today when a streak of 3 or more is at risk', () => {
  const done = keys('2026-10-11', '2026-10-12', '2026-10-13');
  const o = freezeOffer(done, [], '2026-10-14')!;
  assert.deepEqual([o.kind, o.key, o.streak, o.left], ['today', '2026-10-14', 3, 2]);
  assert.equal(freezeOffer(keys('2026-10-12', '2026-10-13'), [], '2026-10-14'), null); // too short
  assert.equal(freezeOffer(done, ['2026-10-01', '2026-10-02'], '2026-10-14'), null); // none left
  assert.equal(freezeOffer(keys('2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'), [], '2026-10-14'), null); // done today
});

test('offer: yesterday when it was missed after a streak', () => {
  const done = keys('2026-10-09', '2026-10-10', '2026-10-11'); // 12th and 13th missed? only the 13th (yesterday) is offered
  assert.equal(freezeOffer(done, [], '2026-10-14'), null); // two days gap: streak is gone
  const o = freezeOffer(keys('2026-10-10', '2026-10-11', '2026-10-12'), [], '2026-10-14')!;
  // yesterday (the 13th) missed, today open: both could be frozen, yesterday is the first one offered after today
  assert.ok(o.kind === 'today' || o.kind === 'yesterday');
  const only = freezeOffer(keys('2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14'), [], '2026-10-14')!;
  assert.deepEqual([only.kind, only.key], ['yesterday', '2026-10-13']);
});

test('adding a freeze keeps the list tidy', () => {
  assert.deepEqual(addFreeze(['2026-10-09'], '2026-10-02'), ['2026-10-02', '2026-10-09']);
  assert.deepEqual(addFreeze(['2026-10-09'], '2026-10-09'), ['2026-10-09']);
});
