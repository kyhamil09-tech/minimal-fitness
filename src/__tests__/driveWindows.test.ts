import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_DRIVE_MS, planDriveWindows } from '../lib/driveWindows';

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 10, 18);

test('a drive becomes one period on its day', () => {
  const plan = planDriveWindows([[at(2026, 10, 10, 8, 10), at(2026, 10, 10, 8, 50)]], [], [], NOW);
  assert.deepEqual(plan, [{ key: at(2026, 10, 10, 8, 10), date: '2026-10-10', fromMs: at(2026, 10, 10, 8, 10), toMs: at(2026, 10, 10, 8, 50) }]);
});

test('a drive across midnight is split, because steps are kept per day', () => {
  const start = at(2026, 10, 9, 23, 40);
  const end = at(2026, 10, 10, 0, 20);
  const plan = planDriveWindows([[start, end]], [], [], NOW);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan.map((w) => w.date), ['2026-10-09', '2026-10-10']);
  assert.equal(plan[0].toMs, at(2026, 10, 10, 0, 0));
  assert.equal(plan[1].fromMs, at(2026, 10, 10, 0, 0));
  assert.equal(plan[0].key, start);
  assert.equal(plan[1].key, start);
});

test('drives already dealt with, too short, or not over yet are left out', () => {
  const ok: [number, number] = [at(2026, 10, 10, 8, 0), at(2026, 10, 10, 8, 30)];
  const short: [number, number] = [at(2026, 10, 10, 9, 0), at(2026, 10, 10, 9, 0) + MIN_DRIVE_MS - 1000];
  const future: [number, number] = [at(2026, 10, 10, 17, 30), at(2026, 10, 10, 19, 0)];
  const backwards: [number, number] = [at(2026, 10, 10, 12, 0), at(2026, 10, 10, 11, 0)];
  assert.equal(planDriveWindows([ok, short, future, backwards], [], [], NOW).length, 1);
  // Put back by the user earlier: its start is in the handled list, so it does not return.
  assert.equal(planDriveWindows([ok], [ok[0]], [], NOW).length, 0);
});

test('a stretch already taken out by hand is not taken out twice', () => {
  const drive: [number, number] = [at(2026, 10, 10, 8, 0), at(2026, 10, 10, 8, 40)];
  const byHand = [{ date: '2026-10-10', fromMs: at(2026, 10, 10, 8, 5), toMs: at(2026, 10, 10, 8, 35) }];
  assert.equal(planDriveWindows([drive], [], byHand, NOW).length, 0);
  // Another day's period does not matter.
  assert.equal(planDriveWindows([drive], [], [{ ...byHand[0], date: '2026-10-09' }], NOW).length, 1);
});
