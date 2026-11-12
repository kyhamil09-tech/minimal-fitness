import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleSec, makeCustomPattern, patternById, setCustomPatterns, isSit, SIT_SESSIONS, PATTERNS } from '../lib/breathing';
import { DEFAULT_REMINDER, planBreatheReminders } from '../lib/breatheReminder';
import { GUIDED, guidedById, lineAt } from '../breathe/guided';

test('a custom rhythm is built from four numbers and checked', () => {
  const r = makeCustomPattern({ name: ' Mine ', inSec: 4, holdInSec: 2, outSec: 6, holdOutSec: 0 }, 'c1');
  assert.ok('pattern' in r);
  if ('pattern' in r) {
    assert.equal(r.pattern.name, 'Mine');
    assert.equal(r.pattern.rhythm, 'In 4 · hold 2 · out 6');
    assert.equal(cycleSec(r.pattern), 12);
    assert.deepEqual(r.pattern.phases.map((p) => p.kind), ['in', 'hold', 'out']);
  }
  const bad = (o: Partial<Parameters<typeof makeCustomPattern>[0]>) => makeCustomPattern({ name: 'x', inSec: 4, holdInSec: 0, outSec: 4, holdOutSec: 0, ...o }, 'c');
  assert.ok('error' in bad({ name: '  ' }));
  assert.ok('error' in bad({ inSec: 0 }));
  assert.ok('error' in bad({ holdInSec: 11 }));
  assert.ok('error' in bad({ inSec: 1, outSec: 1 })); // too short a breath
  assert.ok('error' in bad({ inSec: 12, holdInSec: 10, outSec: 16, holdOutSec: 10 })); // too long
});

test('custom and sit sessions are found by id, and unknown ids fall back', () => {
  const r = makeCustomPattern({ name: 'Mine', inSec: 4, holdInSec: 0, outSec: 6, holdOutSec: 0 }, 'custom-1');
  assert.ok('pattern' in r);
  if ('pattern' in r) setCustomPatterns([r.pattern]);
  assert.equal(patternById('custom-1').name, 'Mine');
  assert.equal(patternById('silent').name, 'Silent meditation');
  assert.equal(patternById('nope').id, PATTERNS[0].id);
  assert.ok(isSit('guided-bodyscan') && !isSit('calm'));
  setCustomPatterns([]);
  assert.equal(patternById('custom-1').id, PATTERNS[0].id);
  // every guided session has a history name
  for (const g of GUIDED) assert.ok(SIT_SESSIONS.some((s) => s.id === g.id), g.id);
});

test('guided sessions are well formed: ordered, spaced, and within their length', () => {
  for (const g of GUIDED) {
    assert.ok(g.lines.length >= 10, g.id);
    for (let i = 1; i < g.lines.length; i++) assert.ok(g.lines[i].at - g.lines[i - 1].at >= 10, `${g.id}: lines ${i - 1} and ${i} are too close`);
    assert.ok(g.lines[g.lines.length - 1].at < g.minutes * 60 - 5, `${g.id}: last line runs past the end`);
    assert.ok(g.lines[g.lines.length - 1].at > g.minutes * 60 * 0.7, `${g.id}: long silence at the end`);
    assert.ok(!/cure|treat|diagnos|medical/i.test(g.lines.map((l) => l.text).join(' ')), g.id);
  }
  const g = guidedById('guided-reset')!;
  assert.equal(lineAt(g, 0), null);
  assert.equal(lineAt(g, 5)!.at, 2);
  assert.equal(lineAt(g, 1000)!.at, g.lines[g.lines.length - 1].at);
});

const at = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();

test('reminders: off gives none; a week of evenings; today skipped when you already breathed', () => {
  assert.deepEqual(planBreatheReminders(at('2026-10-20', 9), DEFAULT_REMINDER, null), []);
  const on = { on: true, time: '19:00', nudge: true };
  const plan = planBreatheReminders(at('2026-10-20', 9), on, null);
  assert.equal(plan.length, 7);
  assert.equal(plan[0].date, '2026-10-20');
  assert.equal(plan[0].at.getHours(), 19);
  const done = planBreatheReminders(at('2026-10-20', 9), on, at('2026-10-20', 8));
  assert.equal(done[0].date, '2026-10-21');
  // after the time of day has passed, today is left out
  assert.equal(planBreatheReminders(at('2026-10-20', 20), on, null)[0].date, '2026-10-21');
});

test('reminders: gentler wording after a few days away, if the nudge is on', () => {
  const last = at('2026-10-10', 12);
  const withNudge = planBreatheReminders(at('2026-10-20', 9), { on: true, time: '19:00', nudge: true }, last);
  assert.equal(withNudge[0].title, 'Whenever you are ready');
  const without = planBreatheReminders(at('2026-10-20', 9), { on: true, time: '19:00', nudge: false }, last);
  assert.equal(without[0].title, 'Take a breath');
  // the day after a session is a regular one
  const recent = planBreatheReminders(at('2026-10-20', 9), { on: true, time: '19:00', nudge: true }, at('2026-10-19', 12));
  assert.equal(recent[0].title, 'Take a breath');
});

import { thin } from '../breathe/HrLine';

test('a long heart-rate series is thinned evenly and keeps its ends', () => {
  const xs = Array.from({ length: 500 }, (_, i) => 60 + (i % 40));
  const t = thin(xs, 80);
  assert.equal(t.length, 80);
  assert.equal(t[0], xs[0]);
  assert.equal(t[79], xs[499]);
  assert.deepEqual(thin([70, 71, 72], 80), [70, 71, 72]);
});
