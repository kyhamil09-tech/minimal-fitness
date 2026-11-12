import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBackup, parseBackup, workoutsToJson, BackupFile } from '../lib/backup';

const memory = (init: Record<string, string> = {}, failOn?: string) => {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k === failOn) throw new Error('quota');
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
  };
};

const backup = (data: Record<string, string>): BackupFile => ({ app: 'ky-fitness', version: 1, exportedAt: '', data });

test('a restore that fails halfway puts the current data back', () => {
  const s = memory({ kyfit_a: 'old-a', kyfit_b: 'old-b' }, 'kyfit_z');
  assert.throws(() => applyBackup(backup({ kyfit_a: 'new-a', kyfit_z: 'boom' }), s), /current data was kept/);
  assert.equal(s.map.get('kyfit_a'), 'old-a');
  assert.equal(s.map.get('kyfit_b'), 'old-b');
  assert.equal(s.map.has('kyfit_z'), false);
});

test('a restore that works replaces the data', () => {
  const s = memory({ kyfit_a: 'old', kyfit_b: 'old' });
  assert.equal(applyBackup(backup({ kyfit_a: 'new' }), s), 1);
  assert.equal(s.map.get('kyfit_a'), 'new');
  assert.equal(s.map.has('kyfit_b'), false);
});

test('a backup from a newer version is refused with a clear message', () => {
  assert.throws(() => parseBackup(JSON.stringify({ app: 'ky-fitness', version: 2, data: {} })), /newer version/);
});

test('the lifting JSON export carries a header and every workout', () => {
  const j = JSON.parse(workoutsToJson([{ id: 'w-1' } as never]));
  assert.equal(j.kind, 'lifting-history');
  assert.equal(j.count, 1);
  assert.equal(j.units, 'kg');
  assert.equal(j.workouts[0].id, 'w-1');
});
