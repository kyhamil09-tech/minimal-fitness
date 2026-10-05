import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMilestone } from '../lib/milestones';
import { paceGapSec, verdictMessage } from '../lib/targets';

const said = (...ids: string[]) => new Set(ids);

test('distance goal says halfway once, then the last kilometre', () => {
  assert.equal(nextMilestone({ type: 'distance', goal: 10, done: 2, said: said() }), null);
  assert.equal(nextMilestone({ type: 'distance', goal: 10, done: 5.1, said: said('quarter') })?.text, 'Halfway.');
  assert.equal(nextMilestone({ type: 'distance', goal: 10, done: 5.2, said: said('quarter', 'half') }), null);
  assert.equal(nextMilestone({ type: 'distance', goal: 10, done: 9.05, said: said('quarter', 'half', 'three-quarter') })?.text, 'Last kilometre.');
});

test('a late first fix does not replay earlier cues', () => {
  const m = nextMilestone({ type: 'distance', goal: 10, done: 9.6, said: said() });
  assert.equal(m?.id, 'last-500');
  assert.equal(m?.text, '400 metres to go.');
});

test('time goal counts down in minutes', () => {
  assert.equal(nextMilestone({ type: 'time', goal: 30, done: 25.5, said: said('quarter', 'half', 'three-quarter') })?.text, 'Five minutes to go.');
  assert.equal(nextMilestone({ type: 'time', goal: 30, done: 29.2, said: said('last-5') })?.id, 'last-1');
});

test('short goals only say halfway and the end', () => {
  assert.equal(nextMilestone({ type: 'distance', goal: 2, done: 1.1, said: said() })?.id, 'half');
});

test('pace messages say how far off you are', () => {
  assert.equal(paceGapSec(3.0, 300)?.toFixed(0), '33');
  assert.equal(verdictMessage('slow', 33), 'Speed up, you are 35 seconds per kilometre behind');
  assert.equal(verdictMessage('fast', -12), 'Slow down');
  assert.equal(verdictMessage('fast', 12), 'Slow down, you are 10 seconds per kilometre ahead');
  assert.equal(verdictMessage('high'), 'Heart rate high, ease off');
});
