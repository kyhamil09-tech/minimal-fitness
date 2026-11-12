/** One recorded point from any file format, before it becomes a workout. */
export interface ParsedPoint {
  t: number;
  lat: number;
  lng: number;
  alt?: number;
  hr?: number;
  /** Cumulative distance in meters when the file carries it (FIT, TCX). */
  dist?: number;
}

/** What every parser hands back: one activity, in plain terms. */
export interface ParsedActivity {
  /** Where it came from ('gpx', 'tcx', 'fit', 'nike', 'fitbit'). */
  source: string;
  /** The file's own name or id, used to tell two imports of the same file apart. */
  key: string;
  name?: string;
  /** The sport as the source calls it ("Run", "running", "Ride"). */
  sport?: string;
  start: number;
  elapsedSec?: number;
  movingSec?: number;
  distanceKm?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  ascentM?: number;
  points: ParsedPoint[];
  /** Heart-rate readings with no position (Nike, Fitbit and indoor FIT files). */
  hr?: [number, number][];
}

export interface ImportProgress {
  /** Files (or archive entries) looked at so far. */
  seen: number;
  workouts: number;
  nights: number;
  current?: string;
}
