import { LatLng, haversineKm } from './geo';
import { WorkoutSession } from '../types/health';
import { trackMovingSeconds } from './workoutStats';

/**
 * Finds the routes you run again and again, and ranks your attempts on each. Two workouts are the same route when they start and
 * end in the same places, cover about the same distance and stay close to each other along the way (compared at 40 evenly spaced
 * points). Everything is worked out from your own recorded tracks, with no map data or server.
 */

const SAMPLES = 40;
const MEAN_LIMIT_M = 35;
const MAX_LIMIT_M = 140;
const DISTANCE_TOLERANCE = 0.1;

const ROUTE_TYPES = new Set(['Running', 'Walking', 'Hiking', 'Cycling']);

export const workoutPoints = (w: WorkoutSession): LatLng[] =>
  w.track && w.track.length >= 2 ? w.track.map((p): LatLng => [p.lat, p.lng]) : (w.route ?? []);

/** The line resampled to {@code n} points evenly spaced along its length. */
export const resample = (pts: LatLng[], n = SAMPLES): LatLng[] => {
  if (pts.length < 2) return pts.slice();
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineKm(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  if (total <= 0) return pts.slice(0, 1);
  const out: LatLng[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < pts.length - 1 && cum[j] < target) j++;
    const span = cum[j] - cum[j - 1];
    const f = span > 0 ? (target - cum[j - 1]) / span : 0;
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
  }
  return out;
};

export interface RouteShape {
  samples: LatLng[];
  km: number;
  /** Start and finish within 150 m of each other. */
  loop: boolean;
}

export const shapeOf = (w: WorkoutSession): RouteShape | null => {
  const pts = workoutPoints(w);
  if (pts.length < 2) return null;
  const samples = resample(pts);
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]);
  const dist = w.distanceKm && w.distanceKm > 0 ? w.distanceKm : km;
  if (dist < 0.4) return null;
  return { samples, km: dist, loop: haversineKm(samples[0], samples[samples.length - 1]) < 0.15 };
};

/** How far apart two routes are along their length: average and worst gap, in metres (same direction). */
export const routeGap = (a: LatLng[], b: LatLng[]): { mean: number; max: number } => {
  let sum = 0;
  let max = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = haversineKm(a[i], b[i]) * 1000;
    sum += d;
    if (d > max) max = d;
  }
  return { mean: n ? sum / n : Infinity, max };
};

export const sameRoute = (a: RouteShape, b: RouteShape): boolean => {
  if (Math.abs(a.km - b.km) / Math.max(a.km, b.km) > DISTANCE_TOLERANCE) return false;
  if (a.loop !== b.loop) return false;
  const forward = routeGap(a.samples, b.samples);
  if (forward.mean < MEAN_LIMIT_M && forward.max < MAX_LIMIT_M) return true;
  // A loop run the other way round is still the same loop.
  if (a.loop) {
    const back = routeGap(a.samples, [...b.samples].reverse());
    return back.mean < MEAN_LIMIT_M && back.max < MAX_LIMIT_M;
  }
  return false;
};

export interface Attempt {
  workoutId: string;
  at: number;
  seconds: number;
  /** Seconds per km. */
  paceSecPerKm: number;
  avgHr?: number;
}

export interface RouteGroup {
  id: string;
  type: WorkoutSession['type'];
  km: number;
  loop: boolean;
  /** Newest first. */
  attempts: Attempt[];
  best: Attempt;
  /** The route as a polyline for a thumbnail. */
  outline: LatLng[];
  /** Median time of the latest 3 against the 3 before, in percent (negative is faster). Needs 6 attempts. */
  trendPct?: number;
}

const movingSeconds = (w: WorkoutSession): number => {
  const total = w.durationSec ?? w.durationMinutes * 60;
  if (w.track && w.track.length > 2) {
    const moving = trackMovingSeconds(w.track);
    if (moving > 60 && moving <= total * 1.05) return Math.round(moving);
  }
  return Math.round(total);
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Groups workouts into routes. Only routes done at least twice are returned, most-repeated first. */
export const findRoutes = (workouts: WorkoutSession[]): RouteGroup[] => {
  type Cluster = { type: string; shape: RouteShape; members: { w: WorkoutSession; shape: RouteShape }[] };
  const clusters: Cluster[] = [];
  const sorted = workouts.filter((w) => ROUTE_TYPES.has(w.type) && w.startedAt).sort((a, b) => (a.startedAt as number) - (b.startedAt as number));
  for (const w of sorted) {
    const shape = shapeOf(w);
    if (!shape) continue;
    const home = clusters.find((c) => c.type === w.type && sameRoute(c.shape, shape));
    if (home) home.members.push({ w, shape });
    else clusters.push({ type: w.type, shape, members: [{ w, shape }] });
  }
  return clusters
    .filter((c) => c.members.length >= 2)
    .map((c): RouteGroup => {
      const attempts = c.members
        .map(({ w, shape }): Attempt => {
          const seconds = movingSeconds(w);
          return { workoutId: w.id, at: w.startedAt as number, seconds, paceSecPerKm: seconds / Math.max(0.1, shape.km), avgHr: w.avgHeartRate || undefined };
        })
        .sort((a, b) => b.at - a.at);
      const best = attempts.reduce((a, b) => (b.seconds < a.seconds ? b : a));
      let trendPct: number | undefined;
      if (attempts.length >= 6) {
        const recent = median(attempts.slice(0, 3).map((a) => a.seconds));
        const before = median(attempts.slice(3, 6).map((a) => a.seconds));
        trendPct = Math.round(((recent - before) / before) * 1000) / 10;
      }
      const km = c.members.reduce((s, m) => s + m.shape.km, 0) / c.members.length;
      return { id: `route-${c.type}-${Math.round(c.shape.samples[0][0] * 1e4)}-${Math.round(c.shape.samples[0][1] * 1e4)}-${Math.round(km * 10)}`, type: c.type as WorkoutSession['type'], km, loop: c.shape.loop, attempts, best, outline: c.shape.samples, trendPct };
    })
    .sort((a, b) => b.attempts.length - a.attempts.length || b.attempts[0].at - a.attempts[0].at);
};

/** Where one workout stands among the attempts on its route, if it belongs to one. */
export const standingFor = (groups: RouteGroup[], workoutId: string): { group: RouteGroup; rank: number; of: number; isBest: boolean; behindBestSec: number } | null => {
  for (const g of groups) {
    const mine = g.attempts.find((a) => a.workoutId === workoutId);
    if (!mine) continue;
    const rank = [...g.attempts].sort((a, b) => a.seconds - b.seconds).findIndex((a) => a.workoutId === workoutId) + 1;
    return { group: g, rank, of: g.attempts.length, isBest: rank === 1, behindBestSec: mine.seconds - g.best.seconds };
  }
  return null;
};

export const routeLabel = (g: Pick<RouteGroup, 'km' | 'loop' | 'type'>, miles = false): string => {
  const d = miles ? g.km / 1.609344 : g.km;
  const unit = miles ? 'mi' : 'km';
  const shape = g.loop ? 'loop' : g.type === 'Cycling' ? 'ride' : 'route';
  return `${d >= 10 ? Math.round(d) : Math.round(d * 10) / 10} ${unit} ${shape}`;
};
