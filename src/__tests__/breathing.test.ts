import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, breathStats, calmSignals, circleScale, cycleSec, patternById, phaseAt } from '../lib/breathing';

const box = patternById('box');

test('every pattern has phases with positive lengths and a sensible cycle', () => {
  for (const p of PATTERNS) {
    assert.ok(p.phases.length >= 2, p.id);
    assert.ok(p.phases.every((ph) => ph.sec > 0), p.id);
    assert.ok(cycleSec(p) >= 6 && cycleSec(p) <= 20, p.id);
  }
  assert.equal(patternById('nope').id, PATTERNS[0].id);
});

test('phaseAt walks through a box breath and counts the breaths', () => {
  assert.equal(phaseAt(box, 0).kind, 'in');
  assert.equal(phaseAt(box, 0).left, 4);
  assert.equal(phaseAt(box, 3.5).left, 1);
  assert.equal(phaseAt(box, 4).kind, 'hold');
  assert.equal(phaseAt(box, 8).kind, 'out');
  assert.equal(phaseAt(box, 12).kind, 'hold');
  assert.equal(phaseAt(box, 15.9).cycle, 1);
  assert.equal(phaseAt(box, 16).cycle, 2);
  assert.equal(phaseAt(box, 16).kind, 'in');
  assert.equal(phaseAt(box, -5).kind, 'in', 'before the start is the start');
});

test('the circle grows on the way in, holds, shrinks on the way out, and a hold keeps the size it began with', () => {
  assert.ok(Math.abs(circleScale(box, 0) - 0.45) < 0.001);
  assert.ok(circleScale(box, 2) > circleScale(box, 1));
  assert.ok(Math.abs(circleScale(box, 4) - 1) < 0.001);
  assert.equal(circleScale(box, 6), 1, 'hold after breathing in stays full');
  assert.ok(circleScale(box, 10) < circleScale(box, 8));
  assert.equal(circleScale(box, 14), 0.45, 'hold after breathing out stays small');
  for (const p of PATTERNS) for (let t = 0; t < cycleSec(p) * 2; t += 0.25) {
    const s = circleScale(p, t);
    assert.ok(s >= 0.45 - 1e-9 && s <= 1 + 1e-9, `${p.id} ${t}: ${s}`);
  }
});

test('the double-breath sigh tops up from partly full to full before the long breath out', () => {
  const sigh = patternById('sigh');
  const afterIn = circleScale(sigh, 2);
  assert.ok(afterIn > 0.75 && afterIn < 0.85);
  assert.equal(phaseAt(sigh, 2.2).kind, 'topup');
  assert.ok(Math.abs(circleScale(sigh, 3) - 1) < 0.001);
  assert.equal(phaseAt(sigh, 3.5).kind, 'out');
});

const DAY = 24 * 3600 * 1000;
const noon = new Date(2026, 9, 12, 12, 0, 0).getTime();
const s = (daysAgo: number, seconds = 180) => ({ id: `s${daysAgo}`, at: noon - daysAgo * DAY, patternId: 'calm', seconds });

test('streaks count days in a row and survive until the end of today', () => {
  assert.equal(breathStats([], noon).streakDays, 0);
  assert.equal(breathStats([s(0), s(1), s(2)], noon).streakDays, 3);
  assert.equal(breathStats([s(1), s(2)], noon).streakDays, 2, 'yesterday still counts');
  assert.equal(breathStats([s(0), s(2)], noon).streakDays, 1, 'a missed day ends it');
  assert.equal(breathStats([s(3)], noon).streakDays, 0);
});

test('the week totals only include the last seven days', () => {
  const st = breathStats([s(0, 300), s(6, 180), s(9, 600)], noon);
  assert.equal(st.weekSessions, 2);
  assert.equal(st.weekMinutes, 8);
  assert.equal(st.totalSessions, 3);
});

test('calm signals compare today with your usual and need a few days of data', () => {
  assert.deepEqual(calmSignals(undefined), []);
  assert.deepEqual(calmSignals({ '2026-10-10': { restingHr: 55 }, '2026-10-11': { restingHr: 56 } }), []);
  const days: Record<string, { restingHr?: number; hrvMs?: number }> = {};
  for (let i = 1; i <= 10; i++) days[`2026-10-${String(i).padStart(2, '0')}`] = { restingHr: 56, hrvMs: 50 };
  days['2026-10-11'] = { restingHr: 63, hrvMs: 38 };
  const sig = calmSignals(days);
  assert.equal(sig.find((x) => x.label === 'Resting heart rate')?.trend, 'worse');
  assert.equal(sig.find((x) => x.label === 'Heart-rate variability')?.trend, 'worse');
  days['2026-10-11'] = { restingHr: 52, hrvMs: 60 };
  const better = calmSignals(days);
  assert.equal(better.find((x) => x.label === 'Resting heart rate')?.trend, 'better');
  assert.equal(better.find((x) => x.label === 'Heart-rate variability')?.trend, 'better');
});
