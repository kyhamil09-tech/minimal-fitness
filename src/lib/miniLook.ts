import { adaptForLight, contrast, isHex, mix, parseHex, readableOn } from './colorMath';

/**
 * The look of the Fasting and Eat apps: a mode (dark, AMOLED black, light, or follow the phone) and a color theme (a preset, the main
 * app's accent, or one you pick). Each app keeps its own choice. This turns that choice into the CSS variables the app's stylesheet
 * reads, so the default (dark, first theme) is exactly the look the apps shipped with.
 */

export type LookMode = 'system' | 'dark' | 'amoled' | 'light';
export type MiniApp = 'fasting' | 'eat';

export interface Look {
  mode: LookMode;
  /** A preset id, 'app' (the main app's accent) or 'custom' (the color in `custom`). */
  theme: string;
  custom: string;
}

export const DEFAULT_LOOK: Look = { mode: 'dark', theme: 'default', custom: '#ff5a2a' };

export interface MiniTheme {
  id: string;
  name: string;
  accent: string;
  /** The second color: the gold of Eat's headings, the lighter flame of Fasting's. */
  accent2: string;
  /** The two dark background stops, and the rgb of the tint used for cards and lines on dark. */
  bg: [string, string];
  tint: string;
}

export const FASTING_THEMES: MiniTheme[] = [
  { id: 'flame', name: 'Flame', accent: '#ff5a2a', accent2: '#ffb547', bg: ['#1c0707', '#090203'], tint: '255,150,130' },
  { id: 'crimson', name: 'Crimson', accent: '#ef3b4b', accent2: '#ff8a5b', bg: ['#200509', '#0a0204'], tint: '255,140,150' },
  { id: 'gold', name: 'Molten gold', accent: '#f5a524', accent2: '#ffd166', bg: ['#1d1205', '#0a0602'], tint: '255,215,150' },
  { id: 'magenta', name: 'Magenta', accent: '#e5389b', accent2: '#ff7ac6', bg: ['#1f0617', '#0a0209'], tint: '255,150,215' },
  { id: 'ice', name: 'Ice', accent: '#38bdf8', accent2: '#a5f3fc', bg: ['#06161f', '#02080b'], tint: '150,215,255' },
];

export const EAT_THEMES: MiniTheme[] = [
  { id: 'pomegranate', name: 'Pomegranate', accent: '#f2475f', accent2: '#e9cb8e', bg: ['#1a1019', '#0e080f'], tint: '255,226,214' },
  { id: 'saffron', name: 'Saffron', accent: '#f59e0b', accent2: '#fde68a', bg: ['#1c1306', '#0b0803'], tint: '255,232,190' },
  { id: 'sage', name: 'Sage', accent: '#5fb37c', accent2: '#e9cb8e', bg: ['#0f1a14', '#070d0a'], tint: '214,240,222' },
  { id: 'ocean', name: 'Ocean', accent: '#3da5e0', accent2: '#8fe3d6', bg: ['#0a1620', '#050b11'], tint: '200,230,250' },
  { id: 'orchid', name: 'Orchid', accent: '#b779f0', accent2: '#f5c1e8', bg: ['#170f22', '#0b0712'], tint: '232,215,255' },
];

export const themesFor = (app: MiniApp): MiniTheme[] => (app === 'fasting' ? FASTING_THEMES : EAT_THEMES);

export const MODES: { id: LookMode; name: string; line: string }[] = [
  { id: 'dark', name: 'Dark', line: 'The default, with a tinted dark background' },
  { id: 'amoled', name: 'AMOLED', line: 'Pure black, easy on the battery and eyes' },
  { id: 'light', name: 'Light', line: 'A white, bright version for daylight' },
  { id: 'system', name: 'Match phone', line: 'Light or dark, as your phone is set' },
];

/** What the main app contributes: whether the phone prefers dark, and the main theme's accent for "Match the app". */
export interface LookContext {
  systemDark: boolean;
  appAccent: string;
}

export interface ResolvedLook {
  mode: 'dark' | 'amoled' | 'light';
  accent: string;
  accent2: string;
  /** The accent as text on the page background (darkened or lightened until it can be read). */
  accentText: string;
  vars: Record<string, string>;
}

const rgb = (hex: string): string => parseHex(hex).join(',');

/** Lightens a color toward white until it reads on a dark background (keeps its hue). */
const adaptForDark = (hex: string, bg: string, min = 4.5): string => {
  let cur = hex;
  for (let i = 0; i < 30 && contrast(cur, bg) < min; i++) cur = mix(cur, '#ffffff', 0.08);
  return cur;
};

const safe = (hex: string, fallback: string): string => (isHex(hex) ? hex.toLowerCase() : fallback);

/** The theme a Look names, as colors. A preset that does not exist (after switching apps, say) falls back to the first. */
export const themeOf = (app: MiniApp, look: Look, ctx: LookContext): MiniTheme => {
  const list = themesFor(app);
  const base = list[0];
  const derive = (accent: string, name: string, id: string): MiniTheme => ({
    id,
    name,
    accent,
    accent2: mix(accent, '#ffffff', 0.45),
    bg: [mix(accent, '#000000', 0.9), mix(accent, '#000000', 0.97)],
    tint: rgb(mix(accent, '#ffffff', 0.8)),
  });
  if (look.theme === 'app') return derive(safe(ctx.appAccent, base.accent), 'Match the app', 'app');
  if (look.theme === 'custom') return derive(safe(look.custom, base.accent), 'Your color', 'custom');
  return list.find((t) => t.id === look.theme) ?? base;
};

export const resolveMode = (mode: LookMode, systemDark: boolean): 'dark' | 'amoled' | 'light' => (mode === 'system' ? (systemDark ? 'dark' : 'light') : mode);

/** The CSS variables for one app, in one mode and theme. `p` is the app's variable prefix ('fa' or 'ea'). */
export const resolveLook = (app: MiniApp, look: Look, ctx: LookContext): ResolvedLook => {
  const mode = resolveMode(look.mode, ctx.systemDark);
  const t = themeOf(app, look, ctx);
  const p = app === 'fasting' ? 'fa' : 'ea';
  const v: Record<string, string> = {};
  let bgA: string;
  let bgB: string;
  let text: string;
  let dim: string;
  let tint: string;
  let line: number;
  let card: number;
  let surface: string;
  let surface2: string;
  let glow: number;

  if (mode === 'light') {
    bgA = mix(t.accent, '#ffffff', 0.93);
    bgB = mix(t.accent, '#ffffff', 0.985);
    text = mix(t.accent, '#000000', 0.9);
    dim = adaptForLight(mix(t.accent, '#000000', 0.5), mix(bgA, '#000000', 0.08), 4.8);
    tint = rgb(mix(t.accent, '#000000', 0.85));
    line = 0.16;
    card = 0.05;
    surface = '#ffffff';
    surface2 = mix(t.accent, '#ffffff', 0.95);
    glow = 0.16;
  } else if (mode === 'amoled') {
    bgA = '#000000';
    bgB = '#000000';
    text = '#f6f2ef';
    dim = '#b9b2ae';
    tint = '255,255,255';
    line = 0.16;
    card = 0.06;
    surface = '#0a0a0a';
    surface2 = '#161616';
    glow = 0.1;
  } else {
    bgA = t.bg[0];
    bgB = t.bg[1];
    text = app === 'fasting' ? '#f8efe5' : '#fbf1e8';
    dim = app === 'fasting' ? '#d2b0aa' : '#cbbabe';
    tint = t.tint;
    line = app === 'fasting' ? 0.17 : 0.11;
    card = app === 'fasting' ? 0.07 : 0.045;
    surface = mix(t.bg[0], '#ffffff', 0.04);
    surface2 = mix(t.bg[0], '#ffffff', 0.09);
    glow = app === 'fasting' ? 0.3 : 0.2;
  }

  // Text sits on cards that tint the background a little, so it is checked against the worse of the two.
  const ref = mode === 'light' ? mix(bgA, '#000000', 0.08) : mix(bgB, '#ffffff', 0.12);
  const accentText = mode === 'light' ? adaptForLight(t.accent, ref, 4.6) : adaptForDark(t.accent, ref, 4.6);
  const accent2Text = mode === 'light' ? adaptForLight(t.accent2, ref, 4.6) : adaptForDark(t.accent2, ref, 4.6);
  const onAccent = readableOn(t.accent, '#1e0a08', '#ffffff');

  v[`--${p}-accent`] = t.accent;
  v[`--${p}-accent-rgb`] = rgb(t.accent);
  v[`--${p}-accent-ink`] = onAccent;
  v[`--${p}-accent-text`] = accentText;
  v[`--${p}-gold`] = accent2Text;
  v[`--${p}-gold-rgb`] = rgb(mode === 'light' ? accent2Text : t.accent2);
  v[`--${p}-bg-a`] = bgA;
  v[`--${p}-bg-b`] = bgB;
  v[`--${p}-glow`] = `rgba(${rgb(t.accent)},${glow})`;
  v[`--${p}-glow2`] = `rgba(${rgb(t.accent2)},${mode === 'amoled' ? 0.05 : mode === 'light' ? 0.12 : 0.09})`;
  v[`--${p}-text`] = text;
  v[`--${p}-dim`] = dim;
  v[`--${p}-tint`] = tint;
  v[`--${p}-line`] = `rgba(${tint},${line})`;
  v[`--${p}-card`] = `rgba(${tint},${card})`;
  v[`--${p}-surface`] = surface;
  v[`--${p}-surface2`] = surface2;
  v[`--${p}-faint`] = mode === 'light' ? adaptForLight(mix(t.accent, '#000000', 0.55), mix(bgA, '#000000', 0.08), 4.6) : mix(text, bgA, 0.35);
  v['color-scheme'] = mode === 'light' ? 'light' : 'dark';

  if (app === 'eat') {
    const light = mode === 'light';
    v['--ea-p'] = light ? '#b01f37' : '#ff7a8a';
    v['--ea-c'] = light ? '#7a5300' : '#e9cb8e';
    v['--ea-f'] = light ? '#26692d' : '#a9cfa4';
    v['--ea-lilac'] = light ? '#5f43b8' : '#bba7ec';
    v['--ea-water'] = light ? '#0f6590' : '#8fcbea';
    v['--ea-plate'] = light ? '#ffffff' : mode === 'amoled' ? '#0d0d0d' : mix(t.bg[0], '#ffffff', 0.08);
    v['--g-blue'] = v['--ea-water'];
    v['--g-yellow'] = v['--ea-c'];
    v['--g-red'] = v['--ea-p'];
    v['--g-green'] = v['--ea-f'];
    v['--g-cyan'] = light ? '#12806f' : '#7fd1c4';
    v['--g-purple'] = v['--ea-lilac'];
  } else {
    const light = mode === 'light';
    v['--fa-good'] = light ? '#14602f' : '#86efac';
    v['--fa-warn'] = light ? '#8f3f05' : '#fdba74';
    v['--fa-bad'] = light ? '#a4201a' : '#fca5a5';
    v['--fa-lab'] = light ? '#523aa6' : '#c4b5fd';
    v['--fa-info'] = light ? '#0a5f8a' : '#7dd3fc';
    v['--fa-sun'] = light ? '#6b4e00' : '#fde047';
    v['--fa-cream'] = light ? text : '#f8efe5';
    v['--fa-flag'] = bgA;
    v['--fa-topmix'] = mode === 'dark' ? '30%' : mode === 'amoled' ? '9%' : '16%';
    // How much of a stage's own color is kept when it is used as text: all of it on dark, a darker version on light.
    v['--fa-keep'] = light ? '52%' : '100%';
  }
  return { mode, accent: t.accent, accent2: t.accent2, accentText, vars: v };
};

/** An id for a theme that follows the main app: stored in `Look.theme`. */
export const looksEqual = (a: Look, b: Look): boolean => a.mode === b.mode && a.theme === b.theme && a.custom === b.custom;

/** The stored value, made whole: missing or invalid parts fall back to the defaults. */
export const normalizeLook = (raw: Partial<Look> | null | undefined, app: MiniApp): Look => {
  const modes: LookMode[] = ['system', 'dark', 'amoled', 'light'];
  const first = themesFor(app)[0].id;
  const theme = raw?.theme === 'app' || raw?.theme === 'custom' || themesFor(app).some((t) => t.id === raw?.theme) ? (raw?.theme as string) : first;
  return {
    mode: raw?.mode && modes.includes(raw.mode) ? raw.mode : 'dark',
    theme,
    custom: raw?.custom && isHex(raw.custom) ? raw.custom.toLowerCase() : themesFor(app)[0].accent,
  };
};

/** The variables as a React style object (color-scheme needs its camel-case name there). */
export const styleFromVars = (vars: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(vars)) out[k === 'color-scheme' ? 'colorScheme' : k] = val;
  return out;
};
