import test from 'node:test';
import assert from 'node:assert/strict';
import { DrinkEntry, dayTotals, nightEffects } from '../lib/drinks';
import { SleepLogEntry } from '../types/health';

const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime();
const drink = (id: string, day: string, hour: number, kind: DrinkEntry['kind'], amount: number): DrinkEntry => ({ id, at: at(day, hour), kind, label: kind, amount });
const night = (dateIso: string, durationMinutes: number): SleepLogEntry => ({ id: dateIso, dateIso, durationMinutes } as SleepLogEntry);

test('day totals split caffeine into morning and late', () => {
  const e = [drink('a', '2026-10-10', 8, 'caffeine', 95), drink('b', '2026-10-10', 16, 'caffeine', 80), drink('c', '2026-10-10', 20, 'alcohol', 2), drink('d', '2026-10-11', 9, 'caffeine', 95)];
  assert.deepEqual(dayTotals(e, '2026-10-10'), { caffeineMg: 175, lateCaffeineMg: 80, alcoholDrinks: 2 });
});

test('no comparison until three nights on each side', () => {
  const e = [drink('a', '2026-10-01', 20, 'alcohol', 2), drink('b', '2026-10-02', 20, 'alcohol', 1)];
  const s = ['02', '03', '04', '05', '06', '07'].map((d) => night(`2026-10-${d}`, 450));
  assert.deepEqual(nightEffects(e, s), []);
});

test('sleep after alcohol against the other nights', () => {
  const e = ['01', '03', '05'].map((d) => drink(d, `2026-10-${d}`, 20, 'alcohol', 2));
  // nights 02, 04, 06 follow a drinking evening (short); 03, 05, 07 do not... but 03 and 05 follow evenings 02/04 with none
  const s = [night('2026-10-02', 380), night('2026-10-04', 390), night('2026-10-06', 370), night('2026-10-03', 460), night('2026-10-05', 470), night('2026-10-07', 450), night('2026-10-08', 465)];
  const r = nightEffects(e, s).find((x) => x.id === 'alcohol')!;
  assert.equal(r.nWith, 3);
  assert.equal(r.nWithout, 4);
  assert.ok(r.diffMin < -60);
});
