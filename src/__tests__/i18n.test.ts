import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../locales/en';
import { es } from '../locales/es';
import { fr } from '../locales/fr';
import { de } from '../locales/de';
import { pt } from '../locales/pt';
import { it } from '../locales/it';
import { translate } from '../lib/i18n';
import { LANGUAGES, resolveLanguage } from '../lib/languages';
import { DEFAULT_PREFS, sanitizePrefs } from '../lib/prefs';

const others = { es, fr, de, pt, it } as const;
const PLURAL = /\.(zero|one|two|few|many|other)$/;
const baseOf = (k: string) => k.replace(PLURAL, '');
const fields = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every language is listed and has a table', () => {
  assert.deepEqual(LANGUAGES.map((l) => l.code).sort(), ['de', 'en', 'es', 'fr', 'it', 'pt']);
});

test('no language has a message English does not, so nothing is orphaned or misspelled', () => {
  const enBases = new Set(Object.keys(en).map(baseOf));
  for (const [code, table] of Object.entries(others)) {
    for (const key of Object.keys(table)) assert.ok(enBases.has(baseOf(key)), `${code}: unknown key ${key}`);
  }
});

test('placeholders in every translation match the English message', () => {
  for (const [code, table] of Object.entries(others)) {
    for (const [key, text] of Object.entries(table)) {
      const enText = (en as Record<string, string>)[key] ?? (en as Record<string, string>)[`${baseOf(key)}.other`];
      if (enText === undefined) continue; // an extra plural form such as .few
      assert.deepEqual(fields(text), fields(enText), `${code}: ${key}`);
      assert.ok(text.trim().length > 0, `${code}: ${key} is empty`);
    }
  }
});

test('the core screens are translated in every language (navigation, sports, breathing)', () => {
  const must = Object.keys(en).filter((k) => /^(nav|hub|sport|sportGroup|pull|breathe|settings\.language)\./.test(k));
  for (const [code, table] of Object.entries(others)) {
    const missing = must.filter((k) => table[k] === undefined && table[baseOf(k) + '.other'] === undefined);
    assert.deepEqual(missing, [], `${code} is missing ${missing.join(', ')}`);
  }
});

test('a missing translation falls back to English, and an unknown key shows the key', () => {
  assert.equal(translate('es', 'nav.home'), 'Inicio');
  assert.equal(translate('en', 'nav.home'), 'Home');
  assert.equal(translate('fr', 'common.save'), 'Enregistrer');
  // @ts-expect-error a key that does not exist
  assert.equal(translate('es', 'not.a.key'), 'not.a.key');
});

test('fields are filled and plurals follow the language', () => {
  assert.equal(translate('en', 'hub.food.status', { eaten: 1200, goal: 2000 }), '1200 of 2000 kcal');
  assert.equal(translate('de', 'hub.food.status', { eaten: 1, goal: 2 }), '1 von 2 kcal');
  assert.equal(translate('en', 'breathe.minutes', { n: 3 }), '3 min');
  assert.equal(translate('es', 'hub.healthlog.week', { n: 4 }), '4 esta semana');
  assert.equal(translate('en', 'breathe.summary', { time: '3:00' }), 'You breathed for 3:00.');
});

test('auto follows the phone, a chosen language wins, and anything else is English', () => {
  assert.equal(resolveLanguage('auto', 'es-MX'), 'es');
  assert.equal(resolveLanguage('auto', ['pt-BR', 'en']), 'pt');
  assert.equal(resolveLanguage('auto', ['ja-JP', 'de-AT']), 'de', 'the first language we have');
  assert.equal(resolveLanguage('auto', 'ja'), 'en');
  assert.equal(resolveLanguage('fr', 'es'), 'fr');
  assert.equal(resolveLanguage('xx', 'it'), 'it', 'a bad stored value counts as auto');
  assert.equal(resolveLanguage(undefined, undefined), 'en');
});

test('the language preference defaults to auto and rejects junk', () => {
  assert.equal(DEFAULT_PREFS.language, 'auto');
  assert.equal(sanitizePrefs({ language: 'de' }).language, 'de');
  assert.equal(sanitizePrefs({ language: 'klingon' as never }).language, 'auto');
});
