import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GroupableItem, afterGroupedSetDone, groupKind, groupLabel, groupRange, linkWithNext, removeAt, unlinkFromNext } from '../lib/supersets';

const item = (sets: boolean[], group?: string): GroupableItem => ({ group, rows: sets.map((done) => ({ done })) });
const groups = (items: GroupableItem[]) => items.map((i) => i.group);

test('exercises that sit together with the same group id form one group', () => {
  const items = [item([false]), item([false], 'g1'), item([false], 'g1'), item([false], 'g1'), item([false])];
  assert.deepEqual(groupRange(items, 2), [1, 3]);
  assert.deepEqual(groupRange(items, 0), [0, 0]);
  assert.equal(groupKind(items, 2), 'circuit');
  assert.equal(groupKind(items, 0), 'single');
  assert.equal(groupKind([item([false], 'g1'), item([false], 'g1')], 0), 'superset');
});

test('labels run A1, A2, B1 by group order and are empty for singles', () => {
  const items = [item([false]), item([false], 'g1'), item([false], 'g1'), item([false]), item([false], 'g2'), item([false], 'g2'), item([false], 'g2')];
  assert.deepEqual(items.map((_, i) => groupLabel(items, i)), ['', 'A1', 'A2', '', 'B1', 'B2', 'B3']);
});

test('linking joins an exercise to the next, and merges with the next one’s group', () => {
  let items = [item([false]), item([false]), item([false])];
  items = linkWithNext(items, 0);
  assert.deepEqual(groups(items), ['g1', 'g1', undefined]);
  items = linkWithNext(items, 1);
  assert.deepEqual(groups(items), ['g1', 'g1', 'g1']);
  // linking an exercise to a group that follows it pulls the whole group in
  const merged = linkWithNext([item([false]), item([false], 'g1'), item([false], 'g1')], 0);
  assert.deepEqual(groups(merged), ['g2', 'g2', 'g2']);
  // the last exercise has nothing to link to
  assert.equal(linkWithNext(items, 2), items);
});

test('unlinking splits a group, and a part left alone stops being a group', () => {
  const three = [item([false], 'g1'), item([false], 'g1'), item([false], 'g1')];
  const a = unlinkFromNext(three, 0);
  assert.deepEqual(groups(a), [undefined, 'g2', 'g2']);
  const b = unlinkFromNext(three, 1);
  assert.deepEqual(groups(b), ['g1', 'g1', undefined]);
  const two = unlinkFromNext([item([false], 'g1'), item([false], 'g1')], 0);
  assert.deepEqual(groups(two), [undefined, undefined]);
});

test('removing an exercise repairs its group', () => {
  const three = [item([false], 'g1'), item([false], 'g1'), item([false], 'g1')];
  assert.deepEqual(groups(removeAt(three, 1)), ['g1', 'g1']);
  const two = [item([false], 'g1'), item([false], 'g1'), item([false])];
  assert.deepEqual(groups(removeAt(two, 0)), [undefined, undefined]);
});

test('in a superset the first exercise leads straight to the second with no rest', () => {
  // Set 1 of A1 has just been ticked off.
  const items = [item([true, false, false], 'g1'), item([false, false, false], 'g1')];
  assert.deepEqual(afterGroupedSetDone(items, 0, 0), { cursor: 1, rest: false });
});

test('after the last exercise of the round: rest, then back to the top for the next round', () => {
  const items = [item([true, false, false], 'g1'), item([true, false, false], 'g1')];
  assert.deepEqual(afterGroupedSetDone(items, 1, 0), { cursor: 0, rest: true });
});

test('a circuit goes round in order', () => {
  const round = (a: boolean[], b: boolean[], c: boolean[]) => [item(a, 'g1'), item(b, 'g1'), item(c, 'g1')];
  assert.deepEqual(afterGroupedSetDone(round([true, false], [false, false], [false, false]), 0, 0), { cursor: 1, rest: false });
  assert.deepEqual(afterGroupedSetDone(round([true, false], [true, false], [false, false]), 1, 0), { cursor: 2, rest: false });
  assert.deepEqual(afterGroupedSetDone(round([true, false], [true, false], [true, false]), 2, 0), { cursor: 0, rest: true });
});

test('when the last round finishes the cursor moves past the group', () => {
  const items = [item([true], 'g1'), item([true], 'g1'), item([false])];
  assert.deepEqual(afterGroupedSetDone(items, 1, 0), { cursor: 2, rest: true });
});

test('uneven set counts: an exercise with no set for that round is skipped', () => {
  // A has 3 sets, B only 2: after A's third set there is no B set 3, so the round ends and it rests.
  const done = [item([true, true, true], 'g1'), item([true, true], 'g1')];
  // everything is finished: rest, and there is nowhere further to go, so the cursor stays on the group's last exercise
  assert.deepEqual(afterGroupedSetDone(done, 0, 2), { cursor: 1, rest: true });
  // B's third round does not exist, so A's third set ends the round even though B is not "ahead"
  const pending = [item([true, true, true], 'g1'), item([true, true], 'g1'), item([false])];
  assert.deepEqual(afterGroupedSetDone(pending, 0, 2), { cursor: 2, rest: true });
});

test('an exercise on its own keeps the normal behaviour', () => {
  assert.equal(afterGroupedSetDone([item([true, false]), item([false])], 0, 0), null);
});

test('the watch’s Done button follows the superset: partner exercise next with no rest, rest after the round', async () => {
  const { applyStrengthCommand } = await import('../lib/watchStrength');
  const row = () => ({ reps: '8', weight: '20', done: false });
  const state = {
    items: [
      { exerciseId: 'bench-press', name: 'Bench', rows: [row(), row()], group: 'g1' },
      { exerciseId: 'barbell-row', name: 'Row', rows: [row(), row()], group: 'g1' },
      { exerciseId: 'squat', name: 'Squat', rows: [row()] },
    ],
    cursor: 0,
  };
  const first = applyStrengthCommand(state, { action: 'done' }, 'metric');
  assert.equal(first.state.cursor, 1); // straight to the Row
  assert.deepEqual(first.rest, { kind: 'skip' }); // no rest between the two
  const second = applyStrengthCommand(first.state, { action: 'done' }, 'metric');
  assert.equal(second.state.cursor, 0); // round two starts back at the Bench
  assert.deepEqual(second.rest, { kind: 'start' }); // rest after the round
});

test('the watch keeps its usual behaviour for an exercise on its own', async () => {
  const { applyStrengthCommand } = await import('../lib/watchStrength');
  const state = { items: [{ exerciseId: 'squat', name: 'Squat', rows: [{ reps: '8', weight: '20', done: false }, { reps: '8', weight: '20', done: false }] }], cursor: 0 };
  const out = applyStrengthCommand(state, { action: 'done' }, 'metric');
  assert.equal(out.state.cursor, 0);
  assert.deepEqual(out.rest, { kind: 'start' });
});
