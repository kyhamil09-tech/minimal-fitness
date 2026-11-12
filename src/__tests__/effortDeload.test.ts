import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutSession } from '../types/health';
import { SetLog } from '../types/tracking';
import { e1rmFromEffort, effortNudge, nextSetWeightKg } from '../lib/effort';
import { DEFAULT_DELOAD, deloadActive, deloadAdvice, deloadSets, deloadWeightKg, dippingLifts, hardWeeksInARow, showDeloadSuggestion, snoozeDeload, startDeload, weekLoads } from '../lib/deload';

const set = (weightKg: number, reps: number, rpe?: number): SetLog => ({ weightKg, reps, done: true, ...(rpe !== undefined ? { rpe } : {}) });

test('the next set from the effort of the last one: harder than target means lighter, easier means heavier', () => {
  // 100 x 5 at RPE 10 is a one-rep max of about 86 percent => 116 kg.
  const e1 = e1rmFromEffort(set(100, 5, 10))!;
  assert.ok(e1 > 115 && e1 < 117.5);
  const lighter = nextSetWeightKg(set(100, 5, 10), 8, 2.5)!;
  assert.ok(lighter < 100 && lighter >= 90, `${lighter}`);
  const heavier = nextSetWeightKg(set(100, 5, 7), 8, 2.5)!;
  assert.ok(heavier > 100 && heavier <= 107.5, `${heavier}`);
  assert.equal(nextSetWeightKg(set(100, 5, 8), 8, 2.5), null);
  assert.equal(nextSetWeightKg(set(100, 5), 8), null);
  assert.equal(nextSetWeightKg(set(100, 15, 9), 8), null);
  assert.equal(nextSetWeightKg(set(0, 5, 9), 8), null);
});

test('the weights come out in whole steps', () => {
  const n = nextSetWeightKg(set(103, 6, 9.5), 8, 2.5)!;
  assert.equal(n % 2.5, 0);
  assert.equal(nextSetWeightKg(set(100, 5, 10), 8, 5)! % 5, 0);
});

test('last session felt easy or hard: a full point from the target either way, and it needs two rated sets', () => {
  assert.equal(effortNudge([set(100, 5, 7), set(100, 5, 6.5), set(100, 5, 7)], 8)?.dir, 'up');
  assert.equal(effortNudge([set(100, 5, 9), set(100, 5, 9.5)], 8)?.dir, 'down');
  assert.equal(effortNudge([set(100, 5, 8), set(100, 5, 8.5)], 8)?.dir, 'same');
  assert.equal(effortNudge([set(100, 5, 7)], 8), null);
  assert.equal(effortNudge([{ ...set(60, 8, 6), kind: 'warmup' }, { ...set(60, 8, 6), kind: 'warmup' }], 8), null);
  assert.equal(effortNudge(undefined, 8), null);
});

const DAY = 86_400_000;
// A Wednesday noon, so "this week" has Monday and Tuesday behind it.
const NOW = new Date('2026-10-21T12:00:00').getTime();
const session = (daysAgo: number, lifts: Record<string, SetLog[]>): WorkoutSession => ({
  id: `w${daysAgo}-${Object.keys(lifts).join('')}`,
  type: 'Strength',
  timestamp: new Date(NOW - daysAgo * DAY).toISOString(),
  startedAt: NOW - daysAgo * DAY,
  durationMinutes: 60,
  avgHeartRate: 0,
  caloriesBurned: 0,
  exercises: Object.entries(lifts).map(([exerciseId, sets]) => ({ exerciseId, name: exerciseId, sets })),
} as WorkoutSession);

test('weeks of lifting are counted from Monday, newest first', () => {
  const ws = [session(0, { squat: [set(100, 5)] }), session(1, { squat: [set(100, 5)] }), session(9, { squat: [set(100, 5)] })];
  const l = weekLoads(ws, NOW, 3);
  assert.equal(l.length, 3);
  assert.equal(l[0].sessions, 2);
  assert.equal(l[1].sessions, 1);
  assert.equal(l[0].volumeKg, 1000);
});

test('hard weeks in a row stop at the first lighter week, and an empty current week is not counted against you', () => {
  const mk = (s: number[]) => s.map((sessions, i) => ({ week: String(i), sessions, volumeKg: 0, avgRpe: null, rated: 0 }));
  assert.equal(hardWeeksInARow(mk([2, 3, 2, 1, 4])), 3);
  assert.equal(hardWeeksInARow(mk([0, 2, 2, 2, 0, 3])), 3);
  assert.equal(hardWeeksInARow(mk([1, 3, 3])), 0);
});

test('a lift that slipped over two sessions is named, and one with too few sessions is left alone', () => {
  const days = [28, 21, 14, 7, 0];
  const e = [100, 100, 100, 92, 90];
  const ws = days.map((d, i) => session(d, { squat: [set(e[i], 1)] }));
  assert.deepEqual(dippingLifts(ws, NOW), ['Squat']);
  assert.deepEqual(dippingLifts(ws.slice(0, 4), NOW), []);
});

test('a long hard run plus slipping lifts suggests a deload; one sign only means watch', () => {
  const ws: WorkoutSession[] = [];
  for (let w = 0; w < 6; w++) {
    ws.push(session(w * 7 + 1, { squat: [set(w < 2 ? 90 : 100, 1)] }));
    ws.push(session(w * 7 + 2, { 'bench-press': [set(80, 1)] }));
  }
  const a = deloadAdvice(ws, NOW);
  assert.equal(a.weeksOn >= 5, true);
  assert.equal(a.verdict, 'deload');
  assert.ok(a.reasons.length >= 2);
  const few = deloadAdvice([session(1, { squat: [set(100, 5)] }), session(3, { squat: [set(100, 5)] })], NOW);
  assert.equal(few.verdict, 'ok');
  const only = [] as WorkoutSession[];
  for (let w = 0; w < 5; w++) { only.push(session(w * 7 + 1, { squat: [set(100, 1)] })); only.push(session(w * 7 + 2, { squat: [set(100, 1)] })); }
  assert.equal(deloadAdvice(only, NOW).verdict, 'watch');
});

test('high effort that keeps climbing counts as a sign', () => {
  const ws: WorkoutSession[] = [];
  for (let w = 0; w < 6; w++) {
    const rpe = w < 2 ? 9.5 : 7.5;
    ws.push(session(w * 7 + 1, { squat: [set(100, 5, rpe), set(100, 5, rpe), set(100, 5, rpe)], 'bench-press': [set(80, 5, rpe), set(80, 5, rpe), set(80, 5, rpe)] }));
  }
  const a = deloadAdvice(ws, NOW);
  assert.ok(a.reasons.some((r) => /harder/.test(r)), a.reasons.join('|'));
});

test('the deload week: lighter, half the sets, a seven day window, and a snooze that hides the suggestion', () => {
  assert.equal(deloadWeightKg(100), 90);
  assert.equal(deloadWeightKg(62.5), 56.5);
  assert.deepEqual([deloadSets(1), deloadSets(3), deloadSets(4), deloadSets(5)], [1, 2, 2, 3]);
  const on = startDeload(NOW);
  assert.equal(deloadActive(on, NOW + 6 * DAY), true);
  assert.equal(deloadActive(on, NOW + 8 * DAY), false);
  const advice = { verdict: 'deload' as const, reasons: ['x'], weeksOn: 6 };
  assert.equal(showDeloadSuggestion(advice, DEFAULT_DELOAD, NOW), true);
  assert.equal(showDeloadSuggestion(advice, snoozeDeload(NOW), NOW + DAY), false);
  assert.equal(showDeloadSuggestion(advice, snoozeDeload(NOW), NOW + 8 * DAY), true);
  assert.equal(showDeloadSuggestion(advice, on, NOW + DAY), false);
  assert.equal(showDeloadSuggestion({ ...advice, verdict: 'watch' }, DEFAULT_DELOAD, NOW), false);
});
