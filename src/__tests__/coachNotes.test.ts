import test from 'node:test';
import assert from 'node:assert/strict';
import { POOLS, cleanState, emptyState, noteText, planNotes, weeklyText } from '../lib/encouragement';
import { calorieFloor, planEnergy } from '../lib/energyPlan';
import { translate } from '../lib/i18n';

const said = (notes: { key: string; vars?: Record<string, string | number> }[]) => notes.map((n) => translate('en', n.key as never, n.vars));

const seeded = (seed = 7) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const dates = (from: number, count: number) => Array.from({ length: count }, (_, i) => {
  const d = new Date(2026, 10, from + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

test('a day keeps its note when the schedule is made again, and past days are dropped', () => {
  const a = planNotes(emptyState(), dates(1, 14), day(1), seeded());
  const b = planNotes(a, dates(1, 14), day(1), seeded(99));
  assert.deepEqual(b.byDate, a.byDate);
  const later = planNotes(a, dates(5, 14), day(5), seeded(3));
  assert.equal(later.byDate[day(1)], undefined);
  assert.deepEqual(later.byDate[day(6)], a.byDate[day(6)]);
});

test('no main line is used again within sixty days, and the same note rarely repeats', () => {
  const s = planNotes(emptyState(), dates(1, 60), day(1), seeded(11));
  const leads = Object.values(s.byDate).map((n) => n.l);
  assert.equal(new Set(leads).size, 60);
  const texts = Object.values(s.byDate).map((n) => noteText(n).body);
  assert.equal(new Set(texts).size, 60);
});

test('across a year the full text repeats at most a handful of times', () => {
  let state = emptyState();
  const seen = new Map<string, number>();
  for (let start = 0; start < 365; start += 14) {
    const ds = Array.from({ length: 14 }, (_, i) => new Date(2027, 0, 1 + start + i)).map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    state = planNotes(state, ds, ds[0], seeded(start + 5));
    for (const d of ds) {
      const t = noteText(state.byDate[d]);
      const k = t.title + t.body;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  assert.ok(Math.max(...seen.values()) <= 2, 'the same note at most twice in a year');
});

test('every line is plain, kind text with nothing about weight or food shaming', () => {
  const all = [...POOLS.titles, ...POOLS.leads, ...POOLS.tails];
  assert.ok(POOLS.leads.length >= 60 && POOLS.titles.length >= 25 && POOLS.tails.length >= 25);
  for (const t of all) assert.ok(t.length > 2 && t.length < 160, t);
  assert.ok(!all.some((t) => /\b(fat|diet|calorie|pounds?|kg|lazy|guilt|ashamed|cheat)\b/i.test(t)));
  assert.ok(new Set(all).size === all.length, 'no duplicate lines');
  assert.ok(weeklyText('2026-11-01').title.length > 0);
});

test('stored note state with bad entries is repaired', () => {
  const s = cleanState({ byDate: { '2026-11-01': { t: 0, l: 0, e: 0 }, bad: { t: 1, l: 1, e: 1 }, '2026-11-02': { t: 999, l: 0, e: 0 } }, recent: { t: [0, 99], l: 'x' } });
  assert.deepEqual(Object.keys(s.byDate), ['2026-11-01']);
  assert.deepEqual(s.recent.t, [0]);
  assert.deepEqual(s.recent.l, []);
});

const adult = { weightKg: 90, heightCm: 178, age: 35, sex: 'male' as const, activityLevel: 'light' as const };

test('losing weight sets a deficit, keeps to the floor and gives a date', () => {
  const p = planEnergy({ profile: adult, currentKg: 90, targetKg: 80, mode: 'lose', weeklyKg: 0.5, today: new Date(2026, 9, 1) });
  assert.ok(p.target < p.maintenance && p.target >= calorieFloor('male'));
  assert.ok(Math.abs(p.dailyDelta + 550) < 30, String(p.dailyDelta));
  assert.ok(p.weeks === 20 || p.weeks === 21, String(p.weeks));
  assert.equal(p.reachBy, p.weeks === 20 ? '2027-02-18' : '2027-02-25');
  assert.ok(p.healthyMinKg < p.healthyMaxKg);
  assert.equal(p.proteinG, Math.round(1.6 * (p.healthyMaxKg + 10)), 'protein is based on a weight near the healthy range for a heavier person');
});

test('a deficit that would go under the floor stops at the floor, with a note', () => {
  const small = { weightKg: 55, heightCm: 155, age: 50, sex: 'female' as const, activityLevel: 'sedentary' as const };
  const p = planEnergy({ profile: small, currentKg: 55, targetKg: 50, mode: 'lose', weeklyKg: 0.75 });
  assert.equal(p.target, 1200);
  assert.ok(p.adjusted && said(p.notes).some((n) => /1,200/.test(n)));
});

test('maintaining matches the maintenance figure, and gaining adds calories', () => {
  const m = planEnergy({ profile: adult, currentKg: 90, targetKg: 90, mode: 'maintain', weeklyKg: 0 });
  assert.ok(Math.abs(m.target - m.maintenance) <= 3 && m.weeks === undefined);
  const g = planEnergy({ profile: adult, currentKg: 70, targetKg: 75, mode: 'gain', weeklyKg: 0.5 });
  assert.ok(g.target > g.maintenance && g.weeks === 10);
});

test('warnings: target under the healthy range, already under, and wrong direction', () => {
  const low = planEnergy({ profile: adult, currentKg: 80, targetKg: 50, mode: 'lose', weeklyKg: 0.5 });
  assert.ok(said(low.notes).some((n) => /below the healthy range/.test(n)));
  const under = planEnergy({ profile: { ...adult, heightCm: 190 }, currentKg: 60, targetKg: 55, mode: 'lose', weeklyKg: 0.5 });
  assert.ok(said(under.notes).some((n) => /already under/.test(n)));
  const wrong = planEnergy({ profile: adult, currentKg: 70, targetKg: 80, mode: 'lose', weeklyKg: 0.5 });
  assert.ok(said(wrong.notes).some((n) => /not below/.test(n)) && wrong.weeks === undefined);
  const teen = planEnergy({ profile: { ...adult, age: 16 }, currentKg: 70, targetKg: 65, mode: 'lose', weeklyKg: 0.5 });
  assert.ok(said(teen.notes).some((n) => /under 18/.test(n)));
});

test('a pace faster than 1% of body weight a week is brought down', () => {
  const p = planEnergy({ profile: { ...adult, weightKg: 50 }, currentKg: 50, targetKg: 45, mode: 'lose', weeklyKg: 0.75 });
  assert.equal(p.adjusted, true);
});

test('every language has the same notes in the same order, with no repeated lines inside a list', async () => {
  const { poolsFor, notesEn, noteText: text, weeklyText: weekly } = await import('../lib/encouragement');
  const langs = ['es', 'fr', 'de', 'pt', 'it'] as const;
  for (const l of langs) {
    const p = poolsFor(l);
    for (const k of ['titles', 'leads', 'tails', 'weeklyTitles', 'weeklyBodies'] as const) {
      assert.equal(p[k].length, notesEn[k].length, `${l}.${k} has as many lines as English`);
      assert.equal(new Set(p[k]).size, p[k].length, `${l}.${k} has no repeated line`);
      assert.ok(p[k].every((s) => s.trim().length > 2 && s.length < 200), `${l}.${k} lines are a sane length`);
    }
    assert.ok(!poolsFor(l).leads.some((s) => /\b(kg|kcal|calor|Gewicht abnehmen|peso corporal)\b/i.test(s)));
    assert.notEqual(text({ t: 0, l: 0, e: 0 }, l).title, text({ t: 0, l: 0, e: 0 }, 'en').title, `${l} differs from English`);
    assert.notEqual(weekly('2026-11-01', l).title, weekly('2026-11-01', 'en').title);
  }
});
