import { ParsedActivity, ParsedPoint } from './types';

/**
 * GPX and TCX readers. They read the text with plain pattern matching rather than a DOM parser, so they behave the same in the app,
 * in tests and on very large files, and they tolerate the slightly broken XML some apps write.
 */

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return m ? m[1] : undefined;
};

const inner = (block: string, tag: string): string | undefined => {
  const m = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i').exec(block);
  return m ? m[1].trim() : undefined;
};

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const decode = (s: string | undefined): string | undefined => (s === undefined ? undefined : s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim());

const time = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
};

/** Great-circle distance in metres. */
const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** Total distance in km along the points, when the file did not say. */
export const pathKm = (points: { lat: number; lng: number }[]): number => {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineM(points[i - 1], points[i]);
  return m / 1000;
};

/**
 * The track points of a GPX file. Several tracks in one file become several activities; a file with only route points or waypoints
 * (no times) comes back as one activity with {@code start} 0, which suits "follow this route".
 */
export const parseGpx = (text: string, key = 'file.gpx'): ParsedActivity[] => {
  const out: ParsedActivity[] = [];
  const trks = text.match(/<trk\b[\s\S]*?<\/trk>/gi) ?? [];
  const blocks = trks.length ? trks : [text];
  blocks.forEach((block, bi) => {
    const points: ParsedPoint[] = [];
    const re = /<(trkpt|rtept|wpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      if (!trks.length && m[1].toLowerCase() === 'wpt' && /<trk\b|<rte\b/i.test(text)) continue;
      const lat = num(attr(m[2], 'lat'));
      const lng = num(attr(m[2], 'lon'));
      if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const body = m[3] ?? '';
      points.push({
        t: time(inner(body, 'time')) ?? 0,
        lat,
        lng,
        alt: num(inner(body, 'ele')),
        hr: num(inner(body, 'hr')),
      });
    }
    if (points.length < 2) return;
    const name = decode(inner(block.replace(/<trkseg[\s\S]*<\/trkseg>/i, ''), 'name')) ?? decode(inner(text, 'name'));
    const sport = decode(inner(block.replace(/<trkseg[\s\S]*<\/trkseg>/i, ''), 'type'));
    const timed = points.filter((p) => p.t > 0);
    const start = timed.length ? timed[0].t : time(inner(text, 'time')) ?? 0;
    const end = timed.length ? timed[timed.length - 1].t : 0;
    out.push({
      source: 'gpx',
      key: blocks.length > 1 ? `${key}#${bi}` : key,
      name,
      sport,
      start,
      elapsedSec: end > start ? (end - start) / 1000 : undefined,
      points,
      distanceKm: pathKm(points),
    });
  });
  return out;
};

/** TCX (Garmin Training Center): one activity per <Activity> with its laps and trackpoints. */
export const parseTcx = (text: string, key = 'file.tcx'): ParsedActivity[] => {
  const out: ParsedActivity[] = [];
  const acts = text.match(/<Activity\b[\s\S]*?<\/Activity>/gi) ?? [];
  acts.forEach((act, ai) => {
    const head = /<Activity\b([^>]*)>/i.exec(act)?.[1] ?? '';
    const sport = attr(head, 'Sport');
    const points: ParsedPoint[] = [];
    const hr: [number, number][] = [];
    const tps = act.match(/<Trackpoint\b[\s\S]*?<\/Trackpoint>/gi) ?? [];
    for (const tp of tps) {
      const t = time(inner(tp, 'Time'));
      if (!t) continue;
      const bpm = num(inner(inner(tp, 'HeartRateBpm') ?? '', 'Value'));
      if (bpm) hr.push([t, bpm]);
      const lat = num(inner(tp, 'LatitudeDegrees'));
      const lng = num(inner(tp, 'LongitudeDegrees'));
      if (lat === undefined || lng === undefined) continue;
      points.push({ t, lat, lng, alt: num(inner(tp, 'AltitudeMeters')), hr: bpm, dist: num(inner(tp, 'DistanceMeters')) });
    }
    const laps = act.match(/<Lap\b[\s\S]*?(?=<Lap\b|<\/Activity>)/gi) ?? [];
    const sum = (tag: string) => laps.reduce((s, l) => s + (num(inner(l, tag)) ?? 0), 0);
    const start = time(inner(act, 'Id')) ?? time(attr(/<Lap\b([^>]*)>/i.exec(act)?.[1] ?? '', 'StartTime')) ?? (points[0]?.t ?? hr[0]?.[0] ?? 0);
    const totalSec = sum('TotalTimeSeconds');
    const totalM = sum('DistanceMeters') && laps.length ? laps.reduce((s, l) => s + (num(inner(l.replace(/<Track>[\s\S]*<\/Track>/i, ''), 'DistanceMeters')) ?? 0), 0) : 0;
    if (!start || (points.length < 2 && hr.length < 2 && !totalSec)) return;
    const lastDist = points.length ? points[points.length - 1].dist : undefined;
    out.push({
      source: 'tcx',
      key: acts.length > 1 ? `${key}#${ai}` : key,
      sport,
      start,
      elapsedSec: totalSec || (points.length > 1 ? (points[points.length - 1].t - points[0].t) / 1000 : undefined),
      distanceKm: totalM > 0 ? totalM / 1000 : lastDist ? lastDist / 1000 : points.length > 1 ? pathKm(points) : undefined,
      calories: sum('Calories') || undefined,
      avgHr: num(inner(inner(act, 'AverageHeartRateBpm') ?? '', 'Value')),
      maxHr: num(inner(inner(act, 'MaximumHeartRateBpm') ?? '', 'Value')),
      points,
      hr: hr.length ? hr : undefined,
    });
  });
  return out;
};

/** A route to follow: just the positions, in order, from any GPX (track, route or waypoints). */
export const parseGpxRoute = (text: string): { name?: string; points: [number, number][] } | null => {
  const acts = parseGpx(text);
  if (acts.length === 0) return null;
  const biggest = acts.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  return { name: biggest.name, points: biggest.points.map((p): [number, number] => [p.lat, p.lng]) };
};
