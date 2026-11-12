import test from 'node:test';
import assert from 'node:assert/strict';
import { Fix, TrackBuilder } from '../lib/geo';
import { GpsKalman } from '../lib/kalman';

const T0 = 1_700_000_000_000;
// About 11 m per 0.0001 degree of latitude.
const fix = (i: number, northM: number, extra: Partial<Fix> = {}): Fix => ({ ts: T0 + i * 1000, lat: 51 + northM / 111_320, lng: 0, acc: 6, ...extra });

test('a poor first fix does not start the route', () => {
  const b = new TrackBuilder();
  assert.equal(b.add(fix(0, 0, { acc: 35 })), false);
  assert.equal(b.points.length, 0);
  assert.equal(b.add(fix(1, 0, { acc: 8 })), true);
  assert.equal(b.points.length, 1);
});

test('after waiting a while with only poor fixes, the best available is accepted', () => {
  const b = new TrackBuilder();
  assert.equal(b.add(fix(0, 0, { acc: 35 })), false);
  assert.equal(b.add(fix(21, 0, { acc: 35 })), true);
});

test('standing still, as the GPS chip reports it, adds no distance', () => {
  const b = new TrackBuilder();
  b.add(fix(0, 0, { speed: 2.5 }));
  b.add(fix(1, 3, { speed: 2.5 }));
  const before = b.distanceKm;
  // Drifting 5 to 9 m while the chip says the speed is zero.
  for (let i = 2; i < 12; i++) b.add(fix(i, 3 + (i % 2 ? 9 : 5), { speed: 0.05 }));
  assert.equal(b.distanceKm, before);
});

test('real movement still counts when the chip reports a speed', () => {
  const b = new TrackBuilder();
  for (let i = 0; i < 20; i++) b.add(fix(i, i * 3, { speed: 3 }));
  assert.ok(b.distanceKm > 0.05 && b.distanceKm < 0.07, `distance was ${b.distanceKm}`);
});

test('recent speed prefers the chip speed over positions', () => {
  const b = new TrackBuilder();
  for (let i = 0; i < 6; i++) b.add(fix(i, i * 3, { speed: 4 }));
  assert.equal(b.recentSpeedMs(), 4);
});

test('the Kalman filter trusts a fast mover to be further away than a slow one', () => {
  const slow = new GpsKalman(3);
  const fast = new GpsKalman(3);
  slow.update({ ts: T0, lat: 51, lng: 0, acc: 5, speed: 0.5 });
  fast.update({ ts: T0, lat: 51, lng: 0, acc: 5, speed: 9 });
  // One second later the position jumps 8 m north.
  const north = 8 / 111_320;
  const s = slow.update({ ts: T0 + 1000, lat: 51 + north, lng: 0, acc: 5, speed: 0.5 });
  const f = fast.update({ ts: T0 + 1000, lat: 51 + north, lng: 0, acc: 5, speed: 9 });
  assert.ok(f.lat > s.lat, 'the fast mover follows the new reading more closely');
});
