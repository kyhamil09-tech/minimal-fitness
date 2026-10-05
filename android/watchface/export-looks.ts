// Writes looks.json for generate-watchface.cjs from the phone app's own palettes and dark backgrounds, so the watch face offers the
// same colour schemes. Run through `npm run watchface` from the project root.
import { writeFileSync } from 'node:fs';
import { MODERN_THEMES } from '../../src/data/themes';
import { ALL_BACKDROPS } from '../../src/data/backdrops';

const argb = (h: string) => '#ff' + h.replace('#', '').toLowerCase();
// A watch face stays dark (ambient mode, battery), so every palette is paired with a dark background.
const dark = ALL_BACKDROPS.filter((b) => b.family === 'dark');
const pair: Record<string, string> = { grounded: 'forest', high_energy: 'slate', mind_body: 'plum', ocean_calm: 'charcoal' };

const looks = Object.values(MODERN_THEMES).map((t) => {
  const bd = dark.find((b) => b.id === (pair[t.id] ?? 'charcoal'))!;
  return {
    id: t.id,
    name: t.name,
    // The four gradient colours of the face: main accent, second accent, third accent, and a data colour.
    colors: [t.primary, t.secondary, t.tertiary, t.data?.yellow ?? t.secondary].map(argb),
    bg: argb(bd.bg),
    ink: argb(bd.ink),
    dim: argb(bd.inkDim),
  };
});

writeFileSync(new URL('./looks.json', import.meta.url), JSON.stringify({ looks }, null, 1));
console.log(`wrote ${looks.length} looks`);
