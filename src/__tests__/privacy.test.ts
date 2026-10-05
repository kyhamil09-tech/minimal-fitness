import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NET_FEATURES, contentSecurityPolicy, featureForHost } from '../lib/netHosts';
import { DEFAULT_NET_PREFS, MAX_LOG, clearNetLog, judge, readNetLog, readNetPrefs, readNetTotals, recordRequest, writeNetPrefs, type KeyValueStore, type NetEntry } from '../lib/netGuard';
import { describePermissions, formatBytes, summarizeLocalData } from '../lib/privacyInfo';

const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

const entry = (over: Partial<NetEntry> = {}): NetEntry => ({
  t: 1,
  feature: 'weather',
  host: 'api.open-meteo.com',
  path: '/v1/forecast?latitude=51.50&longitude=-0.12',
  method: 'GET',
  sent: 120,
  result: 'ok',
  status: 200,
  ...over,
});

test('only the listed services are allowed, and everything else is refused', () => {
  const prefs = DEFAULT_NET_PREFS;
  for (const f of NET_FEATURES) for (const h of f.hosts) assert.deepEqual(judge(h, prefs), { allow: true, feature: f.id });
  for (const h of ['example.com', 'google-analytics.com', 'api.open-meteo.com.evil.test', 'www.strava.com.example.org']) {
    const v = judge(h, prefs);
    assert.equal(v.allow, false, h);
    assert.equal(v.feature, 'other');
  }
  assert.equal(featureForHost('TILE.OPENSTREETMAP.ORG'), 'maps');
  assert.equal(featureForHost('evil.test'), null);
});

test('offline mode and the per-feature switches block requests', () => {
  assert.equal(judge('api.open-meteo.com', { ...DEFAULT_NET_PREFS, offline: true }).allow, false);
  assert.equal(judge('www.strava.com', { ...DEFAULT_NET_PREFS, offline: true }).allow, false);
  assert.equal(judge('tile.openstreetmap.org', { ...DEFAULT_NET_PREFS, maps: false }).allow, false);
  assert.equal(judge('world.openfoodfacts.org', { ...DEFAULT_NET_PREFS, food: false }).allow, false);
  assert.equal(judge('world.openfoodfacts.org', { ...DEFAULT_NET_PREFS, maps: false }).allow, true);
});

test('preferences fall back to the defaults and survive a round trip', () => {
  const store = memory();
  assert.deepEqual(readNetPrefs(store), DEFAULT_NET_PREFS);
  writeNetPrefs({ offline: true }, store);
  assert.equal(readNetPrefs(store).offline, true);
  assert.equal(readNetPrefs(store).maps, true);
  store.setItem('kyfit_net_prefs', '{"offline":"yes","maps":5}');
  assert.deepEqual(readNetPrefs(store), DEFAULT_NET_PREFS);
});

test('the log keeps the newest requests and counts sent and blocked ones', () => {
  const store = memory();
  for (let i = 0; i < MAX_LOG + 20; i++) recordRequest(entry({ t: i }), store);
  recordRequest(entry({ result: 'blocked', why: 'Offline mode is on.', sent: 999 }), store);
  const log = readNetLog(store);
  assert.equal(log.length, MAX_LOG);
  assert.equal(log[log.length - 1].result, 'blocked');
  const totals = readNetTotals(store);
  assert.equal(totals.requests, MAX_LOG + 20);
  assert.equal(totals.blocked, 1);
  assert.equal(totals.sent, (MAX_LOG + 20) * 120); // blocked requests send nothing
  clearNetLog(store);
  assert.equal(readNetLog(store).length, 0);
  assert.equal(readNetTotals(store).requests, MAX_LOG + 20, 'clearing the list keeps the running totals');
});

test('the security policy lists exactly the web-view services and nothing else', () => {
  const csp = contentSecurityPolicy();
  assert.match(csp, /connect-src 'self' https:\/\/tile\.openstreetmap\.org https:\/\/server\.arcgisonline\.com https:\/\/api\.open-meteo\.com https:\/\/world\.openfoodfacts\.org(;|$)/);
  assert.ok(!csp.includes('strava'), 'Strava is called by native code, so the web view is not allowed to reach it');
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.ok(!/\*/.test(csp), 'no wildcards');
});

test('permissions are described in plain words and health permissions are summarised', () => {
  const groups = describePermissions([
    { name: 'android.permission.INTERNET', granted: true },
    { name: 'android.permission.ACCESS_FINE_LOCATION', granted: false },
    { name: 'android.permission.health.READ_SLEEP', granted: true },
    { name: 'android.permission.health.WRITE_SLEEP', granted: true },
    { name: 'android.permission.health.READ_STEPS', granted: false },
    { name: 'com.google.android.gms.permission.AD_ID', granted: true },
  ]);
  assert.equal(groups[0].label.startsWith('Health Connect: 2 of 3'), true);
  assert.ok(groups.some((g) => g.label.startsWith('Internet')));
  assert.ok(groups.some((g) => g.label.startsWith('Precise location') && !g.granted));
  assert.ok(!groups.some((g) => /ad id/i.test(g.label)), 'unknown third-party permissions are not listed as ours');
});

test('byte formatting and the local data summary', () => {
  assert.equal(formatBytes(-1), 'not reported');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  const s = summarizeLocalData({ kyfit_workouts: 3000, kyfit_sleep_logs: 2000, kyfit_food: 500, kyfit_prefs: 100, other_key: 99999 });
  assert.equal(s.totalBytes, 5600);
  assert.deepEqual(s.groups.map((g) => g.bytes), [3000, 2000, 500, 100]);
});
