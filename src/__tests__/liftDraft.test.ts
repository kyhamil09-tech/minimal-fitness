import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_KEY, DRAFT_MAX_AGE_MS, clearDraft, loadDraft, saveDraft } from '../lib/liftDraft';

const store = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const base = (over = {}) => ({
  startedAt: 1000,
  items: [{ exerciseId: 'bench', name: 'Bench Press', rows: [{ reps: '5', weight: '100', done: true }, { reps: '', weight: '', done: false }] }],
  cursor: 0,
  title: 'Push',
  notes: '',
  restEnds: 0,
  restTotal: 0,
  ...over,
});

test('a saved draft comes back exactly', () => {
  const s = store();
  saveDraft(s, base({ restEnds: 50_000, restTotal: 90 }), 10_000);
  const d = loadDraft(s, 20_000)!;
  assert.equal(d.items[0].rows[0].weight, '100');
  assert.equal(d.title, 'Push');
  assert.equal(d.restEnds, 50_000);
});

test('a rest that has already ended is not restored', () => {
  const s = store();
  saveDraft(s, base({ restEnds: 15_000 }), 10_000);
  assert.equal(loadDraft(s, 20_000)!.restEnds, 0);
});

test('an old or damaged draft is ignored, an empty one is not kept', () => {
  const s = store();
  saveDraft(s, base(), 10_000);
  assert.equal(loadDraft(s, 10_000 + DRAFT_MAX_AGE_MS + 1), null);
  s.m.set(DRAFT_KEY, '{nope');
  assert.equal(loadDraft(s), null);
  s.m.set(DRAFT_KEY, JSON.stringify({ v: 1, savedAt: 1, startedAt: 1, items: [{ exerciseId: 1 }] }));
  assert.equal(loadDraft(s, 2), null);
  saveDraft(s, base({ items: [] }), 5);
  assert.equal(s.m.has(DRAFT_KEY), false);
});

test('clearing removes it', () => {
  const s = store();
  saveDraft(s, base(), 10_000);
  clearDraft(s);
  assert.equal(loadDraft(s, 10_001), null);
});
