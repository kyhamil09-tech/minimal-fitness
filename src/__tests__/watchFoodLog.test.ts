import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInbox, resultText } from '../hooks/useWatchFoodLog';

test('the note back to the watch says what was logged, or why not, in a few words', () => {
  assert.equal(resultText('two eggs and toast', [{ name: 'Egg, large', kcal: 143 }, { name: 'Toast (1 slice)', kcal: 80 }], 0), 'Logged Egg, large, Toast, 223 kcal');
  assert.equal(resultText('a glass of water', [], 250), '250 ml water');
  assert.equal(resultText('x', [{ name: 'Apple', kcal: 95 }], 500), 'Logged Apple, 95 kcal. 500 ml water');
  assert.match(resultText('flibbertigibbet', [], 0), /Could not find "flibbertigibbet"/);
  assert.match(resultText('a b c d', [1, 2, 3, 4].map((n) => ({ name: `Food ${n}`, kcal: 10 })), 0), /and more/);
});

test('the inbox from the phone: only real, recent meals, and bad JSON is ignored', () => {
  const now = 1_800_000_000_000;
  const json = JSON.stringify([
    { at: now - 1000, text: 'two eggs' },
    { at: now - 1000, text: '   ' },
    { at: now - 30 * 24 * 3_600_000, text: 'too old' },
    { at: now + 10 * 60_000, text: 'from the future' },
    { text: 'no time' },
    7,
  ]);
  assert.deepEqual(parseInbox(json, now), [{ at: now - 1000, text: 'two eggs' }]);
  assert.deepEqual(parseInbox('not json', now), []);
  assert.deepEqual(parseInbox('{"a":1}', now), []);
  assert.deepEqual(parseInbox('[]', now), []);
});
