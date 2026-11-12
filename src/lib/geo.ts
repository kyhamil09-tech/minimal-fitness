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
  /** Horizontal accuracy in meters. */
  acc?: number | null;
  /** The GPS chip's own speed in meters per second (Doppler), when it reported one. */
  speed?: number | null;
  /** Heading in degrees clockwise from north, when known. */
  bearing?: number | null;
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
  /** True when this point starts a new stretch (after a pause, a lost signal or a restore): nothing is drawn from the point before. */
  gap?: boolean;
}

const MAX_ACCURACY_M = 40; // ignore noisy fixes
const GOOD_ACCURACY_M = 25; // while fixes this good keep coming, poorer ones are left out
const GOOD_WINDOW_MS = 30000;
const REACQUIRE_AFTER_MS = 15000; // after this long without a fix, the next one has to be a good one
const REACQUIRE_ACCURACY_M = 20;
const REACQUIRE_PATIENCE_MS = 45000; // ...unless the sky stays poor this long
const GAP_AFTER_MS = 20000; // a silence this long, then a far jump: no line is drawn across it and no distance is added
const FIRST_FIX_ACCURACY_M = 25; // the first point starts the route, so it has to be a good one (unless the sky stays poor)
const FIRST_FIX_PATIENCE_MS = 20000; // after this long with only poor fixes, the best available is accepted
const STILL_SPEED_MS = 0.3; // the GPS chip's own speed below this means standing still
const STILL_STEP_KM = 0.015; // and a step this small is drift, not movement
const MIN_STEP_KM = 0.004; // ignore jitter under ~4 m
const MAX_SPEED_KMH = 45; // ignore teleports (when the sport is not known)
const ALT_STEP_M = 3; // altitude must move this far before it counts as climbing or descending
const SPIKE_MIN_M = 8; // a spike has to stick out at least this far to be dropped
const REACQUIRE_CLUSTER = 4; // this many fixes in a row that agree with each other, but not with the route, mean the route was wrong

/** The fastest a person can plausibly move in each sport. A position that implies more than this is a GPS glitch, not you. */
export const maxSpeedKmhFor = (sport?: string): number => {
  switch (sport) {
    case 'Walking':
    case 'Hiking':
    case 'Snowshoeing':
      return 14;
    case 'AlpineSkiing':
    case 'Snowboarding':
      return 140;
    case 'CrossCountrySkiing':
      return 40;
    case 'Kayaking':
      return 25;
    case 'Paddleboarding':
      return 16;
    case 'Running':
      return 30;
    case 'Cycling':
      return 65;
    default:
      return MAX_SPEED_KMH;
  }
};

/** Keeps at most `max` items, always preserving first and last. */
export const decimate = <T,>(items: T[], max: number): T[] => {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
};

/** Like {@link decimate}, but the points that start a new stretch after a gap are always kept, so no line is drawn across a gap. */
export const decimateTrack = (points: TrackPoint[], max: number): TrackPoint[] => {
  if (points.length <= max) return points;
  const keep = new Set<number>();
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) keep.add(Math.round(i * step));
  points.forEach((p, i) => {
    if (p.gap) {
      keep.add(i);
      // and the point just before it, so the stretch before the gap ends where it really ended
      if (i > 0) keep.add(i - 1);
    }
  });
  return [...keep].sort((x, y) => x - y).map((i) => points[i]);
};

/** The track as separate stretches: a new one starts after every gap, so a map draws no line across the places you did not record. */
export const trackSegments = (points: { lat: number; lng: number; gap?: boolean }[]): LatLng[][] => {
  const out: LatLng[][] = [];
  for (const p of points) {
    if (p.gap || out.length === 0) out.push([]);
    out[out.length - 1].push([p.lat, p.lng]);
  }
  return out;
};

const meters = (a: LatLng, b: LatLng) => haversineKm(a, b) * 1000;

/**
 * Turns a stream of raw GPS fixes into a clean track. It drops inaccurate fixes, impossible jumps for the sport (before they can
 * pull the smoothing filter off course), fixes that arrive out of order or after the signal was lost without being good, and
 * glitches that jump away and come straight back. Anything recorded while paused is skipped. After a gap in the signal the track
 * starts a new stretch instead of drawing a line across it. Distance and climb are accumulated from what is kept.
 */
export class TrackBuilder {
  points: TrackPoint[] = [];
  distanceKm = 0;
  elevationGainM = 0;
  elevationLossM = 0;

  /**
   * With {@code smooth}, positions go through a Kalman filter first, so GPS jitter does not add distance.
   * {@code maxSpeedKmh} is the fastest the sport allows (see {@link maxSpeedKmhFor}).
   */
  constructor(options: { smooth?: boolean; qMetersPerSecond?: number; maxSpeedKmh?: number } = {}) {
    this.kalman = options.smooth ? new GpsKalman(options.qMetersPerSecond ?? 3) : null;
    this.maxSpeedKmh = options.maxSpeedKmh ?? MAX_SPEED_KMH;
  }

  private kalman: GpsKalman | null;
  private maxSpeedKmh: number;
  private firstSeenAt = 0;
  private lastSeenTs = -Infinity;
  private lastGoodAt = 0;
  private lastAcc: number | null = null;
  /** The latest fixes that were turned away for being too far from the route. */
  private rejected: Fix[] = [];
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
    // The chip's own speed, when every fix has it, is steadier than speed worked out from positions.
    const dop = w.filter((f) => f.speed != null && f.speed >= 0);
    if (dop.length === w.length) return dop.reduce((sum, f) => sum + (f.speed as number), 0) / dop.length;
    let dist = 0;
    for (let i = 1; i < w.length; i++) dist += haversineKm([w[i - 1].lat, w[i - 1].lng], [w[i].lat, w[i].lng]);
    const secs = (w[w.length - 1].ts - w[0].ts) / 1000;
    return secs > 0 ? (dist * 1000) / secs : null;
  }

  /** Epoch ms of the newest accurate fix (even while paused). */
  get lastFixAt(): number {
    return this.recent.length ? this.recent[this.recent.length - 1].ts : 0;
  }

  /**
   * The newest point was a glitch if the route goes out to it and straight back (a detour much longer than the direct way from the
   * point before to the fix after) and it was either poorly measured or too fast to be real. It is taken out again.
   */
  private dropSpike(next: Fix) {
    const n = this.points.length;
    if (n < 2 || !this.last) return;
    const k = this.points[n - 1];
    const c = this.points[n - 2];
    if (k.gap) return;
    const kp: LatLng = [k.lat, k.lng];
    const cp: LatLng = [c.lat, c.lng];
    const np: LatLng = [next.lat, next.lng];
    const a = meters(cp, kp);
    const b = meters(kp, np);
    const direct = meters(cp, np);
    const secs = (k.t - c.t) / 1000;
    const speedCK = secs > 0 ? a / secs : 0;
    const detour = a + b > 2 * direct + SPIKE_MIN_M * 1.25;
    const unlikely = speedCK > (0.5 * this.maxSpeedKmh) / 3.6 || (this.lastAcc ?? 0) > 12;
    if (detour && a > SPIKE_MIN_M && b > SPIKE_MIN_M && unlikely) {
      this.points.pop();
      this.distanceKm = c.d;
      this.last = { p: cp, t: c.t };
      this.kalman?.reset();
    }
  }

  /** Returns true when the fix was accepted into the track. */
  add(f: Fix): boolean {
    // A fix that is older than one already seen (or the same) would send the line backwards.
    if (f.ts <= this.lastSeenTs) return false;
    this.lastSeenTs = f.ts;
    const accOk = !(f.acc != null && f.acc > MAX_ACCURACY_M);
    if (accOk) {
      this.recent.push(f);
      if (this.recent.length > 12) this.recent.shift();
    }
    if (this.inPause(f.ts)) return false;
    if (!accOk) return false;
    const acc = f.acc ?? 10;
    // While good fixes keep coming, a poorer one is left out; with no good ones for a while, the best available is used.
    if (acc <= GOOD_ACCURACY_M) this.lastGoodAt = f.ts;
    else if (this.lastGoodAt && f.ts - this.lastGoodAt < GOOD_WINDOW_MS) return false;
    // The route starts on a good fix: a poor first one draws a spur from wherever the phone first guessed it was.
    if (this.points.length === 0 && !this.last) {
      if (!this.firstSeenAt) this.firstSeenAt = f.ts;
      if (f.acc != null && f.acc > FIRST_FIX_ACCURACY_M && f.ts - this.firstSeenAt < FIRST_FIX_PATIENCE_MS) return false;
    }
    // After the signal was lost, the first fix back is often a wild one: wait for a good one.
    if (this.last) {
      const silent = f.ts - this.last.t;
      if (silent > REACQUIRE_AFTER_MS && acc > REACQUIRE_ACCURACY_M && silent < REACQUIRE_PATIENCE_MS) return false;
    }

    // The raw position has to be possible for the sport, judged before it can touch the smoothing filter.
    const raw: LatLng = [f.lat, f.lng];
    let newStretch = false;
    if (this.last) {
      const secs = (f.ts - this.last.t) / 1000;
      const slackM = 0.7 * (acc + (this.lastAcc ?? acc));
      const limitM = (this.maxSpeedKmh / 3.6) * secs + slackM;
      if (meters(this.last.p, raw) > limitM) {
        this.rejected.push(f);
        if (this.rejected.length > 8) this.rejected.shift();
        const tail = this.rejected.slice(-REACQUIRE_CLUSTER);
        const agree = tail.length === REACQUIRE_CLUSTER && tail.every((r) => meters([r.lat, r.lng], raw) < 20);
        if (!agree) return false;
        // Several fixes in a row agree with each other and not with the route: the route's last point was the wrong one.
        newStretch = true;
        this.last = null;
        this.kalman?.reset();
      } else {
        this.dropSpike(f);
      }
    }
    this.rejected = [];

    if (this.kalman) {
      const s = this.kalman.update(f);
      f = { ...f, lat: s.lat, lng: s.lng };
    }
    const p: LatLng = [f.lat, f.lng];
    const alt = f.alt != null && Number.isFinite(f.alt) ? f.alt : undefined;

    // The first point of the track, or of a new stretch after a pause, a restore or a lost signal.
    if (!this.last) {
      const gap = this.points.length > 0 || newStretch;
      this.points.push({ t: f.ts, lat: f.lat, lng: f.lng, alt, d: this.distanceKm, ...(gap ? { gap: true } : {}) });
      this.last = { p, t: f.ts };
      this.lastAcc = acc;
      if (alt !== undefined && this.refAlt === null) this.refAlt = alt;
      return true;
    }

    const step = haversineKm(this.last.p, p);
    const gapMs = f.ts - this.last.t;
    const hours = gapMs / 3600000;
    if (step < MIN_STEP_KM) return false;
    // Standing still (the chip's speed is near zero and the step is small): that is drift, so it adds no distance.
    if (f.speed != null && f.speed < STILL_SPEED_MS && step < STILL_STEP_KM) return false;
    if (hours > 0 && step / hours > this.maxSpeedKmh * 1.25) return false;

    // After a long silence, a far jump is not walked: start a new stretch (no line, no distance) instead of inventing a path.
    if (gapMs > GAP_AFTER_MS && hours > 0 && step / hours > 0.6 * this.maxSpeedKmh) {
      this.kalman?.reset();
      this.points.push({ t: f.ts, lat: f.lat, lng: f.lng, alt, d: this.distanceKm, gap: true });
      this.last = { p: [f.lat, f.lng], t: f.ts };
      this.lastAcc = acc;
      return true;
    }

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
    this.lastAcc = acc;
    return true;
  }

/** Final result for saving: a track of at most `maxPoints` and a coarse route for quick previews. */
  snapshot(maxPoints = 800) {
    const track = decimateTrack(this.points, maxPoints).map((p) => ({
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
