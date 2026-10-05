import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutSession } from '../types/health';
import { Routine } from '../types/tracking';
import {
  StrengthItem,
  applyStrengthCommand,
  buildWatchRoutines,
  buildWatchStrength,
  currentSetIndex,
  resolveWatchRoutine,
  watchRoutinesJson,
} from '../lib/watchStrength';
import { GEAR_INFO, SPLIT_INFO, buildLiftingPlan, clampDays, designFromPlan, planFromDesign, sessionExercises } from '../lib/liftingPlan';
import { getExercise } from '../data/exercises';
import { buildWatchGear } from '../lib/watchGear';
import { NO_GEAR, Shoe, defaultShoe } from '../lib/shoes';
import { watchWorkoutToSession } from '../lib/watchImport';
import { DEFAULT_PROFILE } from '../data/defaults';

const item = (id: string, name: string, rows: [string, string, boolean][]): StrengthItem => ({
  exerciseId: id,
  name,
  rows: rows.map(([reps, weight, done]) => ({ reps, weight, done })),
});

const session = (): { items: StrengthItem[]; cursor: number } => ({
  items: [
    item('bench-press', 'Barbell Bench Press', [['8', '60', false], ['8', '60', false], ['8', '60', false]]),
    item('db-row', 'One-Arm Dumbbell Row', [['10', '20', false], ['10', '20', false]]),
  ],
  cursor: 0,
});

test('the set on show is the first one not ticked off', () => {
  assert.equal(currentSetIndex([{ reps: '8', weight: '', done: true }, { reps: '8', weight: '', done: false }]), 1);
  assert.equal(currentSetIndex([{ reps: '8', weight: '', done: true }, { reps: '8', weight: '', done: true }]), 1);
  assert.equal(currentSetIndex([]), 0);
});

test('done ticks the set, starts a rest, and moves on when an exercise is finished', () => {
  let s = session();
  let r = applyStrengthCommand(s, { action: 'done' }, 'metric');
  assert.deepEqual(r.rest, { kind: 'start' });
  assert.equal(r.state.items[0].rows[0].done, true);
  assert.equal(r.state.cursor, 0);
  s = r.state;
  s = applyStrengthCommand(s, { action: 'done' }, 'metric').state;
  r = applyStrengthCommand(s, { action: 'done' }, 'metric');
  assert.equal(r.state.items[0].rows.every((x) => x.done), true);
  assert.equal(r.state.cursor, 1, 'the watch moves to the next exercise once this one is complete');
  // Undoing a tick gives no rest.
  const undone = applyStrengthCommand({ items: r.state.items, cursor: 0 }, { action: 'done' }, 'metric');
  assert.deepEqual(undone.rest, { kind: 'skip' });
  assert.equal(undone.state.items[0].rows[2].done, false);
});

test('reps and weight change the set on show, by one rep and by the equipment step, and never go below their floor', () => {
  let s = session();
  s = applyStrengthCommand(s, { action: 'reps', delta: 1 }, 'metric').state;
  assert.equal(s.items[0].rows[0].reps, '9');
  s = applyStrengthCommand(s, { action: 'weight', delta: 1 }, 'metric').state;
  assert.equal(s.items[0].rows[0].weight, '62.5', 'a barbell steps by 2.5 kg');
  s = applyStrengthCommand(s, { action: 'weight', delta: -30 }, 'metric').state;
  assert.equal(s.items[0].rows[0].weight, '0');
  for (let i = 0; i < 20; i++) s = applyStrengthCommand(s, { action: 'reps', delta: -1 }, 'metric').state;
  assert.equal(s.items[0].rows[0].reps, '1');
  // Dumbbells step by 2 kg; in pounds a step is 5.
  const db = applyStrengthCommand({ ...session(), cursor: 1 }, { action: 'weight', delta: 1 }, 'metric').state;
  assert.equal(db.items[1].rows[0].weight, '22');
  const lb = applyStrengthCommand({ ...session(), cursor: 1 }, { action: 'weight', delta: 1 }, 'imperial').state;
  assert.equal(lb.items[1].rows[0].weight, '25');
});

test('sets can be added and taken away, and exercises jumped between', () => {
  let s = session();
  s = applyStrengthCommand(s, { action: 'addset' }, 'metric').state;
  assert.equal(s.items[0].rows.length, 4);
  assert.deepEqual(s.items[0].rows[3], { reps: '8', weight: '60', done: false });
  s = applyStrengthCommand(s, { action: 'delset' }, 'metric').state;
  s = applyStrengthCommand(s, { action: 'delset' }, 'metric').state;
  assert.equal(s.items[0].rows.length, 2);
  // A single set is never removed.
  let one = { items: [item('squat', 'Back Squat', [['5', '100', false]])], cursor: 0 };
  one = applyStrengthCommand(one, { action: 'delset' }, 'metric').state;
  assert.equal(one.items[0].rows.length, 1);
  assert.equal(applyStrengthCommand(s, { action: 'next' }, 'metric').state.cursor, 1);
  assert.equal(applyStrengthCommand({ ...s, cursor: 1 }, { action: 'next' }, 'metric').state.cursor, 1, 'stays on the last exercise');
  assert.equal(applyStrengthCommand({ ...s, cursor: 1 }, { action: 'prev' }, 'metric').state.cursor, 0);
  assert.equal(applyStrengthCommand(s, { action: 'jump', index: 1 }, 'metric').state.cursor, 1);
  assert.equal(applyStrengthCommand(s, { action: 'jump', index: 99 }, 'metric').state.cursor, 1);
});

test('rest commands adjust or skip the rest', () => {
  const s = session();
  assert.deepEqual(applyStrengthCommand(s, { action: 'skiprest' }, 'metric').rest, { kind: 'skip' });
  assert.deepEqual(applyStrengthCommand(s, { action: 'rest', delta: 15 }, 'metric').rest, { kind: 'adjust', seconds: 15 });
  assert.equal(applyStrengthCommand({ items: [], cursor: 0 }, { action: 'done' }, 'metric').state.items.length, 0);
});

test('the picture sent to the watch describes the set on show', () => {
  const s = session();
  s.items[0].rows[0].done = true;
  const w = buildWatchStrength(s, { units: 'metric', restEndsAt: 123456, restLen: 90, volume: '480 kg' })!;
  assert.equal(w.name, 'Barbell Bench Press');
  assert.equal(w.setIdx, 1);
  assert.equal(w.setCount, 3);
  assert.equal(w.reps, 8);
  assert.equal(w.weight, 60);
  assert.equal(w.unit, 'kg');
  assert.equal(w.step, 2.5);
  assert.equal(w.done, false);
  assert.equal(w.next, 'One-Arm Dumbbell Row');
  assert.equal(w.doneSets, 1);
  assert.equal(w.restEndsAt, 123456);
  assert.deepEqual(w.exercises[0], { n: 'Barbell Bench Press', done: 1, total: 3 });
  assert.equal(buildWatchStrength({ items: [], cursor: 0 }, { units: 'metric', restEndsAt: 0, restLen: 90, volume: '' }), null);
  assert.equal(buildWatchStrength({ ...s, cursor: 1 }, { units: 'imperial', restEndsAt: 0, restLen: 90, volume: '' })!.unit, 'lb');
});

test('the watch is offered today, your routines and the templates, and a pick resolves on the phone', () => {
  const routines: Routine[] = [{ id: 'r1', name: 'My chest day', exerciseIds: ['bench-press', 'db-fly', 'nope'] }];
  const list = buildWatchRoutines({ routines, activePlan: null });
  assert.equal(list[0].id, 'r:r1');
  assert.deepEqual(list[0].ids, ['bench-press', 'db-fly'], 'unknown exercises are dropped');
  assert.ok(list.some((r) => r.id === 't:push'));
  assert.ok(list.length <= 14);
  const json = JSON.parse(watchRoutinesJson(list));
  assert.deepEqual(Object.keys(json[0]).sort(), ['id', 'name', 'sub']);
  assert.equal(resolveWatchRoutine('t:push', list)?.name, 'Push day');
  assert.equal(resolveWatchRoutine('t:nope', list), null);
});

test('an active plan puts its strength day first on the watch', () => {
  const plan = buildLiftingPlan({ split: 'ppl', daysPerWeek: 3, goal: 'muscle', gear: 'gym', level: 'Intermediate', weeks: 8 }, 0);
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const list = buildWatchRoutines({ routines: [], activePlan: { planId: plan.id, startedAt: monday.getTime(), plan }, now: monday.getTime() });
  assert.ok(list[0].id.startsWith('plan:'));
  assert.match(list[0].name, /^Today: /);
});

test('every split builds a full week of real exercises for every kind of equipment', () => {
  for (const split of Object.keys(SPLIT_INFO) as (keyof typeof SPLIT_INFO)[]) {
    for (const gear of Object.keys(GEAR_INFO) as (keyof typeof GEAR_INFO)[]) {
      for (const goal of ['strength', 'muscle', 'general'] as const) {
        for (let days = SPLIT_INFO[split].minDays; days <= SPLIT_INFO[split].maxDays; days++) {
          const plan = buildLiftingPlan({ split, daysPerWeek: days, goal, gear, level: 'Intermediate', weeks: 8 }, 1);
          const lifting = plan.days.filter((d) => d.kind === 'strength');
          assert.equal(lifting.length, days, `${split} ${gear} ${goal} ${days}`);
          assert.equal(plan.days.length, 7);
          assert.equal(plan.weekly?.length, 8);
          for (const d of lifting) {
            assert.ok((d.exerciseIds?.length ?? 0) >= 4, `${split}/${gear}/${goal}: ${d.title} has ${d.exerciseIds?.length}`);
            assert.equal(new Set(d.exerciseIds).size, d.exerciseIds!.length, `no repeats in ${d.title}`);
            assert.ok(d.exerciseIds!.every((id) => !!getExercise(id)));
          }
          assert.equal(new Set(plan.days.map((d) => d.day)).size, 7);
        }
      }
    }
  }
});

test('a lifting plan has a deload every fourth week and sensible shapes', () => {
  const plan = buildLiftingPlan({ split: 'upperlower', daysPerWeek: 4, goal: 'strength', gear: 'gym', level: 'Beginner', weeks: 8 }, 5);
  assert.ok(plan.weekly![3].filter((d) => d.kind === 'strength').every((d) => d.title.includes('deload')));
  assert.ok(plan.weekly![0].filter((d) => d.kind === 'strength').every((d) => !d.title.includes('deload')));
  assert.deepEqual(plan.weekly![0].filter((d) => d.kind === 'strength').map((d) => d.title), ['Upper body A', 'Lower body A', 'Upper body B', 'Lower body B']);
  assert.equal(clampDays('bro', 2), 4);
  assert.equal(clampDays('fullbody', 6), 4);
  assert.ok(buildLiftingPlan({ split: 'fullbody', daysPerWeek: 3, goal: 'general', gear: 'gym', level: 'Beginner', weeks: 4 }, 0).days.some((d) => d.kind === 'cardio'), 'general fitness adds a walk');
  // Strength keeps fewer exercises than muscle building.
  assert.ok(sessionExercises('push', { goal: 'strength', gear: 'gym', level: 'Intermediate' }, 0).length < sessionExercises('push', { goal: 'muscle', gear: 'gym', level: 'Intermediate' }, 0).length);
});

test('a hand-made plan keeps its lifting days and turns the rest into rest days, and can be edited back', () => {
  const week = Array.from({ length: 7 }, () => ({ title: '', exerciseIds: [] as string[] }));
  week[0] = { title: 'Chest', exerciseIds: ['bench-press', 'db-fly', 'made-up'] };
  week[3] = { title: '', exerciseIds: ['squat'] };
  const plan = planFromDesign('  ', 6, week, 99);
  assert.equal(plan.name, 'My lifting plan');
  assert.equal(plan.weeks, 6);
  assert.equal(plan.days.filter((d) => d.kind === 'strength').length, 2);
  assert.deepEqual(plan.days[0].exerciseIds, ['bench-press', 'db-fly']);
  assert.equal(plan.days[3].title, 'Strength');
  assert.equal(plan.days[1].kind, 'rest');
  const back = designFromPlan(plan);
  assert.deepEqual(back[0].exerciseIds, ['bench-press', 'db-fly']);
  assert.deepEqual(back[1].exerciseIds, []);
  assert.equal(planFromDesign('x', 1, week, 1, 'keep-me').id, 'keep-me');
});

const shoe = (id: string, name: string, kind: Shoe['kind'], startKm = 0, retireKm = 800): Shoe => ({ id, name, kind, startKm, retireKm, retired: false, addedAt: 0 });
const run = (shoeId: string, km: number): WorkoutSession => ({ id: `w${shoeId}${km}`, type: 'Running', timestamp: '', startedAt: 1, durationMinutes: 30, distanceKm: km, avgHeartRate: 140, caloriesBurned: 100, shoeId });

test('the watch is offered each active pair and bike with its mileage, and the phone choice marked', () => {
  const gear = [shoe('a', 'Pegasus', 'shoe', 100), shoe('b', 'Vaporfly', 'shoe'), shoe('c', 'Road bike', 'bike', 0, 1500), { ...shoe('d', 'Old', 'shoe'), retired: true }];
  const list = buildWatchGear(gear, [run('a', 20), run('b', 10)], { shoe: 'b', bike: null }, 'metric');
  assert.deepEqual(list.map((g) => g.id), ['a', 'b', 'c']);
  assert.equal(list[0].text, '120 / 800 km');
  assert.equal(list.find((g) => g.id === 'b')?.selected, true);
  assert.equal(list.find((g) => g.id === 'a')?.selected, false);
  assert.equal(list.find((g) => g.id === 'c')?.selected, true, 'the only bike is the default');
  assert.match(buildWatchGear(gear, [], { shoe: null, bike: null }, 'imperial')[0].text, /mi$/);
  // A pair near its limit carries a warning.
  assert.match(buildWatchGear([shoe('w', 'Worn', 'shoe', 810)], [], { shoe: null, bike: null }, 'metric')[0].warn, /replace/i);
});

test('choosing no gear is remembered and the watch can say which pair a workout used', () => {
  const list = [shoe('a', 'Pegasus', 'shoe')];
  assert.equal(defaultShoe(list, NO_GEAR), null);
  assert.equal(defaultShoe(list, 'missing')?.id, 'a');
  const s = watchWorkoutToSession({ id: '1', type: 'Running', startedAt: 1_700_000_000_000, durationSec: 1800, distanceM: 5000, shoeId: 'a' }, DEFAULT_PROFILE);
  assert.equal(s?.shoeId, 'a');
  assert.equal(watchWorkoutToSession({ id: '2', type: 'Running', startedAt: 1_700_000_000_000, durationSec: 1800, shoeId: 'none' }, DEFAULT_PROFILE)?.shoeId, undefined);
  assert.equal(watchWorkoutToSession({ id: '3', type: 'Running', startedAt: 1_700_000_000_000, durationSec: 1800 }, DEFAULT_PROFILE)?.shoeId, undefined);
});
