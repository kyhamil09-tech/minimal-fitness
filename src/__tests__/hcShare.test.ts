import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SHARE, NO_SHARE, SHARE_ITEMS, sanitizeShare, shareGranted } from '../lib/hcShare';
import { DEFAULT_PREFS, sanitizePrefs } from '../lib/prefs';

test('nothing is shared by default', () => {
  assert.deepEqual(DEFAULT_PREFS.hcShare, NO_SHARE);
  assert.ok(Object.values(sanitizePrefs({}).hcShare).every((v) => v === false));
});

test('someone who already had sending on keeps sending everything until they choose', () => {
  assert.deepEqual(sanitizePrefs({ writeHealthConnect: true }).hcShare, ALL_SHARE);
  assert.deepEqual(sanitizePrefs({ writeHealthConnect: false }).hcShare, NO_SHARE);
});

test('a saved list wins over the old switch, and junk values count as not ticked', () => {
  const kept = sanitizePrefs({ writeHealthConnect: true, hcShare: { ...NO_SHARE, workouts: true } as never }).hcShare;
  assert.equal(kept.workouts, true);
  assert.equal(kept.food, false);
  const junk = sanitizeShare({ workouts: 'yes', food: 1, water: true }, true);
  assert.equal(junk.workouts, false);
  assert.equal(junk.food, false);
  assert.equal(junk.water, true);
});

test('every item names real write permissions and a known group', () => {
  const groups = ['activity', 'heart', 'sleep', 'body', 'nutrition', 'vitals', 'mindfulness'];
  for (const i of SHARE_ITEMS) {
    assert.ok(i.perms.length > 0 && i.perms.every((p) => p.startsWith('WRITE_')), i.id);
    assert.ok(groups.includes(i.group), i.id);
  }
});

test('an item counts as granted only when none of its permissions are missing', () => {
  const workouts = SHARE_ITEMS.find((i) => i.id === 'workouts')!;
  assert.equal(shareGranted(workouts, ['WRITE_NUTRITION']), true);
  assert.equal(shareGranted(workouts, ['WRITE_DISTANCE']), false);
  assert.equal(shareGranted(workouts, undefined), false);
});
