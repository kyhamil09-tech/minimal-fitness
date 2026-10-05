import { GpsKalman } from './kalman';
import { simplifyToMax } from './simplify';

export type LatLng = [number, number];

export const haversineKm = (a: LatLng, b: LatLng): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** One raw GPS reading. */
export interface Fix {
  /** Epoch ms. */
  ts: number;
  lat: number;
  lng: number;
  alt?: number | null;
  /** Horizontal accuracy in metres. */
  acc?: number | null;
}

/** A recorded point along the route. */
export interface TrackPoint {
  /** Epoch ms. */
  t: number;
  lat: number;
  lng: number;
  alt?: number;
  /** Cumulative distance from the start, km. */
  d: number;
}

const MAX_ACCURACY_M = 40; // ignore noisy fixes
const MIN_STEP_KM = 0.004; // ignore jitter under ~4 m
const MAX_SPEED_KMH = 45; // ignore teleports
const ALT_STEP_M = 3; // altitude must move this far before it counts as climbing or descending

/** Keeps at most `max` items, always preserving first and last. */
export const decimate = <T,>(items: T[], max: number): T[] => {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
};

/**
 * Turns a stream of raw GPS fixes into a clean track: drops inaccurate fixes and jumps, skips
 * anything recorded while the workout was paused, and accumulates distance and climb.
 */
export class TrackBuilder {
  points: TrackPoint[] = [];
  distanceKm = 0;
  elevationGainM = 0;
  elevationLossM = 0;

  /** With {@code smooth}, positions go through a Kalman filter first, so GPS jitter does not add distance. */
  constructor(options: { smooth?: boolean; qMetersPerSecond?: number } = {}) {
    this.kalman = options.smooth ? new GpsKalman(options.qMetersPerSecond ?? 3) : null;
  }

  private kalman: GpsKalman | null;
  private last: { p: LatLng; t: number } | null = null;
  /** Recent accurate fixes, kept even while paused, to tell whether you are moving (used by auto-pause). */
  private recent: Fix[] = [];
  private refAlt: number | null = null;
  private pausedSince: number | null = null;
  private pauseRanges: [number, number][] = [];

  /** Restores a track saved mid-run (after a crash). New fixes start a fresh segment so the gap adds no distance. */
  hydrate(state: { points: TrackPoint[]; distanceKm: number; elevationGainM: number; elevationLossM: number }) {
    this.points = state.points.slice();
    this.distanceKm = state.distanceKm;
    this.elevationGainM = state.elevationGainM;
    this.elevationLossM = state.elevationLossM;
    this.last = null;
    this.kalman?.reset();
    const alts = this.points.filter((p) => p.alt !== undefined);
    this.refAlt = alts.length ? (alts[alts.length - 1].alt as number) : null;
  }

  pause(ts: number) {
    if (this.pausedSince === null) this.pausedSince = ts;
  }

  resume(ts: number) {
    if (this.pausedSince !== null) {
      this.pauseRanges.push([this.pausedSince, ts]);
      this.pausedSince = null;
      this.last = null; // don't count the walk across a pause as distance
      this.kalman?.reset(); // the position before a pause says nothing about the one after it
    }
  }

  private inPause(ts: number) {
    if (this.pausedSince !== null && ts >= this.pausedSince) return true;
    return this.pauseRanges.some(([a, b]) => ts >= a && ts <= b);
  }

  /** Speed over the last few seconds in m/s, or null when there are too few fixes to tell. */
  recentSpeedMs(windowMs = 8000): number | null {
    const w = this.recent.filter((f) => f.ts >= (this.recent[this.recent.length - 1]?.ts ?? 0) - windowMs);
    if (w.length < 3) return null;
    let dist = 0;
    for (let i = 1; i < w.length; i++) dist += haversineKm([w[i - 1].lat, w[i - 1].lng], [w[i].lat, w[i].lng]);
    const secs = (w[w.length - 1].ts - w[0].ts) / 1000;
    return secs > 0 ? (dist * 1000) / secs : null;
  }

  /** Epoch ms of the newest accurate fix (even while paused). */
  get lastFixAt(): number {
    return this.recent.length ? this.recent[this.recent.length - 1].ts : 0;
  }

  /** Returns true when the fix was accepted into the track. */
  add(f: Fix): boolean {
    if (!(f.acc != null && f.acc > MAX_ACCURACY_M)) {
      this.recent.push(f);
      if (this.recent.length > 12) this.recent.shift();
    }
    if (this.inPause(f.ts)) return false;
    if (f.acc != null && f.acc > MAX_ACCURACY_M) return false;
    if (this.kalman) {
      const s = this.kalman.update(f);
      f = { ...f, lat: s.lat, lng: s.lng };
    }
    const p: LatLng = [f.lat, f.lng];
    const alt = f.alt != null && Number.isFinite(f.alt) ? f.alt : undefined;

    if (!this.last) {
      this.points.push({ t: f.ts, lat: f.lat, lng: f.lng, alt, d: this.distanceKm });
      this.last = { p, t: f.ts };
      if (alt !== undefined && this.refAlt === null) this.refAlt = alt;
      return true;
    }

    const step = haversineKm(this.last.p, p);
    const hours = (f.ts - this.last.t) / 3600000;
    if (step < MIN_STEP_KM) return false;
    if (hours > 0 && step / hours > MAX_SPEED_KMH) return false;

    this.distanceKm += step;
    if (alt !== undefined) {
      if (this.refAlt === null) this.refAlt = alt;
      const diff = alt - this.refAlt;
      if (diff >= ALT_STEP_M) {
        this.elevationGainM += diff;
        this.refAlt = alt;
      } else if (diff <= -ALT_STEP_M) {
        this.elevationLossM += -diff;
        this.refAlt = alt;
      }
    }
    this.points.push({ t: f.ts, lat: f.lat, lng: f.lng, alt, d: this.distanceKm });
    this.last = { p, t: f.ts };
    return true;
  }

  /** Final result for saving: a track of at most `maxPoints` and a coarse route for quick previews. */
  snapshot(maxPoints = 800) {
    const track = decimate(this.points, maxPoints).map((p) => ({
      ...p,
      lat: Number(p.lat.toFixed(6)),
      lng: Number(p.lng.toFixed(6)),
      d: Number(p.d.toFixed(4)),
    }));
    return {
      distanceKm: Number(this.distanceKm.toFixed(3)),
      elevationGainM: Math.round(this.elevationGainM),
      elevationLossM: Math.round(this.elevationLossM),
      track,
      // The preview route keeps corners and drops straight stretches, which looks right at 300 points and shares well.
      route: simplifyToMax(track.map((p): LatLng => [p.lat, p.lng]), 300),
    };
  }
}

/** Keep at most `max` points, always preserving first and last. */
export const decimateRoute = (route: LatLng[], max = 300): LatLng[] => {
  if (route.length <= max) return route;
  const step = (route.length - 1) / (max - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) out.push(route[Math.round(i * step)]);
  return out;
};

/** Project a route to an SVG polyline `points` string inside a w x h box with padding. */
export const routeToSvgPoints = (route: LatLng[], w: number, h: number, pad = 8): string => {
  if (route.length < 2) return '';
  const lats = route.map((p) => p[0]);
  const lngs = route.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Correct longitude compression so the shape isn't stretched.
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lngScale = Math.cos(midLat);
  const spanX = Math.max(1e-9, (maxLng - minLng) * lngScale);
  const spanY = Math.max(1e-9, maxLat - minLat);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return route
    .map((p) => {
      const x = offX + (p[1] - minLng) * lngScale * scale;
      const y = h - (offY + (p[0] - minLat) * scale);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};
