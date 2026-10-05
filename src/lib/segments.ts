import { LatLng, TrackPoint, haversineKm } from './geo';
import { WorkoutSession } from '../types/health';

/**
 * A segment is a stretch of road or trail you choose on one of your own tracks, like a hill or a bridge to bridge. Every other
 * recorded workout that passes through the same start and finish, in that direction, gets a time for it, so you can see how you
 * compare with yourself. It is all worked out on the phone from your own GPS tracks.
 */
export type SegmentSport = 'Running' | 'Cycling' | 'Walking' | 'Hiking';

export interface Segment {
  id: string;
  name: string;
  sport: SegmentSport;
  start: LatLng;
  end: LatLng;
  /** Length along the track it was made from, km. */
  km: number;
  createdAt: number;
}

export interface SegmentEffort {
  workoutId: string;
  at: number;
  seconds: number;
  km: number;
  /** Fastest first, starting at 1. */
  rank: number;
}

/** How close a track has to pass to the start and finish, in km (GPS is rarely better than 10 to 15 m). */
const GATE_KM = 0.03;
/** A pass counts when its length is within this share of the segment's. */
const LENGTH_TOLERANCE = 0.2;

export const SEGMENT_SPORTS: SegmentSport[] = ['Running', 'Cycling', 'Walking', 'Hiking'];

const near = (p: TrackPoint, q: LatLng) => haversineKm([p.lat, p.lng], q);

/** Makes a segment from the part of a track between two distances (km from the start). Null when the part is too short. */
export const segmentFromTrack = (track: TrackPoint[], fromKm: number, toKm: number, name: string, sport: SegmentSport, now: number = Date.now()): Segment | null => {
  if (track.length < 2) return null;
  const lo = Math.min(fromKm, toKm);
  const hi = Math.max(fromKm, toKm);
  if (hi - lo < 0.1) return null;
  const at = (km: number) => track.reduce((best, p) => (Math.abs(p.d - km) < Math.abs(best.d - km) ? p : best), track[0]);
  const a = at(lo);
  const b = at(hi);
  return { id: `seg-${now}`, name: name.trim() || 'Segment', sport, start: [a.lat, a.lng], end: [b.lat, b.lng], km: Math.round((b.d - a.d) * 1000) / 1000, createdAt: now };
};

const sportMatches = (w: WorkoutSession, s: SegmentSport) => (s === 'Running' ? w.type === 'Running' || w.type === 'Treadmill' : w.type === s);

/** The quickest pass through a segment in one workout, or null. Time is elapsed time from the start gate to the finish gate. */
export const matchSegment = (w: WorkoutSession, seg: Segment): Omit<SegmentEffort, 'rank'> | null => {
  const t = w.track;
  if (!t || t.length < 2 || !sportMatches(w, seg.sport)) return null;
  let best: Omit<SegmentEffort, 'rank'> | null = null;
  let i = 0;
  while (i < t.length - 1) {
    if (near(t[i], seg.start) > GATE_KM) {
      i++;
      continue;
    }
    // A run of points inside the start gate: use the closest one.
    let k = i;
    let bestK = i;
    let bestD = near(t[i], seg.start);
    while (k < t.length - 1 && near(t[k], seg.start) <= GATE_KM) {
      const d = near(t[k], seg.start);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
      k++;
    }
    // From there, find the finish gate within a sensible distance ahead.
    const startPt = t[bestK];
    let endIdx = -1;
    let endD = Infinity;
    for (let j = bestK + 1; j < t.length; j++) {
      const along = t[j].d - startPt.d;
      if (along > seg.km * (1 + LENGTH_TOLERANCE)) break;
      const d = near(t[j], seg.end);
      if (d <= GATE_KM && along >= seg.km * (1 - LENGTH_TOLERANCE) && d < endD) {
        endD = d;
        endIdx = j;
      } else if (endIdx >= 0 && d > GATE_KM) {
        break;
      }
    }
    if (endIdx >= 0) {
      const seconds = Math.round((t[endIdx].t - startPt.t) / 1000);
      if (seconds > 0 && (!best || seconds < best.seconds)) best = { workoutId: w.id, at: w.startedAt ?? startPt.t, seconds, km: Math.round((t[endIdx].d - startPt.d) * 1000) / 1000 };
    }
    i = Math.max(k, i + 1);
  }
  return best;
};

/** Every workout's time on a segment, fastest first with ranks. */
export const segmentEfforts = (workouts: WorkoutSession[], seg: Segment): SegmentEffort[] => {
  const found: Omit<SegmentEffort, 'rank'>[] = [];
  for (const w of workouts) {
    const m = matchSegment(w, seg);
    if (m) found.push(m);
  }
  return found.sort((a, b) => a.seconds - b.seconds).map((e, i) => ({ ...e, rank: i + 1 }));
};

/** Where one workout stands on each segment it passes through. */
export const standingsFor = (workouts: WorkoutSession[], workout: WorkoutSession, segs: Segment[]) =>
  segs
    .map((seg) => {
      const efforts = segmentEfforts(workouts.some((x) => x.id === workout.id) ? workouts : [...workouts, workout], seg);
      const mine = efforts.find((e) => e.workoutId === workout.id);
      return mine ? { seg, effort: mine, of: efforts.length, best: efforts[0] } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

/* ---------- storage ---------- */

const KEY = 'kyfit_segments';
const listeners = new Set<() => void>();
let cache: Segment[] | null = null;

const sanitize = (v: unknown): Segment[] =>
  Array.isArray(v)
    ? v.filter(
        (s): s is Segment =>
          !!s &&
          typeof s.id === 'string' &&
          typeof s.name === 'string' &&
          SEGMENT_SPORTS.includes(s.sport) &&
          Array.isArray(s.start) &&
          Array.isArray(s.end) &&
          Number.isFinite(s.km)
      )
    : [];

export const readSegments = (): Segment[] => {
  if (cache) return cache;
  try {
    cache = sanitize(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    cache = [];
  }
  return cache;
};

export const writeSegments = (list: Segment[]) => {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full: the segments stay for this session
  }
  listeners.forEach((l) => l());
};

export const subscribeSegments = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Drops the cache so the next read comes from storage (after a backup restore). */
export const resetSegmentCache = () => {
  cache = null;
};
