import test from 'node:test';
import assert from 'node:assert/strict';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { PROTOCOLS, STAGES, nextStage, refeedFor, stageAt, WHAT_BREAKS, SCREEN_QUESTIONS } from '../fasting/content';
import {
  DEFAULT_PLAN, FastExtras, addPastFast, buildFastMonth, byProtocol, circadianSuggestion, clampHours, eatingState, editFast, fastedWorkouts, fastsToCsv, hungerStats, ketoneSeries,
  electrolyteNotices, fiveTwoAdjacent, glucoseFromDisplay, glucoseToDisplay, glucoseUnit, lowDayKcal, mealToBed, normalizeFiveTwo, planFastReminders, removeSalt, removeWater, stageHours, startSpread, waterAmounts, waterText, waterTotalMl, weeklyWeight, whatIf, withExtra,
} from '../fasting/model';

const at = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
const fast = (start: number, hours: number, target = 16, name = '16:8 Classic', over: Partial<FastingSession> = {}): FastingSession => ({
  id: `fast-${start}`,
  startTimeIso: new Date(start).toISOString(),
  startTimestamp: start,
  endTimestamp: start + hours * 3_600_000,
  endTimeIso: new Date(start + hours * 3_600_000).toISOString(),
  targetDurationHours: target,
  isCompleted: true,
  actualHours: hours,
  fastProtocolName: name,
  ...over,
});

test('content is complete: protocols, stages and notes are well formed', () => {
  assert.equal(new Set(PROTOCOLS.map((p) => p.id)).size, PROTOCOLS.length);
  for (const p of PROTOCOLS) {
    assert.ok(p.fastHours >= 12 && p.fastHours <= 48, p.id);
    assert.ok(p.day.length >= 3 && p.care.length > 20, p.id);
    if (p.fastHours >= 23) assert.ok(p.gated, `${p.id} should ask for confirmation`);
  }
  // stages cover every hour with no gaps
  for (let i = 1; i < STAGES.length; i++) assert.equal(STAGES[i].from, STAGES[i - 1].to);
  assert.equal(stageAt(0).id, 'digest');
  assert.equal(stageAt(15.9).id, 'burn');
  assert.equal(stageAt(30).id, 'deep');
  const n = nextStage(14)!;
  assert.equal(n.stage.id, 'ketone');
  assert.equal(n.inHours, 2);
  assert.equal(nextStage(30), null);
  // no stage line states a precise health claim as fact
  for (const s of STAGES) assert.ok(!/cures?|treats?|prevents?|guarantee/i.test(s.detail + s.line + s.feel), s.id);
  assert.ok(WHAT_BREAKS.length >= 12);
  assert.ok(SCREEN_QUESTIONS.some((q) => q.stop) && SCREEN_QUESTIONS.length >= 6);
  assert.equal(refeedFor(10).id, 'short');
  assert.equal(refeedFor(20).id, 'daily');
  assert.equal(refeedFor(30).id, 'day');
  assert.equal(refeedFor(40).id, 'long');
});

test('the eating window follows the plan and the day', () => {
  const plan = { ...DEFAULT_PLAN, eatStart: '12:00' }; // 16:8: window 12:00 to 20:00
  const mon = '2026-10-19'; // a Monday
  assert.equal(eatingState(plan, at(mon, 9)).state, 'fasting');
  assert.equal(eatingState(plan, at(mon, 9)).nextAt, at(mon, 12));
  const eating = eatingState(plan, at(mon, 14));
  assert.equal(eating.state, 'eating');
  assert.equal(eating.nextAt, at(mon, 20));
  const after = eatingState(plan, at(mon, 22));
  assert.equal(after.state, 'fasting');
  assert.equal(after.nextAt, at('2026-10-20', 12));
  // a day off in the weekly plan
  const weekly = { ...plan, weekly: ['16-8', null, '16-8', '16-8', '16-8', '16-8', '16-8'] as (string | null)[] };
  assert.equal(eatingState(weekly, at('2026-10-20', 14)).state, 'off');
  assert.equal(eatingState(weekly, at(mon, 22)).nextAt, null); // tomorrow is a rest day
});

test('reminders: start and window-closing notes for the days ahead, none when off', () => {
  const now = at('2026-10-19', 9);
  assert.deepEqual(planFastReminders(now, DEFAULT_PLAN, false), []);
  const on = { ...DEFAULT_PLAN, remindStart: true, remindClose: true };
  const plan = planFastReminders(now, on, false);
  assert.ok(plan.length >= 10);
  assert.equal(plan[0].title, 'Eating window closing');
  assert.equal(plan[0].at.getTime(), at('2026-10-19', 19, 30));
  assert.equal(plan[1].title, 'Time to start your fast');
  // while a fast is running, today's notes are skipped
  assert.ok(planFastReminders(now, on, true).every((n) => n.at.getTime() > at('2026-10-19', 23, 59)));
});

test('editing a fast checks the times, and adding a past one works', () => {
  const s = fast(at('2026-10-10', 20), 16);
  const bad = editFast([s], s.id, { endTimestamp: at('2026-10-10', 19) });
  assert.ok('error' in bad);
  const ok = editFast([s], s.id, { endTimestamp: at('2026-10-11', 14), targetHours: 18, notes: ' felt good ' });
  assert.ok('sessions' in ok);
  if ('sessions' in ok) {
    assert.equal(ok.sessions[0].actualHours, 18);
    assert.equal(ok.sessions[0].notes, 'felt good');
    assert.equal(ok.sessions[0].targetDurationHours, 18);
  }
  assert.ok('error' in editFast([s], s.id, { targetHours: 80 }));
  const added = addPastFast([s], { start: at('2026-10-05', 20), end: at('2026-10-06', 12), targetHours: 16, protocolName: '16:8 Classic' });
  assert.ok('sessions' in added);
  if ('sessions' in added) assert.equal(added.sessions.length, 2);
  assert.ok('error' in addPastFast([s], { start: at('2026-10-05', 20), end: at('2026-10-05', 18), targetHours: 16, protocolName: 'x' }));
});

test('the calendar colors each day by the best fast that ended on it', () => {
  const sessions = [fast(at('2026-10-09', 20), 17), fast(at('2026-10-10', 20), 13), fast(at('2026-10-11', 20), 9), fast(at('2026-10-12', 20), 16, 16)];
  const m = buildFastMonth(sessions, 2026, 9, '2026-10-20');
  const cell = (d: string) => m.cells.find((c) => c.date === d)!;
  assert.equal(cell('2026-10-10').level, 'met');
  assert.equal(cell('2026-10-11').level, 'near'); // 13 of 16 is 81 %
  assert.equal(cell('2026-10-12').level, 'short'); // 9 of 16
  assert.equal(cell('2026-10-13').level, 'met');
  assert.equal(m.summary.fasts, 4);
  assert.equal(m.summary.metGoal, 2);
  assert.equal(m.summary.longest!.actualHours, 17);
  assert.equal(m.cells.length % 7, 0);
});

test('extras add up, hunger waves count, and the CSV has a row for each fast', () => {
  const s = fast(at('2026-10-10', 20), 16);
  let extras: FastExtras = {};
  extras = withExtra(extras, s.id, (e) => ({ ...e, water: [...e.water, { at: s.startTimestamp + 3_600_000, ml: 250 }, { at: s.startTimestamp + 7_200_000, ml: 500 }] }));
  extras = withExtra(extras, s.id, (e) => ({ ...e, waves: [{ at: 1, rode: true }, { at: 2, rode: false }] }));
  assert.equal(waterTotalMl(extras[s.id]), 750);
  assert.deepEqual(hungerStats(extras), { total: 2, rode: 1 });
  const csv = fastsToCsv([s], extras).split('\n');
  assert.equal(csv.length, 2);
  assert.match(csv[1], /16:8 Classic/);
  assert.match(csv[1], /,750,/);
});

test('insights: stage hours, steadiness of the start time and results by protocol', () => {
  const s = [fast(at('2026-10-01', 20), 18, 16), fast(at('2026-10-02', 20, 10), 14, 16), fast(at('2026-10-03', 19, 50), 26, 24, '24 h Full day'), fast(at('2026-10-04', 20, 5), 16, 16)];
  const sh = stageHours(s);
  assert.equal(sh.find((x) => x.id === 'digest')!.hours, 16); // four hours in each of four fasts
  assert.ok(sh.find((x) => x.id === 'deep')!.hours > 0);
  const sp = startSpread(s)!;
  assert.equal(sp.label, 'Very steady');
  assert.match(sp.avgStart, /^(19|20):/);
  const rows = byProtocol(s);
  assert.equal(rows[0].name, '16:8 Classic');
  assert.equal(rows[0].count, 3);
  assert.equal(startSpread(s.slice(0, 2)), null);
});

const night = (dateIso: string, bedtime: string, wakeTime: string, durationMinutes: number, qualityRating = 4): SleepLogEntry =>
  ({ id: dateIso, dateIso, displayDate: dateIso, bedtime, wakeTime, durationMinutes, qualityRating, isManualEntry: false, deepSleepMinutes: 0, remSleepMinutes: 0, lightSleepMinutes: 0, awakeMinutes: 0, efficiencyScore: 90 }) as SleepLogEntry;

test('lab: sleep after a long gap between the last meal and bed, against a short one', () => {
  const sessions: FastingSession[] = [];
  const logs: SleepLogEntry[] = [];
  for (let i = 0; i < 8; i++) {
    const day = `2026-09-${String(10 + i).padStart(2, '0')}`;
    const next = `2026-09-${String(11 + i).padStart(2, '0')}`;
    const longGap = i % 2 === 0;
    sessions.push(fast(at(day, longGap ? 19 : 22), 16));
    logs.push(night(next, '23:00', '07:00', longGap ? 470 : 400));
  }
  const r = mealToBed(sessions, logs)!;
  assert.equal(r.longGap.n, 4);
  assert.equal(r.shortGap.n, 4);
  assert.equal(r.diffMin, 70);
  assert.equal(mealToBed(sessions.slice(0, 3), logs), null);
});

test('lab: workouts 12 or more hours into a fast, against the others', () => {
  const sessions = [fast(at('2026-10-05', 20), 20), fast(at('2026-10-06', 20), 20), fast(at('2026-10-07', 20), 20)];
  const w = (startedAt: number, mins: number, hr: number): WorkoutSession => ({ id: `${startedAt}`, type: 'Running', timestamp: '', startedAt, durationMinutes: mins, avgHeartRate: hr, caloriesBurned: 300 }) as WorkoutSession;
  const workouts = [w(at('2026-10-06', 11), 40, 150), w(at('2026-10-07', 11), 42, 152), w(at('2026-10-08', 11), 38, 148), w(at('2026-10-05', 17), 45, 140), w(at('2026-10-06', 17), 44, 142), w(at('2026-10-07', 17), 46, 141)];
  const r = fastedWorkouts(sessions, workouts)!;
  assert.equal(r.fasted.n, 3);
  assert.equal(r.fed.n, 3);
  assert.equal(r.fasted.avgHr, 150);
  assert.equal(fastedWorkouts(sessions, workouts.slice(0, 2)), null);
});

test('lab: a window from your own sleep, a what-if, ketone readings and weekly weight', () => {
  const logs = Array.from({ length: 8 }, (_, i) => night(`2026-10-${String(10 + i).padStart(2, '0')}`, '23:00', '07:00', 480));
  const c = circadianSuggestion(logs)!;
  assert.equal(c.eatStart, '08:30'); // wake + 1.5 h
  assert.equal(c.eatEnd, '20:00'); // bed - 3 h
  assert.equal(c.fastHours, 12.5);
  assert.equal(circadianSuggestion(logs.slice(0, 3)), null);
  // a very late riser who goes to bed early has too short a window: no suggestion
  assert.equal(circadianSuggestion(Array.from({ length: 6 }, (_, i) => night(`2026-10-${10 + i}`, '20:00', '10:00', 480))), null);
  const w = whatIf(at('2026-10-20', 20), 16, '23:00', '07:00');
  assert.equal(w.endsAt, at('2026-10-21', 12));
  assert.equal(w.asleepHours, 8);
  assert.equal(whatIf(at('2026-10-20', 20), 16).asleepHours, null);
  const s = fast(at('2026-10-10', 20), 20);
  const extras = withExtra({}, s.id, (e) => ({ ...e, ketones: [{ at: s.startTimestamp + 3 * 3_600_000, mmol: 0.4 }, { at: s.startTimestamp + 18 * 3_600_000, mmol: 1.2 }] }));
  assert.deepEqual(ketoneSeries([s], extras), [{ hours: 3, mmol: 0.4 }, { hours: 18, mmol: 1.2 }]);
  const rows = weeklyWeight([fast(at('2026-10-14', 20), 16)], [{ id: 'b', date: '2026-10-15', weightKg: 80 } as never], '2026-10-20', 3);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].fastedHours, 16); // the fast ended on the 15th, in last week
  assert.equal(rows[1].avgWeightKg, 80);
  assert.equal(clampHours(100), 48);
  assert.equal(clampHours(3), 8);
});

test('a logged salt or glass of water can be taken back, and only that one', () => {
  const s = fast(at('2026-10-10', 20), 16);
  let extras: FastExtras = {};
  extras = withExtra(extras, s.id, (e) => ({
    ...e,
    water: [{ at: 1, ml: 250 }, { at: 2, ml: 500 }, { at: 3, ml: 250 }],
    salts: [{ at: 4, label: 'Salt in water' }, { at: 5, label: 'Magnesium' }],
  }));
  const noSalt = removeSalt(extras, s.id, 0);
  assert.deepEqual(noSalt[s.id].salts.map((x) => x.label), ['Magnesium']);
  assert.equal(noSalt[s.id].water.length, 3);
  const noWater = removeWater(extras, s.id, 1);
  assert.deepEqual(noWater[s.id].water.map((x) => x.ml), [250, 250]);
  assert.equal(waterTotalMl(noWater[s.id]), 500);
  assert.equal(extras[s.id].salts.length, 2); // the original is not changed
  assert.equal(removeSalt(extras, 'nope', 0), extras);
  assert.equal(removeSalt(extras, s.id, 9)[s.id].salts.length, 2);
});

test('units: water, glucose and the CSV follow the choice, and the stored numbers stay the same', () => {
  assert.equal(waterText(250, 'metric'), '250 ml');
  assert.equal(waterText(237, 'imperial'), '8 fl oz');
  assert.deepEqual(waterAmounts('metric').map((a) => a.ml), [250, 500, 750]);
  assert.deepEqual(waterAmounts('imperial').map((a) => a.label), ['8 fl oz', '16 fl oz', '24 fl oz']);
  assert.ok(Math.abs(waterAmounts('imperial')[0].ml - 237) <= 1);
  assert.equal(glucoseUnit('imperial'), 'mg/dL');
  assert.equal(glucoseUnit('metric'), 'mmol/L');
  assert.equal(glucoseToDisplay(90, 'imperial'), 90);
  assert.equal(glucoseToDisplay(90, 'metric'), 5);
  assert.ok(Math.abs(glucoseFromDisplay(5, 'metric') - 90) < 0.2);
  const s = fast(at('2026-10-10', 20), 16);
  const extras = withExtra({}, s.id, (e) => ({ ...e, water: [{ at: 1, ml: 710 }] }));
  const metric = fastsToCsv([s], extras, 'metric').split('\n');
  const us = fastsToCsv([s], extras, 'imperial').split('\n');
  assert.match(metric[0], /water_ml/);
  assert.match(metric[1], /,710,/);
  assert.match(us[0], /water_fl_oz/);
  assert.match(us[1], /,24,/);
});

test('5:2 days: two weekdays, three calorie choices, and the plan says which dates are low-calorie days', () => {
  assert.deepEqual(normalizeFiveTwo(undefined), { on: false, days: [0, 3], kcal: 500 });
  assert.deepEqual(normalizeFiveTwo({ on: true, days: [4, 1, 4, 9], kcal: 650 }), { on: true, days: [1, 4], kcal: 500 });
  assert.deepEqual(normalizeFiveTwo({ on: true, days: [4, 9], kcal: 600 }), { on: true, days: [0, 3], kcal: 600 });
  assert.deepEqual(normalizeFiveTwo({ on: true, days: [4, 1], kcal: 600 }), { on: true, days: [1, 4], kcal: 600 });
  assert.equal(fiveTwoAdjacent([0, 1]), true);
  assert.equal(fiveTwoAdjacent([0, 6]), true);
  assert.equal(fiveTwoAdjacent([1, 4]), false);
  const plan = { ...DEFAULT_PLAN, fiveTwo: { on: true, days: [0, 3], kcal: 500 } };
  assert.equal(lowDayKcal(plan, '2026-10-19'), 500); // Monday
  assert.equal(lowDayKcal(plan, '2026-10-22'), 500); // Thursday
  assert.equal(lowDayKcal(plan, '2026-10-20'), null);
  assert.equal(lowDayKcal({ ...plan, fiveTwo: { ...plan.fiveTwo, on: false } }, '2026-10-19'), null);
  assert.equal(lowDayKcal(DEFAULT_PLAN, '2026-10-19'), null);
});

test('electrolyte reminders only on long fasts: from hour 8, every 4 hours, never past the end or in the past', () => {
  const H = 3_600_000;
  const start = at('2026-10-10', 20);
  assert.deepEqual(electrolyteNotices(start, 16, start), []);
  const n = electrolyteNotices(start, 36, start + H);
  assert.deepEqual(n.map((x) => (x.at.getTime() - start) / H), [8, 12, 16, 20, 24, 28]);
  assert.ok(n.every((x) => /water/i.test(x.title) && /unwell/i.test(x.body)));
  assert.deepEqual(electrolyteNotices(start, 36, start + 17 * H).map((x) => (x.at.getTime() - start) / H), [20, 24, 28, 32]);
  assert.deepEqual(electrolyteNotices(start, 24, start + 21 * H), []);
});
