import type { ExerciseLog, SetKind, SetLog } from '../types/tracking';

/**
 * What a set is. A normal set is the work; a warm-up is not counted toward volume, records or the weekly sets; a drop set follows a heavier
 * one with less weight straight away; a failure set was taken to the point where no more reps were possible. Drop and failure sets count.
 */
export const SET_KINDS: { id: SetKind; short: string; label: string; counts: boolean }[] = [
  { id: 'normal', short: '', label: 'Normal set', counts: true },
  { id: 'warmup', short: 'W', label: 'Warm-up set', counts: false },
  { id: 'drop', short: 'D', label: 'Drop set', counts: true },
  { id: 'failure', short: 'F', label: 'Failure set', counts: true },
];

export const kindOf = (s: Pick<SetLog, 'kind'>): SetKind => s.kind ?? 'normal';

export const kindInfo = (k: SetKind | undefined) => SET_KINDS.find((x) => x.id === (k ?? 'normal')) ?? SET_KINDS[0];

/** The next kind when the set-type button is tapped: normal, then warm-up, drop, failure and back. */
export const nextKind = (k: SetKind | undefined): SetKind => {
  const i = SET_KINDS.findIndex((x) => x.id === (k ?? 'normal'));
  return SET_KINDS[(i + 1) % SET_KINDS.length].id;
};

/** A finished set of the kind that counts toward volume, records and weekly sets (warm-ups do not). */
export const isWorkingSet = (s: SetLog): boolean => s.done && kindInfo(s.kind).counts;

/** A finished set that was held for time rather than counted in reps (a plank). */
export const isTimedSet = (s: SetLog): boolean => (s.seconds ?? 0) > 0 && s.reps <= 0;

/** A finished set worth keeping: it has reps, or it was a timed hold. */
export const hasWork = (s: SetLog): boolean => s.done && (s.reps > 0 || (s.seconds ?? 0) > 0);

export const workingSets = (log: ExerciseLog): SetLog[] => log.sets.filter((s) => isWorkingSet(s));

/** Weight lifted by the working sets of one exercise, in kg. Warm-ups and timed holds are not counted. */
export const workingVolumeKg = (log: ExerciseLog): number => log.sets.reduce((sum, s) => (isWorkingSet(s) ? sum + s.reps * s.weightKg : sum), 0);

/** "60 kg × 8", "bodyweight × 12", or "0:45" for a hold: how a set reads in a list. */
export const setText = (s: SetLog, weight: (kg: number) => string): string => {
  if (isTimedSet(s)) {
    const sec = s.seconds ?? 0;
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}${s.weightKg > 0 ? ` +${weight(s.weightKg)}` : ''}`;
  }
  if (s.load) {
    if (s.load.kg <= 0) return `bodyweight × ${s.reps}`;
    return `BW ${s.load.mode === 'assisted' ? '−' : '+'}${weight(s.load.kg)} × ${s.reps}`;
  }
  return `${s.weightKg > 0 ? weight(s.weightKg) : 'bodyweight'} × ${s.reps}`;
};

/** The label for set `index` of a list: W, D or F for those kinds, otherwise its number among the normal sets (warm-ups are not counted). */
export const setLabel = (sets: Pick<SetLog, 'kind'>[], index: number): string => {
  const k = sets[index]?.kind;
  if (k && k !== 'normal') return kindInfo(k).short;
  let n = 0;
  for (let i = 0; i <= index; i++) if (!sets[i].kind || sets[i].kind === 'normal') n++;
  return String(n);
};
