import { FoodRecord } from './foodDb';

/**
 * Food search that forgives how people type: it matches the start of words as you type ("chick" finds chicken), tolerates a slipped
 * letter ("chiken brest"), understands British and American names ("yoghurt", "aubergine", "courgette") and ranks everyday foods
 * ahead of obscure ones, with the foods you eat often and your favorites on top. It runs on the phone over the bundled database.
 */

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const tokensOf = (s: string): string[] => normalize(s).split(' ').filter(Boolean);

/** Words people type that the database spells another way. Each entry lists extra words to look for. */
const SYNONYMS: Record<string, string[]> = {
  yoghurt: ['yogurt'], yogourt: ['yogurt'], aubergine: ['eggplant'], courgette: ['zucchini'], coriander: ['cilantro'], rocket: ['arugula'],
  prawn: ['shrimp'], prawns: ['shrimp'], mince: ['ground'], minced: ['ground'], crisps: ['chips', 'potato'], chips: ['fries', 'french'], fries: ['french'],
  biscuit: ['cookie', 'biscuits'], biscuits: ['cookie', 'cookies'], sweets: ['candy'], candy: ['sweets'], capsicum: ['pepper'], swede: ['rutabaga'],
  beetroot: ['beet', 'beets'], porridge: ['oatmeal', 'oats'], oats: ['oatmeal'], cornflakes: ['corn', 'flakes'], soda: ['cola', 'soft', 'carbonated'],
  fizzy: ['soda', 'carbonated'], lemonade: ['lemon'], icecream: ['ice', 'cream'], mayo: ['mayonnaise'], ketchup: ['catsup'], pb: ['peanut', 'butter'],
  burger: ['hamburger', 'cheeseburger'], bap: ['roll'], flapjack: ['granola'], tuna: ['tuna'], steak: ['beef'], bacon: ['bacon'], fillet: ['filet'],
  jacket: ['baked'], spud: ['potato'], tatties: ['potato'], pasta: ['spaghetti', 'macaroni'], noodles: ['noodle'], egg: ['eggs'], eggs: ['egg'],
  choc: ['chocolate'], tomatoe: ['tomato'], tomatoes: ['tomato'], potatoes: ['potato'], cheeseburger: ['burger'], sandwich: ['sandwiches'],
};

export interface SearchIndex {
  records: FoodRecord[];
  /** Every distinct word, sorted, for prefix and typo lookups. */
  vocab: string[];
  postings: Map<string, number[]>;
  /** Words of each record's name. */
  words: string[][];
}

export const buildIndex = (records: FoodRecord[]): SearchIndex => {
  const postings = new Map<string, number[]>();
  const words: string[][] = [];
  records.forEach((r, i) => {
    const w = tokensOf(r.brand ? `${r.name} ${r.brand}` : r.name);
    words.push(w);
    for (const t of new Set(w)) {
      const list = postings.get(t);
      if (list) list.push(i);
      else postings.set(t, [i]);
    }
  });
  return { records, vocab: [...postings.keys()].sort(), postings, words };
};

/** True when two words differ by at most {@code max} single-letter edits (insert, delete, change, or swap neighbours). */
export const withinEdits = (a: string, b: string, max: number): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  // Damerau-Levenshtein with an early exit
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= max;
};

/** Index of the first vocab word that is >= prefix (binary search), for walking the words that start with it. */
const lowerBound = (vocab: string[], prefix: string): number => {
  let lo = 0;
  let hi = vocab.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vocab[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

type Match = { word: string; weight: number };

/** The database words one typed word can mean, with how good each match is (exact 1, starts-with 0.8, other spelling 0.7, typo 0.5). */
const expand = (ix: SearchIndex, t: string, isLast: boolean): Match[] => {
  const out = new Map<string, number>();
  const put = (w: string, weight: number) => out.set(w, Math.max(out.get(w) ?? 0, weight));
  if (ix.postings.has(t)) put(t, 1);
  // Words starting with it. Every word is allowed to be a prefix while typing; short ones only for the last word.
  if (t.length >= 2 || isLast) {
    for (let i = lowerBound(ix.vocab, t); i < ix.vocab.length && ix.vocab[i].startsWith(t); i++) {
      if (ix.vocab[i] !== t) put(ix.vocab[i], 0.8);
      if (out.size > 400) break;
    }
  }
  for (const alt of SYNONYMS[t] ?? []) {
    if (ix.postings.has(alt)) put(alt, 0.7);
    for (let i = lowerBound(ix.vocab, alt); i < ix.vocab.length && ix.vocab[i].startsWith(alt); i++) {
      if (ix.vocab[i] !== alt) put(ix.vocab[i], 0.6);
      if (out.size > 400) break;
    }
  }
  // A slipped letter: only when nothing else matched, for words of four letters or more.
  if (out.size === 0 && t.length >= 4) {
    const max = t.length >= 8 ? 2 : 1;
    for (const w of ix.vocab) {
      if (Math.abs(w.length - t.length) <= max && w[0] === t[0] && withinEdits(t, w, max)) put(w, 0.5);
    }
    if (out.size === 0) {
      // First letter wrong too (rare): try without that requirement
      for (const w of ix.vocab) if (Math.abs(w.length - t.length) <= max && withinEdits(t, w, max)) put(w, 0.4);
    }
  }
  return [...out.entries()].map(([word, weight]) => ({ word, weight }));
};

export interface SearchOptions {
  limit?: number;
  /** Extra score for a record (how often you eat it, favorites). */
  boost?: (r: FoodRecord) => number;
  /** Only records the filter keeps. */
  filter?: (r: FoodRecord) => boolean;
}

const SRC_BONUS: Record<string, number> = { mine: 5, curated: 3.5, fndds: 1.6, off: 0.8, sr: 0 };
const PLAIN = /\b(cooked|raw|plain|boiled|baked|grilled|roasted|whole|white|brown|fresh)\b/i;
const PROCESSED: [RegExp, string][] = [
  [/\bcakes?\b/i, 'cake'], [/\bcookies?\b/i, 'cookie'], [/\bsoup\b/i, 'soup'], [/\bsauce\b/i, 'sauce'], [/\bcandy\b/i, 'candy'], [/\bflavored\b/i, 'flavored'],
  [/\bpudding\b/i, 'pudding'], [/\bdressing\b/i, 'dressing'], [/\bchips\b/i, 'chips'], [/\bcereal\b/i, 'cereal'], [/\bburrito\b/i, 'burrito'], [/\bsplit\b/i, 'split'],
];

/** Ranks foods for what was typed. Every typed word has to match (as a word, the start of one, a spelling variant or a typo). */
export const searchFoods = (ix: SearchIndex, query: string, opts: SearchOptions = {}): FoodRecord[] => {
  const q = tokensOf(query);
  if (q.length === 0) return [];
  const limit = opts.limit ?? 40;
  const per = q.map((t, i) => expand(ix, t, i === q.length - 1));
  if (per.some((m) => m.length === 0)) {
    // One word matched nothing at all: drop it and rank on the rest rather than showing nothing.
    const kept = q.map((_, i) => i).filter((i) => per[i].length > 0);
    if (kept.length === 0) return [];
    return searchFoods(ix, kept.map((i) => q[i]).join(' '), opts);
  }

  // Candidates: records that contain at least one match of every typed word (or, failing that, of as many as possible).
  const bestWeight: Map<number, number[]>[] = per.map(() => new Map());
  const sets: Set<number>[] = per.map((matches, qi) => {
    const here = new Set<number>();
    for (const m of matches) {
      for (const id of ix.postings.get(m.word) ?? []) {
        here.add(id);
        const slot = bestWeight[qi];
        const cur = slot.get(id);
        if (!cur) slot.set(id, [m.weight]);
        else cur[0] = Math.max(cur[0], m.weight);
      }
    }
    return here;
  });
  let cand: Set<number> = sets.reduce((a, b) => new Set([...a].filter((id) => b.has(id))));
  if (cand.size === 0 && q.length > 1) {
    // No food has every word ("avocado toast"): show foods that have some of them, the most words first.
    cand = new Set(sets.flatMap((s) => [...s]));
  }

  const scored: { id: number; score: number }[] = [];
  for (const id of cand) {
    const r = ix.records[id];
    if (opts.filter && !opts.filter(r)) continue;
    const w = ix.words[id];
    let score = 0;
    q.forEach((_, qi) => {
      score += 3 * (bestWeight[qi].get(id)?.[0] ?? 0);
    });
    // Plain, basic versions of a food come before processed products made from it
    if (PLAIN.test(r.name)) score += 0.9;
    for (const [re, word] of PROCESSED) if (re.test(r.name) && !q.includes(word)) score -= 1.8;
    // The name starts with what was typed
    const firstMatch = per[0].find((m) => w[0] === m.word);
    if (firstMatch) score += 2.2 * firstMatch.weight;
    // Typed words appear in the same order and side by side
    if (q.length > 1) {
      const pos = q.map((_, qi) => w.findIndex((x) => per[qi].some((m) => m.word === x)));
      if (pos.every((p, i) => p >= 0 && (i === 0 || p === pos[i - 1] + 1))) score += 2;
    }
    // A shorter name is usually the plainer food ("Banana" before "Banana bread with nuts and frosting")
    score -= 0.18 * Math.max(0, w.length - q.length);
    score += SRC_BONUS[r.src] ?? 0;
    score += opts.boost?.(r) ?? 0;
    scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score || ix.records[a.id].name.length - ix.records[b.id].name.length);
  // The hand-picked list and the USDA list overlap: show a food once when the name and calories are the same.
  const seen = new Set<string>();
  const out: FoodRecord[] = [];
  for (const s of scored) {
    const r = ix.records[s.id];
    const key = `${normalize(r.name)}|${r.kcal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
};

/** Splits a food name into pieces, marking the ones that match what was typed, for highlighting. */
export const highlight = (name: string, query: string): { text: string; hit: boolean }[] => {
  const q = tokensOf(query);
  if (q.length === 0) return [{ text: name, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  const re = /[A-Za-z0-9À-ɏ]+|[^A-Za-z0-9À-ɏ]+/g;
  for (const piece of name.match(re) ?? [name]) {
    const n = normalize(piece);
    const hit = n.length > 0 && q.some((t) => n.startsWith(t) || (SYNONYMS[t] ?? []).some((a) => n.startsWith(a)));
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += piece;
    else parts.push({ text: piece, hit });
  }
  return parts;
};
