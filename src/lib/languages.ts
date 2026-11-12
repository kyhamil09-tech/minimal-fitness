/** The languages the app offers. Kept apart from the translator so preferences can use it without a circular import. */
export type LangCode = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it';
export type Language = 'auto' | LangCode;

/** Each language's name in its own language, which is how people look for it. */
export const LANGUAGES: { code: LangCode; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
];

export const LANGUAGE_CODES: readonly Language[] = ['auto', ...LANGUAGES.map((l) => l.code)];

/** The language to use: the chosen one, or the phone's when set to auto (English if the phone's is not one of ours). */
export const resolveLanguage = (pref: Language | string | undefined, phone: string | readonly string[] | undefined): LangCode => {
  if (pref && pref !== 'auto' && LANGUAGES.some((l) => l.code === pref)) return pref as LangCode;
  const list = typeof phone === 'string' ? [phone] : phone ? [...phone] : [];
  for (const tag of list) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    const hit = LANGUAGES.find((l) => l.code === base);
    if (hit) return hit.code;
  }
  return 'en';
};
