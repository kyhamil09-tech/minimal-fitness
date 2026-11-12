import { Backdrop } from '../data/backdrops';
import { ColorPalette, DataColors } from '../types/theme';
import { adaptForLight, lightPre, mix, neutralRamp, parseHex, readableOn } from './colorMath';

/**
 * Turns a background and an accent palette into the CSS variables and JS colors the whole app draws with.
 *
 * Dark family: the values are used as they are. Light family: the page is drawn dark and flipped by a CSS filter (invert and hue
 * rotate), so every color in a variable is first converted with {@link lightPre} so that it comes out as the color that was
 * designed, and accents are darkened until they read on the pastel (a neon lime would vanish on cream).
 */
export interface Appearance {
  family: 'dark' | 'light';
  /** Variables for the page's root element. */
  vars: Record<string, string>;
  /** The palette with its surface, text and accent colors ready for inline styles inside the page. */
  theme: ColorPalette;
  /** The page's own background (outside the filter, so the color you chose exactly). */
  pageBg: string;
  /** The color for the phone's status bar. */
  metaColor: string;
}

const DEFAULT_DATA: DataColors = { blue: '#7dd3fc', green: '#10B981', cyan: '#5eead4', red: '#ff4d4d', yellow: '#ffd23f', purple: '#b794ff' };

const rgba = (hex: string, a: number) => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const buildAppearance = (backdrop: Backdrop, palette: ColorPalette): Appearance => {
  const light = backdrop.family === 'light';
  // The color that will be stored for a "final" color: unchanged in the dark family, pre-imaged in the light one.
  const surf = (c: string) => (light ? lightPre(c) : c);
  const accent = (c: string) => (light ? lightPre(adaptForLight(c, backdrop.bg)) : c);
  const data = palette.data ?? DEFAULT_DATA;

  const overlay = light ? mix(backdrop.bg, '#FFFFFF', 0.5) : mix(backdrop.bg, '#000000', 0.45);
  const ramp = neutralRamp(backdrop.ink, backdrop.bg);

  const vars: Record<string, string> = {
    '--page-bg': backdrop.bg,
    '--bg': surf(backdrop.bg),
    '--ink': surf(backdrop.ink),
    '--ink-dim': surf(backdrop.inkDim),
    '--card': surf(backdrop.card),
    '--card-2': surf(backdrop.card2),
    '--hairline': surf(backdrop.hairline),
    '--hairline-strong': surf(backdrop.hairlineStrong),
    '--glass': surf(backdrop.card),
    '--glass-strong': surf(backdrop.card2),
    '--panel': surf(backdrop.card),
    '--edge': surf(backdrop.hairline),
    '--nav-bg': light ? rgba(surf(backdrop.bg), 0.94) : rgba(backdrop.bg, 0.94),
    // Tailwind's own colors: white text becomes the soft ink, black panels the soft overlay, and the grey ramp follows the backdrop.
    '--color-white': surf(backdrop.ink),
    '--color-black': surf(overlay),
    '--accent': accent(palette.primary),
    '--accent-2': accent(palette.secondary),
    // Text on an accent-colored button: whichever of dark or light ink reads better on the color that is actually shown.
    '--on-accent': surf(readableOn(light ? adaptForLight(palette.primary, backdrop.bg) : palette.primary, '#14130F', '#F6F1E7')),
    '--on-accent-2': surf(readableOn(light ? adaptForLight(palette.secondary, backdrop.bg) : palette.secondary, '#14130F', '#F6F1E7')),
    '--g-blue': accent(data.blue),
    '--g-green': accent(data.green),
    '--g-cyan': accent(data.cyan),
    '--g-red': accent(data.red),
    '--g-yellow': accent(data.yellow),
    '--g-purple': accent(data.purple),
  };
  for (const [k, v] of Object.entries(ramp)) vars[`--color-neutral-${k}`] = surf(v);

  const theme: ColorPalette = {
    ...palette,
    primary: accent(palette.primary),
    secondary: accent(palette.secondary),
    tertiary: accent(palette.tertiary),
    ecgStroke: accent(palette.ecgStroke),
    surface: surf(backdrop.card),
    surfaceBorder: surf(backdrop.hairline),
    textPrimary: surf(backdrop.ink),
    textSecondary: surf(mix(backdrop.ink, backdrop.bg, 0.2)),
    textMuted: surf(backdrop.inkDim),
    sleepStages: {
      deep: accent(palette.sleepStages.deep),
      rem: accent(palette.sleepStages.rem),
      light: accent(palette.sleepStages.light),
      awake: surf(palette.sleepStages.awake),
    },
    data: palette.data
      ? { blue: accent(data.blue), green: accent(data.green), cyan: accent(data.cyan), red: accent(data.red), yellow: accent(data.yellow), purple: accent(data.purple) }
      : undefined,
  };

  return { family: backdrop.family, vars, theme, pageBg: backdrop.bg, metaColor: backdrop.bg };
};

/** The few colors the watch needs, in the colors you see (the watch is always dark, so a pastel backdrop uses its dark partner). */
export interface WatchLook {
  bg: string;
  card: string;
  edge: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  blue: string;
  green: string;
  yellow: string;
  orange: string;
  red: string;
  purple: string;
}

export const buildWatchLook = (backdrop: Backdrop, palette: ColorPalette): WatchLook => {
  // A watch screen is always dark (battery and ambient mode), so pastel backdrops fall back to a dark tone of the same family.
  const dark = backdrop.family === 'dark' ? backdrop : null;
  const bg = dark ? dark.bg : mix(backdrop.bg, '#000000', 0.88);
  const card = dark ? dark.card : mix(backdrop.bg, '#000000', 0.8);
  const edge = dark ? dark.hairline : mix(backdrop.bg, '#000000', 0.7);
  const ink = dark ? dark.ink : '#F2EDE3';
  const muted = dark ? dark.inkDim : '#A29E95';
  const d = palette.data ?? DEFAULT_DATA;
  return {
    bg, card, edge, ink, muted,
    accent: palette.primary,
    accent2: palette.secondary,
    blue: d.blue,
    green: d.green,
    yellow: d.yellow,
    orange: palette.secondary,
    red: d.red,
    purple: d.purple,
  };
};
