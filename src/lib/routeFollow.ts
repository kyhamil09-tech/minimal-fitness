import { LatLng, haversineKm } from './geo';

/**
 * Following a saved route with no signal beyond GPS: where you are along the line, how far off it you are, which way to turn, how
 * far to the finish, and the way back to the start. Everything is plain geometry on the route's own points.
 */

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Compass bearing from a to b in degrees, 0 to 360 (0 is north). */
export const bearingDeg = (a: LatLng, b: LatLng): number => {
  const dLng = rad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
};

/** The turn needed from a heading to a bearing, in degrees: negative is left, positive is right, within -180 to 180. */
export const relativeTurn = (heading: number, bearing: number): number => {
  let d = (bearing - heading) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

export type TurnAdvice = 'straight' | 'slight-left' | 'left' | 'slight-right' | 'right' | 'turn-around';

export const turnAdvice = (relative: number): TurnAdvice => {
  const a = Math.abs(relative);
  if (a < 20) return 'straight';
  if (a > 140) return 'turn-around';
  if (a < 55) return relative < 0 ? 'slight-left' : 'slight-right';
  return relative < 0 ? 'left' : 'right';
};

export const turnText = (t: TurnAdvice): string =>
  ({ straight: 'straight ahead', 'slight-left': 'bear left', left: 'turn left', 'slight-right': 'bear right', right: 'turn right', 'turn-around': 'turn around' })[t];

/** Local flat coordinates in metres around the route's centre. */
const makeProjector = (route: LatLng[]) => {
  const lat0 = route.reduce((s, p) => s + p[0], 0) / route.length;
  const k = Math.cos(rad(lat0));
  return (p: LatLng): [number, number] => [rad(p[1]) * R_KM * 1000 * k, rad(p[0]) * R_KM * 1000];
};

export interface FollowState {
  /** Straight-line distance from you to the nearest point of the route, metres. */
  offRouteM: number;
  /** Off the line for long enough to say so (it takes a few readings, and you have to come back closer to clear it). */
  isOff: boolean;
  /** How far along the route the nearest point is, km. */
  progressKm: number;
  remainingKm: number;
  totalKm: number;
  /** Bearing from you to the nearest point of the route, or to the way ahead when you are on it. */
  bearingToRoute: number;
  /** Straight-line distance and bearing back to the route's start. */
  toStartKm: number;
  bearingToStart: number;
  finished: boolean;
}

const OFF_ENTER_M = 40;
const OFF_EXIT_M = 22;
const OFF_READINGS = 3;
const LOOK_AHEAD_M = 50;

/**
 * Tracks one run against one route. Feed it each position. It remembers how far along you were, so a loop or an out-and-back does not
 * confuse the nearest point with the same stretch on the way back, and it needs a few readings off the line before it calls you off.
 */
export class RouteFollower {
  private xy: [number, number][];
  private cum: number[];
  private project: (p: LatLng) => [number, number];
  private lastSeg = 0;
  private offCount = 0;
  private off = false;
  readonly totalKm: number;

  constructor(private route: LatLng[]) {
    this.project = makeProjector(route);
    this.xy = route.map(this.project);
    this.cum = [0];
    for (let i = 1; i < route.length; i++) this.cum.push(this.cum[i - 1] + haversineKm(route[i - 1], route[i]));
    this.totalKm = this.cum[this.cum.length - 1];
  }

  private nearest(p: [number, number], from: number, to: number): { seg: number; t: number; dist: number } {
    let best = { seg: from, t: 0, dist: Infinity };
    for (let i = from; i < Math.min(to, this.xy.length - 1); i++) {
      const [ax, ay] = this.xy[i];
      const [bx, by] = this.xy[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
      const dist = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
      if (dist < best.dist) best = { seg: i, t, dist };
    }
    return best;
  }

  private pointAt(seg: number, t: number): LatLng {
    const a = this.route[seg];
    const b = this.route[Math.min(seg + 1, this.route.length - 1)];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  private kmAt(seg: number, t: number): number {
    const next = this.cum[Math.min(seg + 1, this.cum.length - 1)];
    return this.cum[seg] + (next - this.cum[seg]) * t;
  }

  reset() {
    this.lastSeg = 0;
    this.offCount = 0;
    this.off = false;
  }

  update(pos: LatLng): FollowState {
    const p = this.project(pos);
    // Look near where you were first (the next ~1 km of route); search the whole route only when that finds nothing close.
    const windowEnd = (() => {
      let i = this.lastSeg;
      while (i < this.cum.length - 1 && this.cum[i] - this.cum[this.lastSeg] < 1) i++;
      return Math.min(this.xy.length - 1, i + 1);
    })();
    let hit = this.nearest(p, Math.max(0, this.lastSeg - 3), windowEnd);
    if (hit.dist > 80) {
      const global = this.nearest(p, 0, this.xy.length - 1);
      if (global.dist < hit.dist) hit = global;
    }
    this.lastSeg = hit.seg;

    if (hit.dist > OFF_ENTER_M) this.offCount++;
    else if (hit.dist < OFF_EXIT_M) this.offCount = 0;
    if (this.offCount >= OFF_READINGS) this.off = true;
    else if (hit.dist < OFF_EXIT_M) this.off = false;

    const progressKm = this.kmAt(hit.seg, hit.t);
    const onLine = this.pointAt(hit.seg, hit.t);
    // Where to look: the line itself when you are off it, a little way ahead along it when you are on it.
    let target = onLine;
    if (!this.off || hit.dist < 10) {
      const aheadKm = Math.min(this.totalKm, progressKm + LOOK_AHEAD_M / 1000);
      let s = hit.seg;
      while (s < this.cum.length - 2 && this.cum[s + 1] < aheadKm) s++;
      const span = this.cum[s + 1] - this.cum[s];
      target = this.pointAt(s, span > 0 ? Math.min(1, (aheadKm - this.cum[s]) / span) : 1);
    }
    const remainingKm = Math.max(0, this.totalKm - progressKm);
    const end = this.route[this.route.length - 1];
    const toEndM = haversineKm(pos, end) * 1000;
    return {
      offRouteM: hit.dist,
      isOff: this.off,
      progressKm,
      remainingKm,
      totalKm: this.totalKm,
      bearingToRoute: bearingDeg(pos, target),
      toStartKm: haversineKm(pos, this.route[0]),
      bearingToStart: bearingDeg(pos, this.route[0]),
      finished: remainingKm < 0.05 || (toEndM < 40 && progressKm > this.totalKm * 0.9),
    };
  }
}

/** Heading of travel from the last two positions that are at least {@code minM} metres apart, or null when you have barely moved. */
export const headingFrom = (points: LatLng[], minM = 6): number | null => {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  for (let i = points.length - 2; i >= Math.max(0, points.length - 12); i--) {
    if (haversineKm(points[i], last) * 1000 >= minM) return bearingDeg(points[i], last);
  }
  return null;
};
