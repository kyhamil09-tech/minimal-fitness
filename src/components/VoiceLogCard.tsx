import React, { useEffect, useMemo, useState } from 'react';
import { Mic, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { FoodEntry, MealType } from '../types/tracking';
import { VoiceLog, isAndroidApp } from '../lib/native';
import { VoiceItem, entryFor, itemFor, parseSmart } from '../lib/voiceFood';
import { curatedFoods, displayName, loadUsda } from '../lib/foodDb';
import type { FoodRecord } from '../lib/foodDb';
import { buildIndex } from '../lib/foodSearch';
import { useFoodLibrary } from '../hooks/useFoodLibrary';
import { NewFood } from './AddFoodModal';

interface Props {
  theme: ColorPalette;
  date: string;
  /** The diary so far, so the foods you eat often are matched first. */
  entries: FoodEntry[];
  onAddFood: (date: string, food: NewFood) => void;
  onAddWater: (date: string, ml: number) => void;
}

interface Heard {
  text: string;
  meal: MealType;
  foods: VoiceItem[];
  water: { ml: number; heard: string }[];
  unmatched: string[];
}

/**
 * Say what you ate or drank, with amounts: "2 cups of rice", "100 grams of chicken", "half an avocado". Android turns the speech into
 * text on the phone; the words are then matched to the app's own food database (the one the search uses), the unit is changed into
 * grams from that food's portions, and calories and macros are worked out. Nothing is recorded, saved or sent.
 */
export const VoiceLogCard: React.FC<Props> = ({ theme, date, entries, onAddFood, onAddWater }) => {
  const [ready, setReady] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [error, setError] = useState('');
  const [usda, setUsda] = useState<FoodRecord[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const lib = useFoodLibrary(entries);

  useEffect(() => {
    if (!isAndroidApp()) {
      setReady(false);
      return;
    }
    void VoiceLog.available().then((r) => setReady(r.available)).catch(() => setReady(false));
  }, []);

  // The big food list loads in the background once voice logging is available, so it is ready when you speak.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void loadUsda().then((r) => live && setUsda(r));
    return () => {
      live = false;
    };
  }, [ready]);

  const index = useMemo(() => (usda ? buildIndex([...lib.mine, ...curatedFoods(), ...usda]) : null), [usda, lib.mine]);

  if (ready === false) return null;
  if (ready === null) return null;

  const listen = async () => {
    setError('');
    setHeard(null);
    setOpen(null);
    setListening(true);
    try {
      const { text } = await VoiceLog.listen();
      if (!index) {
        setError('The food list is still loading. Try again in a moment.');
        return;
      }
      const r = parseSmart(text, index, new Date(), lib.boost);
      setHeard({ text, meal: r.meal, foods: r.foods, water: r.water, unmatched: r.unmatched });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not listen.');
    } finally {
      setListening(false);
    }
  };

  const confirm = () => {
    if (!heard) return;
    for (const f of heard.foods) onAddFood(date, entryFor(f, heard.meal));
    for (const w of heard.water) onAddWater(date, w.ml);
    setHeard(null);
    setOpen(null);
  };

  const swap = (i: number, record: FoodRecord) =>
    setHeard((h) => {
      if (!h) return h;
      const cur = h.foods[i];
      const others = [cur.record, ...cur.alternatives].filter((r) => r.id !== record.id).slice(0, 4);
      const next = h.foods.slice();
      next[i] = itemFor(record, cur.spec, cur.heard, others);
      return { ...h, foods: next };
    });

  const remove = (i: number) => {
    setOpen(null);
    setHeard((h) => (h ? { ...h, foods: h.foods.filter((_, k) => k !== i) } : h));
  };

  const nothing = heard && heard.foods.length === 0 && heard.water.length === 0;
  const total = heard ? heard.foods.reduce((s, f) => s + f.nutrients.kcal, 0) : 0;
  return (
    <section className="rounded-[22px] border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">Log by voice</div>
          <p className="text-xs text-neutral-400 mt-0.5">Say amounts too: “2 cups of rice and 100 grams of chicken”. Works on the phone, no internet.</p>
        </div>
        <button
          type="button"
          onClick={() => void listen()}
          disabled={listening}
          aria-label="Start listening"
          className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-black disabled:opacity-60"
          style={{ backgroundColor: theme.primary, boxShadow: listening ? `0 0 0 6px ${theme.primary}33` : undefined }}
        >
          <Mic className="w-5 h-5" />
        </button>
      </div>
      {listening && <p className="text-xs text-neutral-300 mt-2" role="status">Listening…</p>}
      {error && <p className="text-xs text-amber-300 mt-2">{error}</p>}
      {heard && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-neutral-400">Heard: “{heard.text}”</p>
          {heard.foods.map((f, i) => (
            <div key={`${f.record.id}-${i}`} className="rounded-xl glass-inset px-3 py-2.5 text-xs text-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{displayName(f.record)}</div>
                  <div className="text-neutral-300">
                    {f.amount}
                    {f.approximate && <span className="text-amber-300"> · usual serving, check the amount</span>}
                  </div>
                  <div className="text-neutral-400 tabular-nums">
                    P {f.nutrients.p} g · C {f.nutrients.c} g · F {f.nutrients.f} g · {heard.meal.toLowerCase()}
                  </div>
                </div>
                <div className="flex items-start gap-1 shrink-0">
                  <span className="tabular-nums font-bold text-sm pt-0.5">{f.nutrients.kcal} kcal</span>
                  <button type="button" onClick={() => remove(i)} aria-label={`Remove ${f.record.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {f.alternatives.length > 0 && (
                <>
                  <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="mt-1 min-h-9 text-xs font-bold underline" style={{ color: theme.primary }}>
                    {open === i ? 'Hide other matches' : 'Not right? Change the food'}
                  </button>
                  {open === i && (
                    <div className="mt-1 space-y-1">
                      {f.alternatives.map((a) => (
                        <button key={a.id} type="button" onClick={() => { swap(i, a); setOpen(null); }} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-white/10 px-3 text-left text-neutral-200">
                          <span className="truncate">{displayName(a)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {heard.water.map((w, i) => (
            <div key={`w${i}`} className="rounded-xl glass-inset px-3 py-2 text-xs text-white flex justify-between">
              <span>Water</span>
              <span className="tabular-nums text-neutral-300">{w.ml} ml</span>
            </div>
          ))}
          {heard.unmatched.length > 0 && <p className="text-xs text-amber-300">Not found in the foods list: {heard.unmatched.join(', ')}. Add those by hand.</p>}
          {nothing ? (
            <p className="text-xs text-neutral-400">Nothing I could add from that. Try again, or add it by hand below.</p>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={confirm} className="min-h-11 flex-1 rounded-xl text-xs font-extrabold text-black" style={{ backgroundColor: theme.primary }}>
                Add these{total > 0 ? ` · ${total} kcal` : ''}
              </button>
              <button type="button" onClick={() => { setHeard(null); setOpen(null); }} className="min-h-11 px-4 rounded-xl glass-chip text-xs text-neutral-300">
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
