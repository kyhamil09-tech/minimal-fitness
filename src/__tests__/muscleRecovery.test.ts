import test from 'node:test';
import assert from 'node:assert/strict';
import { bestSplit, computeRecovery, stateOf, strainFor } from '../lib/muscleRecovery';
import type { WorkoutSession } from '../types/health';

const NOW = Date.UTC(2026, 10, 30, 12, 0, 0);
const H = 3_600_000;

const session = (hoursAgo: number, exerciseId: string, sets: number, rpe?: number): WorkoutSession =>
  ({
    id: `w-${hoursAgo}-${exerciseId}`,
    type: 'Strength',
    timestamp: '',
    startedAt: NOW - hoursAgo * H - 3_600_000,
    durationMinutes: 60,
    durationSec: 3600,
    exercises: [{ exerciseId, name: exerciseId, sets: Array.from({ length: sets }, () => ({ reps: 8, weightKg: 60, done: true, ...(rpe ? { rpe } : {}) })) }],
  }) as unknown as WorkoutSession;

const score = (rec: ReturnType<typeof computeRecovery>, g: string) => rec.find((r) => r.group === g)!.score;

test('nothing lifted means everything is fresh and nothing is suggested', () => {
  const rec = computeRecovery([], NOW);
  assert.ok(rec.every((r) => r.score === 100 && r.sets === 0));
  assert.equal(bestSplit(rec), null);
});

test('a hard session just finished leaves that group low and the others fresh', () => {
  const rec = computeRecovery([session(0, 'squat', 10, 9)], NOW);
  assert.ok(score(rec, 'Legs') < 15, String(score(rec, 'Legs')));
  assert.equal(score(rec, 'Chest'), 100);
  assert.equal(stateOf(score(rec, 'Legs')), 'rest');
});

test('recovery comes back over time, faster for small muscles than big ones', () => {
  const day = computeRecovery([session(24, 'squat', 10, 8), session(24, 'bench-press', 10, 8)], NOW);
  const twoDays = computeRecovery([session(48, 'squat', 10, 8), session(48, 'bench-press', 10, 8)], NOW);
  assert.ok(score(twoDays, 'Legs') > score(day, 'Legs'));
  assert.ok(score(twoDays, 'Legs') < 100);
  const arms = computeRecovery([session(30, 'db-curl', 10, 8)], NOW);
  const legs = computeRecovery([session(30, 'squat', 10, 8)], NOW);
  assert.ok(score(arms, 'Arms') > score(legs, 'Legs'), 'arms recover faster than legs');
  assert.equal(computeRecovery([session(130, 'squat', 10, 8)], NOW).find((r) => r.group === 'Legs')!.sets, 0, 'older than five days is ignored');
});

test('harder sets cost more, and the best split is the freshest', () => {
  assert.ok(strainFor(10) > strainFor(8) && strainFor(8) > strainFor(6));
  assert.equal(strainFor(undefined), strainFor(8));
  const rec = computeRecovery([session(10, 'squat', 12, 9), session(10, 'bench-press', 6, 8)], NOW);
  const best = bestSplit(rec)!;
  assert.equal(best.split, 'pull');
});
