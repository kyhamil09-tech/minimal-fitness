import type { LatLng } from './geo';

const R = 6371000;

/** Local flat projection in metres around a reference latitude (accurate for the few kilometres of a route). */
const project = (p: LatLng, lat0: number): [number, number] => [((p[1] * Math.PI) / 180) * R * Math.cos((lat0 * Math.PI) / 180), ((p[0] * Math.PI) / 180) * R];

const perpendicular = (p: [number, number], a: [number, number], b: [number, number]): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/**
 * Ramer-Douglas-Peucker: keeps the points that matter for the shape of a route and drops the ones along straight stretches.
 * {@code epsilonM} is how far, in metres, the simplified line may stray from the original. Returns the indices kept.
 */
export const douglasPeuckerIndices = (points: LatLng[], epsilonM: number): number[] => {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);
  const lat0 = points.reduce((s, p) => s + p[0], 0) / n;
  const xy = points.map((p) => project(p, lat0));
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    let worst = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicular(xy[i], xy[s], xy[e]);
      if (d > worst) {
        worst = d;
        idx = i;
      }
    }
    if (worst > epsilonM && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
};

export const douglasPeucker = (points: LatLng[], epsilonM: number): LatLng[] => douglasPeuckerIndices(points, epsilonM).map((i) => points[i]);

/**
 * Simplifies to at most {@code max} points by growing the tolerance until the route fits: tight corners are kept, long straight
 * stretches are not. Better than keeping every Nth point, which cuts corners and keeps redundant points on straights.
 */
export const simplifyToMax = (points: LatLng[], max: number): LatLng[] => {
  if (points.length <= max) return points;
  let lo = 0.5;
  let hi = 2000;
  let best = douglasPeucker(points, hi);
  for (let i = 0; i < 18; i++) {
    const mid = Math.sqrt(lo * hi);
    const s = douglasPeuckerIndices(points, mid);
    if (s.length > max) lo = mid;
    else {
      hi = mid;
      best = s.map((k) => points[k]);
    }
  }
  return best;
};
