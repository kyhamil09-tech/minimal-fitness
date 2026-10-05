import { Achievement, Goals, UnitSystem } from '../types/tracking';
import { Recap } from './weeklyRecap';
import { addDays, shortWeekday } from './dates';
import { distanceUnit, kmToDisplay } from './units';
import { CardSkin } from './cardSkin';
import { drawLogo } from './appLogo';
import { mix } from './colorMath';

/**
 * Story cards: clean, graphic 9:16 pictures (1080 x 1920) for the week, a streak or a milestone, drawn in the look you chose. They are
 * made on the phone from your own numbers and only leave it if you pick an app in the share sheet.
 */
export interface DayDot {
  label: string;
  done: boolean;
  today: boolean;
}

export type StoryData =
  | {
      kind: 'weekly';
      eyebrow: string;
      range: string;
      headline: string;
      /** Workouts done and the weekly goal, for the ring. */
      done: number;
      goal: number;
      days: DayDot[];
      stats: { label: string; value: string; unit?: string }[];
    }
  | {
      kind: 'milestone';
      eyebrow: string;
      title: string;
      subtitle: string;
      big: string;
      unit: string;
      date: string;
    }
  | {
      kind: 'streak';
      eyebrow: string;
      days: number;
      best: number;
      week: DayDot[];
      line: string;
    };

export const STORY_W = 1080;
export const STORY_H = 1920;

const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

/** Seven dots, Monday first (or Sunday when the week starts then), filled for each day with a workout. */
export const weekDots = (weekStart: string, active: ReadonlySet<string>, today: string): DayDot[] =>
  Array.from({ length: 7 }, (_, i) => {
    const key = addDays(weekStart, i);
    return { label: shortWeekday(key).slice(0, 1), done: active.has(key), today: key === today };
  });

export const buildWeeklyStory = (recap: Recap, goals: Goals, units: UnitSystem, active: ReadonlySet<string>, today: string): StoryData => {
  const c = recap.current;
  const stats: { label: string; value: string; unit?: string }[] = [
    { label: 'Distance', value: String(kmToDisplay(c.distanceKm, units, 1)), unit: distanceUnit(units) },
    { label: 'Active time', value: hm(c.minutes) },
    { label: 'Active days', value: String(c.activeDays) },
  ];
  return {
    kind: 'weekly',
    eyebrow: recap.days < 7 ? 'THIS WEEK SO FAR' : 'WEEK IN REVIEW',
    range: `${recap.from} to ${recap.to}`,
    headline: recap.headline,
    done: c.workouts,
    goal: Math.max(1, goals.weeklyWorkouts),
    days: weekDots(recap.from, active, today),
    stats,
  };
};

export const buildStreakStory = (streak: number, best: number, week: DayDot[]): StoryData => ({
  kind: 'streak',
  eyebrow: 'CONSISTENCY',
  days: streak,
  best,
  week,
  line: streak >= best && streak > 1 ? 'My longest run of active days yet.' : streak > 1 ? `${streak} days in a row. Keeping it going.` : 'Starting again, one day at a time.',
});

/** The number and unit on a badge come from the target of the achievement ("7/7 days" gives 7 and days). */
export const buildMilestoneStory = (a: Pick<Achievement, 'title' | 'description' | 'progressLabel'>, when: Date = new Date()): StoryData => {
  const m = /\/(\d+(?:\.\d+)?)\s*(.*)$/.exec(a.progressLabel);
  return {
    kind: 'milestone',
    eyebrow: 'MILESTONE UNLOCKED',
    title: a.title,
    subtitle: a.description,
    big: m ? m[1] : '1',
    unit: m ? m[2].trim() : '',
    date: when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
  };
};

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

const FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
const SANS = '"Figtree Variable", "Figtree", system-ui, sans-serif';

const withAlpha = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

const ring = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, w: number, p: number, color: string, track: string) => {
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = track;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (p > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p));
    ctx.stroke();
  }
};

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
};

const background = (ctx: CanvasRenderingContext2D, s: CardSkin) => {
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const glow = (x: number, y: number, r: number, color: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
  };
  glow(180, 140, 980, s.accent, s.light ? 0.26 : 0.3);
  glow(STORY_W - 80, STORY_H - 200, 1000, s.accent2, s.light ? 0.22 : 0.26);
};

const brand = (ctx: CanvasRenderingContext2D, s: CardSkin, eyebrow: string) => {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = s.accent;
  ctx.font = `800 30px ${SANS}`;
  ctx.letterSpacing = '7px';
  ctx.fillText(eyebrow, 84, 150);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = s.dim;
  ctx.font = `600 26px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText('Minimal Fitness', STORY_W - 84 - 72, 150);
  ctx.textAlign = 'left';
  drawLogo(ctx, STORY_W - 84 - 28, 138, 64, s.logo.style, s.logo.colors, true);
};

const footer = (ctx: CanvasRenderingContext2D, s: CardSkin) => {
  ctx.fillStyle = s.dim;
  ctx.font = `600 26px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText('Recorded on my phone. No cloud.', STORY_W / 2, STORY_H - 90);
  ctx.textAlign = 'left';
};

const dots = (ctx: CanvasRenderingContext2D, s: CardSkin, days: DayDot[], y: number) => {
  const gap = (STORY_W - 168) / 7;
  days.forEach((d, i) => {
    const x = 84 + gap * i + gap / 2;
    if (d.done) {
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.arc(x, y, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = s.onAccent;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 15, y + 1);
      ctx.lineTo(x - 4, y + 13);
      ctx.lineTo(x + 17, y - 11);
      ctx.stroke();
    } else {
      ctx.strokeStyle = d.today ? s.ink : s.hair;
      ctx.lineWidth = d.today ? 5 : 4;
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = d.today ? s.ink : s.dim;
    ctx.font = `700 28px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x, y + 92);
  });
  ctx.textAlign = 'left';
};

export const drawStoryCard = (canvas: HTMLCanvasElement, data: StoryData, s: CardSkin) => {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  background(ctx, s);
  brand(ctx, s, data.eyebrow);
  const track = mix(s.bg, s.ink, 0.12);

  if (data.kind === 'weekly') {
    const p = data.done / data.goal;
    ring(ctx, STORY_W / 2, 640, 300, 44, p, s.accent, track);
    ctx.textAlign = 'center';
    ctx.fillStyle = s.ink;
    ctx.font = `italic 800 330px ${FONT}`;
    ctx.fillText(String(data.done), STORY_W / 2, 700);
    ctx.fillStyle = s.dim;
    ctx.font = `700 34px ${SANS}`;
    ctx.letterSpacing = '6px';
    ctx.fillText(`OF ${data.goal} WORKOUTS`, STORY_W / 2, 790);
    ctx.letterSpacing = '0px';
    ctx.font = `600 32px ${SANS}`;
    ctx.fillText(data.range, STORY_W / 2, 1050);
    ctx.textAlign = 'left';
    dots(ctx, s, data.days, 1170);
    // Three numbers
    const colW = (STORY_W - 168) / data.stats.length;
    data.stats.forEach((st, i) => {
      const x = 84 + colW * i + colW / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = s.dim;
      ctx.font = `700 24px ${SANS}`;
      ctx.letterSpacing = '4px';
      ctx.fillText(st.label.toUpperCase(), x, 1440);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = s.ink;
      ctx.font = `italic 800 92px ${FONT}`;
      const valW = ctx.measureText(st.value).width;
      ctx.fillText(st.value, x - (st.unit ? 22 : 0), 1525);
      if (st.unit) {
        ctx.fillStyle = s.accent;
        ctx.font = `italic 800 42px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(st.unit, x - 22 + valW / 2 + 10, 1525);
      }
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = s.ink;
    ctx.font = `600 40px ${SANS}`;
    wrap(ctx, data.headline, STORY_W - 220).slice(0, 3).forEach((l, i) => ctx.fillText(l, STORY_W / 2, 1660 + i * 56));
    ctx.textAlign = 'left';
  } else if (data.kind === 'streak') {
    ring(ctx, STORY_W / 2, 700, 330, 36, 1, withAlpha(s.accent, 0.35), track);
    ring(ctx, STORY_W / 2, 700, 330, 36, Math.min(1, data.days / Math.max(7, data.best)), s.accent, 'transparent');
    ctx.textAlign = 'center';
    ctx.fillStyle = s.ink;
    ctx.font = `italic 800 460px ${FONT}`;
    ctx.fillText(String(data.days), STORY_W / 2, 800);
    ctx.fillStyle = s.accent;
    ctx.font = `800 36px ${SANS}`;
    ctx.letterSpacing = '9px';
    ctx.fillText(data.days === 1 ? 'DAY STREAK' : 'DAYS IN A ROW', STORY_W / 2, 900);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = s.dim;
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText(`Best so far: ${data.best} day${data.best === 1 ? '' : 's'}`, STORY_W / 2, 1130);
    ctx.textAlign = 'left';
    dots(ctx, s, data.week, 1300);
    ctx.textAlign = 'center';
    ctx.fillStyle = s.ink;
    ctx.font = `600 44px ${SANS}`;
    wrap(ctx, data.line, STORY_W - 240).slice(0, 2).forEach((l, i) => ctx.fillText(l, STORY_W / 2, 1620 + i * 60));
    ctx.textAlign = 'left';
  } else {
    // Milestone badge: concentric rings, the number, and a few quiet specks of confetti
    const cx = STORY_W / 2;
    const cy = 740;
    ring(ctx, cx, cy, 380, 3, 1, s.hair, s.hair);
    ring(ctx, cx, cy, 330, 40, 1, s.accent, track);
    ctx.fillStyle = s.card;
    ctx.beginPath();
    ctx.arc(cx, cy, 290, 0, Math.PI * 2);
    ctx.fill();
    const specks: [number, number, number, number][] = [
      [-420, -250, 12, 0], [380, -330, 9, 1], [-300, 380, 8, 1], [440, 260, 13, 0], [-120, -470, 7, 0],
      [210, 470, 10, 1], [-470, 40, 7, 1], [470, -40, 8, 0], [60, -500, 6, 1], [-210, 500, 7, 0],
    ];
    for (const [dx, dy, r, k] of specks) {
      ctx.fillStyle = withAlpha(k ? s.accent2 : s.accent, 0.7);
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = s.ink;
    const big = data.big.length > 4 ? 190 : data.big.length > 2 ? 250 : 320;
    ctx.font = `italic 800 ${big}px ${FONT}`;
    ctx.fillText(data.big, cx, cy + big * 0.32);
    if (data.unit) {
      ctx.fillStyle = s.accent;
      ctx.font = `italic 800 64px ${FONT}`;
      ctx.letterSpacing = '4px';
      ctx.fillText(data.unit.toUpperCase(), cx, cy + big * 0.32 + 84);
      ctx.letterSpacing = '0px';
    }
    ctx.fillStyle = s.ink;
    ctx.font = `italic 800 120px ${FONT}`;
    wrap(ctx, data.title.toUpperCase(), STORY_W - 180).slice(0, 2).forEach((l, i) => ctx.fillText(l, cx, 1330 + i * 112));
    ctx.fillStyle = s.dim;
    ctx.font = `600 40px ${SANS}`;
    wrap(ctx, data.subtitle, STORY_W - 260).slice(0, 2).forEach((l, i) => ctx.fillText(l, cx, 1600 + i * 56));
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText(data.date, cx, 1750);
    ctx.textAlign = 'left';
  }
  footer(ctx, s);
};

/** Draws the card to a PNG (waits for the fonts first so the numbers use the app's typeface). */
export const renderStoryCard = async (data: StoryData, skin: CardSkin): Promise<string> => {
  try {
    await Promise.all([document.fonts.load(`italic 800 100px "Barlow Condensed"`), document.fonts.load(`600 24px "Figtree Variable"`)]);
  } catch {
    // fall back to the system fonts
  }
  const canvas = document.createElement('canvas');
  drawStoryCard(canvas, data, skin);
  return canvas.toDataURL('image/png');
};
