import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { estimateOneRepMax } from './calc';
import { bestEffortSeconds, formatDuration, personalBests, trackMovingSeconds } from './workoutStats';
import { formatDistance, formatWeight } from './units';

export type BestGroup = 'run' | 'ride' | 'move' | 'lift';

export interface BestRecord {
  id: string;
  group: BestGroup;
  label: string;
  /** Ready to show, in the chosen units. */
  value: string;
  /** Which exercise or activity it belongs to, for lifts. */
  sub: string;
  workoutId: string;
  at: number;
  /** A number for the share card's big figure and its unit. */
  big: string;
  unit: string;
  /** Worked out from a distance and time typed in or logged without GPS, so less exact than a tracked one. */
  estimated?: boolean;
}

const atOf = (w: WorkoutSession): number => w.startedAt ?? (Date.parse(w.timestamp) || 0);
const secOf = (w: WorkoutSession) => w.durationSec ?? w.durationMinutes * 60;

/** The record holder among workouts for one measure, ignoring zero values. */
const top = (list: WorkoutSession[], measure: (w: WorkoutSession) => number): { w: WorkoutSession; v: number } | null => {
  let best: { w: WorkoutSession; v: number } | null = null;
  for (const w of list) {
    const v = measure(w);
    if (v > 0 && (!best || v > best.v)) best = { w, v };
  }
  return best;
};

const RIDE_TYPES = new Set(['Cycling', 'IndoorCycling']);

/**
 * Every best the app can work out from what is logged: fastest running distances, longest runs, rides and walks, strongest
 * power, and for each lift the heaviest set, the best estimated one-rep max and the biggest set by volume.
 */
export const allBests = (workouts: WorkoutSession[], units: UnitSystem): BestRecord[] => {
  const out: BestRecord[] = [];
  // A distance or speed record from a workout with no GPS track (typed in, indoor, or a phone left behind) is marked as estimated.
  const hasTrack = (w: WorkoutSession) => !!w.track && w.track.length > 1;
  const add = (r: Omit<BestRecord, 'at'> & { at?: number }, w?: WorkoutSession) => {
    const guess = !!w && r.group !== 'lift' && !hasTrack(w);
    out.push({ ...r, at: r.at ?? (w ? atOf(w) : 0), ...(guess ? { estimated: true } : {}) });
  };

  // Running: fastest 1 km to half marathon from GPS tracks.
  for (const p of personalBests(workouts)) {
    add({ id: `run-${p.target.id}`, group: 'run', label: `Fastest ${p.target.label}`, value: formatDuration(p.seconds), sub: 'Running', workoutId: p.workoutId, at: p.at, big: formatDuration(p.seconds), unit: p.target.label }, undefined);
  }
  const runs = workouts.filter((w) => w.type === 'Running' || w.type === 'Treadmill');
  const longRun = top(runs, (w) => w.distanceKm ?? 0);
  if (longRun) add({ id: 'run-longest', group: 'run', label: 'Longest run', value: formatDistance(longRun.v, units), sub: 'Running', workoutId: longRun.w.id, big: formatDistance(longRun.v, units).split(' ')[0], unit: units === 'imperial' ? 'mi run' : 'km run' }, longRun.w);
  const climbRun = top(runs, (w) => w.elevationGainM ?? 0);
  if (climbRun) add({ id: 'run-climb', group: 'run', label: 'Most climbing on a run', value: `${Math.round(climbRun.v)} m`, sub: 'Running', workoutId: climbRun.w.id, big: String(Math.round(climbRun.v)), unit: 'm climbed' }, climbRun.w);

  // Riding.
  const rides = workouts.filter((w) => RIDE_TYPES.has(w.type));
  const longRide = top(rides, (w) => w.distanceKm ?? 0);
  if (longRide) add({ id: 'ride-longest', group: 'ride', label: 'Longest ride', value: formatDistance(longRide.v, units), sub: 'Cycling', workoutId: longRide.w.id, big: formatDistance(longRide.v, units).split(' ')[0], unit: units === 'imperial' ? 'mi ride' : 'km ride' }, longRide.w);
  const longTime = top(rides, secOf);
  if (longTime) add({ id: 'ride-time', group: 'ride', label: 'Longest time in the saddle', value: formatDuration(longTime.v), sub: 'Cycling', workoutId: longTime.w.id, big: formatDuration(longTime.v), unit: 'on the bike' }, longTime.w);
  // Fastest 10, 20 and 40 km stretches, from the GPS track's moving time (so a coffee stop does not count against you).
  for (const km of [10, 20, 40]) {
    let best: { w: WorkoutSession; sec: number } | null = null;
    for (const w of rides) {
      if (!hasTrack(w)) continue;
      const sec = bestEffortSeconds(w.track!, km);
      if (sec !== null && (!best || sec < best.sec)) best = { w, sec };
    }
    if (best) {
      const kmh = km / (best.sec / 3600);
      const shown = units === 'imperial' ? kmh / 1.609344 : kmh;
      add({ id: `ride-best-${km}`, group: 'ride', label: `Fastest ${units === 'imperial' ? `${Math.round(km / 1.609344)} mi` : `${km} km`} ride`, value: formatDuration(best.sec), sub: `${shown.toFixed(1)} ${units === 'imperial' ? 'mph' : 'km/h'}`, workoutId: best.w.id, big: formatDuration(best.sec), unit: `fastest ${km} km` }, best.w);
    }
  }
  // Fastest average speed over a whole ride counts only on rides long enough to mean something (10 km or more). Where a GPS
  // track exists the moving time is used, otherwise the logged duration.
  const movingSec = (w: WorkoutSession) => (hasTrack(w) ? trackMovingSeconds(w.track!) || secOf(w) : secOf(w));
  const fast = top(rides.filter((w) => (w.distanceKm ?? 0) >= 10 && movingSec(w) > 0), (w) => (w.distanceKm ?? 0) / (movingSec(w) / 3600));
  if (fast) {
    const shown = units === 'imperial' ? fast.v / 1.609344 : fast.v;
    add({ id: 'ride-speed', group: 'ride', label: 'Fastest average speed (10 km+)', value: `${shown.toFixed(1)} ${units === 'imperial' ? 'mph' : 'km/h'}`, sub: 'Cycling', workoutId: fast.w.id, big: shown.toFixed(1), unit: units === 'imperial' ? 'mph average' : 'km/h average' }, fast.w);
  }
  const climbRide = top(rides, (w) => w.elevationGainM ?? 0);
  if (climbRide) add({ id: 'ride-climb', group: 'ride', label: 'Most climbing on a ride', value: `${Math.round(climbRide.v)} m`, sub: 'Cycling', workoutId: climbRide.w.id, big: String(Math.round(climbRide.v)), unit: 'm climbed' }, climbRide.w);
  const p20 = top(rides, (w) => w.bestPower20W ?? 0);
  if (p20) add({ id: 'ride-p20', group: 'ride', label: 'Best 20-minute power', value: `${Math.round(p20.v)} W`, sub: 'Cycling', workoutId: p20.w.id, big: String(Math.round(p20.v)), unit: 'W for 20 min' }, p20.w);

  // Walking and hiking.
  const walks = workouts.filter((w) => w.type === 'Walking' || w.type === 'Hiking');
  const longWalk = top(walks, (w) => w.distanceKm ?? 0);
  if (longWalk) add({ id: 'move-walk', group: 'move', label: 'Longest walk or hike', value: formatDistance(longWalk.v, units), sub: longWalk.w.type, workoutId: longWalk.w.id, big: formatDistance(longWalk.v, units).split(' ')[0], unit: units === 'imperial' ? 'mi on foot' : 'km on foot' }, longWalk.w);
  const rowing = top(workouts.filter((w) => w.type === 'Rowing'), (w) => w.distanceKm ?? 0);
  if (rowing) add({ id: 'move-row', group: 'move', label: 'Longest row', value: formatDistance(rowing.v, units), sub: 'Rowing', workoutId: rowing.w.id, big: formatDistance(rowing.v, units).split(' ')[0], unit: units === 'imperial' ? 'mi rowed' : 'km rowed' }, rowing.w);

  // Lifts: per exercise, three records.
  type Lift = { name: string; heavy?: { kg: number; reps: number; w: WorkoutSession }; e1?: { v: number; kg: number; reps: number; w: WorkoutSession }; vol?: { v: number; kg: number; reps: number; w: WorkoutSession } };
  const lifts = new Map<string, Lift>();
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      const l = lifts.get(ex.exerciseId) ?? { name: ex.name };
      for (const s of ex.sets) {
        if (!s.done || s.weightKg <= 0 || s.reps <= 0) continue;
        if (!l.heavy || s.weightKg > l.heavy.kg || (s.weightKg === l.heavy.kg && s.reps > l.heavy.reps)) l.heavy = { kg: s.weightKg, reps: s.reps, w };
        const e1 = estimateOneRepMax(s.weightKg, s.reps);
        if (!l.e1 || e1 > l.e1.v) l.e1 = { v: e1, kg: s.weightKg, reps: s.reps, w };
        const vol = s.weightKg * s.reps;
        if (!l.vol || vol > l.vol.v) l.vol = { v: vol, kg: s.weightKg, reps: s.reps, w };
      }
      lifts.set(ex.exerciseId, l);
    }
  }
  for (const [id, l] of lifts) {
    if (l.e1) add({ id: `lift-1rm-${id}`, group: 'lift', label: `${l.name}: estimated 1RM`, value: formatWeight(l.e1.v, units, 0), sub: `${formatWeight(l.e1.kg, units)} × ${l.e1.reps}`, workoutId: l.e1.w.id, big: formatWeight(l.e1.v, units, 0).split(' ')[0], unit: `${units === 'imperial' ? 'lb' : 'kg'} est. 1RM, ${l.name}` }, l.e1.w);
    if (l.heavy) add({ id: `lift-heavy-${id}`, group: 'lift', label: `${l.name}: heaviest set`, value: `${formatWeight(l.heavy.kg, units)} × ${l.heavy.reps}`, sub: l.name, workoutId: l.heavy.w.id, big: formatWeight(l.heavy.kg, units).split(' ')[0], unit: `${units === 'imperial' ? 'lb' : 'kg'} × ${l.heavy.reps}, ${l.name}` }, l.heavy.w);
    if (l.vol) add({ id: `lift-vol-${id}`, group: 'lift', label: `${l.name}: biggest set`, value: formatWeight(l.vol.v, units, 0), sub: `${formatWeight(l.vol.kg, units)} × ${l.vol.reps}`, workoutId: l.vol.w.id, big: formatWeight(l.vol.v, units, 0).split(' ')[0], unit: `${units === 'imperial' ? 'lb' : 'kg'} in one set, ${l.name}` }, l.vol.w);
  }
  return out;
};

/** Records set in the last `days` days: the ones to call out as new. */
export const isRecent = (r: Pick<BestRecord, 'at'>, now: number = Date.now(), days = 14): boolean => r.at > 0 && now - r.at <= days * 86_400_000;
