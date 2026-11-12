import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { distanceUnit, kmToDisplay } from './units';
import { climbFromTrack, formatDuration, formatPaceSec, summarizeWorkout } from './workoutStats';
import { isSpeedSport } from './sports';
import { CardSkin, getCardSkin } from './cardSkin';
import { drawLogo } from './appLogo';

/** What the share image shows, already formatted for the reader. */
export interface ShareCardData {
  title: string;
  /** e.g. "Sunday, 4 October 2026 · 8:12 AM" */
  when: string;
  stats: { label: string; value: string; unit?: string }[];
  /** Route points as [lat, lng]; empty when the workout has no GPS track. */
  route: [number, number][];
  /** Heart-rate readings as bpm, evenly thinned, for a line when there is no route. */
  heart: number[];
  colors: { accent: string; accent2: string };
  /** The look the card is drawn in (your background and palette). Missing means the standard dark one. */
  skin?: CardSkin;
}

const MAX_ROUTE_POINTS = 400;

/** Thins a list to at most {@code max} items, keeping the first and last. */
export const thin = <T,>(items: T[], max: number): T[] => {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out;
};

/**
 * Fits route points into a box, keeping the shape true (a degree of longitude is shorter than a degree of latitude away from
 * the equator). Returns pixel positions inside {@code width} x {@code height}, with {@code pad} of space round the edge.
 */
export const projectRoute = (route: [number, number][], width: number, height: number, pad = 0): [number, number][] => {
  if (route.length === 0) return [];
  const lat0 = route.reduce((s, p) => s + p[0], 0) / route.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = route.map((p) => p[1] * k);
  const ys = route.map((p) => -p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-9, maxX - minX);
  const spanY = Math.max(1e-9, maxY - minY);
  const innerW = Math.max(1, width - 2 * pad);
  const innerH = Math.max(1, height - 2 * pad);
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offX = pad + (innerW - spanX * scale) / 2;
  const offY = pad + (innerH - spanY * scale) / 2;
  return route.map((_, i) => [offX + (xs[i] - minX) * scale, offY + (ys[i] - minY) * scale] as [number, number]);
};

/** Builds the numbers and route for a workout's share image. */
export const buildShareData = (w: WorkoutSession, units: UnitSystem, colors?: { accent: string; accent2: string }): ShareCardData => {
  const s = summarizeWorkout(w, units);
  const du = distanceUnit(units);
  const hasDistance = (w.distanceKm ?? 0) > 0.02;
  const track = w.track ?? [];
  const route: [number, number][] = thin(track.length >= 2 ? track.map((p) => [p.lat, p.lng] as [number, number]) : (w.route ?? []), MAX_ROUTE_POINTS);
  const climb = track.length > 1 ? Math.round(w.elevationGainM ?? climbFromTrack(track).gain) : Math.round(w.elevationGainM ?? 0);
  const stats: ShareCardData['stats'] = [];
  if (hasDistance) stats.push({ label: 'Distance', value: String(kmToDisplay(w.distanceKm as number, units, 2)), unit: du });
  stats.push({ label: 'Time', value: formatDuration(s.totalSeconds) });
  if (s.avgPaceSec && !isSpeedSport(w.type)) stats.push({ label: 'Avg pace', value: formatPaceSec(s.avgPaceSec), unit: `/${du}` });
  else if (s.avgSpeed) stats.push({ label: 'Avg speed', value: s.avgSpeed.toFixed(1), unit: `${du}/h` });
  if (s.avgHr) stats.push({ label: 'Avg heart rate', value: String(s.avgHr), unit: 'bpm' });
  if (w.caloriesBurned) stats.push({ label: 'Energy', value: String(Math.round(w.caloriesBurned)), unit: 'kcal' });
  if (climb > 0) stats.push({ label: 'Climb', value: String(units === 'imperial' ? Math.round(climb * 3.28084) : climb), unit: units === 'imperial' ? 'ft' : 'm' });
  const when = w.startedAt
    ? `${new Date(w.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${new Date(w.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : w.timestamp;
  return {
    title: w.type,
    when,
    stats: stats.slice(0, 6),
    route,
    heart: thin((w.hrSeries ?? []).map(([, b]) => b), 120),
    colors: colors ?? { accent: getCardSkin().accent, accent2: getCardSkin().accent2 },
    skin: getCardSkin(),
  };
};

export const CARD_W = 1080;
export const CARD_H = 1350;

const FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
const SANS = '"Figtree Variable", "Figtree", system-ui, sans-serif';

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** Paints the share image onto a canvas of CARD_W x CARD_H. Everything is drawn here: no map tiles, nothing is fetched. */
export const drawShareCard = (canvas: HTMLCanvasElement, d: ShareCardData) => {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { accent, accent2 } = d.colors;
  const skin: CardSkin = d.skin ?? getCardSkin();

  // Background: your chosen backdrop with a soft glow of each palette color
  ctx.fillStyle = skin.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0'));
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  };
  const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#ff5500');
  glow(120, 80, 760, hex(accent), 0.28);
  glow(CARD_W - 60, CARD_H - 120, 800, hex(accent2), 0.24);

  // Header
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hex(accent);
  ctx.font = `800 30px ${SANS}`;
  ctx.letterSpacing = '6px';
  ctx.fillText('MINIMAL FITNESS', 72, 108);
  ctx.letterSpacing = '0px';
  drawLogo(ctx, CARD_W - 72 - 36, 92, 72, skin.logo.style, skin.logo.colors, true);
  ctx.fillStyle = skin.ink;
  ctx.font = `italic 800 150px ${FONT}`;
  ctx.fillText(d.title.toUpperCase(), 68, 250);
  ctx.fillStyle = skin.dim;
  ctx.font = `600 32px ${SANS}`;
  ctx.fillText(d.when, 72, 306);

  // Route (or a heart-rate line when there is no GPS track)
  const px = 72;
  const py = 350;
  const pw = CARD_W - 144;
  const ph = 560;
  ctx.fillStyle = skin.card;
  roundRect(ctx, px, py, pw, ph, 36);
  ctx.fill();
  ctx.strokeStyle = skin.hair;
  ctx.lineWidth = 2;
  ctx.stroke();

  const line = (pts: [number, number][]) => {
    const grad = ctx.createLinearGradient(px, py, px + pw, py + ph);
    grad.addColorStop(0, hex(accent));
    grad.addColorStop(1, hex(accent2));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = hex(accent);
    ctx.shadowBlur = 24;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 12;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  if (d.route.length >= 2) {
    const pts = projectRoute(d.route, pw, ph, 56).map((p) => [px + p[0], py + p[1]] as [number, number]);
    line(pts);
    const dot = (p: [number, number], fill: string) => {
      ctx.fillStyle = skin.card;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 13, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(pts[0], hex(accent));
    dot(pts[pts.length - 1], skin.ink);
  } else if (d.heart.length >= 2) {
    const lo = Math.min(...d.heart);
    const hi = Math.max(...d.heart);
    const span = Math.max(1, hi - lo);
    const pts = d.heart.map((b, i) => [px + 56 + (i / (d.heart.length - 1)) * (pw - 112), py + ph - 90 - ((b - lo) / span) * (ph - 180)] as [number, number]);
    line(pts);
    ctx.fillStyle = skin.dim;
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText(`Heart rate ${lo}–${hi} bpm`, px + 56, py + 70);
  } else {
    ctx.fillStyle = skin.dim;
    ctx.font = `600 32px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('No route recorded', px + pw / 2, py + ph / 2);
    ctx.textAlign = 'left';
  }

  // Stats: the first one large, the rest in a grid below
  const [main, ...rest] = d.stats;
  let y = 1010;
  if (main) {
    ctx.fillStyle = skin.ink;
    ctx.font = `italic 800 170px ${FONT}`;
    ctx.fillText(main.value, 68, y + 70);
    const w = ctx.measureText(main.value).width;
    ctx.fillStyle = hex(accent);
    ctx.font = `italic 800 60px ${FONT}`;
    ctx.fillText(main.unit ?? '', 68 + w + 16, y + 70);
    ctx.fillStyle = skin.dim;
    ctx.font = `700 26px ${SANS}`;
    ctx.letterSpacing = '4px';
    ctx.fillText(main.label.toUpperCase(), 72, y - 62);
    ctx.letterSpacing = '0px';
  }
  y = 1130;
  const cols = Math.min(3, Math.max(1, rest.length));
  const colW = (CARD_W - 144) / cols;
  rest.slice(0, 5).forEach((s, i) => {
    const cx = 72 + (i % cols) * colW;
    const cy = y + Math.floor(i / cols) * 110;
    ctx.fillStyle = skin.dim;
    ctx.font = `700 22px ${SANS}`;
    ctx.letterSpacing = '3px';
    ctx.fillText(s.label.toUpperCase(), cx, cy);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = skin.ink;
    ctx.font = `italic 800 64px ${FONT}`;
    ctx.fillText(s.value, cx, cy + 62);
    if (s.unit) {
      const w = ctx.measureText(s.value).width;
      ctx.fillStyle = hex(accent);
      ctx.font = `italic 800 32px ${FONT}`;
      ctx.fillText(s.unit, cx + w + 8, cy + 62);
    }
  });

  // Footer
  ctx.fillStyle = skin.dim;
  ctx.font = `600 24px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText('Recorded on my phone. No cloud.', CARD_W - 72, CARD_H - 44);
  ctx.textAlign = 'left';
};

/** Renders the card to a PNG data URL (waits for the fonts first so the numbers use the app's typeface). */
export const renderShareCard = async (d: ShareCardData): Promise<string> => {
  try {
    await Promise.all([
      document.fonts.load(`italic 800 100px "Barlow Condensed"`),
      document.fonts.load(`600 24px "Figtree Variable"`),
    ]);
  } catch {
    // fall back to the system fonts
  }
  const canvas = document.createElement('canvas');
  drawShareCard(canvas, d);
  return canvas.toDataURL('image/png');
};
