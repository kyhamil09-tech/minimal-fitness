// Writes looks.json for generate-watchface.cjs from the phone app's own palettes, so the digital watch face offers the same colour
// schemes as the app. Run through `npm run watchface:digital` from the project root.
import { writeFileSync } from 'node:fs';
import { MODERN_THEMES } from '../../src/data/themes';

// The app's fallback for palettes without their own data colours (DEFAULT_DATA in src/lib/appearance.ts, which is not exported).
const DEFAULT_DATA = { blue: '#7dd3fc', green: '#10b981', cyan: '#5eead4', red: '#ff4d4d', yellow: '#ffd23f', purple: '#b794ff' };

const looks = Object.values(MODERN_THEMES).map((t) => {
  const d = t.data ?? DEFAULT_DATA;
  return { id: t.id, name: t.name, accent: t.primary, secondary: t.secondary, cyan: d.cyan, red: d.red, purple: d.purple, blue: d.blue, yellow: d.yellow };
});

writeFileSync(new URL('./looks.json', import.meta.url), JSON.stringify({ looks }, null, 1));
console.log(`wrote ${looks.length} looks`);
