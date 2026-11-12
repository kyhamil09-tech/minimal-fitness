import test from 'node:test';
import assert from 'node:assert/strict';
import { planStreakSaver } from '../lib/streakSaver';
import { addTime, medNotices, MED_ID_BASE, MED_MAX_NOTICES, MedReminder } from '../lib/medReminders';

const morning = new Date(2026, 9, 18, 9, 0).getTime();
const night = new Date(2026, 9, 18, 21, 0).getTime();

test('streak saver: tonight only if nothing is logged and there is a streak', () => {
  const p = planStreakSaver(morning, '2026-10-18', '19:30', 5, false);
  assert.equal(p.length, 2);
  assert.equal(p[0].date, '2026-10-18');
  assert.equal(p[0].at.getHours(), 19);
  assert.match(p[0].title, /5-day streak/);
  assert.equal(planStreakSaver(morning, '2026-10-18', '19:30', 5, true).map((n) => n.date).join(), '2026-10-19');
  assert.equal(planStreakSaver(morning, '2026-10-18', '19:30', 0, false).map((n) => n.date).join(), '2026-10-19');
});

test('streak saver: a time that has passed is left out', () => {
  assert.equal(planStreakSaver(night, '2026-10-18', '19:30', 5, false).map((n) => n.date).join(), '2026-10-19');
});

const med = (name: string, times: string[], enabled = true, dose?: string): MedReminder => ({ id: name, name, times, enabled, dose });

test('medication notices: one per time, disabled ones skipped, ids in range', () => {
  const n = medNotices([med('Vitamin D', ['08:00', '20:00'], true, '1000 IU'), med('Iron', ['09:30'], false)], false);
  assert.equal(n.length, 2);
  assert.equal(n[0].id, MED_ID_BASE);
  assert.equal(n[1].hour, 20);
  assert.match(n[0].body, /Vitamin D \(1000 IU\)/);
});

test('medication notices: the name can be hidden, and the count is capped', () => {
  const n = medNotices([med('Secret', ['07:00'])], true);
  assert.doesNotMatch(n[0].body + n[0].title, /Secret/);
  const many = medNotices(Array.from({ length: 20 }, (_, i) => med(`m${i}`, ['07:00', '08:00', '09:00'])), false);
  assert.equal(many.length, MED_MAX_NOTICES);
});

test('times are validated, de-duplicated and sorted', () => {
  assert.deepEqual(addTime(['20:00'], '8:05'), ['08:05', '20:00']);
  assert.deepEqual(addTime(['08:05'], '08:05'), ['08:05']);
  assert.deepEqual(addTime(['08:05'], '25:00'), ['08:05']);
});
