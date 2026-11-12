import { WorkoutSession } from '../types/health';
import { addDays, parseDateKey, toDateKey, todayKey } from './dates';
import { workoutTotals } from './lifting';

/**
 * Friends and challenges with no accounts and no server. A challenge is a short code you send to friends in any app you like; each person
 * sends back an update code with their name and their total for the challenge, and every phone works out the leaderboard on its own.
 * What is in an update is only a display name, the challenge it belongs to, and the totals for the chosen measure: nothing else about
 * you. Codes are plain text, so people can read exactly what they are sharing. They cannot prove a total is honest: this is for friends.
 */

export type ChallengeMetric = 'steps' | 'distance' | 'workouts' | 'minutes' | 'volume';

export const METRICS: { id: ChallengeMetric; label: string; unit: string }[] = [
  { id: 'steps', label: 'Steps', unit: 'steps' },
  { id: 'distance', label: 'Distance', unit: 'km' },
  { id: 'workouts', label: 'Workouts', unit: 'workouts' },
  { id: 'minutes', label: 'Active minutes', unit: 'min' },
  { id: 'volume', label: 'Weight lifted', unit: 'kg' },
];

export const LENGTHS_DAYS = [3, 7, 14, 30] as const;

export interface ChallengeDef {
  id: string;
  title: string;
  metric: ChallengeMetric;
  /** First and last day, as date keys (inclusive). */
  start: string;
  end: string;
}

export interface ChallengeEntry {
  /** Who: a random id for this person in this challenge. */
  p: string;
  /** Display name. */
  n: string;
  /** Total for the whole challenge so far, in the metric's unit (km for distance). */
  total: number;
  /** One number per day from the start, for the day-by-day view. */
  days: number[];
  /** When the update was made (epoch ms): a newer update from the same person replaces an older one. */
  ts: number;
}

export interface Challenge extends ChallengeDef {
  /** My participant id in this challenge. */
  me: string;
  /** Updates received from friends, by participant id (mine is worked out live, never stored here). */
  entries: Record<string, ChallengeEntry>;
  createdAt: number;
}

const CHALLENGE_PREFIX = 'KYFIT-CHALLENGE-1:';
const UPDATE_PREFIX = 'KYFIT-UPDATE-1:';
const MAX_DAYS = 31;
const MAX_TOTAL = 10_000_000;

const B64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unB64 = (s: string): string => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** A random id of `n` letters and digits. */
export const randomId = (n = 10): string => {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(n);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

/** Keeps a name short and free of control characters; empty names become "Friend". */
export const cleanName = (name: unknown, fallback = 'Friend'): string => {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) : '';
  return s || fallback;
};

const cleanTitle = (t: unknown): string => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '');
const isKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(parseDateKey(k).getTime());
const isMetric = (m: unknown): m is ChallengeMetric => m === 'steps' || m === 'distance' || m === 'workouts' || m === 'minutes' || m === 'volume';
const isId = (x: unknown): x is string => typeof x === 'string' && /^[a-z0-9]{6,16}$/.test(x);

/** Days from the first to the last key, inclusive. */
export const dayKeysBetween = (start: string, end: string): string[] => {
  const out: string[] = [];
  let k = start;
  for (let i = 0; i < MAX_DAYS && k <= end; i++) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
};

export const encodeChallenge = (c: ChallengeDef): string => CHALLENGE_PREFIX + B64(JSON.stringify({ v: 1, id: c.id, t: c.title, m: c.metric, s: c.start, e: c.end }));

export const decodeChallenge = (code: string): ChallengeDef | null => {
  try {
    const text = code.trim();
    const at = text.indexOf(CHALLENGE_PREFIX);
    if (at < 0) return null;
    const body = text.slice(at + CHALLENGE_PREFIX.length).match(/^[A-Za-z0-9_-]+/)?.[0];
    if (!body) return null;
    const j = JSON.parse(unB64(body)) as Record<string, unknown>;
    if (j.v !== 1 || !isId(j.id) || !isMetric(j.m) || !isKey(j.s) || !isKey(j.e)) return null;
    const title = cleanTitle(j.t);
    if (!title || j.e < j.s || dayKeysBetween(j.s as string, j.e as string).length > MAX_DAYS || (j.e as string) > addDays(j.s as string, MAX_DAYS - 1)) return null;
    return { id: j.id, title, metric: j.m, start: j.s as string, end: j.e as string };
  } catch {
    return null;
  }
};

export const encodeUpdate = (challengeId: string, e: ChallengeEntry): string =>
  UPDATE_PREFIX + B64(JSON.stringify({ v: 1, c: challengeId, p: e.p, n: e.n, total: e.total, d: e.days, ts: e.ts }));

export const decodeUpdate = (code: string): { challengeId: string; entry: ChallengeEntry } | null => {
  try {
    const text = code.trim();
    const at = text.indexOf(UPDATE_PREFIX);
    if (at < 0) return null;
    const body = text.slice(at + UPDATE_PREFIX.length).match(/^[A-Za-z0-9_-]+/)?.[0];
    if (!body) return null;
    const j = JSON.parse(unB64(body)) as Record<string, unknown>;
    if (j.v !== 1 || !isId(j.c) || !isId(j.p)) return null;
    const total = Number(j.total);
    const ts = Number(j.ts);
    if (!Number.isFinite(total) || total < 0 || total > MAX_TOTAL || !Number.isFinite(ts) || ts <= 0) return null;
    const days = Array.isArray(j.d) ? (j.d as unknown[]).slice(0, MAX_DAYS).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x >= 0 && x <= MAX_TOTAL) : [];
    return { challengeId: j.c, entry: { p: j.p, n: cleanName(j.n), total: Math.round(total * 100) / 100, days, ts } };
  } catch {
    return null;
  }
};

/** What `metric` adds up to on each day from `start` to `end` (days after today are left out), from your own data. */
export const myDays = (metric: ChallengeMetric, start: string, end: string, steps: Record<string, number>, workouts: WorkoutSession[], today: string = todayKey()): number[] => {
  const keys = dayKeysBetween(start, end);
  const byDay = new Map<string, number>();
  if (metric !== 'steps') {
    for (const w of workouts) {
      const ms = w.startedAt ?? Date.parse(w.timestamp);
      if (!Number.isFinite(ms)) continue;
      const k = toDateKey(ms);
      const add = metric === 'distance' ? (w.distanceKm ?? 0) : metric === 'minutes' ? w.durationMinutes : metric === 'volume' ? workoutTotals(w).volumeKg : 1;
      byDay.set(k, (byDay.get(k) ?? 0) + (Number.isFinite(add) ? add : 0));
    }
  }
  return keys.map((k) => {
    if (k > today) return 0;
    const v = metric === 'steps' ? steps[k] ?? 0 : byDay.get(k) ?? 0;
    return Math.round(v * 100) / 100;
  });
};

export const sum = (xs: number[]): number => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

export type ChallengeStatus = 'upcoming' | 'active' | 'finished';

export const challengeStatus = (c: ChallengeDef, today: string = todayKey()): { status: ChallengeStatus; daysLeft: number; day: number; totalDays: number } => {
  const totalDays = dayKeysBetween(c.start, c.end).length;
  if (today < c.start) return { status: 'upcoming', daysLeft: totalDays, day: 0, totalDays };
  if (today > c.end) return { status: 'finished', daysLeft: 0, day: totalDays, totalDays };
  const day = dayKeysBetween(c.start, today).length;
  return { status: 'active', daysLeft: totalDays - day, day, totalDays };
};

export interface LeaderRow {
  p: string;
  name: string;
  total: number;
  rank: number;
  me: boolean;
}

/** Everyone ranked by total, with ties sharing a rank. My row always uses my live numbers; a friend's newest update is used. */
export const leaderboard = (c: Challenge, mine: ChallengeEntry): LeaderRow[] => {
  const rows = [{ p: c.me, name: mine.n, total: mine.total, me: true }];
  for (const e of Object.values(c.entries)) if (e.p !== c.me) rows.push({ p: e.p, name: e.n, total: e.total, me: false });
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let rank = 0;
  let prev = Number.NaN;
  return rows.map((r, i) => {
    if (r.total !== prev) rank = i + 1;
    prev = r.total;
    return { ...r, rank };
  });
};

/** Adds a friend's update, keeping the newest from each person; returns null for one from a different challenge or from yourself. */
export const addUpdate = (c: Challenge, challengeId: string, entry: ChallengeEntry): Challenge | { error: string } => {
  if (challengeId !== c.id) return { error: 'That update is for a different challenge.' };
  if (entry.p === c.me) return { error: 'That is your own update.' };
  const old = c.entries[entry.p];
  if (old && old.ts >= entry.ts) return c;
  if (!old && Object.keys(c.entries).length >= 50) return { error: 'A challenge can have up to 50 friends.' };
  return { ...c, entries: { ...c.entries, [entry.p]: entry } };
};

export const newChallenge = (title: string, metric: ChallengeMetric, days: number, startKey: string = todayKey()): Challenge => ({
  id: randomId(10),
  title: cleanTitle(title) || METRICS.find((m) => m.id === metric)?.label + ' challenge',
  metric,
  start: startKey,
  end: addDays(startKey, Math.min(MAX_DAYS, Math.max(1, days)) - 1),
  me: randomId(10),
  entries: {},
  createdAt: Date.now(),
});

/** Joining someone else's challenge: the same definition, a new id for me, no updates yet. */
export const joinChallenge = (def: ChallengeDef): Challenge => ({ ...def, me: randomId(10), entries: {}, createdAt: Date.now() });

/** Every update code in a pasted piece of text (a whole group-chat message, say), the ones that can be read. */
export const decodeAllUpdates = (text: string): { challengeId: string; entry: ChallengeEntry }[] => {
  const out: { challengeId: string; entry: ChallengeEntry }[] = [];
  const re = /KYFIT-UPDATE-1:[A-Za-z0-9_-]+/g;
  for (const m of text.match(re) ?? []) {
    const u = decodeUpdate(m);
    if (u) out.push(u);
  }
  return out;
};

export interface Pasted {
  challenge: ChallengeDef | null;
  updates: { challengeId: string; entry: ChallengeEntry }[];
}

/** What a pasted piece of text holds: a challenge to join, friends' updates, or both. */
export const classifyPaste = (text: string): Pasted => ({ challenge: decodeChallenge(text), updates: decodeAllUpdates(text) });

/** Adds every update in `updates` that belongs to `c`; says how many were new and how many could not be used. */
export const addUpdates = (c: Challenge, updates: Pasted['updates']): { challenge: Challenge; added: number; skipped: number; names: string[] } => {
  let cur = c;
  let added = 0;
  let skipped = 0;
  const names: string[] = [];
  for (const u of updates) {
    const next = addUpdate(cur, u.challengeId, u.entry);
    if ('error' in next) {
      skipped++;
      continue;
    }
    if (next !== cur) {
      added++;
      names.push(u.entry.n);
    }
    cur = next;
  }
  return { challenge: cur, added, skipped, names };
};

/** A ready-made message of the standings, for posting back to the group chat. */
export const standingsMessage = (c: ChallengeDef, board: LeaderRow[], show: (v: number) => string, st: { status: ChallengeStatus; day: number; totalDays: number; daysLeft: number }): string => {
  const metric = METRICS.find((m) => m.id === c.metric)?.label ?? '';
  const when = st.status === 'finished' ? 'Final standings' : st.status === 'upcoming' ? 'Starts ' + c.start : `Day ${st.day} of ${st.totalDays}, ${st.daysLeft} left`;
  const lines = [`${c.title} (${metric})`, when, ''];
  for (const r of board) lines.push(`${r.rank}. ${r.name}: ${show(r.total)}`);
  lines.push('', 'Made with Minimal Fitness. Send me your update to be counted.');
  return lines.join('\n');
};
