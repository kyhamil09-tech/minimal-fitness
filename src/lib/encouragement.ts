/**
 * Daily encouragement that almost never repeats. A note is a title, a main line and a short closing line, each drawn from its own list
 * so that the same combination is very unlikely, and each list is used up before any of its lines comes round again. The tone is kind
 * and about showing up, never about weight, food or guilt. The lines are fixed text kept in the app: nothing is fetched or generated.
 */

import type { LangCode } from './languages';
import { notesDe } from '../locales/notes/de';
import { notesEs } from '../locales/notes/es';
import { notesFr } from '../locales/notes/fr';
import { notesIt } from '../locales/notes/it';
import { notesPt } from '../locales/notes/pt';

const TITLES = [
  'A small step counts',
  'A good day to begin',
  'You showed up before',
  'Today is yours',
  'Quiet progress',
  'One thing at a time',
  'Keep the thread going',
  'Proud of the effort',
  'A fresh day',
  'Strong habits start small',
  'Still on your side',
  'Something good today',
  'Your future self says thanks',
  'Easy does it',
  'Ready when you are',
  'Steady wins',
  'Good things add up',
  'Take a breath',
  'You are doing the work',
  'Hello from your coach',
  'Move a little, feel a lot',
  'Progress, not perfect',
  'A kind reminder',
  'A moment for you',
  'Make it a good one',
  'Look how far you have come',
  'Small is fine',
  'You have got this',
  'Be kind to yourself today',
  'Your streak of trying',
];

const LEADS = [
  'Every walk, set and glass of water is a vote for the person you are becoming.',
  'You do not need a perfect day. A good enough day, repeated, changes a lot.',
  'The hardest part is usually starting, and you have already done that many times.',
  'Whatever you can do today is enough to keep moving forward.',
  'Rest is part of training too. Listen to your body and give it what it needs.',
  'Consistency beats intensity. A short session you actually do wins over a long one you skip.',
  'Look at the habits you have built, not only the ones still to build.',
  'Your body does a lot for you every day. Give it a little movement in return.',
  'Progress is rarely a straight line. A slow week is still part of the journey.',
  'Ten minutes is a real workout. Do what fits today.',
  'Be proud of showing up, especially on the days it was not easy.',
  'You are allowed to go at your own pace. Moving at all is the win.',
  'Small choices made often are what change a body, a mood and a life.',
  'Today is a good day to do one thing your future self will thank you for.',
  'Strong does not mean never tired. It means you keep coming back.',
  'Not every day will feel great, and that is fine. Count the days you showed up.',
  'A walk after a meal, a glass of water, an early night: tiny things, big returns.',
  'You are building something that lasts longer than any single result.',
  'Compare yourself with who you were last month, not with anyone else.',
  'Energy follows action. Start moving and the motivation often catches up.',
  'Good sleep, good food and good movement support each other. Pick the easiest one today.',
  'You are not behind. You are exactly where your effort has brought you, and you can move on from here.',
  'Even a gentle stretch counts as taking care of yourself.',
  'Treat your plan like a friend you keep promises to, and forgive it when a day slips.',
  'Take the stairs, stand up, stretch, breathe. Little breaks keep a body happy.',
  'The best workout is the one you will actually do. Choose something you enjoy.',
  'Your effort is already working, even where you cannot see it yet.',
  'Celebrate the small wins today: a full bottle of water, a short walk, an early bedtime.',
  'You do not have to feel ready. You only have to begin.',
  'A strong week is built from ordinary days. Make today an ordinary good one.',
  'Keep your goals kind and your habits steady.',
  'Doing something is always better than waiting for the perfect moment.',
  'Remember why you started, and let that be enough for today.',
  'Recovery is progress. Let tired muscles repair and come back stronger.',
  'There is no finish line here, only a life that feels better the more you look after it.',
  'You have already proved you can do hard things. Today is one more.',
  'Slow progress is still progress. Keep going.',
  'Choose movement you enjoy and it stops feeling like a chore.',
  'Your health is a long game, and you are playing it well.',
  'Notice how you feel after you move. That feeling is worth coming back for.',
  'Mistakes and missed days are information, not failure. Begin again with a lighter step.',
  'Fresh air and a few minutes outside can change the whole day.',
  'Fuel yourself well, move in a way you like, and sleep when you can. That is the whole recipe.',
  'You are more capable than your tired mind tells you, and also allowed to rest.',
  'Today you can be a little stronger than yesterday, even by a tiny bit.',
  'Hydrate, stretch, and take one proud breath. You are doing better than you think.',
  'Habits are built in the boring middle. You are in it, and that is where it counts.',
  'Aim for a day that feels good, not a day that looks perfect.',
  'You do not owe anyone a perfect streak. Come back whenever you can.',
  'Be patient. Strength, fitness and sleep all build slowly, then suddenly.',
  'Every healthy choice is a gift to the person you will be next year.',
  'Let today be about how you feel, not about a number.',
  'A little movement lifts mood, focus and sleep. It is a good deal.',
  'You can do an easy day and still be on track.',
  'Listen to what your body asks for today: movement, rest, water or food.',
  'Think of today as a chance, not a test.',
  'Start with the smallest version of the habit. It still counts.',
  'There is strength in the days you keep going quietly.',
  'Tell yourself something kind today, then go and do something kind for your body.',
  'Success looks like returning to your routine after a break, again and again.',
  'It is okay if today is a light one. Keep the habit alive.',
  'Your routine is not a punishment. It is a way of looking after yourself.',
  'Remember that you are allowed to enjoy this.',
  'Focus on what you can do today, and leave the rest for tomorrow.',
  'Little by little, a little becomes a lot.',
  'Look up, roll your shoulders back, and take a deep breath. Good start.',
  'You are not starting from zero. You are starting from experience.',
  'Your effort matters even when nobody sees it.',
  'The journey is easier when you are gentle with yourself on the way.',
  'The best time to move is when you can. Today, that might be right now.',
  'Be the kind of friend to yourself that you would be to someone you love.',
];

const TAILS = [
  'You have got this.',
  'Go easy and go anyway.',
  'One step is plenty.',
  'Enjoy it.',
  'Proud of you.',
  'Start small.',
  'Keep it simple today.',
  'Rest counts too.',
  'See you at the finish of today.',
  'Make it fun.',
  'Breathe.',
  'Your pace, your plan.',
  'Tiny wins add up.',
  'Be kind to yourself.',
  'Whenever you are ready.',
  'It all counts.',
  'Look after yourself.',
  'Onward.',
  'You are doing well.',
  'Today, just begin.',
  'Stay curious.',
  'Smile first.',
  'Lovely work so far.',
  'Keep showing up.',
  'Anything counts.',
  'Be proud.',
  'Take your time.',
  'Good things are coming.',
  'Do it for you.',
  'Nice and steady.',
];

/** One language's notes: the three lists a daily note is drawn from, and the lines of the weekly notification. Every language has the same number of lines in the same order. */
export interface NotePools {
  titles: string[];
  leads: string[];
  tails: string[];
  weeklyTitles: string[];
  weeklyBodies: string[];
}

export interface NoteIds {
  t: number;
  l: number;
  e: number;
}

export interface NoteState {
  /** The note chosen for each future date, so rescheduling does not change a day's message. */
  byDate: Record<string, NoteIds>;
  /** The most recently used lines of each list, oldest first. */
  recent: { t: number[]; l: number[]; e: number[] };
}

export const emptyState = (): NoteState => ({ byDate: {}, recent: { t: [], l: [], e: [] } });

/** Keeps shapes valid when state is read back from storage. */
export const cleanState = (raw: unknown): NoteState => {
  const out = emptyState();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { byDate?: unknown; recent?: Record<string, unknown> };
  const ok = (v: unknown, n: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;
  if (r.byDate && typeof r.byDate === 'object') {
    for (const [k, v] of Object.entries(r.byDate as Record<string, Partial<NoteIds>>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && ok(v.t, TITLES.length) && ok(v.l, LEADS.length) && ok(v.e, TAILS.length)) out.byDate[k] = { t: v.t as number, l: v.l as number, e: v.e as number };
    }
  }
  const list = (v: unknown, n: number): number[] => (Array.isArray(v) ? v.filter((x) => ok(x, n)) : []);
  out.recent = { t: list(r.recent?.t, TITLES.length), l: list(r.recent?.l, LEADS.length), e: list(r.recent?.e, TAILS.length) };
  return out;
};

const draw = (size: number, recent: number[], rng: () => number): number => {
  // Everything but the lines used lately; once nearly all have been used, the oldest come back first.
  const keep = Math.min(recent.length, size - 3);
  const blocked = new Set(recent.slice(recent.length - keep));
  const open: number[] = [];
  for (let i = 0; i < size; i++) if (!blocked.has(i)) open.push(i);
  return open[Math.floor(rng() * open.length) % open.length];
};

/**
 * Makes sure each of `dates` has a note. Dates that already have one keep it; past dates are dropped. Returns new state.
 * With 70 main lines, no main line comes round again for 67 days, and the same title, main line and closing together almost never do.
 */
export const planNotes = (state: NoteState, dates: string[], today: string, rng: () => number = Math.random): NoteState => {
  const byDate: Record<string, NoteIds> = {};
  for (const [k, v] of Object.entries(state.byDate)) if (k >= today) byDate[k] = v;
  const recent = { t: [...state.recent.t], l: [...state.recent.l], e: [...state.recent.e] };
  for (const d of dates) {
    if (byDate[d]) continue;
    const t = draw(TITLES.length, recent.t, rng);
    const l = draw(LEADS.length, recent.l, rng);
    const e = draw(TAILS.length, recent.e, rng);
    recent.t.push(t);
    recent.l.push(l);
    recent.e.push(e);
    byDate[d] = { t, l, e };
  }
  const trim = (a: number[], n: number) => a.slice(-n);
  return { byDate, recent: { t: trim(recent.t, TITLES.length), l: trim(recent.l, LEADS.length), e: trim(recent.e, TAILS.length) } };
};


export const WEEKLY_TITLES = ['Your week in review', 'Weekly check-in from your coach', 'Your week, summed up', 'Time for your weekly review', 'How did your week go?'];
export const WEEKLY_BODIES = [
  'Your wins, one thing to work on, and next week’s plan are ready. Tap to see them.',
  'See what went well this week and the one change that would help most. Tap to open.',
  'Your coach has a short review of your week: training, sleep, food and steps. Tap to read.',
  'A quick look back at your week, plus a few easy things to try next. Tap to open.',
  'Your weekly update is ready: the good news first, then what to focus on. Tap to see.',
];

export const notesEn: NotePools = { titles: TITLES, leads: LEADS, tails: TAILS, weeklyTitles: WEEKLY_TITLES, weeklyBodies: WEEKLY_BODIES };

const BY_LANG: Record<LangCode, NotePools> = { en: notesEn, es: notesEs, fr: notesFr, de: notesDe, pt: notesPt, it: notesIt };

/** The notes in a language, in English where a language has none. */
export const poolsFor = (lang: LangCode): NotePools => BY_LANG[lang] ?? notesEn;

export const POOLS = notesEn;

/** The daily note for chosen lines, in a language. */
export const noteText = (n: NoteIds, lang: LangCode = 'en'): { title: string; body: string } => {
  const p = poolsFor(lang);
  return { title: p.titles[n.t], body: `${p.leads[n.l]} ${p.tails[n.e]}` };
};

/** The weekly notification text for a given date, varying week to week. */
export const weeklyText = (dateKey: string, lang: LangCode = 'en'): { title: string; body: string } => {
  const p = poolsFor(lang);
  const n = [...dateKey].reduce((s, c) => s + c.charCodeAt(0), 0);
  return { title: p.weeklyTitles[n % p.weeklyTitles.length], body: p.weeklyBodies[(n * 7) % p.weeklyBodies.length] };
};

const KEY = 'kyfit_coach_notes';

export const readNoteState = (): NoteState => {
  try {
    return cleanState(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return emptyState();
  }
};

export const writeNoteState = (s: NoteState): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // not saved: the next sync simply draws again
  }
};
