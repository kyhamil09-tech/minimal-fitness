import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityName, authorizeUrl, parseAuthCode, sportType, tokenFresh } from '../lib/strava';

test('authorize link carries the client id, scopes and redirect', () => {
  const url = authorizeUrl(' 12345 ');
  assert.ok(url.startsWith('https://www.strava.com/oauth/authorize?client_id=12345&'));
  assert.ok(url.includes('activity%3Awrite'));
  assert.ok(url.includes(encodeURIComponent('http://localhost/strava')));
});

test('the approval code is found in the pasted address or accepted bare', () => {
  assert.equal(parseAuthCode('http://localhost/strava?state=&code=abc123DEF456ghi789jkl&scope=read,activity:write'), 'abc123DEF456ghi789jkl');
  assert.equal(parseAuthCode('abc123DEF456ghi789jkl0'), 'abc123DEF456ghi789jkl0');
  assert.equal(parseAuthCode('http://localhost/strava?error=access_denied'), null);
  assert.equal(parseAuthCode('hello'), null);
});

test('workout types map to Strava sport types', () => {
  assert.equal(sportType('Running'), 'Run');
  assert.equal(sportType('Treadmill'), 'Run');
  assert.equal(sportType('Cycling'), 'Ride');
  assert.equal(sportType('Strength'), 'WeightTraining');
  assert.equal(sportType('Mobility'), 'Workout');
});

test('activity names follow the time of day', () => {
  const at = (h: number) => new Date(2026, 5, 1, h, 0).getTime();
  assert.equal(activityName('Running', at(7)), 'Morning Run');
  assert.equal(activityName('Cycling', at(14)), 'Afternoon Ride');
  assert.equal(activityName('Running', at(19)), 'Evening Run');
  assert.equal(activityName('Running', at(23)), 'Night Run');
});

test('a token is only reused while it has more than a minute left', () => {
  assert.equal(tokenFresh({ clientId: 'a', clientSecret: 'b', accessToken: 't', expiresAt: 1000 }, 900), true);
  assert.equal(tokenFresh({ clientId: 'a', clientSecret: 'b', accessToken: 't', expiresAt: 1000 }, 950), false);
  assert.equal(tokenFresh({ clientId: 'a', clientSecret: 'b' }, 0), false);
});
