/**
 * Guided breathing: the patterns, the timing of a session, the size of the circle at any moment, and the numbers for the history.
 * Everything here is plain arithmetic on the clock, so it is easy to test; the screen only draws what this says.
 */

export type PhaseKind = 'in' | 'topup' | 'hold' | 'out';

export interface Phase {
  kind: PhaseKind;
  sec: number;
}

export interface BreathPattern {
  id: string;
  name: string;
  /** One line on what it is for. */
  blurb: string;
  /** What it feels like, in numbers. */
  rhythm: string;
  phases: Phase[];
}

export const PATTERNS: BreathPattern[] = [
  {
    id: 'calm',
    name: 'Calm rhythm',
    blurb: 'Slow, even breaths at about six a minute. A good all-round way to settle down.',
    rhythm: 'In 5 · out 5',
    phases: [{ kind: 'in', sec: 5 }, { kind: 'out', sec: 5 }],
  },
  {
    id: 'box',
    name: 'Box breathing',
    blurb: 'Four equal sides. Steadying before something stressful, or to focus.',
    rhythm: 'In 4 · hold 4 · out 4 · hold 4',
    phases: [{ kind: 'in', sec: 4 }, { kind: 'hold', sec: 4 }, { kind: 'out', sec: 4 }, { kind: 'hold', sec: 4 }],
  },
  {
    id: 'relax',
    name: '4-7-8 wind-down',
    blurb: 'A long breath out. Useful in the evening, when you want to slow down for sleep.',
    rhythm: 'In 4 · hold 7 · out 8',
    phases: [{ kind: 'in', sec: 4 }, { kind: 'hold', sec: 7 }, { kind: 'out', sec: 8 }],
  },
  {
    id: 'sigh',
    name: 'Double-breath sigh',
    blurb: 'Two quick breaths in through the nose, then a long sigh out. A fast way to let tension go.',
    rhythm: 'In 2 · top up 1 · out 6',
    phases: [{ kind: 'in', sec: 2 }, { kind: 'topup', sec: 1 }, { kind: 'out', sec: 6 }],
  },
  {
    id: 'resonance',
    name: 'Resonance breathing',
    blurb: 'About five and a half breaths a minute, the pace most often used to settle heart rhythm and mind together.',
    rhythm: 'In 5.5 · out 5.5',
    phases: [{ kind: 'in', sec: 5.5 }, { kind: 'out', sec: 5.5 }],
  },
  {
    id: 'longout',
    name: 'Long exhale',
    blurb: 'Breathe out longer than you breathe in. Simple, gentle, and easy to do anywhere.',
    rhythm: 'In 4 · out 6',
    phases: [{ kind: 'in', sec: 4 }, { kind: 'out', sec: 6 }],
  },
  {
    id: 'hum',
    name: 'Humming breath',
    blurb: 'Breathe in through the nose, then hum softly on the way out. The sound gives the breath something to follow.',
    rhythm: 'In 4 · hum out 8',
    phases: [{ kind: 'in', sec: 4 }, { kind: 'out', sec: 8 }],
  },
  {
    id: 'drift',
    name: 'Drift off',
    blurb: 'A short pause and a slow, long breath out. Made for the minutes in bed before sleep.',
    rhythm: 'In 4 · hold 2 · out 8',
    phases: [{ kind: 'in', sec: 4 }, { kind: 'hold', sec: 2 }, { kind: 'out', sec: 8 }],
  },
  {
    id: 'triangle',
    name: 'Triangle breathing',
    blurb: 'Three equal sides. Easier than box breathing, and just as good for steadying your attention.',
    rhythm: 'In 4 · hold 4 · out 4',
    phases: [{ kind: 'in', sec: 4 }, { kind: 'hold', sec: 4 }, { kind: 'out', sec: 4 }],
  },
  {
    id: 'focus',
    name: 'Focus count',
    blurb: 'A steady in, a brief hold and a longer out. A calm, alert rhythm for work or study.',
    rhythm: 'In 4 · hold 2 · out 6',
    phases: [{ kind: 'in', sec: 4 }, { kind: 'hold', sec: 2 }, { kind: 'out', sec: 6 }],
  },
  {
    id: 'lift',
    name: 'Morning lift',
    blurb: 'A lively, even rhythm to wake up with, a little quicker than the calming ones. Stop if you feel light-headed.',
    rhythm: 'In 3 · out 3',
    phases: [{ kind: 'in', sec: 3 }, { kind: 'out', sec: 3 }],
  },
  {
    id: 'pursed',
    name: 'Pursed-lip recovery',
    blurb: 'In through the nose, out slowly through pursed lips, as if cooling a hot drink. Good after a hard effort.',
    rhythm: 'In 2 · out 4',
    phases: [{ kind: 'in', sec: 2 }, { kind: 'out', sec: 4 }],
  },
  {
    id: 'reset',
    name: 'Stress reset',
    blurb: 'A short pause at the top and a long, slow breath out. A quick way to come down when things get tense.',
    rhythm: 'In 3 · hold 1 · out 6',
    phases: [{ kind: 'in', sec: 3 }, { kind: 'hold', sec: 1 }, { kind: 'out', sec: 6 }],
  },
];

export const DURATIONS_MIN = [1, 2, 3, 5, 10] as const;
export const DEFAULT_MINUTES = 3;
/** A session shorter than this is not saved to the history. */
export const MIN_SAVED_SEC = 20;

/** Rhythms made by the person (see makeCustomPattern). Set by the Breathe app when it opens; looked up by patternById like the built-in ones. */
let CUSTOM: BreathPattern[] = [];
export const setCustomPatterns = (list: BreathPattern[]): void => {
  CUSTOM = list;
};
export const customPatterns = (): BreathPattern[] => CUSTOM;

/** Sessions that are not a breathing rhythm: a silent sit and the guided ones. They are saved in the same history, under these ids. */
export const SIT_SESSIONS: BreathPattern[] = [
  { id: 'silent', name: 'Silent meditation', blurb: 'A quiet sit with a bell to begin and end.', rhythm: 'No guide', phases: [{ kind: 'hold', sec: 60 }] },
  { id: 'guided-bodyscan', name: 'Body scan', blurb: 'Move your attention slowly through the body, head to toe.', rhythm: 'Guided', phases: [{ kind: 'hold', sec: 60 }] },
  { id: 'guided-winddown', name: 'Evening wind-down', blurb: 'Let the day go before sleep.', rhythm: 'Guided', phases: [{ kind: 'hold', sec: 60 }] },
  { id: 'guided-reset', name: 'Three-minute reset', blurb: 'A short pause in the middle of a busy day.', rhythm: 'Guided', phases: [{ kind: 'hold', sec: 60 }] },
  { id: 'guided-thanks', name: 'A moment of thanks', blurb: 'Bring to mind what is going well.', rhythm: 'Guided', phases: [{ kind: 'hold', sec: 60 }] },
];

export const patternById = (id: string): BreathPattern => PATTERNS.find((p) => p.id === id) ?? CUSTOM.find((p) => p.id === id) ?? SIT_SESSIONS.find((p) => p.id === id) ?? PATTERNS[0];

/** True for the sessions that are a sit, not a breathing rhythm. */
export const isSit = (id: string): boolean => SIT_SESSIONS.some((p) => p.id === id);

export const CUSTOM_LIMITS = { inMax: 12, outMax: 16, holdMax: 10, cycleMin: 4, cycleMax: 30, nameMax: 28 } as const;

export interface CustomInput {
  name: string;
  inSec: number;
  holdInSec: number;
  outSec: number;
  holdOutSec: number;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A rhythm from four numbers (in, hold, out, hold). Returns the pattern, or a sentence saying what is wrong. */
export const makeCustomPattern = (input: CustomInput, id: string): { pattern: BreathPattern } | { error: string } => {
  const name = input.name.trim().slice(0, CUSTOM_LIMITS.nameMax);
  if (!name) return { error: 'Give it a name.' };
  const { inSec, holdInSec, outSec, holdOutSec } = input;
  if (!(inSec >= 1) || inSec > CUSTOM_LIMITS.inMax) return { error: 'The in-breath needs to be 1 to ' + CUSTOM_LIMITS.inMax + ' seconds.' };
  if (!(outSec >= 1) || outSec > CUSTOM_LIMITS.outMax) return { error: 'The out-breath needs to be 1 to ' + CUSTOM_LIMITS.outMax + ' seconds.' };
  if (holdInSec < 0 || holdInSec > CUSTOM_LIMITS.holdMax || holdOutSec < 0 || holdOutSec > CUSTOM_LIMITS.holdMax) return { error: 'A hold can be at most ' + CUSTOM_LIMITS.holdMax + ' seconds.' };
  const phases: Phase[] = [{ kind: 'in', sec: inSec }];
  if (holdInSec > 0) phases.push({ kind: 'hold', sec: holdInSec });
  phases.push({ kind: 'out', sec: outSec });
  if (holdOutSec > 0) phases.push({ kind: 'hold', sec: holdOutSec });
  const total = phases.reduce((s, p) => s + p.sec, 0);
  if (total < CUSTOM_LIMITS.cycleMin) return { error: 'A breath should take at least ' + CUSTOM_LIMITS.cycleMin + ' seconds.' };
  if (total > CUSTOM_LIMITS.cycleMax) return { error: 'A breath should take at most ' + CUSTOM_LIMITS.cycleMax + ' seconds.' };
  const rhythm = ['In ' + fmt(inSec), holdInSec > 0 ? 'hold ' + fmt(holdInSec) : '', 'out ' + fmt(outSec), holdOutSec > 0 ? 'hold ' + fmt(holdOutSec) : ''].filter(Boolean).join(' · ');
  return { pattern: { id, name, blurb: 'Your own rhythm: ' + rhythm.toLowerCase() + '.', rhythm, phases } };
};

export const cycleSec = (p: BreathPattern): number => p.phases.reduce((s, ph) => s + ph.sec, 0);

export const PHASE_WORDS: Record<PhaseKind, string> = { in: 'Breathe in', topup: 'Top up', hold: 'Hold', out: 'Breathe out' };

export interface PhasePoint {
  index: number;
  kind: PhaseKind;
  /** The text to show and say. */
  label: string;
  /** Seconds into this phase. */
  into: number;
  /** Whole seconds left in this phase, counting down to 1. */
  left: number;
  /** 0 to 1 through this phase. */
  progress: number;
  /** Which breath this is, from 1. */
  cycle: number;
}

/** Where in the pattern a moment `t` seconds after the start falls. */
export const phaseAt = (p: BreathPattern, t: number): PhasePoint => {
  const total = cycleSec(p);
  const time = Math.max(0, t);
  const inCycle = time % total;
  let start = 0;
  for (let i = 0; i < p.phases.length; i++) {
    const ph = p.phases[i];
    if (inCycle < start + ph.sec || i === p.phases.length - 1) {
      const into = Math.min(ph.sec, inCycle - start);
      return {
        index: i,
        kind: ph.kind,
        label: PHASE_WORDS[ph.kind],
        into,
        left: Math.max(1, Math.ceil(ph.sec - into)),
        progress: ph.sec > 0 ? into / ph.sec : 1,
        cycle: Math.floor(time / total) + 1,
      };
    }
    start += ph.sec;
  }
  /* unreachable: the loop returns on the last phase */
  return { index: 0, kind: 'in', label: PHASE_WORDS.in, into: 0, left: 1, progress: 0, cycle: 1 };
};

/** The circle's size (0.45 empty lungs to 1 full) at moment `t`, easing each part so the motion feels like breathing. */
export const circleScale = (p: BreathPattern, t: number): number => {
  const EMPTY = 0.45;
  const FULL = 1;
  const hasTopUp = p.phases.some((ph) => ph.kind === 'topup');
  const MID = hasTopUp ? 0.8 : FULL;
  const pt = phaseAt(p, t);
  const ease = (x: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2;
  switch (pt.kind) {
    case 'in':
      return EMPTY + (MID - EMPTY) * ease(pt.progress);
    case 'topup':
      return MID + (FULL - MID) * ease(pt.progress);
    case 'out':
      return FULL + (EMPTY - FULL) * ease(pt.progress);
    default: {
      // A hold keeps whatever size the breath before it ended on.
      const before = p.phases[(pt.index - 1 + p.phases.length) % p.phases.length].kind;
      return before === 'in' || before === 'topup' ? FULL : EMPTY;
    }
  }
};

/** Phases that change when the session is going: a moment's buzz pattern for each, so it can be followed with the eyes closed. */
export const buzzFor = (kind: PhaseKind): number[] => (kind === 'in' ? [30] : kind === 'topup' ? [20] : kind === 'out' ? [20, 60, 20] : [10]);

export interface BreathSession {
  id: string;
  /** When it ended (epoch ms). */
  at: number;
  patternId: string;
  seconds: number;
  /** Heart rate from a live sensor at the start and end, when there was one. */
  bpmStart?: number;
  bpmEnd?: number;
  /** How calm you felt afterwards, 1 (not at all) to 5 (very), when you said. */
  after?: number;
  /** The journey day this session counted for, when it was one. */
  journey?: { id: string; day: number };
  /** Heart rate through the session (about one reading every few seconds), when a watch or strap was connected. */
  hr?: number[];
}

const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface BreathStats {
  weekMinutes: number;
  weekSessions: number;
  totalSessions: number;
  /** Days in a row, ending today or yesterday, with at least one session. */
  streakDays: number;
}

export const breathStats = (log: BreathSession[], now: number): BreathStats => {
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const week = log.filter((s) => s.at >= weekAgo);
  const days = new Set(log.map((s) => dayKey(s.at)));
  let streak = 0;
  const cursor = new Date(now);
  // A streak is still alive when the last session was yesterday: today is not over yet.
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    weekMinutes: Math.round(week.reduce((s, x) => s + x.seconds, 0) / 60),
    weekSessions: week.length,
    totalSessions: log.length,
    streakDays: streak,
  };
};

export interface CalmSignal {
  label: string;
  value: string;
  /** How it compares with your usual: 'better', 'usual' or 'worse'. */
  trend: 'better' | 'usual' | 'worse';
  note: string;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * How today's resting heart rate and heart-rate variability compare with your usual over the last weeks. Higher variability and a lower
 * resting rate usually go with being rested; the opposite can go with stress, poor sleep or hard training. It is a hint, never a diagnosis.
 * `days` is date key -> readings, newest dates last when sorted.
 */
export const calmSignals = (days: Record<string, { restingHr?: number; hrvMs?: number }> | undefined): CalmSignal[] => {
  if (!days) return [];
  const keys = Object.keys(days).sort();
  const out: CalmSignal[] = [];
  const read = (field: 'restingHr' | 'hrvMs') => {
    const pts = keys.map((k) => days[k][field]).filter((v): v is number => typeof v === 'number' && v > 0);
    if (pts.length < 4) return null;
    const latest = pts[pts.length - 1];
    const usual = median(pts.slice(0, -1));
    return { latest, usual };
  };
  const hr = read('restingHr');
  if (hr) {
    const diff = hr.latest - hr.usual;
    out.push({
      label: 'Resting heart rate',
      value: `${Math.round(hr.latest)} bpm`,
      trend: diff <= -2 ? 'better' : diff >= 3 ? 'worse' : 'usual',
      note: `Your usual is about ${Math.round(hr.usual)}`,
    });
  }
  const hrv = read('hrvMs');
  if (hrv) {
    const ratio = hrv.latest / hrv.usual;
    out.push({
      label: 'Heart-rate variability',
      value: `${Math.round(hrv.latest)} ms`,
      trend: ratio >= 1.1 ? 'better' : ratio <= 0.88 ? 'worse' : 'usual',
      note: `Your usual is about ${Math.round(hrv.usual)} ms`,
    });
  }
  return out;
};

/** Minutes breathed on each of the last `days` days, oldest first, for the week chart. */
export const dailyMinutes = (log: BreathSession[], now: number, days = 7): { key: string; minutes: number }[] => {
  const out: { key: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    const sec = log.filter((s) => dayKey(s.at) === key).reduce((a, s) => a + s.seconds, 0);
    out.push({ key, minutes: Math.round((sec / 60) * 10) / 10 });
  }
  return out;
};

/** The technique used most, with how many times; null for an empty history. */
export const favouriteTechnique = (log: BreathSession[]): { patternId: string; count: number } | null => {
  const counts = new Map<string, number>();
  for (const s of log) counts.set(s.patternId, (counts.get(s.patternId) ?? 0) + 1);
  let best: { patternId: string; count: number } | null = null;
  for (const [patternId, count] of counts) if (!best || count > best.count) best = { patternId, count };
  return best;
};

export interface BreathTotals {
  minutes: number;
  /** Mean change in heart rate over sessions that had a live reading at both ends (negative: it came down); null with fewer than three. */
  avgBpmChange: number | null;
  /** Mean of the "how calm do you feel" ratings, or null with fewer than three. */
  avgCalm: number | null;
}

export const breathTotals = (log: BreathSession[]): BreathTotals => {
  const both = log.filter((s) => s.bpmStart && s.bpmEnd);
  const rated = log.filter((s) => s.after);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    minutes: Math.round(log.reduce((a, s) => a + s.seconds, 0) / 60),
    avgBpmChange: both.length >= 3 ? Math.round(mean(both.map((s) => (s.bpmEnd as number) - (s.bpmStart as number))) * 10) / 10 : null,
    avgCalm: rated.length >= 3 ? Math.round(mean(rated.map((s) => s.after as number)) * 10) / 10 : null,
  };
};
