import { WorkoutSession } from '../types/health';

/**
 * After a session: how hard it was for you, and about how long to give it before the next hard one. "Hard" is judged against your
 * own recent sessions (the median load of the last 28 days), so the same run reads as easy for a regular runner and hard for a
 * beginner. The hours are a rule of thumb, nudged by your effort rating and by how ready you were that morning. They are not
 * medical advice.
 */

export type EffortLabel = 'easy' | 'moderate' | 'hard' | 'very-hard';

export interface RecoveryAdvice {
  label: EffortLabel;
  title: string;
  /** Today's load against your usual session (1.0 is a typical one). */
  ratio: number;
  /** Hours before another hard session feels good. */
  hours: number;
  message: string;
  tone: 'good' | 'neutral' | 'warn' | 'bad';
}

const DAY = 86_400_000;
/** A typical session on the app's load scale, used until there is enough history. */
const FALLBACK_LOAD = 60;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const recoveryAdvice = (w: WorkoutSession, all: WorkoutSession[], opts: { readiness?: number } = {}): RecoveryAdvice | null => {
  const load = w.cardioLoadPoints ?? 0;
  if (!(load > 0)) return null;
  const at = w.startedAt ?? Date.now();
  const prior = all
    .filter((x) => x.id !== w.id && x.startedAt && x.startedAt < at && x.startedAt >= at - 28 * DAY && (x.cardioLoadPoints ?? 0) > 0)
    .map((x) => x.cardioLoadPoints as number);
  const baseline = prior.length >= 4 ? median(prior) : FALLBACK_LOAD;
  const ratio = load / baseline;

  let label: EffortLabel = ratio < 0.6 ? 'easy' : ratio < 1.25 ? 'moderate' : ratio < 1.8 ? 'hard' : 'very-hard';
  // How it felt counts too: an 9 or 10 out of 10 is never "easy".
  if ((w.perceivedExertion ?? 0) >= 9 && label === 'easy') label = 'moderate';

  let hours = 10 + 22 * Math.min(2.5, ratio);
  if ((w.perceivedExertion ?? 0) >= 9) hours += 6;
  if (opts.readiness !== undefined) hours += opts.readiness < 50 ? 8 : opts.readiness >= 80 ? -4 : 0;
  hours = Math.round(Math.min(72, Math.max(8, hours)) / 2) * 2;

  const when = hours <= 14 ? 'You can go again tomorrow if you like.' : hours <= 30 ? 'Keep tomorrow easy or take a rest day.' : hours <= 44 ? 'Take an easy day or two before the next hard session.' : 'Give it a couple of easy days before the next hard session.';
  const title = { easy: 'An easy session for you', moderate: 'A solid, normal session for you', hard: 'A hard session for you', 'very-hard': 'A very hard session for you' }[label];
  const tone = ({ easy: 'good', moderate: 'neutral', hard: 'warn', 'very-hard': 'bad' } as const)[label];
  const basis = prior.length >= 4 ? 'compared with your last month' : 'compared with a typical session (not enough history yet)';
  return { label, title, ratio: Math.round(ratio * 100) / 100, hours, message: `${title} ${basis}. About ${hours} hours until another hard one. ${when}`, tone };
};
