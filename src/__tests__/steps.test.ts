import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateOldSteps, recordSource, resolveDay, resolveSteps, usesHealthConnect, usesPhone } from '../lib/steps';

test('a source keeps its highest reading and ignores empty ones', () => {
  let by = recordSource({}, '2026-10-05', 'phone', 4000);
  by = recordSource(by, '2026-10-05', 'phone', 3000);
  by = recordSource(by, '2026-10-05', 'watch', 0);
  by = recordSource(by, '2026-10-05', 'watch', NaN);
  assert.deepEqual(by, { '2026-10-05': { phone: 4000 } });
});

test('each source choice only counts its own steps', () => {
  const day = { phone: 5000, watch: 7000, hc: 6000 };
  assert.equal(resolveDay(day, 'auto'), 7000);
  assert.equal(resolveDay(day, 'phone'), 5000);
  assert.equal(resolveDay(day, 'watch'), 7000);
  assert.equal(resolveDay(day, 'health-connect'), 6000);
  assert.equal(resolveDay(undefined, 'auto'), 0);
});

test('history from before sources were separated counts under every choice', () => {
  const day = { old: 9000, phone: 100 };
  assert.equal(resolveDay(day, 'phone'), 9000);
  assert.equal(resolveDay(day, 'watch'), 9000);
});

test('a day you set beats every source, and zero deletes the day', () => {
  const by = { a: { phone: 5000 }, b: { phone: 6000 } };
  const out = resolveSteps(by, 'auto', { a: 0, c: 1200 });
  assert.equal(out.a, 0);
  assert.equal(out.b, 6000);
  assert.equal(out.c, 1200);
});

test('removing the override returns the automatic count', () => {
  const by = { a: { phone: 5000 } };
  assert.equal(resolveSteps(by, 'auto', {}).a, 5000);
});

test('old totals move across except for today', () => {
  const by = migrateOldSteps({ '2026-10-03': 8000, '2026-10-05': 3000 }, {}, '2026-10-05');
  assert.deepEqual(by, { '2026-10-03': { old: 8000 } });
});

test('only the sources that are chosen are read', () => {
  assert.equal(usesPhone('auto'), true);
  assert.equal(usesPhone('watch'), false);
  assert.equal(usesHealthConnect('phone'), false);
  assert.equal(usesHealthConnect('health-connect'), true);
});
