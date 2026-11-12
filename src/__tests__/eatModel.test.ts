import test from 'node:test';
import assert from 'node:assert/strict';
import { FoodEntry } from '../types/tracking';
import { STYLES, styleById } from '../eat/content';
import {
  dayNote, dayTotals, eatingWindow, entryTime, feelingCounts, fillIdeas, foodToCsv, loggingStreak, macroTargets, mealShares, plate, proteinForStyle, scaleAmountText, scaleEntry,
  breaksFast, calmWord, dayGoal, eatSummary, isTrainingDay, lastMealTime, mealBudget, microAverages, splitDefaults, reminderSlots, topFoods, weekBudget, weekdayAverages, weekendGap, windowAverage,
} from '../eat/model';

let n = 0;
const food = (date: string, over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `f-${1_700_000_000_000 + n++}-abcd`,
  date,
  meal: 'Lunch',
  name: 'Rice',
  calories: 200,
  proteinG: 4,
  carbsG: 44,
  fatG: 1,
  ...over,
});

test('day totals add up, and missing fiber counts as zero', () => {
  const t = dayTotals([food('2026-10-20', { fiberG: 2 }), food('2026-10-20', { calories: 300, proteinG: 20, sodiumMg: 400 })]);
  assert.equal(t.calories, 500);
  assert.equal(t.proteinG, 24);
  assert.equal(t.fiberG, 2);
  assert.equal(t.sodiumMg, 400);
  assert.equal(t.count, 2);
});

test('macro targets split what is left after protein by the style, and keto holds carbs to the cap', () => {
  const b = macroTargets(2000, 150, styleById('balanced'));
  assert.equal(b.proteinG, 150);
  assert.equal(b.carbsG, Math.round((1400 * 0.65) / 4));
  assert.equal(b.fatG, Math.round((1400 * 0.35) / 9));
  assert.equal(b.fiberG, 28);
  const k = macroTargets(2000, 150, styleById('keto'));
  assert.equal(k.carbsG, 30);
  assert.ok(Math.abs(k.carbsG * 4 + k.proteinG * 4 + k.fatG * 9 - 2000) <= 10);
  assert.equal(macroTargets(2000, 150, styleById('plant')).fiberG, 35);
  assert.equal(macroTargets(0, 0, STYLES[0]).carbsG, 0);
  assert.equal(styleById('nope').id, 'balanced');
});

test('applying a style sets protein per kg only when the style has one', () => {
  assert.equal(proteinForStyle(styleById('protein'), 80, 120), 160);
  assert.equal(proteinForStyle(styleById('balanced'), 80, 120), 120);
  assert.equal(proteinForStyle(styleById('protein'), 0, 120), 120);
});

test('the plate fills with the day, in macro colors, and a second ring shows going over', () => {
  assert.deepEqual(plate({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, 2000), { segments: [], fill: 0, over: 0 });
  const half = plate({ calories: 1000, proteinG: 50, carbsG: 100, fatG: 44 }, 2000);
  assert.equal(half.fill, 0.5);
  assert.equal(half.over, 0);
  assert.equal(half.segments.length, 3);
  assert.ok(Math.abs(half.segments[2].to - 0.5) < 1e-9);
  assert.ok(half.segments[0].to > 0 && half.segments[1].from === half.segments[0].to);
  const over = plate({ calories: 2500, proteinG: 100, carbsG: 250, fatG: 80 }, 2000);
  assert.equal(over.fill, 1);
  assert.equal(over.over, 0.25);
  assert.equal(plate({ calories: 300, proteinG: 0, carbsG: 0, fatG: 0 }, 2000).segments[0].key, 'c');
  assert.equal(plate({ calories: 300, proteinG: 1, carbsG: 1, fatG: 1 }, 0).fill, 0);
});

test('the week budget: unlogged past days count as the goal, so nothing is banked from not logging', () => {
  // 2026-10-21 is a Wednesday; the week starts Monday the 19th (or Sunday the 18th if the app is set that way).
  const log = [food('2026-10-19', { calories: 1800 }), food('2026-10-21', { calories: 600 })];
  const w = weekBudget(log, 2000, '2026-10-21');
  assert.equal(w.days.length, 7);
  assert.equal(w.allowance, 14000);
  assert.ok(w.days.some((d) => d.isToday && d.date === '2026-10-21'));
  const monday = w.weekStart === '2026-10-19';
  if (monday) {
    // Mon logged 1800, Tue not logged (counts 2000), Wed today 600.
    assert.equal(w.eaten, 4400);
    assert.equal(w.left, 9600);
    assert.equal(w.daysLeft, 5);
    assert.equal(w.perDay, 1920);
  }
  assert.equal(weekBudget([], 2000, '2026-10-21').daysLeft >= 5, true);
});

test('the day note is warm, never harsh, and steady for one date', () => {
  const base = { hour: 9, date: '2026-10-21', eaten: 0, goal: 2000, proteinG: 0, proteinGoal: 120, entries: 0 };
  assert.ok(dayNote(base).length > 10);
  assert.equal(dayNote(base), dayNote(base));
  const over = dayNote({ ...base, hour: 20, eaten: 2600, entries: 5 });
  assert.match(over, /week|tomorrow|allowed|enjoy/i);
  assert.doesNotMatch(over, /fail|bad|cheat|guilt|sin/i);
  assert.match(dayNote({ ...base, hour: 20, eaten: 1000, proteinG: 30, entries: 3 }), /protein|Protein|dinner|room/);
});

test('ideas close a protein gap from your own log first, then typical foods, and skip what you ate today', () => {
  const log = [
    food('2026-10-10', { name: 'Skyr', calories: 130, proteinG: 22, meal: 'Snack' }),
    food('2026-10-12', { name: 'Skyr', calories: 130, proteinG: 22, meal: 'Snack' }),
    food('2026-10-11', { name: 'Pizza', calories: 800, proteinG: 30 }),
    food('2026-10-20', { name: 'Cake', calories: 400, proteinG: 4 }),
    food('2026-10-21', { name: 'Eggs', calories: 140, proteinG: 12 }),
  ];
  const ideas = fillIdeas(log, '2026-10-21', { kcal: 500, proteinG: 40, fiberG: 0 }, 3);
  assert.equal(ideas[0].entry.name, 'Skyr');
  assert.equal(ideas[0].typical, false);
  assert.ok(ideas.every((i) => i.entry.calories <= 525));
  assert.ok(!ideas.some((i) => i.entry.name === 'Pizza'));
  assert.ok(!ideas.some((i) => i.entry.name.toLowerCase().startsWith('eggs')));
  assert.equal(ideas.length, 3);
  assert.ok(ideas.some((i) => i.typical));
  assert.deepEqual(fillIdeas(log, '2026-10-21', { kcal: 60, proteinG: 40, fiberG: 10 }), []);
  assert.deepEqual(fillIdeas(log, '2026-10-21', { kcal: 600, proteinG: 0, fiberG: 0 }), []);
  const fiber = fillIdeas([], '2026-10-21', { kcal: 400, proteinG: 0, fiberG: 12 }, 2);
  assert.ok(fiber.length === 2 && fiber.every((i) => (i.entry.fiberG ?? 0) >= 3));
});

test('scaling a logged food changes the numbers and the amount text together', () => {
  assert.equal(scaleAmountText('1 cup (244 g)', 1.5), '1.5 cup (366 g)');
  assert.equal(scaleAmountText('1/2 cup (113 g)', 2), '1 cup (226 g)');
  assert.equal(scaleAmountText('1 1/2 cups', 2), '3 cups');
  assert.equal(scaleAmountText('a handful', 2), '2 x a handful');
  assert.equal(scaleAmountText(undefined, 2), undefined);
  const e = food('2026-10-21', { calories: 101, proteinG: 3.3, fiberG: 1.1, sodiumMg: 55, amount: '2 slices (60 g)', micros: { iron: 2 } });
  const s = scaleEntry(e, 0.5);
  assert.equal(s.calories, 51);
  assert.equal(s.proteinG, 1.7);
  assert.equal(s.fiberG, 0.6);
  assert.equal(s.sodiumMg, 28);
  assert.equal(s.amount, '1 slices (30 g)');
  assert.equal(s.micros?.iron, 1);
  assert.equal(scaleEntry(food('2026-10-21'), 2).fiberG, undefined);
});

test('the time of a meal comes from the id, only when it is on the entry\'s own day', () => {
  const ms = new Date('2026-10-21T12:30:00').getTime();
  const a = { id: `f-${ms}-ab12`, date: '2026-10-21' };
  assert.equal(entryTime(a), ms);
  assert.equal(entryTime({ id: `f-${ms}-ab12`, date: '2026-10-19' }), null);
  assert.equal(entryTime({ id: 'seed-1', date: '2026-10-21' }), null);
  const mk = (h: number, m: number) => {
    const t = new Date(`2026-10-21T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
    return food('2026-10-21', { id: `f-${t}-zz` });
  };
  const w = eatingWindow([mk(18, 30), mk(8, 0), mk(12, 30)]);
  assert.equal(w?.hours, 10.5);
  assert.equal(eatingWindow([mk(8, 0)]), null);
});

test('the logging streak counts back from today, or from yesterday while today is empty', () => {
  const days = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'].map((d) => ({ date: d }));
  assert.equal(loggingStreak(days, '2026-10-21'), 4);
  assert.equal(loggingStreak([...days, { date: '2026-10-21' }], '2026-10-21'), 5);
  assert.equal(loggingStreak(days, '2026-10-23'), 0);
  assert.equal(loggingStreak([], '2026-10-21'), 0);
});

test('weekday averages and the weekend gap need enough days', () => {
  const log: FoodEntry[] = [];
  // Weekdays near 1800, weekends near 2400, over four weeks ending Sunday 2026-10-25.
  for (let i = 0; i < 28; i++) {
    const d = new Date(2026, 9, 25 - i, 12);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    log.push(food(key, { calories: weekend ? 2400 : 1800 }));
  }
  const avgs = weekdayAverages(log, '2026-10-25', 28);
  assert.equal(avgs.length, 7);
  assert.equal(avgs[0].avg, 1800);
  assert.equal(avgs[5].avg, 2400);
  assert.deepEqual(weekendGap(avgs), { weekday: 1800, weekend: 2400, diff: 600 });
  assert.equal(weekendGap(weekdayAverages(log.slice(0, 3), '2026-10-25', 28)), null);
});

test('meal shares, top foods and feeling counts', () => {
  const log = [
    food('2026-10-20', { meal: 'Breakfast', calories: 300, name: 'Oats' }),
    food('2026-10-20', { meal: 'Dinner', calories: 700, name: 'Pasta' }),
    food('2026-10-19', { meal: 'Breakfast', calories: 300, name: 'Oats' }),
  ];
  const shares = mealShares(log, '2026-10-21', 7);
  assert.equal(shares.find((s) => s.meal === 'Breakfast')?.pct, 46);
  assert.equal(shares.reduce((s, m) => s + m.kcal, 0), 1300);
  assert.deepEqual(topFoods(log, '2026-10-21', 7, 1), [{ name: 'Oats', count: 2, avgKcal: 300 }]);
  assert.deepEqual(feelingCounts({ '2026-10-20': { feel: ['calm', 'hungry'] }, '2026-10-19': { feel: ['calm'] }, '2025-01-01': { feel: ['calm'] } }, '2026-10-21', 30), [
    { id: 'calm', n: 2 },
    { id: 'hungry', n: 1 },
  ]);
});

test('the diary exports as a spreadsheet, with quotes handled', () => {
  const rows = foodToCsv([food('2026-10-20', { name: 'Soup, "tomato"', amount: '1 bowl', fiberG: 3 })]).split('\n');
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^date,meal,food,amount,calories/);
  assert.match(rows[1], /"Soup, ""tomato"""/);
  assert.match(rows[1], /,3,,$/);
});

test('typical first and last bite needs three days with a window', () => {
  const at = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
  const day = (d: string, first: number, last: number) => [
    food(d, { id: `f-${at(d, first)}-aa` }),
    food(d, { id: `f-${at(d, last)}-bb` }),
  ];
  const log = [...day('2026-10-18', 8, 19), ...day('2026-10-19', 9, 20), ...day('2026-10-20', 8, 18)];
  const w = windowAverage(log, '2026-10-21', 7);
  assert.equal(w?.days, 3);
  assert.equal(w?.firstMin, Math.round((8 * 60 + 9 * 60 + 8 * 60) / 3));
  assert.equal(windowAverage(log.slice(0, 4), '2026-10-21', 7), null);
});

test('vitamin averages count only days whose foods list them, lowest first', () => {
  const log = [
    food('2026-10-20', { micros: { iron: 9, vitC: 90 } }),
    food('2026-10-19', { micros: { iron: 18, vitC: 45 } }),
    food('2026-10-18'),
  ];
  const m = microAverages(log, '2026-10-21', 7);
  assert.equal(m.days, 2);
  assert.ok(m.rows.length > 5);
  assert.ok(m.rows[0].pct <= m.rows[m.rows.length - 1].pct);
  const iron = m.rows.find((r) => r.id === 'iron');
  assert.equal(iron?.pct, Math.round((Math.round((9 / 18) * 100) + 100) / 2));
  assert.deepEqual(microAverages([food('2026-10-20')], '2026-10-21', 7), { days: 0, rows: [] });
});

test('reminders: only the switched-on meals with a valid time, and none when off', () => {
  const base = { on: true, which: { breakfast: true, lunch: false, dinner: true, review: true }, times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', review: '25:00' } };
  const s = reminderSlots(base);
  assert.deepEqual(s.map((x) => [x.slot, x.hour, x.minute]), [[0, 8, 0], [2, 18, 30]]);
  assert.ok(s.every((x) => x.title.length > 0 && x.body.length > 0));
  assert.deepEqual(reminderSlots({ ...base, on: false }), []);
});

test('meal budgets add up to the day, and the calm words never scold', () => {
  const total = (['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const).reduce((s, m) => s + mealBudget(2000, m), 0);
  assert.ok(Math.abs(total - 2000) <= 20);
  assert.equal(mealBudget(2000, 'Breakfast'), 500);
  assert.equal(mealBudget(-5, 'Lunch'), 0);
  assert.equal(calmWord(0, 2000), 'A fresh plate');
  assert.equal(calmWord(1000, 2000), 'Room to enjoy');
  assert.equal(calmWord(1950, 2000), 'Nicely full');
  assert.match(calmWord(2600, 2000), /okay/);
  assert.equal(calmWord(500, 0), 'A fresh plate');
});

test('rest and training day targets: the split only applies when it is on and sensible', () => {
  const split = { on: true, restKcal: 2000, trainKcal: 2400 };
  assert.equal(dayGoal(2200, split, false), 2000);
  assert.equal(dayGoal(2200, split, true), 2400);
  assert.equal(dayGoal(2200, { ...split, on: false }, true), 2200);
  assert.equal(dayGoal(2200, { on: true, restKcal: 0, trainKcal: 0 }, true), 2200);
  assert.equal(dayGoal(2200, undefined, true), 2200);
  const d = splitDefaults(2200);
  assert.ok(d.on && d.restKcal < 2200 && d.trainKcal > 2200);
  assert.equal(splitDefaults(500).restKcal, 800);
});

test('a training day has a real workout logged, or a session planned for today', () => {
  const day = (h: number, minutes: number) => ({ timestamp: new Date(2026, 9, 20, h).toISOString(), startedAt: new Date(2026, 9, 20, h).getTime(), durationMinutes: minutes });
  assert.equal(isTrainingDay([day(8, 40)], '2026-10-20', '2026-10-21', false), true);
  assert.equal(isTrainingDay([day(8, 5)], '2026-10-20', '2026-10-21', false), false);
  assert.equal(isTrainingDay([], '2026-10-21', '2026-10-21', true), true);
  assert.equal(isTrainingDay([], '2026-10-20', '2026-10-21', true), false);
});

test('only more than a sip breaks a fast, and the last meal is found from the ids', () => {
  assert.equal(breaksFast({ calories: 5 }), false);
  assert.equal(breaksFast({ calories: 49 }), false);
  assert.equal(breaksFast({ calories: 50 }), true);
  const now = new Date('2026-10-21T20:00:00').getTime();
  const at = (h: number) => new Date(`2026-10-21T${String(h).padStart(2, '0')}:00:00`).getTime();
  const e = (h: number) => food('2026-10-21', { id: `f-${at(h)}-q` });
  assert.equal(lastMealTime([e(8), e(13), e(18)], now), at(18));
  assert.equal(lastMealTime([e(8)], now, 6), null);
  assert.equal(lastMealTime([], now), null);
  assert.equal(lastMealTime([food('2026-10-21', { id: 'seed-1' })], now), null);
});

test('the summary for the widget and watch: goal with the split and activity, left, protein and the last food time', () => {
  const at = (h: number) => new Date(`2026-10-21T${String(h).padStart(2, '0')}:00:00`).getTime();
  const log = [food('2026-10-21', { id: `f-${at(8)}-a`, calories: 400, proteinG: 30 }), food('2026-10-21', { id: `f-${at(13)}-b`, calories: 600, proteinG: 40 }), food('2026-10-20', { calories: 999 })];
  const base = { food: log, today: '2026-10-21', goalKcal: 2000, proteinGoal: 140, split: undefined, training: false, burnedKcal: 0, activity: true };
  const s = eatSummary(base);
  assert.deepEqual([s.eaten, s.goal, s.left, s.proteinG, s.proteinGoal, s.lastFoodMs], [1000, 2000, 1000, 70, 140, at(13)]);
  assert.equal(eatSummary({ ...base, burnedKcal: 300 }).goal, 2300);
  assert.equal(eatSummary({ ...base, burnedKcal: 300, activity: false }).goal, 2000);
  const split = { on: true, restKcal: 1900, trainKcal: 2300 };
  assert.equal(eatSummary({ ...base, split, training: true }).goal, 2300);
  assert.equal(eatSummary({ ...base, split, training: false }).left, 900);
  assert.equal(eatSummary({ ...base, food: [] }).lastFoodMs, 0);
  assert.equal(eatSummary({ ...base, food: [food('2026-10-21', { id: 'seed-1', calories: 3000 })] }).left, -1000);
});
