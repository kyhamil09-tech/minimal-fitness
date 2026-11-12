import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, BreathSession, breathTotals, cycleSec, dailyMinutes, favouriteTechnique, patternById, phaseAt } from '../lib/breathing';
import { CATEGORIES, JOURNEYS, MOODS, TECHNIQUE_INFO, completeJourneyDay, infoFor, inCategory, journeyById, nextJourneyDay, suggestedNow } from '../breathe/content';

test('every technique has timing, words and a category, and every id is unique', () => {
  assert.equal(new Set(PATTERNS.map((p) => p.id)).size, PATTERNS.length);
  assert.equal(TECHNIQUE_INFO.length, PATTERNS.length);
  for (const p of PATTERNS) {
    const info = infoFor(p.id);
    assert.ok(info, `${p.id} has no content`);
    assert.ok(info!.how.length >= 3 && info!.bestFor.length >= 2 && info!.about.length > 40, p.id);
    assert.ok(p.phases.every((ph) => ph.sec > 0), p.id);
    assert.ok(cycleSec(p) >= 4 && cycleSec(p) <= 20, p.id);
    // a technique with a hold carries a note of care
    if (p.phases.some((ph) => ph.kind === 'hold')) assert.ok(info!.caution, `${p.id} has a hold but no caution`);
  }
  for (const c of CATEGORIES) assert.ok(inCategory(c.id).length >= 1, c.id);
});

test('moods and journeys point only at techniques that exist', () => {
  const ids = new Set(PATTERNS.map((p) => p.id));
  for (const m of MOODS) for (const t of m.techniques) assert.ok(ids.has(t), `${m.id}: ${t}`);
  for (const j of JOURNEYS) {
    assert.ok(j.days.length >= 3);
    for (const d of j.days) {
      assert.ok(ids.has(d.technique), `${j.id}: ${d.technique}`);
      assert.ok(d.minutes >= 1 && d.lesson.length > 30);
    }
  }
  assert.equal(new Set(JOURNEYS.map((j) => j.id)).size, JOURNEYS.length);
});

test('fractional phases still tell the right moment', () => {
  const r = patternById('resonance');
  assert.equal(cycleSec(r), 11);
  assert.equal(phaseAt(r, 5.4).kind, 'in');
  assert.equal(phaseAt(r, 5.6).kind, 'out');
  assert.equal(phaseAt(r, 11.2).cycle, 2);
});

test('journey days are done in order, and the next one moves on', () => {
  const j = journeyById('calm7')!;
  assert.equal(nextJourneyDay(j, undefined), 1);
  let p = completeJourneyDay({}, j, 3, 100); // too early: ignored
  assert.deepEqual(p, {});
  p = completeJourneyDay(p, j, 1, 100);
  p = completeJourneyDay(p, j, 2, 200);
  assert.equal(nextJourneyDay(j, p[j.id]), 3);
  assert.equal(p[j.id].startedAt, 100);
  let all = p;
  for (let d = 3; d <= 7; d++) all = completeJourneyDay(all, j, d, 300);
  assert.equal(nextJourneyDay(j, all[j.id]), null);
});

const s = (id: string, at: number, seconds: number, extra: Partial<BreathSession> = {}): BreathSession => ({ id, at, patternId: 'calm', seconds, ...extra });
const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();

test('the week chart, favorite and totals', () => {
  const now = noon('2026-10-20');
  const log = [s('a', noon('2026-10-20'), 180, { bpmStart: 80, bpmEnd: 70, after: 4 }), s('b', noon('2026-10-19'), 300, { patternId: 'box', bpmStart: 76, bpmEnd: 72, after: 5 }), s('c', noon('2026-10-19'), 120, { bpmStart: 90, bpmEnd: 80, after: 3 }), s('d', noon('2026-10-10'), 600)];
  const days = dailyMinutes(log, now, 7);
  assert.equal(days.length, 7);
  assert.equal(days[6].minutes, 3);
  assert.equal(days[5].minutes, 7);
  assert.equal(days[0].minutes, 0);
  assert.deepEqual(favouriteTechnique(log), { patternId: 'calm', count: 3 });
  const t = breathTotals(log);
  assert.equal(t.minutes, 20);
  assert.equal(t.avgBpmChange, -8);
  assert.equal(t.avgCalm, 4);
  assert.equal(breathTotals(log.slice(0, 2)).avgBpmChange, null); // fewer than three
  assert.equal(favouriteTechnique([]), null);
});

test('the suggestion follows the time of day', () => {
  assert.equal(suggestedNow(23).technique, 'drift');
  assert.equal(suggestedNow(8).technique, 'focus');
  assert.equal(suggestedNow(14).technique, 'resonance');
  assert.equal(suggestedNow(19).technique, 'longout');
});
