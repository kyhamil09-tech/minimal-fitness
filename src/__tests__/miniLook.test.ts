import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast } from '../lib/colorMath';
import { DEFAULT_LOOK, EAT_THEMES, FASTING_THEMES, Look, normalizeLook, resolveLook, resolveMode, themeOf } from '../lib/miniLook';

const ctx = { systemDark: true, appAccent: '#00b3a4' };
const mk = (over: Partial<Look>): Look => ({ ...DEFAULT_LOOK, ...over });

test('the default look is the shipped one: dark, first theme', () => {
  const f = resolveLook('fasting', normalizeLook({}, 'fasting'), ctx);
  assert.equal(f.mode, 'dark');
  assert.equal(f.accent, '#ff5a2a');
  assert.equal(f.vars['--fa-bg-a'], '#1c0707');
  assert.equal(f.vars['--fa-text'], '#f8efe5');
  const e = resolveLook('eat', normalizeLook({}, 'eat'), ctx);
  assert.equal(e.accent, '#f2475f');
  assert.equal(e.vars['--ea-bg-a'], '#1a1019');
  assert.equal(e.vars['--ea-p'], '#ff7a8a');
});

test('AMOLED is pure black with neutral tints', () => {
  const r = resolveLook('eat', mk({ mode: 'amoled' }), ctx);
  assert.equal(r.vars['--ea-bg-a'], '#000000');
  assert.equal(r.vars['--ea-bg-b'], '#000000');
  assert.equal(r.vars['--ea-tint'], '255,255,255');
  assert.equal(r.mode, 'amoled');
});

test('system mode follows the phone', () => {
  assert.equal(resolveMode('system', true), 'dark');
  assert.equal(resolveMode('system', false), 'light');
  assert.equal(resolveMode('amoled', false), 'amoled');
  assert.equal(resolveLook('fasting', mk({ mode: 'system' }), { ...ctx, systemDark: false }).mode, 'light');
});

test('every theme in every mode keeps text, dim text and accent text readable', () => {
  for (const app of ['fasting', 'eat'] as const) {
    const themes = app === 'fasting' ? FASTING_THEMES : EAT_THEMES;
    for (const mode of ['dark', 'amoled', 'light'] as const) {
      const ids = [...themes.map((t) => t.id), 'app', 'custom'];
      for (const theme of ids) {
        for (const custom of ['#ff5a2a', '#ffee00', '#0a3d91', '#ffffff', '#000000']) {
          const r = resolveLook(app, mk({ mode, theme, custom }), ctx);
          const p = app === 'fasting' ? 'fa' : 'ea';
          const bg = r.vars[`--${p}-bg-b`];
          const label = `${app} ${mode} ${theme} ${custom}`;
          assert.ok(contrast(r.vars[`--${p}-text`], bg) >= 7, `text ${label}`);
          assert.ok(contrast(r.vars[`--${p}-dim`], bg) >= 4.5, `dim ${label}`);
          assert.ok(contrast(r.accentText, bg) >= 4.5, `accent text ${label}: ${contrast(r.accentText, bg)}`);
          assert.ok(contrast(r.vars[`--${p}-accent-ink`], r.accent) >= 4.5, `on accent ${label}`);
          assert.ok(contrast(r.vars[`--${p}-gold`], bg) >= 4.5, `gold ${label}`);
        }
      }
    }
  }
});

test('Match the app and custom colors use the color given, and bad input falls back', () => {
  assert.equal(themeOf('eat', mk({ theme: 'app' }), ctx).accent, '#00b3a4');
  assert.equal(themeOf('eat', mk({ theme: 'custom', custom: '#123456' }), ctx).accent, '#123456');
  assert.equal(themeOf('eat', mk({ theme: 'custom', custom: 'nope' }), ctx).accent, EAT_THEMES[0].accent);
  assert.equal(themeOf('fasting', mk({ theme: 'pomegranate' }), ctx).id, 'flame');
});

test('a saved value is made whole', () => {
  assert.deepEqual(normalizeLook(null, 'eat'), { mode: 'dark', theme: 'pomegranate', custom: '#f2475f' });
  assert.deepEqual(normalizeLook({ mode: 'light', theme: 'ocean', custom: '#ABCDEF' }, 'eat'), { mode: 'light', theme: 'ocean', custom: '#abcdef' });
  assert.equal(normalizeLook({ mode: 'neon' as never, theme: 'x' }, 'fasting').theme, 'flame');
  assert.equal(normalizeLook({ theme: 'app' }, 'fasting').theme, 'app');
});
