import { Decoder, Stream } from '@garmin/fitsdk';
import { ParsedActivity, ParsedPoint } from './types';

const SEMICIRCLE = 180 / 2 ** 31;

type Mesg = Record<string, unknown>;

const n = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const ms = (v: unknown): number | undefined => (v instanceof Date ? v.getTime() : n(v));

/** A Garmin FIT activity file (also what Strava archives, Wahoo, Coros, Polar and Suunto export). Returns [] for anything that is not a usable activity. */
export const parseFit = (bytes: Uint8Array, key = 'file.fit'): ParsedActivity[] => {
  let messages: Record<string, Mesg[]>;
  try {
    const stream = Stream.fromByteArray(Array.from(bytes.length > 4_000_000 ? bytes : bytes));
    const decoder = new Decoder(stream);
    if (!decoder.isFIT()) return [];
    messages = decoder.read({ mergeHeartRates: true, applyScaleAndOffset: true, convertTypesToStrings: true, convertDateTimesToDates: true }).messages as Record<string, Mesg[]>;
  } catch {
    return [];
  }
  const records = messages.recordMesgs ?? [];
  const sessions = messages.sessionMesgs ?? [];
  const points: ParsedPoint[] = [];
  const hr: [number, number][] = [];
  for (const r of records) {
    const t = ms(r.timestamp);
    if (!t) continue;
    const bpm = n(r.heartRate);
    if (bpm) hr.push([t, bpm]);
    const la = n(r.positionLat);
    const lo = n(r.positionLong);
    if (la === undefined || lo === undefined) continue;
    points.push({ t, lat: la * SEMICIRCLE, lng: lo * SEMICIRCLE, alt: n(r.enhancedAltitude) ?? n(r.altitude), hr: bpm, dist: n(r.distance) });
  }
  const s = sessions[0] ?? {};
  const start = ms(s.startTime) ?? points[0]?.t ?? hr[0]?.[0];
  if (!start) return [];
  const sport = [s.sport, s.subSport].filter((x) => typeof x === 'string' && x !== 'generic').join(' ') || undefined;
  const dist = n(s.totalDistance) ?? (points.length ? points[points.length - 1].dist : undefined);
  const elapsed = n(s.totalElapsedTime) ?? (points.length > 1 ? (points[points.length - 1].t - points[0].t) / 1000 : undefined);
  if (points.length < 2 && hr.length < 2 && !elapsed) return [];
  return [
    {
      source: 'fit',
      key,
      sport,
      start,
      elapsedSec: elapsed,
      movingSec: n(s.totalTimerTime),
      distanceKm: dist !== undefined ? dist / 1000 : undefined,
      calories: n(s.totalCalories),
      avgHr: n(s.avgHeartRate),
      maxHr: n(s.maxHeartRate),
      ascentM: n(s.totalAscent),
      points,
      hr: hr.length ? hr : undefined,
    },
  ];
};
