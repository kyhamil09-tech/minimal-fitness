import { TrackPoint } from './geo';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { KM_PER_MI } from './units';
import { heartRateZone } from './calc';
import { hampel } from './robust';

/** One lap of a run, ride or walk: a full kilometre or mile, or the shorter final stretch. */
export interface Split {
  index: number;
  distanceKm: number;
  /** Moving seconds (time spent paused is not counted). */
  seconds: number;
  /** Seconds per display unit (per km or per mile). */
  paceSec: number;
  /** Net climb over the split, metres (negative when descending). */
  elevDeltaM?: number;
  avgHr?: number;
  partial: boolean;
}

const unitKm = (u: UnitSystem) => (u === 'imperial' ? KM_PER_MI : 1);

/** A gap longer than this with almost no progress means you stopped (a pause, or standing at a light). */
const PAUSE_GAP_S = 10;
/** Below this average speed during a gap, the time is treated as stopped. */
const STOPPED_KMH = 1.5;

const movingSeconds = (a: TrackPoint, b: TrackPoint) => {
  const dt = (b.t - a.t) / 1000;
  if (dt <= PAUSE_GAP_S) return Math.max(0, dt);
  const kmh = ((b.d - a.d) / dt) * 3600;
  return kmh < STOPPED_KMH ? 0 : dt;
};

/** Total moving time of a track in seconds. */
export const trackMovingSeconds = (track: TrackPoint[]): number => {
  let s = 0;
  for (let i = 1; i < track.length; i++) s += movingSeconds(track[i - 1], track[i]);
  return s;
};

const avgHrBetween = (hr: [number, number][] | undefined, from: number, to: number): number | undefined => {
  if (!hr || hr.length === 0) return undefined;
  let sum = 0;
  let n = 0;
  for (const [ts, bpm] of hr) {
    if (ts >= from && ts <= to) {
      sum += bpm;
      n++;
    }
  }
  return n > 0 ? Math.round(sum / n) : undefined;
};

/** Per-kilometre (or per-mile) splits with pace, net elevation change and average heart rate. */
export const computeSplits = (
  track: TrackPoint[],
  units: UnitSystem,
  hr?: [number, number][]
): Split[] => {
  if (track.length < 2) return [];
  const step = unitKm(units);
  const total = track[track.length - 1].d;
  const out: Split[] = [];

  let boundary = step;
  let startIdx = 0;
  let splitStartT = track[0].t;
  let splitStartD = 0;
  let splitStartAlt = track[0].alt;
  let movingAcc = 0;

  const pushSplit = (endT: number, endD: number, endAlt: number | undefined, partial: boolean) => {
    const dist = endD - splitStartD;
    if (dist <= 0) return;
    const seconds = Math.max(1, movingAcc);
    out.push({
      index: out.length + 1,
      distanceKm: dist,
      seconds,
      paceSec: seconds / (dist / step),
      elevDeltaM: endAlt !== undefined && splitStartAlt !== undefined ? endAlt - splitStartAlt : undefined,
      avgHr: avgHrBetween(hr, splitStartT, endT),
      partial,
    });
  };

  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const segSeconds = movingSeconds(a, b);
    // Several boundaries can fall inside one long segment.
    let segStartD = a.d;
    let segStartT = a.t;
    let segMoving = segSeconds;
    while (b.d >= boundary - 1e-9 && boundary <= total + 1e-9 && b.d > segStartD) {
      const frac = (boundary - segStartD) / (b.d - segStartD);
      const t = segStartT + (b.t - segStartT) * frac;
      const alt = a.alt !== undefined && b.alt !== undefined ? a.alt + (b.alt - a.alt) * ((boundary - a.d) / Math.max(1e-9, b.d - a.d)) : b.alt;
      movingAcc += segMoving * frac;
      pushSplit(t, boundary, alt, false);
      segMoving *= 1 - frac;
      segStartD = boundary;
      segStartT = t;
      splitStartT = t;
      splitStartD = boundary;
      splitStartAlt = alt;
      movingAcc = 0;
      boundary += step;
      startIdx = i;
    }
    movingAcc += segMoving;
  }
  void startIdx;

  const last = track[track.length - 1];
  // A final stretch shorter than 5% of a unit is GPS noise, not a split.
  if (last.d - splitStartD >= step * 0.05) pushSplit(last.t, last.d, last.alt, true);
  return out;
};

/** Seconds spent in each of the five heart-rate zones. */
export const zoneSeconds = (hr: [number, number][] | undefined, maxHr: number): number[] => {
  const zones = [0, 0, 0, 0, 0];
  if (!hr || hr.length === 0 || maxHr <= 0) return zones;
  for (let i = 0; i < hr.length; i++) {
    const [ts, bpm] = hr[i];
    const next = hr[i + 1]?.[0];
    // Each reading covers the time until the next one, capped so a gap in data isn't counted as exercise.
    const dur = next ? Math.min(15, (next - ts) / 1000) : 5;
    zones[heartRateZone(bpm, maxHr) - 1] += Math.max(0, dur);
  }
  return zones;
};

/** Speed along the route (display units per hour) over a short rolling window. */
export const speedSeries = (track: TrackPoint[], units: UnitSystem, windowKm = 0.12) => {
  const out: { label: string; value: number }[] = [];
  if (track.length < 2) return out;
  const step = unitKm(units);
  let j = 0;
  for (let i = 0; i < track.length; i++) {
    while (j < track.length - 1 && track[j].d - track[i].d < windowKm) j++;
    if (j <= i) continue;
    let secs = 0;
    for (let k = i + 1; k <= j; k++) secs += movingSeconds(track[k - 1], track[k]);
    const distKm = track[j].d - track[i].d;
    if (secs > 0 && distKm > 0) {
      const kmh = (distKm / secs) * 3600;
      if (kmh < 60) out.push({ label: (track[i].d / step).toFixed(1), value: kmh / step });
    }
  }
  return out;
};

/** Altitude along the route, lightly smoothed. */
export const elevationSeries = (track: TrackPoint[], units: UnitSystem) => {
  const pts = track.filter((p) => p.alt !== undefined);
  if (pts.length < 2) return [];
  const step = unitKm(units);
  const m = units === 'imperial' ? 3.28084 : 1;
  const w = 4;
  return pts.map((p, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(pts.length - 1, i + w); k++) {
      s += pts[k].alt as number;
      n++;
    }
    return { label: (p.d / step).toFixed(1), value: (s / n) * m };
  });
};

/** Reduces a heart-rate series to at most one averaged reading per `stepMs`. */
export const downsampleHr = (raw: [number, number][], stepMs = 5000): [number, number][] => {
  if (raw.length === 0) return [];
  // Spikes (a strap slipping, a wrist sensor locking onto cadence) are replaced by the median of their neighbours first.
  const cleaned = hampel(raw.map(([, b]) => b)).values;
  const series: [number, number][] = raw.map(([t], i) => [t, cleaned[i]]);
  const out: [number, number][] = [];
  let bucketStart = series[0][0];
  let sum = 0;
  let n = 0;
  let tsSum = 0;
  const flush = () => {
    if (n > 0) out.push([Math.round(tsSum / n), Math.round(sum / n)]);
    sum = 0;
    n = 0;
    tsSum = 0;
  };
  for (const [ts, bpm] of series) {
    if (ts - bucketStart >= stepMs) {
      flush();
      bucketStart = ts;
    }
    sum += bpm;
    tsSum += ts;
    n++;
  }
  flush();
  return out;
};

export interface WorkoutSummary {
  totalSeconds: number;
  movingSeconds: number;
  avgHr?: number;
  maxHr?: number;
  /** Seconds per display unit over moving time, when there is distance. */
  avgPaceSec?: number;
  avgSpeed?: number;
  bestSplit?: Split;
}

export const summarizeWorkout = (w: WorkoutSession, units: UnitSystem): WorkoutSummary => {
  const totalSeconds = w.durationSec ?? w.durationMinutes * 60;
  const track = w.track ?? [];
  const moving = track.length > 1 ? Math.min(totalSeconds, trackMovingSeconds(track)) || totalSeconds : totalSeconds;
  const step = unitKm(units);
  const hrValues = (w.hrSeries ?? []).map(([, b]) => b);
  const dist = w.distanceKm ?? 0;
  const splits = computeSplits(track, units, w.hrSeries);
  const full = splits.filter((s) => !s.partial);
  return {
    totalSeconds,
    movingSeconds: moving,
    avgHr: hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : w.avgHeartRate || undefined,
    maxHr: w.maxHeartRate ?? (hrValues.length ? Math.max(...hrValues) : undefined),
    avgPaceSec: dist > 0.02 ? moving / (dist / step) : undefined,
    avgSpeed: dist > 0.02 ? dist / step / (moving / 3600) : undefined,
    bestSplit: full.length > 1 ? full.reduce((best, s) => (s.paceSec < best.paceSec ? s : best)) : undefined,
  };
};

export const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
};

/** m:ss for seconds-per-unit. */
export const formatPaceSec = (paceSec: number | undefined): string => {
  if (!paceSec || !Number.isFinite(paceSec) || paceSec <= 0) return '--:--';
  let m = Math.floor(paceSec / 60);
  let s = Math.round(paceSec - m * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** GPX 1.1 file for the workout (opens in Strava, Garmin Connect, Komoot, Google Earth and others). */
export const toGpx = (w: WorkoutSession): string => {
  const points = w.track && w.track.length > 0 ? w.track : (w.route ?? []).map(([lat, lng]) => ({ lat, lng, t: w.startedAt ?? 0, alt: undefined as number | undefined, d: 0 }));
  const hr = w.hrSeries ?? [];
  const hrAt = (t: number): number | undefined => {
    if (hr.length === 0) return undefined;
    let best = hr[0];
    for (const r of hr) if (Math.abs(r[0] - t) < Math.abs(best[0] - t)) best = r;
    return Math.abs(best[0] - t) <= 10000 ? best[1] : undefined;
  };
  const name = `${w.type} ${w.startedAt ? new Date(w.startedAt).toISOString().slice(0, 10) : ''}`.trim();
  const pts = points
    .map((p) => {
      const bpm = hrAt(p.t);
      return (
        `      <trkpt lat="${p.lat}" lon="${p.lng}">` +
        (p.alt !== undefined ? `<ele>${p.alt.toFixed(1)}</ele>` : '') +
        (p.t ? `<time>${new Date(p.t).toISOString()}</time>` : '') +
        (bpm !== undefined ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${bpm}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : '') +
        `</trkpt>`
      );
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- build 1q20cmknw37r -->
<gpx version="1.1" creator="Minimal Fitness" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>${esc(name)}</name>${w.startedAt ? `<time>${new Date(w.startedAt).toISOString()}</time>` : ''}</metadata>
  <trk>
    <name>${esc(name)}</name>
    <type>${esc(w.type)}</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
};

/** A Google Maps directions link that follows the recorded route (Maps allows up to 9 waypoints). */
export const googleMapsRouteUrl = (w: WorkoutSession): string | null => {
  const pts: [number, number][] =
    w.track && w.track.length >= 2 ? w.track.map((p) => [p.lat, p.lng]) : (w.route ?? []);
  if (pts.length < 2) return null;
  const fmt = (p: [number, number]) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const wayCount = Math.min(8, Math.max(0, pts.length - 2));
  const waypoints: string[] = [];
  for (let i = 1; i <= wayCount; i++) waypoints.push(fmt(pts[Math.round((i * (pts.length - 1)) / (wayCount + 1))]));
  const mode = w.type === 'Cycling' ? 'bicycling' : 'walking';
  const params = new URLSearchParams({
    api: '1',
    origin: fmt(pts[0]),
    destination: fmt(pts[pts.length - 1]),
    travelmode: mode,
  });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

// ---------------------------------------------------------------------------------------------
// Best efforts and personal bests
// ---------------------------------------------------------------------------------------------

export interface EffortTarget {
  id: string;
  label: string;
  km: number;
}

export const EFFORT_TARGETS: EffortTarget[] = [
  { id: '1k', label: '1 km', km: 1 },
  { id: '1mi', label: '1 mile', km: KM_PER_MI },
  { id: '5k', label: '5 km', km: 5 },
  { id: '10k', label: '10 km', km: 10 },
  { id: 'half', label: 'Half marathon', km: 21.0975 },
];

/** Fastest continuous stretch of `targetKm` in the track, as moving seconds (null if the track is shorter). */
export const bestEffortSeconds = (track: TrackPoint[], targetKm: number): number | null => {
  if (track.length < 2 || track[track.length - 1].d < targetKm) return null;
  // Cumulative moving time at each point, then a lookup of that time at any distance.
  const m: number[] = [0];
  for (let i = 1; i < track.length; i++) m.push(m[i - 1] + movingSeconds(track[i - 1], track[i]));
  const timeAt = (dist: number): number => {
    let lo = 0;
    let hi = track.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (track[mid].d <= dist) lo = mid;
      else hi = mid;
    }
    const span = track[hi].d - track[lo].d;
    return span <= 0 ? m[lo] : m[lo] + (m[hi] - m[lo]) * ((dist - track[lo].d) / span);
  };
  let best: number | null = null;
  for (let j = 1; j < track.length; j++) {
    if (track[j].d < targetKm) continue;
    const secs = timeAt(track[j].d) - timeAt(track[j].d - targetKm);
    if (secs > 0 && (best === null || secs < best)) best = secs;
  }
  return best;
};

export interface Effort {
  target: EffortTarget;
  seconds: number;
}

export const bestEfforts = (w: WorkoutSession): Effort[] => {
  if (!w.track || w.track.length < 2) return [];
  const out: Effort[] = [];
  for (const target of EFFORT_TARGETS) {
    const seconds = bestEffortSeconds(w.track, target.km);
    if (seconds !== null) out.push({ target, seconds });
  }
  return out;
};

export interface PersonalBest {
  target: EffortTarget;
  seconds: number;
  workoutId: string;
  at: number;
}

/** Fastest effort per distance over all recorded runs. */
export const personalBests = (workouts: WorkoutSession[]): PersonalBest[] => {
  const best = new Map<string, PersonalBest>();
  for (const w of workouts) {
    if (w.type !== 'Running') continue;
    for (const e of bestEfforts(w)) {
      const cur = best.get(e.target.id);
      if (!cur || e.seconds < cur.seconds) best.set(e.target.id, { target: e.target, seconds: e.seconds, workoutId: w.id, at: w.startedAt ?? 0 });
    }
  }
  return EFFORT_TARGETS.map((t) => best.get(t.id)).filter((b): b is PersonalBest => !!b);
};

// ---------------------------------------------------------------------------------------------
// Editing a saved workout: trimming the start or end
// ---------------------------------------------------------------------------------------------

const ALT_STEP_M = 3;

/** Total climb and descent of a track using the same 3 m threshold as live recording. */
export const climbFromTrack = (track: TrackPoint[]): { gain: number; loss: number } => {
  let ref: number | null = null;
  let gain = 0;
  let loss = 0;
  for (const p of track) {
    if (p.alt === undefined) continue;
    if (ref === null) {
      ref = p.alt;
      continue;
    }
    const diff = p.alt - ref;
    if (diff >= ALT_STEP_M) {
      gain += diff;
      ref = p.alt;
    } else if (diff <= -ALT_STEP_M) {
      loss += -diff;
      ref = p.alt;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
};

/**
 * Cuts a recorded workout down to the part between two moments (epoch ms), e.g. to drop a forgotten
 * stop at the end. Distance, time, climb, heart rate and calories are recomputed for what remains.
 * Returns the workout unchanged if there is no track or the cut would leave nothing.
 */
export const trimWorkout = (w: WorkoutSession, fromMs: number, toMs: number): WorkoutSession => {
  const track = w.track;
  if (!track || track.length < 2) return w;
  const kept = track.filter((p) => p.t >= fromMs && p.t <= toMs);
  if (kept.length < 2) return w;

  const d0 = kept[0].d;
  const rebased = kept.map((p) => ({ ...p, d: Number((p.d - d0).toFixed(4)) }));
  const oldSpan = (track[track.length - 1].t - track[0].t) / 1000;
  const newSpan = (kept[kept.length - 1].t - kept[0].t) / 1000;
  const ratio = oldSpan > 0 ? Math.min(1, newSpan / oldSpan) : 1;
  const oldDuration = w.durationSec ?? w.durationMinutes * 60;
  const durationSec = Math.max(1, Math.round(oldDuration * ratio));

  const hr = (w.hrSeries ?? []).filter(([ts]) => ts >= fromMs && ts <= toMs);
  const hrValues = hr.map(([, b]) => b);
  const climb = climbFromTrack(rebased);
  const distanceKm = Number(rebased[rebased.length - 1].d.toFixed(3));

  return {
    ...w,
    startedAt: kept[0].t,
    durationSec,
    durationMinutes: Math.max(1, Math.round(durationSec / 60)),
    distanceKm,
    track: rebased,
    route: rebased.filter((_, i) => i % Math.max(1, Math.ceil(rebased.length / 300)) === 0).map((p): [number, number] => [p.lat, p.lng]),
    elevationGainM: climb.gain > 0 ? climb.gain : undefined,
    elevationLossM: climb.loss > 0 ? climb.loss : undefined,
    hrSeries: hr.length > 0 ? hr : undefined,
    avgHeartRate: hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : w.avgHeartRate,
    maxHeartRate: hrValues.length ? Math.max(...hrValues) : w.maxHeartRate,
    caloriesBurned: Math.round(w.caloriesBurned * ratio),
    cardioLoadPoints: w.cardioLoadPoints ? Math.round(w.cardioLoadPoints * ratio) : w.cardioLoadPoints,
    laps: w.laps?.filter((l) => l.t >= fromMs && l.t <= toMs),
  };
};