import { ParsedActivity, ParsedPoint } from './types';
import { FitFields, fitSportName, fitSubSportName, fitTimeMs, isFit, readFit } from './fitReader';

const SEMICIRCLE = 180 / 2 ** 31;

const num = (f: FitFields | undefined, field: number): number | undefined => {
  const v = f?.get(field);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const scaled = (f: FitFields | undefined, field: number, scale: number, offset = 0): number | undefined => {
  const v = num(f, field);
  return v === undefined ? undefined : v / scale - offset;
};

/** A Garmin FIT activity file (also what Strava archives, Wahoo, Coros, Polar and Suunto export). Returns [] for anything that is not a usable activity. */
export const parseFit = (bytes: Uint8Array, key = 'file.fit'): ParsedActivity[] => {
  if (!isFit(bytes)) return [];
  let messages: ReturnType<typeof readFit>;
  try {
    messages = readFit(bytes);
  } catch {
    return [];
  }
  const points: ParsedPoint[] = [];
  const hr: [number, number][] = [];
  for (const r of messages.records) {
    const t = fitTimeMs(r.get(253));
    if (!t) continue;
    const bpm = num(r, 3);
    if (bpm) hr.push([t, bpm]);
    const la = num(r, 0);
    const lo = num(r, 1);
    if (la === undefined || lo === undefined) continue;
    points.push({ t, lat: la * SEMICIRCLE, lng: lo * SEMICIRCLE, alt: scaled(r, 78, 5, 500) ?? scaled(r, 2, 5, 500), hr: bpm, dist: scaled(r, 5, 100) });
  }
  // Heart-rate messages from a chest strap stand in when the records carry no heart rate of their own.
  if (hr.length === 0) {
    for (const m of messages.hrs) {
      const t = fitTimeMs(m.get(253));
      const bpm = m.get(6);
      const first = Array.isArray(bpm) ? bpm[0] : bpm;
      if (t && typeof first === 'number' && first > 0) hr.push([t, first]);
    }
  }
  const s = messages.sessions[0];
  const start = fitTimeMs(s?.get(2)) ?? fitTimeMs(s?.get(253)) ?? points[0]?.t ?? hr[0]?.[0];
  if (!start) return [];
  const sport = [fitSportName(s?.get(5)), fitSubSportName(s?.get(6))].filter(Boolean).join(' ') || undefined;
  const dist = scaled(s, 9, 100) ?? (points.length ? points[points.length - 1].dist : undefined);
  const elapsed = scaled(s, 7, 1000) ?? (points.length > 1 ? (points[points.length - 1].t - points[0].t) / 1000 : undefined);
  if (points.length < 2 && hr.length < 2 && !elapsed) return [];
  return [
    {
      source: 'fit',
      key,
      sport,
      start,
      elapsedSec: elapsed,
      movingSec: scaled(s, 8, 1000),
      distanceKm: dist !== undefined ? dist / 1000 : undefined,
      calories: num(s, 11),
      avgHr: num(s, 16),
      maxHr: num(s, 17),
      ascentM: num(s, 22),
      points,
      hr: hr.length ? hr : undefined,
    },
  ];
};
