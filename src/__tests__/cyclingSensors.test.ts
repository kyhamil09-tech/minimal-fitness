import test from 'node:test';
import assert from 'node:assert/strict';
import { CyclingDecoder, bestAverage, estimateFtp, hexToBytes, parseCsc, parsePower, powerLoad, powerZoneSeconds, summarizePower } from '../lib/cyclingSensors';

const hex = (...b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join('');
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

test('speed and cadence bytes decode', () => {
  const c = parseCsc([0x03, ...le32(1000), ...le16(2048), ...le16(500), ...le16(1024)])!;
  assert.deepEqual(c, { wheelRevs: 1000, wheelTime: 2048, crankRevs: 500, crankTime: 1024 });
  assert.deepEqual(parseCsc([0x02, ...le16(10), ...le16(20)]), { crankRevs: 10, crankTime: 20 });
  assert.equal(parseCsc([0x01, 1, 2]), null);
});

test('power bytes decode, including negative noise and crank data', () => {
  assert.equal(parsePower([0, 0, ...le16(250)])!.watts, 250);
  assert.equal(parsePower([0, 0, 0xfe, 0xff])!.watts, -2);
  // flags: pedal balance (bit0) + crank data (bit5)
  const p = parsePower([...le16(0x21), ...le16(180), 50, ...le16(77), ...le16(4096)])!;
  assert.equal(p.watts, 180);
  assert.equal(p.crankRevs, 77);
  assert.equal(p.crankTime, 4096);
  assert.equal(parsePower([0, 0]), null);
});

test('cadence from successive crank events, with the counter wrapping', () => {
  const d = new CyclingDecoder();
  d.push('2a5b', [0x02, ...le16(65530), ...le16(1000)]);
  // 6 revolutions in 4 seconds (4096 ticks) = 90 rpm, across the 16-bit wrap
  const live = d.push('2a5b', [0x02, ...le16(0), ...le16(1000 + 4096)]);
  assert.equal(live.cadenceRpm, 90);
});

test('speed from the wheel: 2.105 m rollout, 10 revolutions per second is about 75.8 km/h', () => {
  const d = new CyclingDecoder(2105);
  d.push('2a5b', [0x01, ...le32(0), ...le16(0)]);
  const live = d.push('2a5b', [0x01, ...le32(10), ...le16(1024)]);
  assert.equal(live.speedKmh, 75.8);
  // 2 revolutions in 1 s with a 2 m wheel: 14.4 km/h
  const d2 = new CyclingDecoder(2000);
  d2.push('2a5b', [0x01, ...le32(100), ...le16(0)]);
  assert.equal(d2.push('2a5b', [0x01, ...le32(102), ...le16(1024)]).speedKmh, 14.4);
});

test('a repeated event does not change cadence, a stop with no revolutions reads zero', () => {
  const d = new CyclingDecoder();
  d.push('2a5b', [0x02, ...le16(10), ...le16(0)]);
  d.push('2a5b', [0x02, ...le16(11), ...le16(1024)]);
  assert.equal(d.live.cadenceRpm, 60);
  d.push('2a5b', [0x02, ...le16(11), ...le16(1024)]);
  assert.equal(d.live.cadenceRpm, 60);
  d.push('2a5b', [0x02, ...le16(11), ...le16(2048)]);
  assert.equal(d.live.cadenceRpm, 0);
});

test('power meter readings feed the same decoder', () => {
  const d = new CyclingDecoder();
  assert.equal(d.push('2a63', [...le16(0), ...le16(210)]).powerW, 210);
  assert.equal(hexToBytes(hex(1, 255, 16)).join(','), '1,255,16');
});

test('summary: normalised power is above the plain average for a surgy ride', () => {
  const steady = Array(600).fill(200);
  assert.deepEqual(summarizePower(steady), { avgW: 200, maxW: 200, npW: 200, seconds: 600 });
  const surgy = Array.from({ length: 600 }, (_, i) => (Math.floor(i / 60) % 2 ? 100 : 300));
  const s = summarizePower(surgy)!;
  assert.equal(s.avgW, 200);
  assert.ok(s.npW > 200);
  assert.equal(summarizePower([100, 100]), null);
});

test('load: an hour at threshold scores 100; zones and bests', () => {
  assert.equal(powerLoad(250, 3600, 250), 100);
  assert.equal(powerLoad(200, 3600, 250), 64);
  assert.equal(powerLoad(200, 3600, 0), 0);
  const z = powerZoneSeconds([100, 150, 200, 240, 270, 320], 250);
  assert.deepEqual(z, [1, 1, 1, 1, 1, 1]);
  assert.equal(bestAverage([100, 300, 300, 100], 2), 300);
  assert.equal(bestAverage([1], 2), null);
  assert.equal(estimateFtp([{ bestPower20W: 300, durationMinutes: 60 }]), 285);
  assert.equal(estimateFtp([{ normPowerW: 200, durationSec: 3600, durationMinutes: 60 }]), 180);
  assert.equal(estimateFtp([]), null);
});
