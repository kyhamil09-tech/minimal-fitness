import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RACE_INFO, buildRacePlan, planDaysForWeek } from '../lib/planBuilder';
import { INTERVAL_WORKOUTS } from '../data/intervals';

test('every week has seven days and the last Sunday is race day', () => {
  for (const goal of ['5k', '10k', 'half'] as const) {
    for (const level of ['Beginner', 'Intermediate', 'Advanced'] as const) {
      for (const daysPerWeek of [3, 4, 5] as const) {
        const plan = buildRacePlan({ goal, level, daysPerWeek, weeks: 12 });
        assert.equal(plan.weekly?.length, plan.weeks);
        for (const wk of plan.weekly ?? []) {
          assert.equal(wk.length, 7);
          assert.deepEqual(wk.map((d) => d.day), [0, 1, 2, 3, 4, 5, 6]);
          assert.equal(wk.filter((d) => d.kind === 'cardio').length, daysPerWeek);
        }
        const race = plan.weekly![plan.weeks - 1][6];
        assert.ok(race.title.startsWith('Race day'));
        assert.ok(Math.abs((race.targetKm ?? 0) - RACE_INFO[goal].km) < 0.1);
      }
    }
  }
});

test('long runs build toward the peak, with a lighter week and a taper', () => {
  const plan = buildRacePlan({ goal: '10k', level: 'Intermediate', daysPerWeek: 4, weeks: 12 });
  const long = plan.weekly!.map((wk) => wk[6].targetKm ?? 0);
  assert.ok(long[2] > long[0], 'grows');
  assert.ok(long[3] < long[2], 'week 4 is a cutback');
  assert.ok(long[long.length - 1] <= 10.1, 'race week ends at the race distance');
  assert.ok(long[long.length - 2] < long[long.length - 3] || long[long.length - 2] <= Math.max(...long), 'taper does not exceed the peak');
});

test('quality days reference real interval workouts', () => {
  const ids = new Set(INTERVAL_WORKOUTS.map((w) => w.id));
  const plan = buildRacePlan({ goal: 'half', level: 'Advanced', daysPerWeek: 5, weeks: 14 });
  for (const wk of plan.weekly!) for (const d of wk) if (d.intervalId) assert.ok(ids.has(d.intervalId), d.intervalId);
});

test('weeks are clamped and planDaysForWeek stays in range', () => {
  const short = buildRacePlan({ goal: '5k', level: 'Beginner', daysPerWeek: 3, weeks: 2 });
  assert.equal(short.weeks, RACE_INFO['5k'].minWeeks);
  assert.equal(planDaysForWeek(short, 0).length, 7);
  assert.equal(planDaysForWeek(short, 99), short.weekly![short.weeks - 1]);
});

test('beginners start with run / walk', () => {
  const plan = buildRacePlan({ goal: '5k', level: 'Beginner', daysPerWeek: 3, weeks: 8 });
  assert.equal(plan.weekly![0].find((d) => d.intervalId === 'run-walk')?.day, 1);
});
