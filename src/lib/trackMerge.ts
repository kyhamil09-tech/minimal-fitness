import { TrackPoint, haversineKm } from './geo';

/** A silence this long in the phone's route (pocket, tunnel, lost fix) is filled from the watch. */
export const GAP_MS = 15_000;

export interface MergedTrack {
  track: TrackPoint[];
  /** Points taken from the watch to fill the phone's gaps. */
  filled: number;
  /** Total distance of the merged route, km. */
  distanceKm: number;
}

/** Cumulative distance along a route, recomputed from its points. */
const withDistance = (points: Omit<TrackPoint, 'd'>[]): TrackPoint[] => {
  let d = 0;
  return points.map((p, i) => {
    if (i > 0) d += haversineKm([points[i - 1].lat, points[i - 1].lng], [p.lat, p.lng]);
    return { ...p, d: Number(d.toFixed(4)) };
  });
};

/**
 * Combines the phone's route with the watch's: wherever the phone has no fix for longer than {@link GAP_MS}, the watch's points
 * inside that gap are used, so a route is not cut short by a phone in a pocket or a tunnel. The phone's own points are always
 * kept. Without a gap, or without a watch route, the phone's route comes back unchanged.
 */
export const mergeTracks = (phone: TrackPoint[], watch: TrackPoint[], gapMs = GAP_MS): MergedTrack => {
  const unchanged = { track: phone, filled: 0, distanceKm: phone.length ? phone[phone.length - 1].d : 0 };
  if (watch.length === 0) return unchanged;
  if (phone.length === 0) {
    const track = withDistance([...watch].sort((a, b) => a.t - b.t));
    return { track, filled: track.length, distanceKm: track.length ? track[track.length - 1].d : 0 };
  }

  const sorted = [...phone].sort((a, b) => a.t - b.t);
  const watchSorted = [...watch].sort((a, b) => a.t - b.t);
  const out: Omit<TrackPoint, 'd'>[] = [];
  let filled = 0;
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    const next = sorted[i + 1];
    if (!next || next.t - sorted[i].t <= gapMs) continue;
    for (const w of watchSorted) {
      if (w.t > sorted[i].t + gapMs / 3 && w.t < next.t - gapMs / 3) {
        out.push(w);
        filled++;
      }
    }
  }
  // The watch may also have recorded before the phone got its first fix, or after its last.
  const first = sorted[0].t;
  const last = sorted[sorted.length - 1].t;
  const head = watchSorted.filter((w) => w.t < first - gapMs);
  const tail = watchSorted.filter((w) => w.t > last + gapMs);
  filled += head.length + tail.length;
  if (filled === 0) return unchanged;

  const track = withDistance([...head, ...out, ...tail]);
  return { track, filled, distanceKm: track[track.length - 1].d };
};
