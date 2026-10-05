// Builds src/data/usda/foods.json: a compact offline food database from the US government's USDA FoodData Central
// (SR Legacy + FNDDS "Survey" foods; public domain, https://fdc.nal.usda.gov/). Run once when the data changes:
//   node tools/build-food-db.mjs <folder with the two unzipped CSV folders>
// The folder must contain FoodData_Central_sr_legacy_food_csv_* and FoodData_Central_survey_food_csv_* directories.
import { createReadStream, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? '.');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'src', 'data', 'usda');
mkdirSync(out, { recursive: true });

const dirOf = (prefix) => {
  const d = readdirSync(root, { withFileTypes: true }).find((e) => e.isDirectory() && e.name.startsWith(prefix));
  if (!d) throw new Error(`Missing ${prefix}* folder in ${root}`);
  return join(root, d.name);
};
const SR = dirOf('FoodData_Central_sr_legacy');
const FN = dirOf('FoodData_Central_survey');

/** Splits one CSV line (quoted fields, doubled quotes). */
const parseLine = (line) => {
  const cells = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      cells.push(cur);
      cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells;
};

const rows = async (file, each) => {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let head = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseLine(line);
    if (!head) {
      head = cells;
      continue;
    }
    const o = {};
    head.forEach((h, i) => (o[h] = cells[i]));
    each(o);
  }
};

// ---- food groups ----
const GROUPS = ['Other', 'Dairy', 'Eggs', 'Meat', 'Poultry', 'Fish and seafood', 'Grains and pasta', 'Bread and baking', 'Fruit', 'Vegetables', 'Beans, nuts and seeds', 'Oils, sauces and spices', 'Sweets and desserts', 'Snacks', 'Drinks', 'Alcohol', 'Meals and dishes'];
const G = Object.fromEntries(GROUPS.map((g, i) => [g, i]));
const SR_CAT = { 1: 'Dairy', 2: 'Oils, sauces and spices', 4: 'Oils, sauces and spices', 5: 'Poultry', 6: 'Meals and dishes', 7: 'Meat', 8: 'Grains and pasta', 9: 'Fruit', 10: 'Meat', 11: 'Vegetables', 12: 'Beans, nuts and seeds', 13: 'Meat', 14: 'Drinks', 15: 'Fish and seafood', 16: 'Beans, nuts and seeds', 17: 'Meat', 18: 'Bread and baking', 19: 'Sweets and desserts', 20: 'Grains and pasta', 21: 'Meals and dishes', 22: 'Meals and dishes', 23: 'Snacks', 24: 'Other', 25: 'Meals and dishes' };
const SKIP_SR_CAT = new Set([3]); // baby foods

const byName = (name, fallback) => {
  const n = name.toLowerCase();
  if (/\b(beer|wine|whiskey|vodka|liqueur|cocktail|gin|rum|brandy|tequila|cider|sake|champagne|margarita)\b/.test(n)) return G.Alcohol;
  if (/\b(egg|eggs|omelet|omelette)\b/.test(n) && !/eggplant|noodle/.test(n)) return G.Eggs;
  if (/\b(juice|soda|cola|coffee|tea|smoothie|lemonade|water|energy drink|sports drink|milkshake|shake)\b/.test(n) && !/ice cream|candy/.test(n)) return G.Drinks;
  if (/\b(pizza|burger|sandwich|taco|burrito|soup|stew|casserole|lasagna|curry|stir.?fry|salad with|sushi|wrap|nuggets|hot dog)\b/.test(n)) return G['Meals and dishes'];
  return fallback;
};

const WWEIA_WORDS = [
  [/milk|cheese|yogurt|cream|dairy/i, 'Dairy'],
  [/egg/i, 'Eggs'],
  [/chicken|turkey|poultry/i, 'Poultry'],
  [/beef|pork|lamb|veal|sausage|bacon|ham|meat|steak|jerky|hot dog|frankfurter/i, 'Meat'],
  [/fish|shrimp|seafood|crab|lobster|tuna|salmon|oyster|clam/i, 'Fish and seafood'],
  [/bread|roll|bagel|muffin|biscuit|tortilla|pancake|waffle|cake|cookie|pie|pastry|doughnut|cracker/i, 'Bread and baking'],
  [/rice|pasta|noodle|cereal|oat|grain|pizza|macaroni/i, 'Grains and pasta'],
  [/fruit|apple|banana|berry|berries|orange|melon|grape/i, 'Fruit'],
  [/vegetable|potato|tomato|carrot|salad|lettuce|broccoli|onion|corn|bean|pepper/i, 'Vegetables'],
  [/nut|seed|peanut|legume|lentil|tofu|hummus/i, 'Beans, nuts and seeds'],
  [/candy|chocolate|sugar|ice cream|dessert|sweet|syrup|jam|gelatin|pudding|frozen/i, 'Sweets and desserts'],
  [/chips|snack|popcorn|pretzel|bar\b/i, 'Snacks'],
  [/soft drink|soda|juice|coffee|tea|water|beverage|drink|smoothie/i, 'Drinks'],
  [/beer|wine|liquor|alcohol|cocktail/i, 'Alcohol'],
  [/soup|sandwich|burger|mixed|dish|entree|burrito|taco|stew|casserole|sushi|fast food/i, 'Meals and dishes'],
  [/oil|fat|sauce|dressing|gravy|spread|butter|margarine|condiment|spice|seasoning/i, 'Oils, sauces and spices'],
];

// ---- nutrients ----
// SR Legacy rows use nutrient ids; the FNDDS survey rows use nutrient numbers (208 is energy, 203 protein, ...).
const NUT_SR = { 1008: 'kcal', 1003: 'p', 1005: 'c', 1004: 'f', 1079: 'fiber', 2000: 'sugar', 1093: 'sodium', 1258: 'sat' };
const NUT_FN = { 208: 'kcal', 203: 'p', 205: 'c', 204: 'f', 291: 'fiber', 269: 'sugar', 307: 'sodium', 606: 'sat' };

const loadFoods = async (dir, type, NUT) => {
  const foods = new Map();
  await rows(join(dir, 'food.csv'), (r) => {
    if (r.data_type === type) foods.set(r.fdc_id, { id: r.fdc_id, name: r.description.trim(), cat: r.food_category_id, n: {}, portions: [] });
  });
  await rows(join(dir, 'food_nutrient.csv'), (r) => {
    const key = NUT[r.nutrient_id];
    if (!key) return;
    const f = foods.get(r.fdc_id);
    if (!f) return;
    const v = parseFloat(r.amount);
    if (Number.isFinite(v) && f.n[key] === undefined) f.n[key] = v;
  });
  return foods;
};

const units = new Map();
await rows(join(SR, 'measure_unit.csv'), (r) => units.set(r.id, r.name));

const addPortions = async (dir, foods) => {
  await rows(join(dir, 'food_portion.csv'), (r) => {
    const f = foods.get(r.fdc_id);
    if (!f) return;
    const g = parseFloat(r.gram_weight);
    if (!(g > 0)) return;
    let label = (r.portion_description || '').trim();
    if (!label || label === 'Quantity not specified') {
      const amount = parseFloat(r.amount);
      const unit = units.get(r.measure_unit_id);
      const mod = (r.modifier || '').trim();
      const u = unit && unit !== 'undetermined' ? unit : '';
      label = [Number.isFinite(amount) && amount > 0 ? (Number.isInteger(amount) ? String(amount) : String(amount)) : '', u, mod].filter(Boolean).join(' ').trim();
      if (!u && mod) label = `${Number.isFinite(amount) && amount > 0 ? amount + ' ' : '1 '}${mod}`.trim();
    }
    label = label.replace(/\s+/g, ' ');
    if (!label || /not specified|^\d*$|90000|guideline|individual school/i.test(label) || label.length > 40) return;
    if (!f.portions.some((p) => p[0] === label)) f.portions.push([label, Math.round(g * 10) / 10, parseInt(r.seq_num || '99', 10) || 99]);
  });
  for (const f of foods.values()) f.portions.sort((a, b) => a[2] - b[2]);
};

const srCats = new Map();
await rows(join(SR, 'food_category.csv'), (r) => srCats.set(r.id, r.description));

const sr = await loadFoods(SR, 'sr_legacy_food', NUT_SR);
await addPortions(SR, sr);
const fn = await loadFoods(FN, 'survey_fndds_food', NUT_FN);
await addPortions(FN, fn);
const wweia = new Map();
await rows(join(FN, 'wweia_food_category.csv'), (r) => wweia.set(r.wweia_food_category, r.wweia_food_category_description));
const fnCat = new Map();
await rows(join(FN, 'survey_fndds_food.csv'), (r) => fnCat.set(r.fdc_id, wweia.get(r.wweia_category_number) ?? ''));

const r1 = (v) => Math.round((v ?? 0) * 10) / 10;
const list = [];
const seen = new Set();
/** FNDDS names carry survey jargon ("NS as to cooking method", "NFS"): drop it so names read like food. */
const tidy = (name) =>
  name
    .replace(/,?\s*NS as to [^,]*/gi, '')
    .replace(/,?\s*NFS\b/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim();

const push = (f, src, group) => {
  if (f.n.kcal === undefined) return;
  f.name = tidy(f.name);
  if (!f.name) return;
  const key = `${src}|${f.name.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  // FNDDS entries are the commonly eaten ones: they come first so search can prefer them.
  list.push([f.name, group, src, Math.round(f.n.kcal), r1(f.n.p), r1(f.n.c), r1(f.n.f), r1(f.n.fiber), r1(f.n.sugar), Math.round(f.n.sodium ?? 0), f.portions.slice(0, 6).map((p) => [p[0], p[1]])]);
};
for (const f of fn.values()) {
  const cat = fnCat.get(f.id) ?? '';
  const hit = WWEIA_WORDS.find(([re]) => re.test(cat) || re.test(f.name));
  push(f, 1, byName(f.name, hit ? G[hit[1]] : G.Other));
}
for (const f of sr.values()) {
  const catId = parseInt(f.cat, 10);
  if (SKIP_SR_CAT.has(catId)) continue;
  if (/\bUSDA Commodity\b/i.test(f.name)) continue;
  const base = G[SR_CAT[catId] ?? 'Other'];
  push(f, 0, byName(f.name, base));
}

writeFileSync(join(out, 'foods.json'), JSON.stringify({ v: 1, groups: GROUPS, foods: list }));
console.log(`wrote ${list.length} foods (${fn.size} FNDDS, ${sr.size} SR scanned)`);
