import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_BACKDROPS, DARK_BACKDROPS, LIGHT_BACKDROPS, findBackdrop, makeBackdrop } from '../data/backdrops';
import { MODERN_THEMES } from '../data/themes';
import { VIBES } from '../data/vibes';
import { buildAppearance, buildWatchLook } from '../lib/appearance';
import { contrast, isLight, lightFilter } from '../lib/colorMath';

const dist = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
};

test('no backdrop uses pure black or pure white text, apart from the AMOLED page itself', () => {
  for (const b of ALL_BACKDROPS) {
    assert.notEqual(b.ink.toLowerCase(), '#ffffff', b.id);
    assert.notEqual(b.ink.toLowerCase(), '#000000', b.id);
    if (b.id !== 'amoled') assert.notEqual(b.bg.toLowerCase(), '#000000', b.id);
    // The Google-inspired theme is white by request.
    if (b.id !== 'google_white') assert.notEqual(b.bg.toLowerCase(), '#ffffff', b.id);
  }
});

test('every backdrop has readable text and the right family', () => {
  for (const b of DARK_BACKDROPS) {
    assert.ok(!isLight(b.bg), b.id);
    assert.ok(contrast(b.ink, b.bg) >= 7, `${b.id} ink contrast`);
    assert.ok(contrast(b.inkDim, b.bg) >= 3.5, `${b.id} dim contrast`);
  }
  for (const b of LIGHT_BACKDROPS) {
    assert.ok(isLight(b.bg), b.id);
    assert.ok(contrast(b.ink, b.bg) >= 7, `${b.id} ink contrast`);
    assert.ok(contrast(b.inkDim, b.bg) >= 3.5, `${b.id} dim contrast`);
  }
  assert.ok(DARK_BACKDROPS.length >= 6 && LIGHT_BACKDROPS.length >= 6);
});

test('dark appearance uses the colors as designed', () => {
  const b = findBackdrop('charcoal')!;
  const a = buildAppearance(b, MODERN_THEMES.grounded);
  assert.equal(a.family, 'dark');
  assert.equal(a.vars['--card'], b.card);
  assert.equal(a.vars['--ink'], b.ink);
  assert.equal(a.vars['--accent'], MODERN_THEMES.grounded.primary);
  assert.equal(a.pageBg, b.bg);
  assert.equal(a.theme.surface, b.card);
});

test('light appearance comes out as the designed pastel after the page filter', () => {
  const b = findBackdrop('cream')!;
  const a = buildAppearance(b, MODERN_THEMES.grounded);
  assert.equal(a.family, 'light');
  assert.equal(a.pageBg, b.bg);
  assert.ok(dist(lightFilter(a.vars['--card']), b.card) <= 4);
  assert.ok(dist(lightFilter(a.vars['--ink']), b.ink) <= 4);
  assert.ok(dist(lightFilter(a.vars['--hairline']), b.hairline) <= 4);
  // The accent is readable on the pastel
  assert.ok(contrast(lightFilter(a.vars['--accent']), b.bg) >= 2.8, lightFilter(a.vars['--accent']));
});

test('every palette works on every backdrop', () => {
  for (const p of Object.values(MODERN_THEMES)) {
    for (const b of ALL_BACKDROPS) {
      const a = buildAppearance(b, p);
      assert.ok(a.vars['--accent'].startsWith('#'));
      assert.ok(a.vars['--color-neutral-400'].startsWith('#'));
    }
  }
});

test('vibes point at real palettes and backdrops', () => {
  for (const v of VIBES) {
    assert.ok(MODERN_THEMES[v.paletteId], v.id);
    assert.ok(findBackdrop(v.light)?.family === 'light', v.id);
    assert.ok(findBackdrop(v.dark)?.family === 'dark', v.id);
  }
});

test('a custom background gets matching card and text colors', () => {
  const dark = makeBackdrop('c1', 'Mine', '#1E2A3A');
  assert.equal(dark.family, 'dark');
  assert.ok(contrast(dark.ink, dark.bg) >= 7);
  const light = makeBackdrop('c2', 'Mine', '#F0E6F6');
  assert.equal(light.family, 'light');
  assert.ok(contrast(light.ink, light.bg) >= 7);
});

test('the watch is always dark: pastel backdrops fall back to a dark partner', () => {
  const look = buildWatchLook(findBackdrop('cream')!, MODERN_THEMES.grounded);
  assert.ok(!isLight(look.bg));
  const d = buildWatchLook(findBackdrop('slate')!, MODERN_THEMES.high_energy);
  assert.equal(d.bg, '#11151C');
  assert.equal(d.accent, '#C8F135');
});
