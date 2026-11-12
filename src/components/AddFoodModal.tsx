import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Globe, Pencil, Plus, ScanBarcode, Search, Utensils, X, Zap } from 'lucide-react';
import { FoodEntry, Goals, MealType, SavedMeal } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { FoodRecord, UnitKey, amountText, curatedFoods, defaultAmount, displayName, loadUsda, nutrientsFor } from '../lib/foodDb';
import { buildIndex, highlight, searchFoods } from '../lib/foodSearch';
import { searchPackaged } from '../lib/barcode';
import { useFoodLibrary } from '../hooks/useFoodLibrary';
import { haptic } from '../lib/haptics';
import { Ring } from './ui/charts';
import { FoodIcon } from './food/FoodIcon';
import { FoodDetail } from './food/FoodDetail';
import { FoodForm } from './food/FoodForm';
import { FoodScanner } from './food/FoodScanner';
import { useT } from '../lib/i18n';
import { RecipeBuilder } from './food/RecipeBuilder';
import { LabelScanner } from './food/LabelScanner';
import { PhotoMeal } from './food/PhotoMeal';
import { Micros, scaleMicros } from '../lib/micros';
import { Recipe, recipeFoodId } from '../lib/recipe';
import { rememberBarcode } from '../lib/barcodeCache';
import { makeId } from '../lib/ids';
import { macroColors } from './food/MacroDonut';

export type NewFood = Omit<FoodEntry, 'id' | 'date'>;

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ColorPalette;
  defaultMeal: MealType;
  /** Every food entry, newest first: recent foods and how often you eat each come from it. */
  recents: FoodEntry[];
  /** Logs a food and returns its id, so an accidental tap can be undone. */
  onAdd: (food: NewFood) => string | void;
  onUndo?: (id: string) => void;
  /** Foods already logged on the day being edited. */
  dayEntries?: FoodEntry[];
  goals?: Goals;
  savedMeals?: SavedMeal[];
  onSaveMeal?: (name: string, items: SavedMeal['items']) => void;
  onDeleteMeal?: (id: string) => void;
  /** Open straight on the barcode scanner (the quick-add strip's Scan button). */
  startOnScan?: boolean;
  /** Open straight on a new recipe, a recipe import, the create-a-food form or the photo meal. */
  startOn?: 'recipe' | 'import' | 'create' | 'photo';
  /** Open straight on editing this recipe. */
  startRecipe?: Recipe;
  /** Leaves out foods that do not fit (a diet). The finder says so and can show everything again. */
  foodFilter?: (r: FoodRecord) => boolean;
  filterLabel?: string;
}

type LabelValues = { name?: string; serving?: string; kcal?: number; p?: number; c?: number; f?: number; fiber?: number; sugar?: number; sodium?: number };
type View =
  | { k: 'search' }
  | { k: 'detail'; rec: FoodRecord }
  | { k: 'quick' }
  | { k: 'create'; initial?: LabelValues; barcode?: string; micros?: Micros; foundNote?: string }
  | { k: 'scan' }
  | { k: 'photo' }
  | { k: 'label'; barcode?: string }
  | { k: 'recipe' };
type Tab = 'all' | 'recent' | 'fav' | 'mine' | 'meals';
const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const TABS: [Tab, string][] = [['all', 'All'], ['recent', 'Recent'], ['fav', 'Favorites'], ['mine', 'My foods'], ['meals', 'Meals']];

/** The meal that fits the time of day, for when nothing was chosen. */
export const mealForNow = (d = new Date()): MealType => {
  const h = d.getHours();
  return h < 10 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
};

const entryFrom = (rec: FoodRecord, unit: UnitKey, qty: number, meal: MealType): NewFood => {
  const n = nutrientsFor(rec, unit, qty);
  return {
    meal,
    name: displayName(rec),
    calories: n.kcal,
    proteinG: n.p,
    carbsG: n.c,
    fatG: n.f,
    fiberG: n.fiber || undefined,
    sugarG: n.sugar || undefined,
    sodiumMg: n.sodium || undefined,
    micros: n.micros,
    amount: amountText(rec, unit, qty),
    group: rec.group,
  };
};

/** "1 cup (244 g)": the portion a food opens with. */
const defaultPortionText = (r: FoodRecord) => {
  const a = defaultAmount(r);
  return r.perServing ? r.portions[0]?.label ?? '1 serving' : amountText(r, a.unit, a.qty);
};

const Highlighted: React.FC<{ name: string; query: string }> = ({ name, query }) => (
  <>
    {highlight(name, query).map((p, i) => (
      <span key={i} style={p.hit ? { color: 'var(--accent)', fontWeight: 800 } : undefined}>{p.text}</span>
    ))}
  </>
);

const FoodRow: React.FC<{ rec: FoodRecord; query: string; onOpen: () => void; onQuick: () => void; delay?: number }> = ({ rec, query, onOpen, onQuick, delay = 0 }) => {
  const a = defaultAmount(rec);
  const kcal = nutrientsFor(rec, a.unit, a.qty).kcal;
  return (
    <li className="fade-up" style={{ '--i': Math.min(delay, 8) } as React.CSSProperties}>
      <div className="flex items-center gap-3 py-2.5">
        <button onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left" aria-label={`${displayName(rec)}, ${kcal} calories. Open`}>
          <FoodIcon group={rec.group} size={42} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--ink)' }}>
              <Highlighted name={rec.name} query={query} />
              {rec.brand && <span style={{ color: 'var(--ink-dim)', fontWeight: 500 }}> · {rec.brand}</span>}
            </span>
            <span className="block text-xs mt-0.5 truncate" style={{ color: 'var(--ink-dim)' }}>
              {defaultPortionText(rec)}
            </span>
          </span>
          <span className="text-right shrink-0">
            <span className="block text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{kcal}</span>
            <span className="block text-xs tracking-widest font-bold" style={{ color: 'var(--ink-dim)' }}>KCAL</span>
          </span>
        </button>
        <button onClick={onQuick} aria-label={`Add ${displayName(rec)} now`} className="round-btn !w-10 !h-10 shrink-0" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }}>
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </li>
  );
};

export const AddFoodModal: React.FC<AddFoodModalProps> = ({
  isOpen,
  onClose,
  theme,
  defaultMeal,
  recents,
  onAdd,
  onUndo,
  dayEntries = [],
  goals,
  savedMeals = [],
  onSaveMeal,
  onDeleteMeal,
  startOnScan = false,
  startOn,
  startRecipe: recipeToEdit,
  foodFilter,
  filterLabel = '',
}) => {
  const [filterOff, setFilterOff] = useState(false);
  const filterOn = !!foodFilter && !filterOff;
  const tr = useT();
  const lib = useFoodLibrary(recents);
  const [view, setView] = useState<View>({ k: 'search' });
  const [tab, setTab] = useState<Tab>('all');
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [query, setQuery] = useState('');
  const [usda, setUsda] = useState<FoodRecord[] | null>(null);
  const [online, setOnline] = useState<{ q: string; state: 'idle' | 'loading' | 'error'; results: FoodRecord[]; error: string }>({ q: '', state: 'idle', results: [], error: '' });
  const [added, setAdded] = useState({ n: 0, kcal: 0 });
  const [toast, setToast] = useState<{ text: string; id?: string; at: number } | null>(null);
  const [mealName, setMealName] = useState('');
  // A recipe being built or changed, and whether the next food picked goes into it instead of the diary.
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [recipeEditing, setRecipeEditing] = useState(false);
  const adding = recipe !== null && view.k !== 'recipe';
  const inputRef = useRef<HTMLInputElement>(null);

  // Each time it opens: the meal for the time of day (or the one asked for), a clean search, and the big database loading in the background.
  useEffect(() => {
    if (!isOpen) return;
    setView(startOnScan ? { k: 'scan' } : { k: 'search' });
    setTab('all');
    setMeal(defaultMeal);
    setQuery('');
    setOnline({ q: '', state: 'idle', results: [], error: '' });
    setAdded({ n: 0, kcal: 0 });
    setToast(null);
    setFilterOff(false);
    setMealName('');
    setRecipe(null);
    let live = true;
    void loadUsda().then((r) => live && setUsda(r));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const index = useMemo(() => (isOpen ? buildIndex([...lib.mine, ...curatedFoods(), ...(usda ?? [])]) : null), [isOpen, usda, lib.mine]);
  const q = query.trim();
  const results = useMemo(() => {
    const found = index && q.length > 0 ? searchFoods(index, q, { limit: 120, boost: lib.boost }) : [];
    return (filterOn ? found.filter(foodFilter!) : found).slice(0, 60);
  }, [index, q, lib.boost, filterOn, foodFilter]);

  // Recent foods, once each, newest first.
  const recentList = useMemo(() => {
    const out: FoodEntry[] = [];
    const seen = new Set<string>();
    for (const r of recents) {
      const k = r.name;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
      if (out.length >= 40) break;
    }
    return out;
  }, [recents]);

  const popular = useMemo(() => curatedFoods().filter((r) => !filterOn || foodFilter!(r)).slice(0, 12), [filterOn, foodFilter]);

  // dayEntries already includes what was added in this visit (the diary updates as you go).
  const eaten = dayEntries.reduce((s, e) => s + e.calories, 0);
  const sums = dayEntries.reduce((s, e) => ({ p: s.p + e.proteinG, c: s.c + e.carbsG, f: s.f + e.fatG }), { p: 0, c: 0, f: 0 });
  const col = macroColors(theme);

  const log = (food: NewFood, label: string) => {
    const id = onAdd(food);
    setAdded((a) => ({ n: a.n + 1, kcal: a.kcal + food.calories }));
    setToast({ text: `Added ${label}`, id: typeof id === 'string' ? id : undefined, at: Date.now() });
    haptic.success();
  };
  /** A food picked while building a recipe becomes an ingredient (and returns to the recipe). */
  const ingredient = (rec: FoodRecord, unit: UnitKey, qty: number) => {
    const f = entryFrom(rec, unit, qty, meal);
    setRecipe((r) =>
      r
        ? {
            ...r,
            ingredients: [...r.ingredients, { name: f.name, amount: f.amount, kcal: f.calories, p: f.proteinG, c: f.carbsG, f: f.fatG, fiber: f.fiberG, sugar: f.sugarG, sodium: f.sodiumMg, micros: f.micros, group: f.group }],
          }
        : r
    );
    setView({ k: 'recipe' });
  };
  const quick = (rec: FoodRecord) => {
    const a = defaultAmount(rec);
    if (recipe) return ingredient(rec, a.unit, a.qty);
    if (rec.barcode) rememberBarcode(rec);
    log(entryFrom(rec, a.unit, a.qty, meal), displayName(rec));
  };
  const [importFirst, setImportFirst] = useState(false);
  const startRecipe = (existing?: Recipe, importNow = false) => {
    setImportFirst(importNow);
    setRecipe(existing ?? { id: makeId('rcp'), name: '', servings: 4, ingredients: [] });
    setRecipeEditing(!!existing);
    setView({ k: 'recipe' });
  };
  // Opened from outside on a particular page.
  useEffect(() => {
    if (!isOpen) return;
    if (recipeToEdit) startRecipe(recipeToEdit);
    else if (startOn === 'recipe') startRecipe();
    else if (startOn === 'import') startRecipe(undefined, true);
    else if (startOn === 'create') setView({ k: 'create' });
    else if (startOn === 'photo') setView({ k: 'photo' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const relog = (e: FoodEntry) => {
    const { id: _id, date: _date, ...rest } = e;
    log({ ...rest, meal }, e.name);
  };

  const doOnline = async () => {
    if (q.length < 2) return;
    setOnline({ q, state: 'loading', results: [], error: '' });
    try {
      const r = await searchPackaged(q);
      setOnline({ q, state: 'idle', results: r, error: '' });
    } catch (e: any) {
      setOnline({ q, state: 'error', results: [], error: e?.message || 'Search failed. Check your connection.' });
    }
  };

  const mealEntries = dayEntries.filter((e) => e.meal === meal);
  const saveCurrentAsMeal = () => {
    const name = mealName.trim();
    if (!name || mealEntries.length === 0 || !onSaveMeal) return;
    onSaveMeal(name, mealEntries.map((e) => ({ name: e.name, calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG })));
    setMealName('');
    setToast({ text: `Saved ${name}`, at: Date.now() });
  };

  if (!isOpen) return null;

  const showSearchResults = q.length > 0;
  const nothingFound = showSearchResults && results.length === 0;
  const remainingText = goals ? goals.dailyCalories - eaten : null;

  const renderSearch = () => (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      {adding && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5" style={{ backgroundColor: 'var(--card-2)', border: '1px solid var(--hairline-strong)', color: 'var(--ink)' }} role="status">
          <span className="min-w-0 truncate text-xs font-semibold">Adding to {recipe?.name.trim() || 'your recipe'}</span>
          <button onClick={() => setView({ k: 'recipe' })} className="shrink-0 text-xs font-extrabold" style={{ color: 'var(--accent)' }}>
            Back to recipe
          </button>
        </div>
      )}
      <div className="px-4 pt-1 pb-2 flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold" style={{ color: 'var(--ink)' }}>Add food</h2>
        <button aria-label="Close" onClick={onClose} className="round-btn !w-10 !h-10">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 flex gap-2 overflow-x-auto no-scrollbar pb-2" role="radiogroup" aria-label="Meal">
        {MEALS.map((m) => (
          <button key={m} role="radio" aria-checked={meal === m} onClick={() => setMeal(m)} className="sport-pill shrink-0">
            {m}
          </button>
        ))}
      </div>

      {goals && (
        <div className="mx-4 mb-2 rounded-3xl border px-3.5 py-2.5 flex items-center gap-3" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
          <Ring value={Math.max(0, Math.min(1, eaten / goals.dailyCalories))} size={46} stroke={5} color={remainingText !== null && remainingText < 0 ? '#F43F5E' : theme.primary} ariaLabel={`${eaten} of ${goals.dailyCalories} calories eaten`}>
            <span className="text-xs font-extrabold" style={{ color: 'var(--ink)' }}>{Math.round((eaten / goals.dailyCalories) * 100)}%</span>
          </Ring>
          <div className="flex-1 min-w-0">
            <div className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              <span className="font-extrabold text-sm" style={{ color: remainingText !== null && remainingText < 0 ? '#F43F5E' : 'var(--ink)' }}>{Math.abs(remainingText ?? 0)}</span> kcal {remainingText !== null && remainingText < 0 ? 'over' : 'left today'}
            </div>
            <div className="flex gap-3 mt-1 text-xs font-mono" style={{ color: 'var(--ink-dim)' }}>
              <span><i className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: col.p }} />P {Math.round(sums.p)}</span>
              <span><i className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: col.c }} />C {Math.round(sums.c)}</span>
              <span><i className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: col.f }} />F {Math.round(sums.f)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-2xl border px-3" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline-strong)' }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-dim)' }} />
          <input
            ref={inputRef}
            aria-label="Search foods"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (tab !== 'all') setTab('all');
            }}
            placeholder={usda ? 'Search 13,000+ foods' : 'Search foods'}
            autoCapitalize="none"
            className="bare-input flex-1 min-w-0 py-3 text-[15px] outline-none"
            style={{ color: 'var(--ink)', background: 'transparent', border: 'none', boxShadow: 'none' }}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="p-1" style={{ color: 'var(--ink-dim)' }}>
              <X className="w-4 h-4" />
            </button>
          )}
          <button aria-label="Scan a barcode" onClick={() => setView({ k: 'scan' })} className="p-1.5 rounded-xl" style={{ color: 'var(--accent)' }}>
            <ScanBarcode className="w-5 h-5" />
          </button>
        </div>
      </div>

      {!showSearchResults && (
        <div className="px-4 flex gap-1.5 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Food lists">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="sport-pill shrink-0 !py-1.5 !px-3 !text-xs">
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-28">
        {foodFilter && (
          <p className="flex items-center justify-between gap-2 py-2 text-xs" style={{ color: 'var(--ink-dim)' }}>
            <span>{filterOn ? `Hiding foods that do not fit: ${filterLabel}.` : 'Showing every food.'}</span>
            <button type="button" className="min-h-9 shrink-0 font-bold underline" style={{ color: 'var(--accent)' }} onClick={() => setFilterOff((v) => !v)}>
              {filterOn ? 'Show all' : 'Use my diet'}
            </button>
          </p>
        )}
        {showSearchResults ? (
          <>
            {!usda && results.length < 5 && <p className="text-xs py-1" style={{ color: 'var(--ink-dim)' }}>Loading the full food list...</p>}
            <ul className="row-divide">
              {results.map((r, i) => (
                <FoodRow key={r.id} rec={r} query={q} delay={i} onOpen={() => setView({ k: 'detail', rec: r })} onQuick={() => quick(r)} />
              ))}
            </ul>
            {nothingFound && usda && (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--ink-dim)' }}>
                Nothing found for “{q}”.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {online.q === q && online.state === 'idle' && online.results.length === 0 && (
                <p className="text-xs px-1" style={{ color: 'var(--ink-dim)' }}>No packaged foods found for “{q}”.</p>
              )}
              {online.q !== q ? (
                <button
                  onClick={doOnline}
                  disabled={q.length < 2 || online.state === 'loading'}
                  className="w-full rounded-2xl border px-4 py-3 flex items-center gap-3 text-left"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
                >
                  <Globe className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="flex-1">
                    <span className="block text-[13px] font-bold">Search packaged foods online</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-dim)' }}>Brands and products from Open Food Facts. Only “{q}” is sent, when you tap.</span>
                  </span>
                </button>
              ) : null}
              {online.q === q && online.state === 'loading' && (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--card)' }} />
                  ))}
                </div>
              )}
              {online.q === q && online.state === 'error' && <p role="alert" className="text-xs" style={{ color: 'var(--g-red)' }}>{online.error}</p>}
              {online.q === q && online.state === 'idle' && online.results.length > 0 && (
                <>
                  <div className="text-xs font-bold uppercase tracking-wider pt-2" style={{ color: 'var(--ink-dim)' }}>Packaged foods</div>
                  <ul className="row-divide">
                    {(filterOn ? online.results.filter(foodFilter!) : online.results).map((r, i) => (
                      <FoodRow key={r.id + i} rec={r} query={q} delay={i} onOpen={() => setView({ k: 'detail', rec: r })} onQuick={() => quick(r)} />
                    ))}
                  </ul>
                </>
              )}
              <button onClick={() => setView({ k: 'create' })} className="w-full rounded-2xl border border-dashed px-4 py-3 text-left text-[13px] font-bold" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
                <Pencil className="inline w-4 h-4 mr-2" style={{ color: 'var(--accent)' }} />
                Create “{q}” yourself
              </button>
            </div>
          </>
        ) : tab === 'all' ? (
          <>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[
                { label: 'Scan', icon: <ScanBarcode className="w-5 h-5" />, go: () => setView({ k: 'scan' }) },
                { label: 'Photo', icon: <Camera className="w-5 h-5" />, go: () => setView({ k: 'photo' }) },
                { label: 'Quick add', icon: <Zap className="w-5 h-5" />, go: () => setView({ k: 'quick' }) },
                { label: 'Create food', icon: <Pencil className="w-5 h-5" />, go: () => setView({ k: 'create' }) },
                { label: tr('rcp.tile'), icon: <Utensils className="w-5 h-5" />, go: () => startRecipe(undefined, true) },
              ].map((t, i) => (
                <button key={t.label} onClick={t.go} className="pop-in rounded-2xl border py-3 flex flex-col items-center gap-1.5" style={{ '--i': i, backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' } as React.CSSProperties}>
                  <span style={{ color: 'var(--accent)' }}>{t.icon}</span>
                  <span className="text-xs font-bold">{t.label}</span>
                </button>
              ))}
            </div>
            {recentList.length > 0 && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider pt-4 pb-1" style={{ color: 'var(--ink-dim)' }}>Recent</div>
                <ul className="row-divide">
                  {recentList.slice(0, 6).map((e, i) => (
                    <RecentRow key={e.id} entry={e} delay={i} onRelog={() => relog(e)} />
                  ))}
                </ul>
              </>
            )}
            {lib.favorites.length > 0 && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider pt-4 pb-1" style={{ color: 'var(--ink-dim)' }}>Favorites</div>
                <ul className="row-divide">
                  {lib.favorites.slice(0, 4).map((r, i) => (
                    <FoodRow key={r.id} rec={r} query="" delay={i} onOpen={() => setView({ k: 'detail', rec: r })} onQuick={() => quick(r)} />
                  ))}
                </ul>
              </>
            )}
            <div className="text-xs font-bold uppercase tracking-wider pt-4 pb-1" style={{ color: 'var(--ink-dim)' }}>Common foods</div>
            <ul className="row-divide">
              {popular.map((r, i) => (
                <FoodRow key={r.id} rec={r} query="" delay={i} onOpen={() => setView({ k: 'detail', rec: r })} onQuick={() => quick(r)} />
              ))}
            </ul>
          </>
        ) : tab === 'recent' ? (
          recentList.length === 0 ? (
            <Empty text="Foods you log will show up here for one-tap adding." />
          ) : (
            <ul className="row-divide">
              {recentList.map((e, i) => (
                <RecentRow key={e.id} entry={e} delay={i} onRelog={() => relog(e)} />
              ))}
            </ul>
          )
        ) : tab === 'fav' ? (
          lib.favorites.length === 0 ? (
            <Empty text="Tap the star on a food to keep it here." />
          ) : (
            <ul className="row-divide">
              {lib.favorites.map((r, i) => (
                <FoodRow key={r.id} rec={r} query="" delay={i} onOpen={() => setView({ k: 'detail', rec: r })} onQuick={() => quick(r)} />
              ))}
            </ul>
          )
        ) : tab === 'mine' ? (
          <>
            <button onClick={() => setView({ k: 'create' })} className="w-full rounded-2xl border border-dashed px-4 py-3 my-2 text-left text-[13px] font-bold" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
              <Plus className="inline w-4 h-4 mr-2" style={{ color: 'var(--accent)' }} /> Create a food
            </button>
            <button onClick={() => startRecipe()} className="w-full rounded-2xl border border-dashed px-4 py-3 mb-2 text-left text-[13px] font-bold" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
              <Utensils className="inline w-4 h-4 mr-2" style={{ color: 'var(--accent)' }} /> Build a recipe from ingredients
            </button>
            {lib.mine.length === 0 ? (
              <Empty text="Foods you create (a recipe, a home-made dish, something from a label) are kept here." />
            ) : (
              <ul className="row-divide">
                {lib.mine.map((r, i) => {
                  const rcp = lib.recipes.find((x) => recipeFoodId(x.id) === r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <FoodRow rec={r} query="" delay={i} onOpen={() => setView({ k: 'detail', rec: r })} onQuick={() => quick(r)} />
                      {rcp && (
                        <li className="-mt-1 pb-2 pl-14">
                          <button onClick={() => startRecipe(rcp)} className="text-xs font-extrabold" style={{ color: 'var(--accent)' }} aria-label={`Edit the recipe ${rcp.name}`}>
                            Edit recipe · {rcp.ingredients.length} ingredient{rcp.ingredients.length === 1 ? '' : 's'}, {rcp.servings} servings
                          </button>
                        </li>
                      )}
                    </React.Fragment>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-3 pt-2">
            {savedMeals.length === 0 ? (
              <Empty text="No saved meals yet. Log the foods for a meal, then save them here to add the whole thing in one tap." />
            ) : (
              <ul className="row-divide">
                {savedMeals.map((m) => {
                  const kcal = m.items.reduce((s, i) => s + i.calories, 0);
                  return (
                    <li key={m.id} className="py-2.5 flex items-center gap-3">
                      <FoodIcon group={16} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.name}</div>
                        <div className="text-xs" style={{ color: 'var(--ink-dim)' }}>{m.items.length} item{m.items.length === 1 ? '' : 's'} · {kcal} kcal</div>
                      </div>
                      {onDeleteMeal && (
                        <button onClick={() => onDeleteMeal(m.id)} aria-label={`Delete ${m.name}`} className="text-xs" style={{ color: 'var(--ink-dim)' }}>Delete</button>
                      )}
                      <button
                        onClick={() => {
                          for (const item of m.items) log({ meal, ...item }, item.name);
                        }}
                        aria-label={`Add ${m.name}`}
                        className="round-btn !w-10 !h-10 shrink-0"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }}
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {onSaveMeal && (
              <div className="rounded-3xl border p-3.5 space-y-2" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
                <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                  {mealEntries.length > 0 ? `Save the ${mealEntries.length} item${mealEntries.length === 1 ? '' : 's'} logged for ${meal} today as one meal.` : `Nothing is logged for ${meal} today yet. Add foods first, then save them as a meal.`}
                </p>
                <div className="flex gap-2">
                  <input aria-label="Meal name" value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="Name, e.g. Usual breakfast" className="flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--hairline)', color: 'var(--ink)' }} />
                  <button onClick={saveCurrentAsMeal} disabled={!mealName.trim() || mealEntries.length === 0} className="px-4 rounded-xl text-xs font-extrabold disabled:opacity-40" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>Save</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add food"
      className="fixed inset-0 z-[60] flex flex-col"
      style={{
        background:
          'radial-gradient(70% 36% at 10% -6%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 72%), radial-gradient(60% 30% at 105% 105%, color-mix(in srgb, var(--accent-2) 14%, transparent), transparent 72%), var(--bg)',
      }}
    >
      <div className="max-w-lg w-full mx-auto flex-1 flex flex-col min-h-0 pt-[max(0.75rem,env(safe-area-inset-top))] relative">
        {view.k === 'search' && renderSearch()}
        {view.k === 'detail' && (
          <FoodDetail
            theme={theme}
            rec={view.rec}
            meal={meal}
            onMeal={setMeal}
            favorite={lib.isFavorite(view.rec)}
            onToggleFavorite={() => lib.toggleFavorite(view.rec)}
            onBack={() => setView({ k: 'search' })}
            onDelete={view.rec.src === 'mine' ? () => { lib.removeMine(view.rec.id); setView({ k: 'search' }); } : undefined}
            addLabel={recipe ? 'Add to recipe' : undefined}
            onAdd={(unit, qty) => {
              if (recipe) return ingredient(view.rec, unit, qty);
              if (view.rec.barcode) rememberBarcode(view.rec);
              log(entryFrom(view.rec, unit, qty, meal), displayName(view.rec));
              setView({ k: 'search' });
            }}
          />
        )}
        {(view.k === 'quick' || view.k === 'create') && (
          <FoodForm
            mode={view.k}
            initial={view.k === 'create' ? view.initial : undefined}
            barcode={view.k === 'create' ? view.barcode : undefined}
            micros={view.k === 'create' ? view.micros : undefined}
            foundNote={view.k === 'create' ? view.foundNote : undefined}
            initialName={view.k === 'create' && !view.initial ? q : ''}
            meal={meal}
            onMeal={setMeal}
            onBack={() => setView({ k: 'search' })}
            onSubmit={(rec, keep) => {
              if (keep) lib.addMine(rec);
              // A product typed in or read from its label is remembered under its barcode: the next scan finds it, offline.
              if (rec.barcode) rememberBarcode(rec);
              log(entryFrom(rec, 'p0', 1, meal), rec.name);
              setView({ k: 'search' });
            }}
          />
        )}
        {view.k === 'recipe' && recipe && (
          <RecipeBuilder
            draft={recipe}
            onChange={setRecipe}
            editing={recipeEditing}
            startImport={importFirst}
            findFoods={(q) => (index ? searchFoods(index, q, { limit: 6, boost: lib.boost }) : [])}
            onAddIngredient={() => setView({ k: 'search' })}
            onBack={() => {
              setRecipe(null);
              setView({ k: 'search' });
            }}
            onSave={() => {
              lib.saveRecipe({ ...recipe, name: recipe.name.trim() });
              setToast({ text: `Saved ${recipe.name.trim()}: find it under My foods`, at: Date.now() });
              setRecipe(null);
              setTab('mine');
              setView({ k: 'search' });
            }}
          />
        )}
        {view.k === 'photo' && (
          <PhotoMeal
            onBack={() => setView({ k: 'search' })}
            findFoods={(q) => (index ? searchFoods(index, q, { limit: 6, boost: lib.boost }) : [])}
            onPick={(rec) => setView({ k: 'detail', rec })}
          />
        )}
        {view.k === 'scan' && (
          <FoodScanner
            onBack={() => setView({ k: 'search' })}
            onFound={(rec) => setView({ k: 'detail', rec })}
            onLabel={(barcode) => setView({ k: 'label', barcode })}
            onCreate={(barcode) => setView({ k: 'create', barcode })}
          />
        )}
        {view.k === 'label' && (
          <LabelScanner
            onBack={() => setView({ k: 'scan' })}
            onRead={(p) => {
              const per100 = p.basis === '100g';
              const g = p.servingG ?? 0;
              // A label that lists 100 g is turned into one serving when the serving size is known, else kept as it is.
              const k = per100 && g > 0 ? g / 100 : 1;
              const sc = (v: number | undefined, d = 1) => (v === undefined ? undefined : Math.round(v * k * 10 ** d) / 10 ** d);
              const found = p.found.length ? `Read from the label: ${p.found.join(', ')}.` : '';
              setView({
                k: 'create',
                barcode: view.barcode,
                micros: per100 && k !== 1 ? scaleMicros(p.micros, k) : p.micros,
                foundNote: found,
                initial: {
                  serving: p.servingText ?? (per100 && g > 0 ? `${g} g` : per100 ? '100 g' : undefined),
                  kcal: sc(p.kcal, 0),
                  p: sc(p.proteinG),
                  c: sc(p.carbsG),
                  f: sc(p.fatG),
                  fiber: sc(p.fiberG),
                  sugar: sc(p.sugarG),
                  sodium: sc(p.sodiumMg, 0),
                },
              });
            }}
          />
        )}

        {/* Added so far, and the way out */}
        {view.k === 'search' && (
          <div className="absolute inset-x-0 bottom-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none" style={{ background: 'linear-gradient(to top, var(--bg) 55%, transparent)' }}>
            {toast && (
              <div className="pointer-events-auto mb-2 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 slide-in" role="status" style={{ backgroundColor: 'var(--card-2)', border: '1px solid var(--hairline-strong)', color: 'var(--ink)' }}>
                <span className="text-xs font-semibold truncate">{toast.text}</span>
                {toast.id && onUndo && (
                  <button
                    onClick={() => {
                      onUndo(toast.id as string);
                      setAdded((a) => ({ n: Math.max(0, a.n - 1), kcal: a.kcal }));
                      setToast({ text: 'Removed', at: Date.now() });
                    }}
                    className="text-xs font-extrabold shrink-0"
                    style={{ color: 'var(--accent)' }}
                  >
                    Undo
                  </button>
                )}
              </div>
            )}
            {added.n > 0 && (
              <button onClick={onClose} className="pointer-events-auto w-full py-3.5 rounded-2xl text-sm font-extrabold" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
                Done · {added.n} added
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-sm text-center py-10 px-6 leading-relaxed" style={{ color: 'var(--ink-dim)' }}>{text}</p>
);

const RecentRow: React.FC<{ entry: FoodEntry; onRelog: () => void; delay: number }> = ({ entry, onRelog, delay }) => (
  <li className="fade-up" style={{ '--i': Math.min(delay, 8) } as React.CSSProperties}>
    <div className="flex items-center gap-3 py-2.5">
      <FoodIcon group={entry.group ?? 0} size={42} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--ink)' }}>{entry.name}</div>
        <div className="text-xs truncate" style={{ color: 'var(--ink-dim)' }}>{entry.amount ?? `P ${entry.proteinG} · C ${entry.carbsG} · F ${entry.fatG}`}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{entry.calories}</div>
        <div className="text-xs tracking-widest font-bold" style={{ color: 'var(--ink-dim)' }}>KCAL</div>
      </div>
      <button onClick={onRelog} aria-label={`Add ${entry.name} again`} className="round-btn !w-10 !h-10 shrink-0" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'transparent' }}>
        <Plus className="w-5 h-5" />
      </button>
    </div>
  </li>
);
