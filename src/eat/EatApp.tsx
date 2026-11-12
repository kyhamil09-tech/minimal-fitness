import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, ChefHat, Salad, SlidersHorizontal } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { BodyEntry, FoodEntry, Goals, MealType, SavedMeal, UserProfile, WaterEntry } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { usePersistentState } from '../hooks/usePersistentState';
import { useMealPlan } from '../hooks/useMealPlan';
import { useBack } from '../lift/back';
import { useMiniLook } from '../hooks/useMiniLook';
import { todayKey } from '../lib/dates';
import { syncEatReminders } from '../lib/notifications';
import { Recipe } from '../lib/recipe';
import { mealNow } from '../lib/quickFood';
import { AddFoodModal } from '../components/AddFoodModal';
import { VoiceLogCard } from '../components/VoiceLogCard';
import { Cook } from './Cook';
import { EntrySheet } from './EntrySheet';
import { Insights } from './Insights';
import { Plan } from './Plan';
import { Today } from './Today';
import { You } from './You';
import { DayNotes, reminderSlots } from './model';
import { eatingState, FastPlan } from '../fasting/model';
import { hoursText, timeOfDay } from './ui';
import { breaksFast } from './model';
import { dietActive, dietLabel, fitsDiet } from './diet';
import { AddStart, EatCtx, EatPrefs, normalizeEatPrefs } from './state';
import { EaHeader, EatShell, Sheet } from './ui';

type Tab = 'today' | 'plan' | 'cook' | 'insights' | 'you';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'today', label: 'Today', icon: Salad },
  { id: 'plan', label: 'Plan', icon: CalendarDays },
  { id: 'cook', label: 'Cook', icon: ChefHat },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'you', label: 'You', icon: SlidersHorizontal },
];

export interface EatAppProps {
  theme: ColorPalette;
  profile: UserProfile;
  goals: Goals;
  food: FoodEntry[];
  water: WaterEntry[];
  savedMeals: SavedMeal[];
  workouts: WorkoutSession[];
  body: BodyEntry[];
  /** The saved Eat settings (kept in the app, which also reads them for the widget and the watch). */
  prefsRaw: Partial<EatPrefs>;
  onPrefsRaw: (p: Partial<EatPrefs>) => void;
  fast: { startedAt: number; targetHours: number } | null;
  fastPlan: FastPlan;
  fastsUsed: boolean;
  plannedTraining: boolean;
  onAddBody: (entry: { date: string; weightKg: number }) => void;
  /** Ends the fast that is running (from the prompt that follows a first meal). */
  onEndFast: () => void;
  onAddFood: EatCtx['onAddFood'];
  onDeleteFood: (id: string) => void;
  onUpdateFood: (id: string, patch: Partial<FoodEntry>) => void;
  onAddWater: (date: string, ml: number) => void;
  onDeleteWater: (id: string) => void;
  onSaveMeal: (name: string, items: SavedMeal['items']) => void;
  onDeleteMeal: (id: string) => void;
  onSetGoals: (patch: Partial<Goals>) => void;
  openFasting: () => void;
  /** Something asked for a particular page or the food finder when the app opened. */
  start?: { tab?: Tab; add?: AddStart; nonce: number } | null;
  onExit: () => void;
}

/**
 * Eat, as an app of its own inside the app: a deep plum look with pomegranate and champagne, five tabs (Today, Plan, Cook, Insights, You).
 * The food, water and saved meals are the same lists the rest of the app, the widgets and Health Connect already read, so everything
 * stays in step. The food finder (search, barcode, label and photo scanning, recipes) is the app's own, shown inside.
 */
export const EatApp: React.FC<EatAppProps> = (p) => {
  const { theme, profile, onExit } = p;
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(todayKey());
  const [notes, setNotes] = usePersistentState<Record<string, DayNotes>>('eat_notes', {});
  const mealPlan = useMealPlan();
  const miniLook = useMiniLook('eat', theme.primary);

  const prefs: EatPrefs = useMemo(() => normalizeEatPrefs(p.prefsRaw), [p.prefsRaw]);

  // The food finder lives here so every tab can open it.
  const [add, setAdd] = useState<{ meal: MealType; start?: AddStart; recipe?: Recipe } | null>(null);
  const [libVersion, setLibVersion] = useState(0);
  const [voice, setVoice] = useState(false);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void; key: number } | null>(null);
  const keyRef = useRef(0);

  const eatTheme = useMemo<ColorPalette>(
    () => ({ ...theme, primary: miniLook.resolved.accent, primaryGlow: `${miniLook.resolved.accent}66`, secondary: miniLook.resolved.accent2, surface: '#241528', surfaceBorder: '#3a2640' }),
    [theme, miniLook.resolved.accent, miniLook.resolved.accent2]
  );

  const say = (text: string, undo?: () => void) => setToast({ text, undo, key: ++keyRef.current });

  // Food and fasting know about each other: a meal while a fast runs offers to end it, and a meal outside your window gets a gentle note.
  const [breakAsk, setBreakAsk] = useState<{ name: string; kcal: number; since: number } | null>(null);
  const askedFor = useRef(0);
  const addFood: EatCtx['onAddFood'] = (d, f) => {
    const id = p.onAddFood(d, f);
    if (d === todayKey() && breaksFast(f)) {
      if (p.fast) {
        if (askedFor.current !== p.fast.startedAt) {
          askedFor.current = p.fast.startedAt;
          setBreakAsk({ name: f.name, kcal: f.calories, since: p.fast.startedAt });
        }
      } else if (p.fastsUsed) {
        const e = eatingState(p.fastPlan, Date.now());
        if (e.state === 'fasting' && e.windowStart && e.windowEnd) {
          say(`Logged. That is outside your eating window (${timeOfDay(e.windowStart)} to ${timeOfDay(e.windowEnd)}), and it is your call.`);
        }
      }
    }
    return id;
  };
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useBack(true, () => {
    if (tab !== 'today') setTab('today');
    else onExit();
  });
  useBack(add !== null, () => closeAdd());

  const closeAdd = () => {
    setAdd(null);
    setLibVersion((v) => v + 1);
  };

  // A request from outside (the map, a shortcut): open that page, or the food finder.
  const lastStart = useRef(0);
  useEffect(() => {
    const s = p.start;
    if (!s || s.nonce === lastStart.current) return;
    lastStart.current = s.nonce;
    if (s.tab) setTab(s.tab);
    if (s.add) setAdd({ meal: mealNow(), start: s.add });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.start?.nonce]);

  // Reminders are scheduled on the phone whenever the choice changes.
  const remindKey = JSON.stringify(prefs.reminders);
  useEffect(() => {
    void syncEatReminders(reminderSlots(prefs.reminders));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remindKey]);

  const today = todayKey();
  const ctx: EatCtx = {
    calendarTheme: eatTheme,
    miniLook,
    appAccent: theme.primary,
    name: profile.name,
    profile,
    units: profile.units,
    goals: p.goals,
    food: p.food,
    water: p.water,
    savedMeals: p.savedMeals,
    workouts: p.workouts,
    body: p.body,
    mealPlan,
    fast: p.fast,
    prefs,
    setPrefs: (next) => p.onPrefsRaw(next),
    notes,
    setNotes,
    date,
    today,
    setDate,
    fastPlan: p.fastPlan,
    fastsUsed: p.fastsUsed,
    plannedTraining: p.plannedTraining,
    onAddBody: p.onAddBody,
    onAddFood: addFood,
    onDeleteFood: p.onDeleteFood,
    onUpdateFood: p.onUpdateFood,
    onAddWater: p.onAddWater,
    onDeleteWater: p.onDeleteWater,
    onSaveMeal: p.onSaveMeal,
    onDeleteMeal: p.onDeleteMeal,
    onSetGoals: p.onSetGoals,
    openAdd: (meal, start) => setAdd({ meal: meal ?? mealNow(), start }),
    openVoice: () => setVoice(true),
    say,
    openFasting: () => {
      onExit();
      p.openFasting();
    },
  };

  const diet = prefs.diet;
  const foodFilter = useMemo(() => (dietActive(diet) ? (r: { name: string; group: number }) => fitsDiet({ name: r.name, group: r.group }, diet) : undefined), [diet]);
  const dayEntries = useMemo(() => p.food.filter((f) => f.date === date), [p.food, date]);
  const recents = useMemo(() => [...p.food].sort((a, b) => (a.id < b.id ? 1 : -1)), [p.food]);

  return (
    <EatShell label="Eat" look={miniLook.style} mode={miniLook.resolved.mode}>
      <EaHeader title="Eat" onBack={onExit} backLabel="Back to Health" />
      {tab === 'today' && <Today ctx={ctx} onEdit={setEditing} />}
      {tab === 'plan' && <Plan ctx={ctx} onCook={() => setTab('cook')} />}
      {tab === 'cook' && <Cook key={libVersion} ctx={ctx} onEditRecipe={(r) => setAdd({ meal: mealNow(), start: 'recipe', recipe: r })} />}
      {tab === 'insights' && <Insights ctx={ctx} />}
      {tab === 'you' && <You ctx={ctx} />}

      {tab === 'today' && (
        <button type="button" className="ea-fab" onClick={() => ctx.openAdd(mealNow())}>
          <span aria-hidden="true" className="text-xl leading-none">+</span> Add food
        </button>
      )}

      {toast && (
        <div className="ea-toast" role="status" key={toast.key}>
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      <nav className="ea-tabbar" aria-label="Eat sections">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" className="ea-tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <EntrySheet ctx={ctx} entry={editing} onClose={() => setEditing(null)} />

      <Sheet open={breakAsk !== null} onClose={() => setBreakAsk(null)} title="Does this end your fast?">
        {breakAsk && (
          <>
            <p className="text-sm leading-relaxed">
              You logged {breakAsk.name} ({Math.round(breakAsk.kcal)} kcal) {hoursText((Date.now() - breakAsk.since) / 3_600_000)} into your fast. If you are breaking it, end it now so your fast is counted at the right time.
            </p>
            <button
              type="button"
              className="ea-btn mt-4 w-full"
              onClick={() => {
                p.onEndFast();
                setBreakAsk(null);
                say('Fast ended. Enjoy your meal.');
              }}
            >
              End my fast
            </button>
            <button type="button" className="ea-btn ea-btn-quiet mt-2 w-full" onClick={() => setBreakAsk(null)}>
              Keep fasting
            </button>
            <p className="ea-dim mt-3 text-xs">I will not ask again during this fast.</p>
          </>
        )}
      </Sheet>

      <Sheet open={voice} onClose={() => setVoice(false)} title="Say what you ate">
        <div className="ea-darkpanel">
          <VoiceLogCard theme={eatTheme} date={date} entries={p.food} onAddFood={(d, f) => void addFood(d, f)} onAddWater={p.onAddWater} />
        </div>
      </Sheet>

      <AddFoodModal
        isOpen={add !== null}
        onClose={closeAdd}
        theme={eatTheme}
        defaultMeal={add?.meal ?? 'Lunch'}
        recents={recents}
        onAdd={(f) => addFood(date, f)}
        onUndo={p.onDeleteFood}
        dayEntries={dayEntries}
        goals={p.goals}
        savedMeals={p.savedMeals}
        onSaveMeal={p.onSaveMeal}
        onDeleteMeal={p.onDeleteMeal}
        startOnScan={add?.start === 'scan'}
        startOn={add?.start && add.start !== 'scan' && add.start !== 'search' ? add.start : undefined}
        startRecipe={add?.recipe}
        foodFilter={foodFilter}
        filterLabel={dietLabel(diet)}
      />
    </EatShell>
  );
};
