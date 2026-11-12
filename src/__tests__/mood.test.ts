import test from 'node:test';
import assert from 'node:assert/strict';
import { MoodEntry, moodFactors, setCheckIn } from '../lib/mood';
import { addDays } from '../lib/dates';
import { SleepLogEntry } from '../types/health';

test('one check-in a day, each part kept when the other is set', () => {
  let e: MoodEntry[] = [];
  e = setCheckIn(e, '2026-10-10', 'mood', 4, 1);
  e = setCheckIn(e, '2026-10-10', 'energy', 2, 2);
  e = setCheckIn(e, '2026-10-09', 'mood', 9, 3);
  assert.equal(e.length, 2);
  assert.deepEqual(e.map((x) => x.date), ['2026-10-09', '2026-10-10']);
  assert.equal(e[0].mood, 5); // clamped
  assert.deepEqual([e[1].mood, e[1].energy], [4, 2]);
  e = setCheckIn(e, '2026-10-10', 'mood', 1, 4);
  assert.deepEqual([e[1].mood, e[1].energy], [1, 2]);
});

const day = (n: number) => addDays('2026-09-01', n);
const night = (dateIso: string, durationMinutes: number): SleepLogEntry => ({ id: dateIso, dateIso, durationMinutes } as SleepLogEntry);

test('too few check-ins: no patterns', () => {
  const e = [0, 1, 2].map((n) => ({ date: day(n), mood: 3, energy: 3, at: n }));
  assert.deepEqual(moodFactors(e, [], [], []), []);
});

test('energy is higher after longer sleep, and it is reported with the counts', () => {
  const entries: MoodEntry[] = [];
  const sleep: SleepLogEntry[] = [];
  for (let n = 0; n < 16; n++) {
    const long = n % 2 === 0;
    entries.push({ date: day(n), mood: 3, energy: long ? 4 : 2, at: n });
    sleep.push(night(day(n), long ? 480 : 360));
  }
  const f = moodFactors(entries, sleep, [], []);
  const top = f.find((x) => x.id === 'sleep' && x.metric === 'energy')!;
  assert.equal(top.nWith, 8);
  assert.equal(top.nWithout, 8);
  assert.equal(top.diff, 2);
  assert.ok(!f.some((x) => x.metric === 'mood')); // mood did not change, so nothing is claimed
});
