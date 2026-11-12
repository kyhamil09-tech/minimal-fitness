export type IntervalStepKind = 'warmup' | 'work' | 'recover' | 'cooldown';

/** One piece of a structured workout. A step ends after `durationSec` seconds or `distanceKm` kilometers. */
export interface IntervalStep {
  kind: IntervalStepKind;
  label: string;
  durationSec?: number;
  distanceKm?: number;
}

export interface IntervalWorkout {
  id: string;
  name: string;
  description: string;
  steps: IntervalStep[];
}

const min = (m: number) => m * 60;

const warm = (m: number): IntervalStep => ({ kind: 'warmup', label: 'Warm up', durationSec: min(m) });
const cool = (m: number): IntervalStep => ({ kind: 'cooldown', label: 'Cool down', durationSec: min(m) });

/** Repeats a work/recover pair `reps` times (the last recovery is dropped so the cool-down follows the last effort). */
export const repeatSets = (
  reps: number,
  work: { durationSec?: number; distanceKm?: number; label?: string },
  recover: { durationSec?: number; distanceKm?: number; label?: string }
): IntervalStep[] => {
  const out: IntervalStep[] = [];
  for (let i = 1; i <= reps; i++) {
    out.push({ kind: 'work', label: work.label ?? `Interval ${i} of ${reps}`, durationSec: work.durationSec, distanceKm: work.distanceKm });
    if (i < reps) out.push({ kind: 'recover', label: recover.label ?? 'Recover', durationSec: recover.durationSec, distanceKm: recover.distanceKm });
  }
  return out;
};

export const INTERVAL_WORKOUTS: IntervalWorkout[] = [
  {
    id: 'run-walk',
    name: 'Run / walk',
    description: 'A gentle start: 8 rounds of 1 minute running and 2 minutes walking.',
    steps: [
      { kind: 'warmup', label: 'Brisk walk', durationSec: min(5) },
      ...repeatSets(8, { durationSec: min(1), label: 'Run' }, { durationSec: min(2), label: 'Walk' }),
      cool(5),
    ],
  },
  {
    id: '5x3',
    name: '5 × 3 minutes',
    description: 'Five hard 3-minute efforts with 2 minutes easy between.',
    steps: [warm(8), ...repeatSets(5, { durationSec: min(3) }, { durationSec: min(2) }), cool(6)],
  },
  {
    id: '8x400',
    name: '8 × 400 m',
    description: 'Track-style speed work: eight 400 m repeats, 90 seconds easy between.',
    steps: [warm(10), ...repeatSets(8, { distanceKm: 0.4 }, { durationSec: 90 }), cool(8)],
  },
  {
    id: '6x800',
    name: '6 × 800 m',
    description: 'Six 800 m repeats at 5K effort with a 2 minute jog between.',
    steps: [warm(10), ...repeatSets(6, { distanceKm: 0.8 }, { durationSec: min(2) }), cool(8)],
  },
  {
    id: 'tempo20',
    name: 'Tempo 20',
    description: '10 minutes easy, 20 minutes comfortably hard, 10 minutes easy.',
    steps: [warm(10), { kind: 'work', label: 'Tempo', durationSec: min(20) }, cool(10)],
  },
  {
    id: 'pyramid',
    name: 'Pyramid',
    description: 'Build up and back down: 1, 2, 3, 2, 1 minutes hard with equal rests.',
    steps: [
      warm(8),
      ...[1, 2, 3, 2, 1].flatMap((m, i, a): IntervalStep[] => {
        const hard: IntervalStep = { kind: 'work', label: `${m} minute effort`, durationSec: min(m) };
        return i < a.length - 1 ? [hard, { kind: 'recover', label: 'Recover', durationSec: min(m) }] : [hard];
      }),
      cool(6),
    ],
  },
  {
    id: 'fartlek',
    name: 'Fartlek',
    description: 'Playful speed changes: 6 rounds of 90 seconds fast, 90 seconds easy.',
    steps: [warm(8), ...repeatSets(6, { durationSec: 90, label: 'Fast' }, { durationSec: 90, label: 'Easy' }), cool(6)],
  },
];

export interface CustomIntervalInput {
  reps: number;
  /** Work length: minutes, or kilometers when `workByDistance`. */
  work: number;
  workByDistance: boolean;
  recoverMin: number;
  warmupMin: number;
  cooldownMin: number;
}

export const buildCustomIntervals = (c: CustomIntervalInput): IntervalStep[] => {
  const reps = Math.max(1, Math.min(30, Math.round(c.reps)));
  const steps: IntervalStep[] = [];
  if (c.warmupMin > 0) steps.push(warm(c.warmupMin));
  steps.push(
    ...repeatSets(
      reps,
      c.workByDistance ? { distanceKm: Math.max(0.05, c.work) } : { durationSec: Math.max(10, Math.round(c.work * 60)) },
      { durationSec: Math.max(0, Math.round(c.recoverMin * 60)) }
    ).filter((s) => !(s.kind === 'recover' && (s.durationSec ?? 0) === 0))
  );
  if (c.cooldownMin > 0) steps.push(cool(c.cooldownMin));
  return steps;
};

/** Total planned time in seconds (distance steps are not counted). */
export const plannedSeconds = (steps: IntervalStep[]): number => steps.reduce((s, st) => s + (st.durationSec ?? 0), 0);

/** The step to announce and how far through the current one you are, given the elapsed clock and distance. */
export interface StepProgress {
  /** 0..1 within the current step. */
  fraction: number;
  /** Seconds or kilometers left in the current step. */
  remainingSec?: number;
  remainingKm?: number;
  done: boolean;
}

export const stepProgress = (step: IntervalStep, secInStep: number, kmInStep: number): StepProgress => {
  if (step.durationSec !== undefined) {
    const left = Math.max(0, step.durationSec - secInStep);
    return { fraction: Math.min(1, secInStep / Math.max(1, step.durationSec)), remainingSec: left, done: left <= 0 };
  }
  const total = step.distanceKm ?? 0;
  const left = Math.max(0, total - kmInStep);
  return { fraction: total > 0 ? Math.min(1, kmInStep / total) : 1, remainingKm: left, done: left <= 0 };
};

/** Spoken description of a step, e.g. "Interval 2 of 8. 400 meters." */
export const describeStep = (step: IntervalStep, miles: boolean): string => {
  if (step.durationSec !== undefined) {
    const s = step.durationSec;
    const m = Math.floor(s / 60);
    const r = s % 60;
    const time = m > 0 ? `${m} minute${m === 1 ? '' : 's'}${r ? ` ${r} seconds` : ''}` : `${r} seconds`;
    return `${step.label}. ${time}.`;
  }
  const km = step.distanceKm ?? 0;
  if (miles) return `${step.label}. ${(km / 1.609344).toFixed(2)} miles.`;
  return km < 1 ? `${step.label}. ${Math.round(km * 1000)} meters.` : `${step.label}. ${km.toFixed(1)} kilometers.`;
};

/* ---------- run / walk: your own timing ---------- */

/** A run/walk workout you set up yourself: how long to run, how long to walk, and how many times. */
export interface RunWalkInput {
  rounds: number;
  runSec: number;
  walkSec: number;
  warmupMin: number;
  cooldownMin: number;
}

export const DEFAULT_RUN_WALK: RunWalkInput = { rounds: 8, runSec: 60, walkSec: 120, warmupMin: 5, cooldownMin: 5 };

export const RUN_WALK_LIMITS = { rounds: [1, 40], runSec: [5, 1800], walkSec: [5, 1800], warmupMin: [0, 30], cooldownMin: [0, 30] } as const;

const clampTo = (v: unknown, [lo, hi]: readonly [number, number], fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};

/** Keeps every number inside what makes sense (a missing or odd value falls back to the usual one). */
export const clampRunWalk = (c: Partial<RunWalkInput> | undefined): RunWalkInput => ({
  rounds: clampTo(c?.rounds, RUN_WALK_LIMITS.rounds, DEFAULT_RUN_WALK.rounds),
  runSec: clampTo(c?.runSec, RUN_WALK_LIMITS.runSec, DEFAULT_RUN_WALK.runSec),
  walkSec: clampTo(c?.walkSec, RUN_WALK_LIMITS.walkSec, DEFAULT_RUN_WALK.walkSec),
  warmupMin: clampTo(c?.warmupMin, RUN_WALK_LIMITS.warmupMin, DEFAULT_RUN_WALK.warmupMin),
  cooldownMin: clampTo(c?.cooldownMin, RUN_WALK_LIMITS.cooldownMin, DEFAULT_RUN_WALK.cooldownMin),
});

/** A warm-up walk, then run and walk in turn for the number of rounds, ending on a run, then a cool-down walk. */
export const buildRunWalk = (input: Partial<RunWalkInput>): IntervalStep[] => {
  const c = clampRunWalk(input);
  const steps: IntervalStep[] = [];
  if (c.warmupMin > 0) steps.push({ kind: 'warmup', label: 'Brisk walk', durationSec: min(c.warmupMin) });
  steps.push(...repeatSets(c.rounds, { durationSec: c.runSec, label: 'Run' }, { durationSec: c.walkSec, label: 'Walk' }));
  if (c.cooldownMin > 0) steps.push(cool(c.cooldownMin));
  return steps;
};

/** "1 minute 30 seconds", "45 seconds". */
export const spokenSeconds = (total: number): string => {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} second${r === 1 ? '' : 's'}`;
  return `${m} minute${m === 1 ? '' : 's'}${r ? ` ${r} second${r === 1 ? '' : 's'}` : ''}`;
};

/** Labels short enough to read out as a command: "Run", "Walk", "Fast", "Easy"... Anything longer is read as written. */
const COMMAND = /^(run|walk|jog|sprint|fast|easy|brisk walk|recover|rest|tempo|cool down|warm up)$/i;

const spokenLabel = (step: IntervalStep): string => {
  if (COMMAND.test(step.label)) return step.label;
  return step.label;
};

/** What to say when a step starts: "Run for 1 minute." or, for a distance step, "Interval 2 of 8. 400 meters." */
export const spokenStep = (step: IntervalStep, miles: boolean): string => {
  if (step.durationSec !== undefined && COMMAND.test(step.label)) return `${step.label} for ${spokenSeconds(step.durationSec)}.`;
  return describeStep(step, miles);
};

/** What to say a few seconds before the next step starts: "Walk in 10 seconds." */
export const warnText = (next: IntervalStep, seconds: number): string => `${spokenLabel(next)} in ${seconds} seconds.`;

/** Where the cues for the current step have got to, so each is given once. */
export interface CueState {
  warned: boolean;
  lastCount: number;
}

export const FRESH_CUES: CueState = { warned: false, lastCount: -1 };

export interface CueDecision {
  /** `warn`: the "coming up" cue. `count`: one of the last three seconds. */
  cue: 'warn' | 'count' | null;
  /** For `count`: 3, 2 or 1. */
  count?: number;
  state: CueState;
}

/**
 * Decides, once a second, whether to give a cue before a timed step ends: a warning when `warnSec` seconds are left (0 turns it off),
 * then 3, 2, 1. A step too short for the warning (shorter than the warning plus the countdown) just changes without one.
 * `remainingSec` is the whole seconds left, rounded up.
 */
export const stepCue = (remainingSec: number, totalSec: number, warnSec: number, countdown: boolean, st: CueState): CueDecision => {
  if (warnSec > 0 && !st.warned && remainingSec <= warnSec && remainingSec > 3 && totalSec > warnSec + 3) {
    return { cue: 'warn', state: { ...st, warned: true } };
  }
  if (countdown && remainingSec >= 1 && remainingSec <= 3 && remainingSec !== st.lastCount && totalSec > 6) {
    return { cue: 'count', count: remainingSec, state: { ...st, lastCount: remainingSec } };
  }
  return { cue: null, state: st };
};
/* ---------- reading a workout before you start it ---------- */

/** One line of a workout outline: a step, or a repeated pair such as "8 × Run 1 min, Walk 2 min". */
export interface StepLine {
  kind: IntervalStepKind | 'repeat';
  text: string;
  /** Planned time of the line in seconds (distance steps are not counted). */
  seconds: number;
}

/** "1 min", "2 min 30 s", "45 s". */
export const shortTime = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} s`;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
};

const stepSize = (s: IntervalStep, miles: boolean): string => {
  if (s.durationSec !== undefined) return shortTime(s.durationSec);
  const km = s.distanceKm ?? 0;
  if (miles) return `${(km / 1.609344).toFixed(2)} mi`;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
};

const signature = (s: IntervalStep): string => `${s.kind}|${s.durationSec ?? ''}|${s.distanceKm ?? ''}`;

/** "Interval 3 of 8" is just an effort in an outline. */
const outlineLabel = (s: IntervalStep): string => (/^interval \d+ of \d+$/i.test(s.label) ? 'Effort' : s.label);

/**
 * The workout as a short outline: warm-up, "8 × Run 1 min, Walk 2 min", cool-down. Steps that repeat the same effort and rest are
 * gathered into one line, so a 17-step workout reads in three lines.
 */
export const summarizeSteps = (steps: IntervalStep[], miles = false): StepLine[] => {
  const lines: StepLine[] = [];
  let i = 0;
  while (i < steps.length) {
    const w = steps[i];
    const r = steps[i + 1];
    if (w.kind === 'work' && r && r.kind === 'recover') {
      let rounds = 1;
      let j = i + 2;
      while (j + 1 < steps.length && signature(steps[j]) === signature(w) && signature(steps[j + 1]) === signature(r)) {
        rounds++;
        j += 2;
      }
      // The last effort has no rest after it.
      if (j < steps.length && signature(steps[j]) === signature(w)) {
        rounds++;
        j++;
      }
      if (rounds >= 2) {
        const sec = steps.slice(i, j).reduce((a, s) => a + (s.durationSec ?? 0), 0);
        lines.push({ kind: 'repeat', text: `${rounds} × ${outlineLabel(w)} ${stepSize(w, miles)}, ${outlineLabel(r)} ${stepSize(r, miles)}`, seconds: sec });
        i = j;
        continue;
      }
    }
    lines.push({ kind: w.kind, text: `${outlineLabel(w)} ${stepSize(w, miles)}`, seconds: w.durationSec ?? 0 });
    i++;
  }
  return lines;
};