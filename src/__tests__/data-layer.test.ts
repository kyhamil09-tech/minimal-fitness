import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBackup, buildBackup, clearAppData, parseBackup, workoutsToCsv } from '../lib/backup';
import { mapOpenFoodFacts } from '../lib/barcode';
import { decimateRoute, haversineKm, routeToSvgPoints } from '../lib/geo';
import { aggregate, makeBuckets } from '../lib/trends';
import { computeAchievements } from '../lib/achievements';
import { DEFAULT_GOALS } from '../data/defaults';
import { parseHeartRateMeasurement } from '../hooks/useBleHeartRate';
import { WorkoutSession } from '../types/health';

class FakeStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

test('backup only includes this app\'s keys and round-trips', () => {
  const s = new FakeStorage();
  s.setItem('kyfit_workouts', '[1,2]');
  s.setItem('aegis_theme_id', 'hyper_mint');
  s.setItem('someone_elses_key', 'secret');

  const backup = buildBackup(s);
  assert.deepEqual(Object.keys(backup.data).sort(), ['aegis_theme_id', 'kyfit_workouts']);

  const restored = new FakeStorage();
  restored.setItem('kyfit_stale', 'old');
  restored.setItem('unrelated', 'keep');
  const parsed = parseBackup(JSON.stringify(backup));
  applyBackup(parsed, restored);

  assert.equal(restored.getItem('kyfit_workouts'), '[1,2]');
  assert.equal(restored.getItem('kyfit_stale'), null); // replaced
  assert.equal(restored.getItem('unrelated'), 'keep'); // untouched
});

test('parseBackup rejects bad input with readable errors', () => {
  assert.throws(() => parseBackup('not json'), /valid JSON/);
  assert.throws(() => parseBackup('{"hello":1}'), /not a Minimal Fitness backup/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'ky-fitness', version: 9, data: {} })), /Unsupported/);
});

test('parseBackup drops foreign keys and non-string values', () => {
  const p = parseBackup(
    JSON.stringify({ app: 'ky-fitness', version: 1, data: { kyfit_a: '1', evil_key: 'x', kyfit_b: 5 } })
  );
  assert.deepEqual(Object.keys(p.data), ['kyfit_a']);
});

test('clearAppData leaves other keys alone', () => {
  const s = new FakeStorage();
  s.setItem('kyfit_a', '1');
  s.setItem('other', '2');
  clearAppData(s);
  assert.equal(s.getItem('kyfit_a'), null);
  assert.equal(s.getItem('other'), '2');
});

test('CSV export escapes commas and quotes', () => {
  const w: WorkoutSession = {
    id: '1',
    type: 'Running',
    timestamp: 'x',
    startedAt: Date.UTC(2026, 0, 1),
    durationMinutes: 30,
    avgHeartRate: 150,
    caloriesBurned: 300,
    notes: 'felt "great", fast',
  };
  const csv = workoutsToCsv([w]).split('\n');
  assert.equal(csv.length, 2);
  assert.ok(csv[1].includes('"felt ""great"", fast"'));
});

test('Open Food Facts mapping', () => {
  const p = mapOpenFoodFacts({
    status: 1,
    product: {
      product_name: ' Oat Bar ',
      serving_quantity: 40,
      nutriments: { 'energy-kcal_100g': 400, proteins_100g: 8.04, carbohydrates_100g: 60, fat_100g: 12 },
    },
  });
  assert.deepEqual(p, {
    name: 'Oat Bar',
    per100g: { calories: 400, proteinG: 8, carbsG: 60, fatG: 12 },
    servingG: 40,
  });
  assert.equal(mapOpenFoodFacts({ status: 0 }), null);
  assert.equal(mapOpenFoodFacts({ status: 1, product: { product_name: 'Empty', nutriments: {} } }), null);
  // kJ fallback: 1674 kJ ≈ 400 kcal
  assert.equal(mapOpenFoodFacts({ status: 1, product: { nutriments: { energy_100g: 1674, fat_100g: 1 } } })?.per100g.calories, 400);
});

test('haversine distance', () => {
  assert.ok(Math.abs(haversineKm([0, 0], [0, 1]) - 111.19) < 0.5);
  assert.equal(haversineKm([10, 10], [10, 10]), 0);
});

test('route helpers', () => {
  assert.equal(routeToSvgPoints([[0, 0]], 100, 100), '');
  const pts = routeToSvgPoints([[0, 0], [0.001, 0.001], [0.002, 0]], 100, 100).split(' ');
  assert.equal(pts.length, 3);
  const long = Array.from({ length: 1000 }, (_, i) => [i, i] as [number, number]);
  const d = decimateRoute(long, 100);
  assert.equal(d.length, 100);
  assert.deepEqual(d[0], [0, 0]);
  assert.deepEqual(d[99], [999, 999]);
});

test('trend buckets and aggregation', () => {
  const { buckets } = makeBuckets('7d', '2026-10-03');
  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].id, '2026-09-27');
  assert.equal(buckets[0].label, 'Sun');
  assert.equal(buckets[6].id, '2026-10-03');

  const sums = aggregate(
    [
      { key: '2026-10-03', value: 30 },
      { key: '2026-10-03', value: 15 },
    ],
    '7d',
    '2026-10-03',
    'sum'
  );
  assert.equal(sums[6].value, 45);
  assert.equal(sums[0].value, 0);

  const year = aggregate(
    [
      { key: '2026-10-01', value: 2000 },
      { key: '2026-10-03', value: 3000 },
    ],
    '1y',
    '2026-10-03',
    'avg'
  );
  assert.equal(year.length, 12);
  assert.equal(year[0].id, '2025-11');
  assert.equal(year[11].id, '2026-10');
  assert.equal(year[11].value, 2500);
});

test('achievements unlock from real data', () => {
  const w: WorkoutSession = { id: '1', type: 'Running', timestamp: '', startedAt: Date.now(), durationMinutes: 30, avgHeartRate: 140, caloriesBurned: 300 };
  const empty = computeAchievements({ workouts: [], body: [], food: [], water: [], goals: DEFAULT_GOALS, today: '2026-10-03' });
  assert.ok(empty.every((a) => !a.unlocked));
  const one = computeAchievements({ workouts: [w], body: [], food: [], water: [], goals: DEFAULT_GOALS, today: '2026-10-03' });
  assert.equal(one.find((a) => a.id === 'first-workout')?.unlocked, true);
  assert.equal(one.find((a) => a.id === 'workouts-10')?.unlocked, false);
});

test('BLE heart-rate characteristic parsing', () => {
  assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0, 72]).buffer)), 72);
  assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([1, 0x2c, 0x01]).buffer)), 300);
});
