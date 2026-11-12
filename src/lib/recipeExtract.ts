/**
 * Reading a recipe out of a web page that has already been downloaded. Almost every recipe site describes its recipe to search engines in
 * a block of structured data (schema.org "Recipe"): the name, the servings, one string per ingredient and often the nutrition. This
 * finds that block, so the ingredients and servings come out without the page's story, photos or adverts. Pure text work, no network.
 */

export interface SiteNutrition {
  /** Per serving, as the site states it. Sodium is in mg. */
  kcal: number;
  p: number;
  c: number;
  f: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export interface WebRecipe {
  name: string;
  servings?: number;
  lines: string[];
  nutrition?: SiteNutrition;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

/** Turns HTML text into plain text: tags removed, entities decoded, spaces tidied. */
export const plain = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10) || 32))
    .replace(/&([a-z0-9]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

const firstNumber = (v: unknown): number | undefined => {
  const m = /(\d+(?:[.,]\d+)?)/.exec(String(v ?? ''));
  return m ? parseFloat(m[1].replace(',', '.')) : undefined;
};

/** A nutrition value with its unit ("12 g", "800 mg", "250 kcal"), in grams (or mg when `mg` is set). */
const amount = (v: unknown, mg = false): number | undefined => {
  const n = firstNumber(v);
  if (n === undefined) return undefined;
  const s = String(v).toLowerCase();
  if (mg) return /\bmg\b|milligram/.test(s) ? n : /\bg\b|gram/.test(s) ? n * 1000 : n;
  return /\bmg\b|milligram/.test(s) ? n / 1000 : n;
};

const parseYield = (v: unknown): number | undefined => {
  const list = Array.isArray(v) ? v : [v];
  const text = list.map(String);
  // Prefer an entry that says servings ("4 servings") over one that says what it makes ("8 slices").
  const best = text.find((t) => /serv/i.test(t)) ?? text[0];
  const n = firstNumber(best);
  if (n === undefined) return undefined;
  const r = Math.round(n);
  return r >= 1 && r <= 60 ? r : undefined;
};

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

const isRecipe = (o: unknown): o is Record<string, unknown> => {
  if (!o || typeof o !== 'object') return false;
  const t = (o as Record<string, unknown>)['@type'];
  return asList(t).some((x) => String(x).toLowerCase() === 'recipe');
};

/** The first node of type Recipe anywhere in the structured data (it may sit in a list, or inside @graph). */
const findRecipe = (node: unknown, depth = 0): Record<string, unknown> | null => {
  if (depth > 6 || !node || typeof node !== 'object') return null;
  if (isRecipe(node)) return node;
  const values = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>);
  for (const v of values) {
    const hit = findRecipe(v, depth + 1);
    if (hit) return hit;
  }
  return null;
};

const parseBlock = (raw: string): unknown => {
  const text = raw.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    // some sites leave raw line breaks inside strings
    try {
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return null;
    }
  }
};

const cleanLine = (s: string): string => plain(s).replace(/^[\s•\-*▢☐□]+/, '');

const nutritionOf = (n: unknown): SiteNutrition | undefined => {
  if (!n || typeof n !== 'object') return undefined;
  const o = n as Record<string, unknown>;
  const kcal = amount(o.calories);
  if (kcal === undefined || kcal <= 0) return undefined;
  return {
    kcal,
    p: amount(o.proteinContent) ?? 0,
    c: amount(o.carbohydrateContent) ?? 0,
    f: amount(o.fatContent) ?? 0,
    fiber: amount(o.fiberContent),
    sugar: amount(o.sugarContent),
    sodium: amount(o.sodiumContent, true),
  };
};

const titleOf = (html: string): string => {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i.exec(html);
  const t = og?.[1] ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  return plain(t).replace(/\s*[|–—-]\s*[^|–—-]{2,40}$/, '').slice(0, 60);
};

/** The recipe on a page, or null when the page does not describe one. */
export const extractRecipe = (html: string): WebRecipe | null => {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const r = findRecipe(parseBlock(m[1]));
    if (!r) continue;
    const lines = asList(r.recipeIngredient ?? r.ingredients)
      .map((x) => cleanLine(String(x)))
      .filter((l) => l.length > 1);
    if (lines.length === 0) continue;
    const name = typeof r.name === 'string' ? plain(r.name).slice(0, 60) : titleOf(html);
    return { name: name || titleOf(html), servings: parseYield(r.recipeYield), lines, nutrition: nutritionOf(r.nutrition) };
  }
  // Older pages use microdata attributes in the page itself.
  const lines = [...html.matchAll(/itemprop=["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\/(?:li|span|p|div)>/gi)].map((m) => cleanLine(m[1])).filter((l) => l.length > 1);
  if (lines.length === 0) return null;
  const y = /itemprop=["']recipeYield["'][^>]*>([\s\S]*?)<\/(?:li|span|p|div)>/i.exec(html);
  return { name: titleOf(html), servings: y ? parseYield(plain(y[1])) : undefined, lines };
};

/** The first web address in some pasted text. An http address is upgraded to https. */
export const urlFrom = (text: string): string | null => {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text.trim());
  if (!m) return null;
  try {
    const u = new URL(m[0].replace(/[),.;]+$/, ''));
    if (!u.hostname.includes('.') || u.username || u.password) return null;
    u.protocol = 'https:';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
};
