import { RecipeFetch, isAndroidApp } from './native';
import { guardRecipePage } from './netGuard';
import { WebRecipe, extractRecipe, urlFrom } from './recipeExtract';
import type { MessageKey } from '../locales/en';

/** A failure is a message key (shown in the app's language), or the plain text of an error from the device. */
export type FetchResult = { ok: true; recipe: WebRecipe; url: string } | { ok: false; errorKey?: MessageKey; error?: string };

/** Downloads the page at an address from some pasted text and reads the recipe on it. */
export const importRecipe = async (text: string): Promise<FetchResult> => {
  const url = urlFrom(text);
  if (!url) return { ok: false, errorKey: 'rcp.err.noUrl' };
  if (!isAndroidApp()) return { ok: false, errorKey: 'rcp.err.web' };
  try {
    const page = await guardRecipePage(url, () => RecipeFetch.fetch({ url }));
    const recipe = extractRecipe(page.html);
    if (!recipe) return { ok: false, errorKey: 'rcp.err.noRecipe' };
    return { ok: true, recipe, url: page.url };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || undefined, errorKey: (e as Error)?.message ? undefined : 'rcp.err.generic' };
  }
};
