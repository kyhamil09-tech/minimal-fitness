import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoachInput, buildCoachReport } from '../lib/weeklyCoach';
import { setWeekStartsOnSunday } from '../lib/dates';
import type { SleepLogEntry, WorkoutSession } from '../types/health';

const WEEK = '2026-09-28'; // a Monday; the week ends Sunday 2026-10-04
const at = (date: string, hour = 7) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
const day = (n: number) => {
  const d = new Date(`${WEEK}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const run = (date: string, id = date): WorkoutSession =>
  ({ id, type: 'Running', timestamp: '', startedAt: at(date), durationMinutes: 30, avgHeartRate: 0, caloriesBurned: 0 }) as WorkoutSession;
const night = (date: string, minutes: number, bedtime = '23:30'): SleepLogEntry =>
  ({ id: date, dateIso: date, displayDate: date, bedtime, wakeTime: '07:00', durationMinutes: minutes, qualityRating: 3, isManualEntry: true, deepSleepMinutes: 0, remSleepMinutes: 0, lightSleepMinutes: 0, awakeMinutes: 0, efficiencyScore: 80 }) as SleepLogEntry;

const base = (over: Partial<CoachInput> = {}): CoachInput => ({
  weekStart: WEEK,
  today: '2026-10-10', // the week is over
  workouts: [],
  sleepLogs: [],
  food: [],
  steps: {},
  goals: { weeklyWorkouts: 3, dailySteps: 8000, dailyCalories: 2000, dailyProteinG: 150 },
  plan: null,
  ...over,
});

test('a good week scores high, lists wins, and has nothing to fix', () => {
  setWeekStartsOnSunday(false);
  const steps: Record<string, number> = {};
  const sleepLogs: SleepLogEntry[] = [];
  const food = [];
  for (let i = 0; i < 7; i++) {
    steps[day(i)] = 9000;
    sleepLogs.push(night(day(i), 460));
    food.push({ date: day(i), calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 });
  }
  const r = buildCoachReport(base({ workouts: [run(day(0)), run(day(2)), run(day(4))], steps, sleepLogs, food, loadRatio: 1.0 }));
  assert.ok(r.score !== null && r.score >= 85, `score ${r.score}`);
  assert.equal(r.label, 'Excellent week');
  assert.ok(r.wins.length >= 2);
  assert.deepEqual(r.focus, ['Nothing stands out to fix. Repeat what worked this week.']);
  assert.equal(r.days, 7);
});

test('a thin week gets concrete next steps and a lower score', () => {
  const r = buildCoachReport(base({ workouts: [run(day(1))], sleepLogs: [night(day(0), 330), night(day(1), 340), night(day(2), 350), night(day(3), 345)] }));
  assert.ok(r.score !== null && r.score < 55, `score ${r.score}`);
  assert.ok(r.focus.some((f) => /goal of 3/.test(f)), r.focus.join(' | '));
  assert.ok(r.focus.some((f) => /sleep/i.test(f)));
  assert.ok(r.focus.length <= 3);
});

test('a load spike comes first, because it matters more than the rest', () => {
  const r = buildCoachReport(base({ workouts: [run(day(0)), run(day(1)), run(day(2))], loadRatio: 1.8 }));
  assert.match(r.focus[0], /1\.8 times your usual week/);
});

test('missed planned days are named, and the usual training days are suggested', () => {
  const plan = {
    startedAt: at(WEEK),
    plan: {
      id: 'p', name: 'P', description: '', weeks: 4, level: 'Beginner' as const,
      days: [
        { day: 0 as const, title: 'Lift A', kind: 'strength' as const },
        { day: 2 as const, title: 'Run', kind: 'cardio' as const },
        { day: 4 as const, title: 'Lift B', kind: 'strength' as const },
      ],
    },
  };
  // only Monday done; earlier weeks had Tuesday/Thursday sessions
  const earlier = [run('2026-09-22'), run('2026-09-24'), run('2026-09-15'), run('2026-09-17')];
  const r = buildCoachReport(base({ plan, workouts: [run(day(0)), ...earlier] }));
  const t = r.pillars.find((p) => p.id === 'training')!;
  assert.match(t.detail, /1 of 3 planned days done/);
  assert.ok(r.focus.some((f) => /missed 2 planned days \(Run, Lift B\)/.test(f)), r.focus.join(' | '));
  assert.ok(r.focus.some((f) => /Tuesday, Thursday/.test(f)), r.focus.join(' | '));
});

test('areas with no data are marked, not scored as zero', () => {
  const r = buildCoachReport(base({ workouts: [run(day(0)), run(day(2)), run(day(4))] }));
  assert.equal(r.pillars.find((p) => p.id === 'sleep')!.status, 'none');
  assert.equal(r.pillars.find((p) => p.id === 'nutrition')!.status, 'none');
  assert.equal(r.pillars.find((p) => p.id === 'steps')!.status, 'none');
  assert.ok(r.score !== null && r.score >= 85); // judged on what there is
});

test('too little data gives no overall score', () => {
  const r = buildCoachReport(base());
  assert.equal(r.score, null);
  assert.equal(r.label, 'Not enough data yet');
  assert.deepEqual(r.focus, []);
});

test('a week still in progress is reviewed over the days so far, and early days are not judged', () => {
  const early = buildCoachReport(base({ today: day(1) })); // Tuesday
  assert.equal(early.days, 2);
  assert.equal(early.pillars.find((p) => p.id === 'training')!.status, 'none');
  const mid = buildCoachReport(base({ today: day(3), workouts: [run(day(0)), run(day(2))] })); // Thursday: goal scales to 2
  assert.equal(mid.days, 4);
  assert.equal(mid.pillars.find((p) => p.id === 'training')!.score, 100);
});

test('low protein is called out with the numbers', () => {
  const food = [];
  for (let i = 0; i < 7; i++) food.push({ date: day(i), calories: 2000, proteinG: 90, carbsG: 250, fatG: 60 });
  const r = buildCoachReport(base({ workouts: [run(day(0)), run(day(2)), run(day(4))], food }));
  assert.ok(r.focus.some((f) => /Protein averaged 90 g against a goal of 150 g/.test(f)), r.focus.join(' | '));
});
