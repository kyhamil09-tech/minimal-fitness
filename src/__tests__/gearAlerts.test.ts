import test from 'node:test';
import assert from 'node:assert/strict';
import { Shoe, gearAlerts } from '../lib/shoes';
import { WorkoutSession } from '../types/health';

const shoe = (id: string, retireKm = 800, startKm = 0, over: Partial<Shoe> = {}): Shoe => ({ id, name: `Shoe ${id}`, startKm, retireKm, retired: false, addedAt: 0, ...over });
const run = (shoeId: string, km: number): WorkoutSession => ({ id: `${shoeId}-${km}`, type: 'Running', timestamp: '', durationMinutes: 30, distanceKm: km, avgHeartRate: 140, caloriesBurned: 300, shoeId }) as WorkoutSession;

test('worn at 85 percent, replace at the full distance, each said once', () => {
  const g = [shoe('a', 800)];
  assert.equal(gearAlerts(g, [run('a', 600)], {}).alerts.length, 0);
  const worn = gearAlerts(g, [run('a', 700)], {});
  assert.equal(worn.alerts.length, 1);
  assert.equal(worn.alerts[0].state, 'worn');
  assert.equal(gearAlerts(g, [run('a', 710)], worn.notified).alerts.length, 0); // not again
  const rep = gearAlerts(g, [run('a', 810)], worn.notified);
  assert.equal(rep.alerts[0].state, 'replace');
  assert.equal(gearAlerts(g, [run('a', 900)], rep.notified).alerts.length, 0);
});

test('jumping straight past both gives one alert at the higher level; retired gear is quiet; bikes say service', () => {
  const r = gearAlerts([shoe('a', 800, 790)], [run('a', 20)], {});
  assert.deepEqual(r.alerts.map((a) => a.state), ['replace']);
  assert.equal(gearAlerts([shoe('a', 800, 900, { retired: true })], [], {}).alerts.length, 0);
  const bike = gearAlerts([shoe('b', 1500, 1600, { kind: 'bike' })], [], {});
  assert.match(bike.alerts[0].title, /service due/);
});

test('raising the replace-by distance resets the record', () => {
  const first = gearAlerts([shoe('a', 800, 700)], [], {});
  assert.equal(first.alerts[0].state, 'worn');
  const raised = gearAlerts([shoe('a', 1200, 700)], [], first.notified);
  assert.equal(raised.alerts.length, 0);
  assert.deepEqual(raised.notified, {});
});
