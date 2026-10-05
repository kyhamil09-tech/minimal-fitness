import test from 'node:test';
import assert from 'node:assert/strict';
import { canShareLocation, normalizePhone, sanitizeLiveShare, sportWord } from '../lib/liveShare';

test('phone numbers are cleaned, and impossible ones are refused', () => {
  assert.equal(normalizePhone('+1 (555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('07911 123456'), '07911123456');
  assert.equal(normalizePhone('555-12'), null);
  assert.equal(normalizePhone('call me'), null);
  assert.equal(normalizePhone('+1234567890123456'), null);
});

test('settings are cleaned: duplicates dropped, at most three, switched off without a contact', () => {
  const cfg = sanitizeLiveShare({
    enabled: true,
    yourName: '  Sam  ',
    contacts: [
      { name: 'Mum', number: '+44 7911 123456' },
      { name: 'Mum again', number: '+447911123456' },
      { name: 'Bad', number: 'abc' },
      { name: 'A', number: '5551110001' },
      { name: 'B', number: '5551110002' },
      { name: 'C', number: '5551110003' },
    ],
    everyMin: 7 as never,
  });
  assert.equal(cfg.yourName, 'Sam');
  assert.deepEqual(cfg.contacts.map((c) => c.number), ['+447911123456', '5551110001', '5551110002']);
  assert.equal(cfg.everyMin, 10);
  assert.equal(cfg.enabled, true);
  assert.equal(sanitizeLiveShare({ enabled: true, contacts: [] }).enabled, false);
  assert.equal(sanitizeLiveShare(null).enabled, false);
});

test('only GPS sports can share, with plain words for the text', () => {
  assert.equal(canShareLocation('Running'), true);
  assert.equal(canShareLocation('Strength'), false);
  assert.equal(canShareLocation('IndoorCycling'), false);
  assert.equal(sportWord('Cycling'), 'ride');
  assert.equal(sportWord('Hiking'), 'hike');
  assert.equal(sportWord('Yoga'), 'workout');
});
