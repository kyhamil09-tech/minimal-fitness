/**
 * Small color helpers for the theme system: mixing, contrast, and the "light pre-image".
 *
 * The app's light family is the dark design with a CSS filter on the page (invert, then rotate the hue by 180 degrees). To make a
 * light surface come out as a chosen color, the variable has to hold the color that the filter turns INTO it. {@link lightPre}
 * works that color out, so a designer's cream stays that cream on screen.
 */

export type RGB = [number, number, number];

const clamp = (v: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, v));

export const isHex = (s: string): boolean => /^#[0-9a-f]{6}$/i.test(s);

export const parseHex = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
};

export const toHex = (rgb: RGB): string =>
  '#' + rgb.map((v) => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('');

/** A color {@code t} of the way from {@code a} to {@code b} (0 is a, 1 is b). */
export const mix = (a: string, b: string, t: number): string => {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** Relative luminance, 0 (black) to 1 (white). */
export const luminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** WCAG contrast ratio, 1 to 21. */
export const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export const isLight = (hex: string): boolean => luminance(hex) > 0.4;

/** Black or off-white text, whichever reads better on this color. */
export const readableOn = (bg: string, dark = '#1C1B18', light = '#F6F1E7'): string => (contrast(bg, dark) >= contrast(bg, light) ? dark : light);

/** The same color with its saturation scaled ({@code 0} is grey, {@code 1} unchanged). */
export const desaturate = (hex: string, amount: number): string => {
  const [r, g, b] = parseHex(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return toHex([y + (r - y) * amount, y + (g - y) * amount, y + (b - y) * amount]);
};

// CSS hue-rotate(180deg) as a matrix (the standard luminance-weighted rotation at cos = -1, sin = 0).
const HUE180: [RGB, RGB, RGB] = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856],
];
const apply = (m: [RGB, RGB, RGB], c: RGB): RGB => [
  m[0][0] * c[0] + m[0][1] * c[1] + m[0][2] * c[2],
  m[1][0] * c[0] + m[1][1] * c[1] + m[1][2] * c[2],
  m[2][0] * c[0] + m[2][1] * c[1] + m[2][2] * c[2],
];
const inv = (c: RGB): RGB => [255 - c[0], 255 - c[1], 255 - c[2]];

/** What the light-family page filter (invert, then hue-rotate 180) turns a color into. */
export const lightFilter = (hex: string): string => toHex(apply(HUE180, inv(parseHex(hex)).map((v) => clamp(v)) as RGB).map((v) => clamp(v)) as RGB);

const raw = (hex: string): RGB => apply(HUE180, parseHex(hex)).map((v) => 255 - v) as RGB;

const inGamut = (c: RGB) => c.every((v) => v >= -0.5 && v <= 255.5);

/**
 * The color to put in a variable so that, after the light filter, it shows as {@code hex}. Strongly colored values can fall
 * outside what a screen can show; those are pulled toward grey just far enough to fit, so the result is always the closest color
 * that can be made, never a wrong hue.
 */
export const lightPre = (hex: string): string => {
  let cur = hex;
  for (let i = 0; i < 24; i++) {
    const c = raw(cur);
    if (inGamut(c)) return toHex(c);
    cur = desaturate(cur, 0.93);
  }
  return toHex(raw(cur).map((v) => clamp(v)) as RGB);
};

/**
 * An accent made readable on a light background: darkened (keeping its hue) until it has at least {@code min} contrast, which is
 * also what lets a bright color such as electric lime fit inside what the light filter can reproduce.
 */
export const adaptForLight = (hex: string, bg: string, min = 3): string => {
  let cur = hex;
  for (let i = 0; i < 30 && contrast(cur, bg) < min; i++) cur = mix(cur, '#000000', 0.07);
  return cur;
};

/** Neutral shades (Tailwind's neutral 100 to 950) running from the ink color down to the background. */
export const neutralRamp = (ink: string, bg: string): Record<string, string> => {
  const steps: [string, number][] = [
    ['100', 0], ['200', 0.08], ['300', 0.2], ['400', 0.38], ['500', 0.55], ['600', 0.7], ['700', 0.8], ['800', 0.89], ['900', 0.95], ['950', 0.98],
  ];
  const out: Record<string, string> = {};
  for (const [k, t] of steps) out[k] = mix(ink, bg, t);
  return out;
};
