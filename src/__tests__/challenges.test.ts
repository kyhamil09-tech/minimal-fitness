import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Challenge,
  addUpdate,
  challengeStatus,
  cleanName,
  decodeChallenge,
  decodeUpdate,
  encodeChallenge,
  encodeUpdate,
  joinChallenge,
  leaderboard,
  myDays,
  newChallenge,
  sum,
} from '../lib/challenges';
import { WorkoutSession } from '../types/health';

const url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const def = { id: 'abc123xyz9', title: 'Weekend warriors', metric: 'steps' as const, start: '2026-10-12', end: '2026-10-18' };

test('a challenge code round-trips, including names with accents and emoji', () => {
  const code = encodeChallenge({ ...def, title: 'Café run 🏃' });
  assert.ok(code.startsWith('KYFIT-CHALLENGE-1:'));
  assert.deepEqual(decodeChallenge(code), { ...def, title: 'Café run 🏃' });
  assert.deepEqual(decodeChallenge(`Join my challenge!\n${code}\nSee you there`), { ...def, title: 'Café run 🏃' }, 'works when pasted inside a message');
});

test('broken, wrong or hostile challenge codes are refused', () => {
  assert.equal(decodeChallenge(''), null);
  assert.equal(decodeChallenge('KYFIT-CHALLENGE-1:!!!'), null);
  assert.equal(decodeChallenge('KYFIT-CHALLENGE-1:' + btoa('{"v":2}')), null);
  const bad = (patch: object) => 'KYFIT-CHALLENGE-1:' + url({ v: 1, id: def.id, t: def.title, m: 'steps', s: def.start, e: def.end, ...patch });
  assert.ok(decodeChallenge(bad({})), 'the base code is valid');
  assert.equal(decodeChallenge(bad({ m: 'gold' })), null);
  assert.equal(decodeChallenge(bad({ s: '2026-13-40' })), null);
  assert.equal(decodeChallenge(bad({ e: '2026-10-01' })), null, 'ends before it starts');
  assert.equal(decodeChallenge(bad({ e: '2027-10-18' })), null, 'a year is too long');
  assert.equal(decodeChallenge(bad({ id: 'x' })), null);
  assert.equal(decodeChallenge(bad({ t: '   ' })), null);
});

test('titles and names lose control characters and angle brackets and are cut short', () => {
  assert.equal(cleanName('  Sam\u0000<b>Jones</b> '), 'SambJones/b');
  assert.equal(cleanName(''), 'Friend');
  assert.equal(cleanName(42 as never), 'Friend');
  assert.equal(cleanName('x'.repeat(100)).length, 24);
});

const entry = (p: string, n: string, total: number, ts = 1000) => ({ p, n, total, days: [total], ts });

test('an update code round-trips and refuses nonsense numbers', () => {
  const e = { p: 'friend0001', n: 'Alex', total: 53210.5, days: [10000, 12000, 31210.5], ts: 1_760_000_000_000 };
  const code = encodeUpdate(def.id, e);
  assert.deepEqual(decodeUpdate(code), { challengeId: def.id, entry: e });
  const raw = (patch: object) => 'KYFIT-UPDATE-1:' + url({ v: 1, c: def.id, p: 'friend0001', n: 'A', total: 5, d: [5], ts: 5, ...patch });
  assert.ok(decodeUpdate(raw({})));
  assert.equal(decodeUpdate(raw({ total: -1 })), null);
  assert.equal(decodeUpdate(raw({ total: 1e12 })), null);
  assert.equal(decodeUpdate(raw({ total: 'lots' })), null);
  assert.equal(decodeUpdate(raw({ c: 'no' })), null);
  assert.equal(decodeUpdate('KYFIT-UPDATE-1:'), null);
  assert.equal(decodeUpdate(encodeChallenge(def)), null, 'a challenge code is not an update');
  assert.equal(decodeUpdate(raw({ n: '<script>alert(1)</script>' }))?.entry.n, 'scriptalert(1)/script');
});

const workout = (daysFromStart: number, km: number, min: number): WorkoutSession =>
  ({ id: `w${daysFromStart}${km}`, type: 'Running', timestamp: '', startedAt: new Date(2026, 9, 12 + daysFromStart, 8, 0, 0).getTime(), durationMinutes: min, distanceKm: km, avgHeartRate: 0, caloriesBurned: 0 }) as WorkoutSession;

test('my numbers come from my own steps and workouts, day by day, and never count future days', () => {
  const steps = { '2026-10-12': 8000, '2026-10-13': 12000, '2026-10-14': 5000, '2026-10-20': 99999 };
  assert.deepEqual(myDays('steps', '2026-10-12', '2026-10-18', steps, [], '2026-10-14'), [8000, 12000, 5000, 0, 0, 0, 0]);
  const ws = [workout(0, 5, 30), workout(0, 3, 20), workout(1, 10, 55), workout(9, 8, 40)];
  assert.deepEqual(myDays('distance', '2026-10-12', '2026-10-14', {}, ws, '2026-10-14'), [8, 10, 0]);
  assert.deepEqual(myDays('workouts', '2026-10-12', '2026-10-14', {}, ws, '2026-10-14'), [2, 1, 0]);
  assert.deepEqual(myDays('minutes', '2026-10-12', '2026-10-14', {}, ws, '2026-10-14'), [50, 55, 0]);
  assert.equal(sum([0.1, 0.2]), 0.3);
});

test('status says whether a challenge is upcoming, active or finished and how many days are left', () => {
  assert.deepEqual(challengeStatus(def, '2026-10-10'), { status: 'upcoming', daysLeft: 7, day: 0, totalDays: 7 });
  assert.deepEqual(challengeStatus(def, '2026-10-12'), { status: 'active', daysLeft: 6, day: 1, totalDays: 7 });
  assert.deepEqual(challengeStatus(def, '2026-10-18'), { status: 'active', daysLeft: 0, day: 7, totalDays: 7 });
  assert.equal(challengeStatus(def, '2026-10-19').status, 'finished');
});

test('creating a challenge sets a start, an end and my own id, and joining gives me a different id', () => {
  const c = newChallenge('  My week  ', 'distance', 7, '2026-10-12');
  assert.equal(c.title, 'My week');
  assert.equal(c.end, '2026-10-18');
  assert.match(c.id, /^[a-z0-9]{10}$/);
  assert.notEqual(c.id, c.me);
  assert.equal(newChallenge('', 'steps', 3, '2026-10-12').title, 'Steps challenge');
  assert.equal(newChallenge('x', 'steps', 400, '2026-10-12').end, '2026-11-11', 'capped at 31 days');
  const joined = joinChallenge(def);
  assert.equal(joined.id, def.id);
  assert.notEqual(joined.me, def.id);
  assert.deepEqual(joined.entries, {});
});

test('the leaderboard ranks everyone, shares ranks on ties, and always shows me from live numbers', () => {
  const c: Challenge = { ...def, me: 'me00000001', entries: { a000000001: entry('a000000001', 'Alex', 40000), b000000001: entry('b000000001', 'Bo', 52000), c000000001: entry('c000000001', 'Cy', 40000) }, createdAt: 1 };
  const rows = leaderboard(c, entry('me00000001', 'Me', 45000));
  assert.deepEqual(rows.map((r) => [r.name, r.rank]), [['Bo', 1], ['Me', 2], ['Alex', 3], ['Cy', 3]]);
  assert.equal(rows.find((r) => r.me)?.name, 'Me');
  const alone = leaderboard({ ...c, entries: {} }, entry('me00000001', 'Me', 0));
  assert.deepEqual(alone.map((r) => r.rank), [1]);
});

test('updates keep the newest per friend, and ones for other challenges, from me, or too many are refused', () => {
  const c: Challenge = { ...def, me: 'me00000001', entries: {}, createdAt: 1 };
  const first = addUpdate(c, def.id, entry('a000000001', 'Alex', 100, 10)) as Challenge;
  assert.equal(first.entries.a000000001.total, 100);
  const newer = addUpdate(first, def.id, entry('a000000001', 'Alex', 150, 20)) as Challenge;
  assert.equal(newer.entries.a000000001.total, 150);
  const older = addUpdate(newer, def.id, entry('a000000001', 'Alex', 90, 5)) as Challenge;
  assert.equal(older.entries.a000000001.total, 150, 'an older update never replaces a newer one');
  assert.ok('error' in (addUpdate(c, 'other00000', entry('a000000001', 'Alex', 1)) as object));
  assert.ok('error' in (addUpdate(c, def.id, entry('me00000001', 'Me', 1)) as object));
  let full = c;
  for (let i = 0; i < 50; i++) full = addUpdate(full, def.id, entry(`p${String(i).padStart(9, '0')}`, `F${i}`, i)) as Challenge;
  assert.ok('error' in (addUpdate(full, def.id, entry('zzzzzzzzzz', 'One more', 1)) as object));
});

test('a pasted group chat gives every update in it, and a chat with a challenge code is told apart', async () => {
  const { decodeAllUpdates, classifyPaste, addUpdates, standingsMessage, leaderboard: lb, joinChallenge: join, challengeStatus: status } = await import('../lib/challenges');
  const c = join(def);
  const e = (p: string, n: string, total: number) => ({ p, n, total, days: [total], ts: 1 });
  const chat = `Sam: KYFIT-UPDATE: Weekend\n${encodeUpdate(def.id, e('aaaaaaaa', 'Sam', 9000))}\nJo: ${encodeUpdate(def.id, e('bbbbbbbb', 'Jo', 12000))}\nnoise KYFIT-UPDATE-1:!!!`;
  assert.equal(decodeAllUpdates(chat).length, 2);
  assert.equal(classifyPaste(chat).challenge, null);
  assert.ok(classifyPaste(encodeChallenge(def)).challenge);
  const res = addUpdates(c, decodeAllUpdates(chat));
  assert.equal(res.added, 2);
  assert.deepEqual(res.names.sort(), ['Jo', 'Sam']);
  const again = addUpdates(res.challenge, decodeAllUpdates(chat));
  assert.equal(again.added, 0);
  const other = addUpdates(c, [{ challengeId: 'zzzzzzzzzz', entry: e('cccccccc', 'X', 1) }]);
  assert.equal(other.skipped, 1);
  const board = lb(res.challenge, e(res.challenge.me, 'Me', 10000));
  const msg = standingsMessage(def, board, (v) => `${v} steps`, status(def, '2026-10-14'));
  assert.ok(msg.includes('1. Jo: 12000 steps') && msg.includes('Day 3 of 7'));
});

test('lifting volume can be a challenge measure', () => {
  const code = encodeChallenge({ ...def, metric: 'volume' });
  assert.equal(decodeChallenge(code)?.metric, 'volume');
});

test('saved video links are only usable https addresses', async () => {
  const { cleanLink, searchUrl } = await import('../lib/exerciseVideo');
  assert.equal(cleanLink('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(cleanLink('youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(cleanLink('http://example.com/x'), null);
  assert.equal(cleanLink('javascript:alert(1)'), null);
  assert.equal(cleanLink('https://user:pw@example.com/'), null);
  assert.equal(cleanLink('two words.com'), null);
  assert.ok(searchUrl('Bench Press').includes('Bench%20Press%20exercise%20form'));
});
