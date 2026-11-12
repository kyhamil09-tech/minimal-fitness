import { useCallback } from 'react';
import { en, MessageKey, Messages } from '../locales/en';
import { es } from '../locales/es';
import { fr } from '../locales/fr';
import { de } from '../locales/de';
import { pt } from '../locales/pt';
import { it } from '../locales/it';
import { usePrefs } from './prefs';
import { LangCode, Language, resolveLanguage } from './languages';

/**
 * Languages. English is the complete one and the fallback: a message that a language has not translated yet shows in English rather
 * than as a blank or a key. `{name}` in a message is filled from the values passed in; a count `n` picks `.one`, `.other` (and so on)
 * versions of the key by the language's own plural rules.
 */
export { LANGUAGES, LANGUAGE_CODES, resolveLanguage } from './languages';
export type { LangCode, Language } from './languages';

const TABLES: Record<LangCode, Messages> = { en, es, fr, de, pt, it };

const fill = (text: string, vars?: Record<string, string | number>): string =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;

/** Looks a message up in `lang`, falling back to English; picks a plural form when `vars.n` is given. */
export const translate = (lang: LangCode, key: MessageKey, vars?: Record<string, string | number>): string => {
  const table = TABLES[lang] as Record<string, string | undefined>;
  const base = en as Record<string, string | undefined>;
  let text: string | undefined;
  if (vars && typeof vars.n === 'number') {
    let rule = 'other';
    try {
      rule = new Intl.PluralRules(lang).select(vars.n);
    } catch {
      // no plural rules: use the generic form
    }
    text = table[`${key}.${rule}`] ?? table[`${key}.other`] ?? base[`${key}.${rule}`] ?? base[`${key}.other`];
  }
  text = text ?? table[key] ?? base[key] ?? key;
  return fill(text, vars);
};

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

const phoneLanguages = (): readonly string[] | string | undefined => {
  try {
    return navigator.languages?.length ? navigator.languages : navigator.language;
  } catch {
    return undefined;
  }
};

/** The language for a given preference. Use this where the preferences context is not above you (the App component itself provides it). */
export const useLangFor = (language: Language): LangCode => resolveLanguage(language, phoneLanguages());

/** A translate function for a given preference. It changes when the language does, so screens redraw. */
export const useTFor = (language: Language): TFunction => {
  const lang = useLangFor(language);
  return useCallback<TFunction>((key, vars) => translate(lang, key, vars), [lang]);
};

/** The language in force right now (needs the preferences context). */
export const useLang = (): LangCode => useLangFor(usePrefs().prefs.language);

/** A translate function in the app's language, for screens inside the preferences context. */
export const useT = (): TFunction => useTFor(usePrefs().prefs.language);
