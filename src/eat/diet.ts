import { tokensOf } from '../lib/foodSearch';

/**
 * Diet filters for the food finder, the ideas and the pantry: vegetarian, vegan, gluten-free, dairy-free, nut-free, and words of your own
 * to avoid. Foods are checked by their food group and the words in their name, which is a good guide and not a guarantee: a name does not
 * list every ingredient. This is for convenience. It is NOT for allergy safety: read the label, every time.
 */

export interface DietPrefs {
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  dairyFree: boolean;
  nutFree: boolean;
  /** Anything else to leave out, separated by commas ("shellfish, soy"). */
  avoid: string;
}

export const NO_DIET: DietPrefs = { vegetarian: false, vegan: false, glutenFree: false, dairyFree: false, nutFree: false, avoid: '' };

export const normalizeDiet = (d: Partial<DietPrefs> | undefined): DietPrefs => ({
  vegetarian: d?.vegetarian === true,
  vegan: d?.vegan === true,
  glutenFree: d?.glutenFree === true,
  dairyFree: d?.dairyFree === true,
  nutFree: d?.nutFree === true,
  avoid: typeof d?.avoid === 'string' ? d.avoid.slice(0, 200) : '',
});

export const avoidWords = (d: DietPrefs): string[] =>
  d.avoid
    .split(/[,;\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2)
    .slice(0, 12);

export const dietActive = (d: DietPrefs): boolean => d.vegetarian || d.vegan || d.glutenFree || d.dairyFree || d.nutFree || avoidWords(d).length > 0;

export const dietLabel = (d: DietPrefs): string => {
  const parts = [d.vegan ? 'vegan' : d.vegetarian ? 'vegetarian' : '', d.glutenFree ? 'gluten-free' : '', d.dairyFree ? 'dairy-free' : '', d.nutFree ? 'nut-free' : '', ...avoidWords(d).map((w) => `no ${w}`)].filter(Boolean);
  return parts.join(', ');
};

// Food groups (index into foodDb GROUPS)
const G = { dairy: 1, eggs: 2, meat: 3, poultry: 4, fish: 5, bread: 7 };

const MEAT = ['chicken', 'beef', 'pork', 'bacon', 'ham', 'sausage', 'turkey', 'lamb', 'veal', 'duck', 'steak', 'meatball', 'pepperoni', 'salami', 'prosciutto', 'hotdog', 'brisket', 'ribs', 'jerky', 'gelatin'];
const FISH = ['fish', 'salmon', 'tuna', 'cod', 'shrimp', 'prawn', 'crab', 'lobster', 'anchovy', 'anchovies', 'sardine', 'mackerel', 'trout', 'tilapia', 'scallop', 'oyster', 'clam', 'mussel', 'squid', 'calamari'];
const VEG_QUALIFIER = ['veggie', 'vegetarian', 'vegan', 'plant', 'bean', 'lentil', 'tofu', 'mushroom'];
const EGG = ['egg', 'mayo', 'mayonnaise', 'omelet', 'omelette', 'meringue'];
const DAIRY = ['milk', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'whey', 'casein', 'ghee', 'custard', 'kefir', 'paneer', 'ricotta', 'mozzarella', 'cheddar', 'parmesan', 'latte', 'cappuccino'];
const PLANT_QUALIFIER = ['almond', 'oat', 'soy', 'soya', 'coconut', 'rice', 'cashew', 'plant', 'vegan', 'peanut', 'cocoa', 'shea', 'sunflower', 'nut', 'hazelnut', 'tartar'];
const HONEY = ['honey'];
const GLUTEN = ['wheat', 'bread', 'pasta', 'noodle', 'spaghetti', 'macaroni', 'barley', 'rye', 'couscous', 'flour', 'bagel', 'bun', 'cracker', 'cereal', 'pizza', 'seitan', 'malt', 'beer', 'croissant', 'muffin', 'pancake', 'waffle', 'biscuit', 'pie', 'cake', 'cookie', 'donut', 'doughnut', 'pretzel', 'lasagna', 'ravioli', 'dumpling', 'breadcrumb', 'granola', 'tortilla', 'pita', 'toast', 'sandwich', 'burger'];
const GLUTEN_SAFE = ['rice', 'corn', 'buckwheat', 'almond', 'coconut', 'chickpea', 'potato', 'quinoa', 'cauliflower', 'lettuce'];
const NUTS = ['nut', 'almond', 'peanut', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'marzipan', 'nutella', 'praline'];
const NUT_NOT = ['coconut', 'nutmeg', 'butternut', 'chestnut', 'doughnut', 'donut', 'nutrition'];

const has = (tokens: string[], word: string): boolean => tokens.some((t) => t === word || t === `${word}s` || t === `${word}es` || (word.endsWith('y') && t === `${word.slice(0, -1)}ies`));
const hasAny = (tokens: string[], words: string[]): boolean => words.some((w) => has(tokens, w));

/** Whether a food (its name, and its food group when known) fits the diet. */
export const fitsDiet = (item: { name: string; group?: number }, d: DietPrefs): boolean => {
  if (!dietActive(d)) return true;
  const tokens = tokensOf(item.name);
  for (const w of avoidWords(d)) {
    const wt = tokensOf(w);
    if (wt.length > 0 && wt.every((x) => has(tokens, x))) return false;
  }
  const noMeat = d.vegetarian || d.vegan;
  if (noMeat) {
    if (item.group === G.meat || item.group === G.poultry || item.group === G.fish) return false;
    const plant = hasAny(tokens, VEG_QUALIFIER);
    if (!plant && hasAny(tokens, MEAT)) return false;
    if (hasAny(tokens, FISH)) return false;
  }
  if (d.vegan) {
    if (item.group === G.dairy || item.group === G.eggs) return false;
    if (hasAny(tokens, EGG) || hasAny(tokens, HONEY)) return false;
  }
  if (d.vegan || d.dairyFree) {
    if (d.dairyFree && item.group === G.dairy) return false;
    if (hasAny(tokens, DAIRY) && !hasAny(tokens, PLANT_QUALIFIER)) return false;
    if (has(tokens, 'ice') && has(tokens, 'cream')) return false;
  }
  if (d.glutenFree) {
    const free = has(tokens, 'gluten') && (has(tokens, 'free') || has(tokens, 'gf'));
    if (!free) {
      if (item.group === G.bread) return false;
      if (hasAny(tokens, GLUTEN)) {
        // "corn tortilla", "rice noodles", "almond flour" and the like are fine; cake and bread are not.
        const safeBase = hasAny(tokens, GLUTEN_SAFE) && !hasAny(tokens, ['bread', 'cake', 'cookie', 'pie', 'cracker', 'bun', 'sandwich', 'burger', 'pizza', 'wheat', 'barley', 'rye', 'seitan', 'malt', 'beer']);
        if (!safeBase) return false;
      }
    }
  }
  if (d.nutFree) {
    if (tokens.some((t) => NUT_NOT.includes(t))) {
      // coconut and nutmeg are not tree nuts; only a real nut word alongside makes it a nut food
      const rest = tokens.filter((t) => !NUT_NOT.includes(t));
      if (hasAny(rest, NUTS)) return false;
    } else if (hasAny(tokens, NUTS)) return false;
  }
  return true;
};
