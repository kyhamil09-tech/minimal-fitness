/**
 * The app's logo: an outlined M inside a ring. It is drawn from two simple shapes (a circle and one closed line), so it can be drawn as
 * an SVG on screen, painted on the share cards, written as an Android icon and recoloured to anything. All coordinates are in a
 * 1024 by 1024 square.
 */
export type LogoStyle = 'sport' | 'ring' | 'badge' | 'mark';

export interface LogoColors {
  bg: string;
  ink: string;
}

export const LOGO_BOX = 1024;
export const RING = { cx: 512, cy: 508, r: 325, width: 34 };
export const MARK_PATH = 'M346 661 L346 363 L512 529 L678 363 L678 661 L607 661 L607 492 L512 606 L418 492 L418 661 Z';
export const MARK_WIDTH = 36;

/** The sport mark: a heavy italic M (drawn as one line with round joins) over a faint diagonal speed band, like the Run Club banner. */
export const SPORT_M = 'M256 740 L344 300 L504 560 L768 300 L680 740';
export const SPORT_WIDTH = 118;
export const SPORT_BAND = 'M690 0 L1010 0 L350 1024 L30 1024 Z';
export const SPORT_BAND_ALPHA = 0.16;

export const LOGO_STYLES: { id: LogoStyle; label: string }[] = [
  { id: 'sport', label: 'Sport' },
  { id: 'ring', label: 'Ring' },
  { id: 'badge', label: 'Badge' },
  { id: 'mark', label: 'Mark only' },
];

/** Ready-made color pairs. The first is the default. */
export const LOGO_PRESETS: { id: string; name: string; bg: string; ink: string }[] = [
  { id: 'runclub', name: 'Run Club', bg: '#101112', ink: '#FF5500' },
  { id: 'forest', name: 'Forest', bg: '#30633F', ink: '#FFFFFF' },
  { id: 'charcoal', name: 'Charcoal', bg: '#17181B', ink: '#F2EDE3' },
  { id: 'cream', name: 'Cream', bg: '#F6F0E4', ink: '#30633F' },
  { id: 'terracotta', name: 'Terracotta', bg: '#C8643F', ink: '#FFF6EE' },
  { id: 'lavender', name: 'Lavender', bg: '#B8A9D9', ink: '#241F38' },
  { id: 'ocean', name: 'Ocean', bg: '#2F5D86', ink: '#FFFFFF' },
  { id: 'rose', name: 'Rose', bg: '#D9A5A8', ink: '#3A1F24' },
  { id: 'lime', name: 'Lime', bg: '#C8F135', ink: '#14130F' },
];

export const DEFAULT_LOGO: { style: LogoStyle; colors: LogoColors } = { style: 'sport', colors: { bg: LOGO_PRESETS[0].bg, ink: LOGO_PRESETS[0].ink } };

/**
 * The shapes of a logo as SVG elements, for a square of the given size placed at (0,0). "ring" is the ring and the M, "badge" is a
 * filled disc with the M cut out of it, and "mark" is the M alone.
 */
export const logoShapes = (style: LogoStyle, c: LogoColors): string => {
  const mark = (stroke: string) => `<path d="${MARK_PATH}" fill="none" stroke="${stroke}" stroke-width="${MARK_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (style === 'sport') {
    return `<path d="${SPORT_BAND}" fill="${c.ink}" fill-opacity="${SPORT_BAND_ALPHA}"/><path d="${SPORT_M}" fill="none" stroke="${c.ink}" stroke-width="${SPORT_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  if (style === 'badge') {
    return `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r + RING.width / 2}" fill="${c.ink}"/>${mark(c.bg)}`;
  }
  if (style === 'mark') return mark(c.ink);
  return `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="${c.ink}" stroke-width="${RING.width}"/>${mark(c.ink)}`;
};

/** A complete SVG (with the background square) as text, for files and the web app icon. */
export const logoSvg = (style: LogoStyle, c: LogoColors, size = 512, rounded = false): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${LOGO_BOX} ${LOGO_BOX}"><rect width="${LOGO_BOX}" height="${LOGO_BOX}"${rounded ? ' rx="224"' : ''} fill="${c.bg}"/>${logoShapes(style, c)}</svg>`;

/** Draws the logo on a canvas, centered at (x, y) with the given width. Used by the share cards. */
export const drawLogo = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, style: LogoStyle, c: LogoColors, withBackground = false) => {
  const s = size / LOGO_BOX;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(s, s);
  if (withBackground) {
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.roundRect?.(0, 0, LOGO_BOX, LOGO_BOX, 224);
    if (!ctx.roundRect) ctx.rect(0, 0, LOGO_BOX, LOGO_BOX);
    ctx.fill();
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (style === 'sport') {
    ctx.save();
    ctx.globalAlpha = SPORT_BAND_ALPHA;
    ctx.fillStyle = c.ink;
    ctx.fill(new Path2D(SPORT_BAND));
    ctx.restore();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = SPORT_WIDTH;
    ctx.stroke(new Path2D(SPORT_M));
    ctx.restore();
    return;
  }
  if (style === 'badge') {
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(RING.cx, RING.cy, RING.r + RING.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.bg;
  } else {
    ctx.strokeStyle = c.ink;
    if (style === 'ring') {
      ctx.lineWidth = RING.width;
      ctx.beginPath();
      ctx.arc(RING.cx, RING.cy, RING.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.lineWidth = MARK_WIDTH;
  ctx.stroke(new Path2D(MARK_PATH));
  ctx.restore();
};

/**
 * The logo as a base64 PNG on a full-bleed background, sized for an adaptive icon (the logo sits inside the middle 86% so a
 * launcher's circle or squircle mask never clips it). Used for the custom-color home-screen shortcut.
 */
export const logoShortcutPng = (style: LogoStyle, c: LogoColors, px = 432): string => {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, px, px);
  drawLogo(ctx, px / 2, px / 2, px * 0.86, style, c, false);
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
};

const alphaHex = (hex: string, a: number): string => '#' + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() + hex.replace('#', '');

/** The inner paths of the logo as Android vector paths, in the 1024 square (the callers scale and place them). */
export const androidShapes = (style: LogoStyle, c: LogoColors): string => {
  const stroke = (color: string, width: number, path: string) =>
    `        <path android:pathData="${path}" android:strokeColor="${color}" android:strokeWidth="${width}" android:strokeLineJoin="round" android:strokeLineCap="round" android:fillColor="#00000000"/>`;
  const circle = (r: number) => `M${RING.cx - r},${RING.cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
  if (style === 'sport') {
    return `        <path android:pathData="${SPORT_BAND}" android:fillColor="${alphaHex(c.ink, SPORT_BAND_ALPHA)}"/>
${stroke(c.ink, SPORT_WIDTH, SPORT_M)}`;
  }
  return style === 'badge'
    ? `        <path android:pathData="${circle(RING.r + RING.width / 2)}" android:fillColor="${c.ink}"/>
${stroke(c.bg, MARK_WIDTH, MARK_PATH)}`
    : style === 'mark'
      ? stroke(c.ink, MARK_WIDTH, MARK_PATH)
      : `${stroke(c.ink, RING.width, circle(RING.r))}
${stroke(c.ink, MARK_WIDTH, MARK_PATH)}`;
};

const wrapVector = (body: string, scale = 0.0906): string => {
  const tx = (54 - RING.cx * scale).toFixed(3);
  const ty = (54 - RING.cy * scale).toFixed(3);
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group android:scaleX="${scale}" android:scaleY="${scale}" android:translateX="${tx}" android:translateY="${ty}">
${body}
    </group>
</vector>
`;
};

/** Android vector drawable (foreground of an adaptive icon): the logo scaled into the safe zone of a 108 dp icon. */
export const androidForeground = (style: LogoStyle, c: LogoColors, scale = 0.0906): string => wrapVector(androidShapes(style, c), scale);

/** The one-color version for Android 13 themed icons: the system tints it, so only its shape matters. */
export const androidMonochrome = (style: LogoStyle, scale = 0.0906): string => wrapVector(androidShapes(style === 'sport' ? 'sport' : 'mark', { bg: '#FFFFFF', ink: '#FFFFFF' }).replace(/android:fillColor="#29FFFFFF"/, 'android:fillColor="#00000000"'), scale);
