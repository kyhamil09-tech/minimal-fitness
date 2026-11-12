import { WorkoutSession } from '../types/health';
import { TrackPoint } from './geo';

/**
 * A "ghost" to race: how far you were (or would be) at every moment of a run. It is built from an earlier run's GPS track, or from a
 * steady pace. The live screen compares your distance and time with it and says how far ahead or behind you are, in seconds.
 */
export interface Ghost {
  label: string;
  /** Cumulative distance in km and moving time in seconds, one entry for each sample, both rising. */
  km: number[];
  sec: number[];
}

const MIN_KM = 0.2;

/** The ghost of an earlier run: moving time only, so a pause or a lost signal in that run does not slow it down. */
export const ghostFromTrack = (label: string, track: TrackPoint[] | undefined): Ghost | null => {
  if (!track || track.length < 2) return null;
  const km: number[] = [0];
  const sec: number[] = [0];
  let t = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (!b.gap) t += Math.max(0, (b.t - a.t) / 1000);
    const d = b.d - track[0].d;
    if (d <= km[km.length - 1] && t <= sec[sec.length - 1]) continue;
    km.push(Math.max(d, km[km.length - 1]));
    sec.push(Math.max(t, sec[sec.length - 1]));
  }
  return km[km.length - 1] >= MIN_KM && sec[sec.length - 1] > 0 ? { label, km, sec } : null;
};

/** A ghost that runs at one steady pace (seconds per km) for as far as anyone could want. */
export const ghostFromPace = (label: string, secPerKm: number): Ghost => ({ label, km: [0, 200], sec: [0, 200 * Math.max(60, secPerKm)] });

/** Seconds the ghost took to reach `km`; past the end of a recorded run it carries on at that run's average speed. */
export const ghostTimeAt = (g: Ghost, km: number): number => {
  const n = g.km.length;
  if (km <= 0) return 0;
  const lastKm = g.km[n - 1];
  const lastSec = g.sec[n - 1];
  if (km >= lastKm) return lastSec + (km - lastKm) * (lastSec / lastKm);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.km[mid] <= km) lo = mid;
    else hi = mid;
  }
  const span = g.km[hi] - g.km[lo];
  return span <= 0 ? g.sec[lo] : g.sec[lo] + ((km - g.km[lo]) / span) * (g.sec[hi] - g.sec[lo]);
};

/** Seconds you are ahead of the ghost (negative: behind). Zero before the first meters, where it would only be noise. */
export const gapSec = (g: Ghost, elapsedSec: number, km: number): number => (km < 0.05 ? 0 : Math.round(ghostTimeAt(g, km) - elapsedSec));

export interface GapText {
  state: 'ahead' | 'behind' | 'level';
  /** m:ss, or h:mm:ss over an hour. */
  text: string;
}

export const gapText = (gap: number): GapText => {
  const s = Math.abs(gap);
  const text = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return { state: gap > 1 ? 'ahead' : gap < -1 ? 'behind' : 'level', text };
};

export interface GhostChoices {
  last?: WorkoutSession;
  fastest?: WorkoutSession;
}

/** Your earlier runs of this activity that can serve as a ghost: the latest, and the quickest of the last thirty. */
export const ghostChoices = (workouts: WorkoutSession[], type: string): GhostChoices => {
  const pool = workouts
    .filter((w) => w.type === type && w.startedAt && (w.distanceKm ?? 0) >= 1 && (w.track?.length ?? 0) >= 2)
    .sort((a, b) => (b.startedAt as number) - (a.startedAt as number))
    .slice(0, 30);
  if (pool.length === 0) return {};
  const pace = (w: WorkoutSession) => (w.durationSec ?? w.durationMinutes * 60) / (w.distanceKm as number);
  const fastest = pool.reduce((best, w) => (pace(w) < pace(best) ? w : best), pool[0]);
  return { last: pool[0], fastest: fastest.id === pool[0].id ? undefined : fastest };
};
