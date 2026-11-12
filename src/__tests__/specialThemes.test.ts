import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODERN_THEMES, SPECIAL_THEME_IDS } from '../data/themes';
import { ALL_BACKDROPS, findBackdrop } from '../data/backdrops';
import { contrast } from '../lib/colorMath';
import { mascotLine } from '../lib/mascotTalk';
import { buildAppearance } from '../lib/appearance';

test('only the two special themes carry a scene, and every other theme is unchanged', () => {
  const withScene = Object.values(MODERN_THEMES).filter((t) => t.scene);
  assert.deepEqual(withScene.map((t) => t.id).sort(), ['google', 'sagittarius']);
  assert.deepEqual([...SPECIAL_THEME_IDS].sort(), ['google', 'sagittarius']);
  assert.equal(MODERN_THEMES.google.scene, 'google');
  assert.equal(MODERN_THEMES.sagittarius.scene, 'galaxy');
  for (const t of Object.values(MODERN_THEMES)) if (!t.scene) assert.equal(t.preset, undefined, `${t.id} has a preset but no scene`);
});

test('a special theme\'s preset points at backgrounds that exist, in the right family', () => {
  for (const id of SPECIAL_THEME_IDS) {
    const p = MODERN_THEMES[id].preset!;
    assert.ok(p, `${id} has a preset`);
    if (p.light) assert.equal(findBackdrop(p.light)?.family, 'light', `${id} light background`);
    if (p.dark) assert.equal(findBackdrop(p.dark)?.family, 'dark', `${id} dark background`);
    assert.ok((p.mode === 'light' ? p.light : p.dark), `${id} sets a background for the family it opens in`);
  }
  assert.equal(MODERN_THEMES.google.preset!.mode, 'light');
  assert.equal(MODERN_THEMES.google.preset!.light, 'google_white');
  assert.equal(MODERN_THEMES.sagittarius.preset!.mode, 'dark');
  assert.equal(MODERN_THEMES.sagittarius.preset!.dark, 'galaxy');
  assert.equal(MODERN_THEMES.sagittarius.preset!.glow, 'always');
  assert.equal(new Set(ALL_BACKDROPS.map((b) => b.id)).size, ALL_BACKDROPS.length, 'background ids are unique');
});

test('the Google-inspired background is truly white and its text reads on it', () => {
  const white = findBackdrop('google_white')!;
  assert.equal(white.bg.toUpperCase(), '#FFFFFF');
  assert.ok(contrast(white.ink, white.bg) >= 12, 'main text');
  assert.ok(contrast(white.inkDim, white.bg) >= 4.5, 'secondary text');
  assert.ok(contrast(white.ink, white.card) >= 12, 'text on a card');
  const g = MODERN_THEMES.google;
  assert.deepEqual([g.primary, g.secondary, g.tertiary, g.data!.yellow], ['#4285F4', '#34A853', '#EA4335', '#FBBC04']);
});

test('the galaxy background is deep dark and its text reads on the cards', () => {
  const space = findBackdrop('galaxy')!;
  assert.equal(space.family, 'dark');
  assert.ok(contrast(space.ink, space.bg) >= 14);
  assert.ok(contrast(space.inkDim, space.card) >= 4.5);
  const ap = buildAppearance(space, MODERN_THEMES.sagittarius);
  assert.equal(ap.theme.scene, 'galaxy');
  assert.equal(ap.family, 'dark');
  // The ambient glow follows the accents, so it comes out in the galaxy's own colors.
  assert.equal(ap.vars['--accent'], '#FFC46B');
  assert.equal(ap.vars['--accent-2'], '#E58BC0');
});

test('the white theme keeps its scene and brand accents when the page colors are flipped for the light look', () => {
  const ap = buildAppearance(findBackdrop('google_white')!, MODERN_THEMES.google);
  assert.equal(ap.theme.id, 'google');
  assert.equal(ap.theme.scene, 'google');
  assert.equal(ap.family, 'light');
});

test('the bots speak to the day: workout, steps, time and streak, and tapping moves to the next line', () => {
  const base = { hour: 14, stepsPct: 20, streak: 0, workoutDoneToday: false };
  assert.match(mascotLine({ ...base, workoutDoneToday: true, name: 'Ky' }), /Ky|done|counts|showed/i);
  assert.match(mascotLine({ ...base, stepsPct: 120 }), /goal|bonus|gift/i);
  assert.match(mascotLine({ ...base, stepsPct: 70 }), /half|walk|closer/i);
  assert.match(mascotLine({ ...base, hour: 7 }), /morning|outside|water/i);
  assert.match(mascotLine({ ...base, hour: 22 }), /wind|sleep|night|rest/i);
  assert.match(mascotLine({ ...base, streak: 5 }), /5 days|streak|steady/i);
  const lines = new Set([0, 1, 2, 3].map((n) => mascotLine(base, n)));
  assert.ok(lines.size >= 3, 'a few different lines');
  assert.equal(mascotLine(base, 0), mascotLine(base, 3), 'the lines cycle');
  assert.equal(mascotLine(base, -1), mascotLine(base, 2), 'a negative count still picks a line');
  assert.ok(!/undefined|NaN/.test(mascotLine({ ...base, name: '  ' })));
});
