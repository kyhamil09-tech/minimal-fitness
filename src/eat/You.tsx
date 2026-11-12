import React, { useMemo, useState } from 'react';
import { adaptiveTdee, intakeByDay } from '../lib/adaptiveTdee';
import { tdee } from '../lib/calc';
import { GoalMode, RATES_KG, planEnergy } from '../lib/energyPlan';
import { displayToKg, displayToMl, kgToDisplay, mlToDisplay, volumeUnit, weightUnit } from '../lib/units';
import { useT } from '../lib/i18n';
import { STYLES, styleById } from './content';
import { macroTargets, proteinForStyle, splitDefaults } from './model';
import { EatCtx, EatPrefs, MealKey } from './state';
import { LookPicker } from '../components/ui/LookPicker';
import { dietActive, dietLabel } from './diet';
import { EaToggle, SectionTitle, num } from './ui';

/** A number you can type: it is saved when you leave the field, and put back if it is not a sensible value. */
const NumField: React.FC<{ id: string; label: string; unit: string; value: number; min: number; max: number; step?: number; onCommit: (n: number) => void }> = ({ id, label, unit, value, min, max, step = 1, onCommit }) => {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && n >= min && n <= max) onCommit(Math.round(n / step) * step);
    else setText(String(value));
  };
  return (
    <div>
      <label htmlFor={id} className="ea-eyebrow block">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input id={id} className="ea-input pr-14" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <span className="ea-dim pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm">{unit}</span>
      </div>
    </div>
  );
};

const KEYS: MealKey[] = ['breakfast', 'lunch', 'dinner', 'review'];
const KEY_LABEL: Record<MealKey, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', review: 'Evening look-back' };

/** You: your targets, a suggestion worked out from your body, an eating style, the week view, and gentle reminders. */
export const You: React.FC<{ ctx: EatCtx }> = ({ ctx }) => {
  const { goals, units, prefs, profile, food, body, today } = ctx;
  const t = useT();
  const set = (p: Partial<EatPrefs>) => ctx.setPrefs({ ...prefs, ...p });
  const style = styleById(prefs.style);
  const targets = macroTargets(goals.dailyCalories, goals.dailyProteinG, style);
  const currentKg = body.length > 0 ? [...body].sort((a, b) => (a.date < b.date ? 1 : -1))[0].weightKg : profile.weightKg;

  const [mode, setMode] = useState<GoalMode>(goals.targetWeightKg < currentKg - 0.5 ? 'lose' : goals.targetWeightKg > currentKg + 0.5 ? 'gain' : 'maintain');
  const [rate, setRate] = useState(0.5);
  const formula = tdee({ ...profile, weightKg: currentKg });
  const adaptive = useMemo(() => adaptiveTdee(body, intakeByDay(food), today, formula), [body, food, today, formula]);
  const rates: readonly number[] = mode === 'gain' ? RATES_KG.gain : RATES_KG.lose;
  const weekly = rates.includes(rate) ? rate : rates[Math.min(1, rates.length - 1)];
  const plan = planEnergy({ profile, currentKg, targetKg: goals.targetWeightKg, mode, weeklyKg: weekly, maintenanceKcal: adaptive.confidence === 'locked' ? adaptive.maintenanceKcal : undefined });
  const same = goals.dailyCalories === plan.target && goals.dailyProteinG === plan.proteinG;
  const pace = (kg: number) => `${Math.round((units === 'imperial' ? kg * 2.20462 : kg) * 100) / 100} ${weightUnit(units)}`;

  const setRemind = (patch: Partial<EatPrefs['reminders']>) => set({ reminders: { ...prefs.reminders, ...patch } });
  const proteinSuggest = proteinForStyle(style, currentKg, goals.dailyProteinG);

  return (
    <div className="ea-scroll">
      <div className="ea-wrap">
        <h1 className="ea-h1 mt-3">
          Your <em>table</em>
        </h1>
        <p className="ea-dim mt-1 text-sm">Targets that fit you, an eating style, and a few gentle nudges.</p>

        <SectionTitle eyebrow="Daily targets">Numbers</SectionTitle>
        <section className="ea-card" aria-label="Daily targets">
          <div className="grid grid-cols-2 gap-3">
            <NumField id="ea-cal" label="Calories" unit="kcal" value={goals.dailyCalories} min={800} max={8000} step={5} onCommit={(n) => ctx.onSetGoals({ dailyCalories: n })} />
            <NumField id="ea-pro" label="Protein" unit="g" value={goals.dailyProteinG} min={20} max={400} onCommit={(n) => ctx.onSetGoals({ dailyProteinG: n })} />
            <NumField id="ea-water" label="Water" unit={volumeUnit(units)} value={mlToDisplay(goals.dailyWaterMl, units)} min={units === 'imperial' ? 20 : 500} max={units === 'imperial' ? 400 : 8000} onCommit={(n) => ctx.onSetGoals({ dailyWaterMl: displayToMl(n, units) })} />
            <NumField id="ea-goalw" label="Goal weight" unit={weightUnit(units)} value={kgToDisplay(goals.targetWeightKg, units)} min={30} max={400} step={0.1} onCommit={(n) => ctx.onSetGoals({ targetWeightKg: Math.round(displayToKg(n, units) * 10) / 10 })} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumField id="ea-sodium" label="Sodium limit" unit="mg" value={prefs.sodiumMg} min={0} max={10000} step={50} onCommit={(n) => set({ sodiumMg: n })} />
            <NumField id="ea-sugar" label="Sugar limit" unit="g" value={prefs.sugarG} min={0} max={500} onCommit={(n) => set({ sugarG: n })} />
          </div>
          <p className="ea-dim mt-2 text-xs">Set a limit to see it as a bar on Today. 0 means no target.</p>
          <div className="ea-dim mt-4 grid grid-cols-4 gap-1 text-center text-xs tabular-nums">
            <div>
              <div className="ea-serif text-base font-semibold" style={{ color: 'var(--ea-p)' }}>
                {targets.proteinG} g
              </div>
              protein
            </div>
            <div>
              <div className="ea-serif text-base font-semibold" style={{ color: 'var(--ea-c)' }}>
                {targets.carbsG} g
              </div>
              carbs
            </div>
            <div>
              <div className="ea-serif text-base font-semibold" style={{ color: 'var(--ea-f)' }}>
                {targets.fatG} g
              </div>
              fat
            </div>
            <div>
              <div className="ea-serif text-base font-semibold" style={{ color: 'var(--ea-lilac)' }}>
                {targets.fiberG} g
              </div>
              fiber
            </div>
          </div>
        </section>

        <div className="ea-card !p-0 mt-3">
          <EaToggle
            label="Rest and training days"
            sub="Different calorie targets. Training means a workout of 15 minutes or more, or one planned for today"
            on={prefs.split.on}
            onChange={(v) => set({ split: v ? (prefs.split.restKcal >= 800 ? { ...prefs.split, on: true } : splitDefaults(goals.dailyCalories)) : { ...prefs.split, on: false } })}
          />
          {prefs.split.on && (
            <div className="grid grid-cols-2 gap-3 px-4 pb-4">
              <NumField id="ea-rest" label="Rest day" unit="kcal" value={prefs.split.restKcal} min={800} max={8000} step={5} onCommit={(n) => set({ split: { ...prefs.split, restKcal: n } })} />
              <NumField id="ea-train" label="Training day" unit="kcal" value={prefs.split.trainKcal} min={800} max={8000} step={5} onCommit={(n) => set({ split: { ...prefs.split, trainKcal: n } })} />
            </div>
          )}
        </div>

        <SectionTitle eyebrow="Worked out for you">A suggested target</SectionTitle>
        <section className="ea-card ea-card-gold" aria-label="Suggested target">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Aim">
            {(['lose', 'maintain', 'gain'] as GoalMode[]).map((m) => (
              <button key={m} type="button" className="ea-chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'lose' ? 'Lose' : m === 'maintain' ? 'Keep' : 'Gain'}
              </button>
            ))}
          </div>
          {mode !== 'maintain' && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pace per week">
              {rates.map((r) => (
                <button key={r} type="button" className="ea-chip" aria-pressed={weekly === r} onClick={() => setRate(r)}>
                  {pace(r)} a week
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="ea-serif text-3xl font-semibold tabular-nums">{num(plan.target)} kcal</div>
              <div className="ea-dim text-xs">
                {plan.proteinG} g protein · you maintain about {num(plan.maintenance)}
                {adaptive.confidence === 'locked' ? ' (measured)' : ' (estimated)'}
              </div>
            </div>
            <button type="button" className="ea-btn ea-btn-small shrink-0" disabled={same} onClick={() => { ctx.onSetGoals({ dailyCalories: plan.target, dailyProteinG: plan.proteinG }); ctx.say('Targets updated'); }}>
              {same ? 'In use' : 'Use this'}
            </button>
          </div>
          {plan.reachBy && mode !== 'maintain' && (
            <p className="ea-dim mt-2 text-xs">At this pace, around {new Date(`${plan.reachBy}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}. Real bodies vary; adjust from what the scale does.</p>
          )}
          {plan.notes.map((n) => (
            <p key={n.key} className="ea-note mt-3 text-xs leading-relaxed">
              {t(n.key, n.vars)}
            </p>
          ))}
          <p className="ea-dim mt-3 text-xs leading-relaxed">General guidance, not medical advice. Under 18, pregnant, or managing a health condition: ask a doctor or dietitian for numbers.</p>
        </section>

        <SectionTitle eyebrow="How you like to eat">Style</SectionTitle>
        <ul className="space-y-2">
          {STYLES.map((s) => (
            <li key={s.id}>
              <button type="button" className={`ea-card ea-row !items-start ${prefs.style === s.id ? 'ea-card-berry' : ''}`} aria-pressed={prefs.style === s.id} onClick={() => set({ style: s.id })}>
                <span className="min-w-0 flex-1">
                  <span className="ea-h2 block !text-lg">{s.name}</span>
                  <span className="ea-dim block text-xs leading-relaxed">{s.line}</span>
                </span>
                {prefs.style === s.id && <span className="ea-tag shrink-0" style={{ color: 'var(--ea-p)' }}>Chosen</span>}
              </button>
            </li>
          ))}
        </ul>
        {style.proteinPerKg && proteinSuggest !== goals.dailyProteinG && (
          <button type="button" className="ea-btn ea-btn-quiet ea-btn-small mt-3 w-full" onClick={() => { ctx.onSetGoals({ dailyProteinG: proteinSuggest }); ctx.say(`Protein set to ${proteinSuggest} g`); }}>
            Set protein to {proteinSuggest} g for {style.name}
          </button>
        )}

        <SectionTitle eyebrow="What you eat">Diet</SectionTitle>
        <section className="ea-card" aria-label="Diet">
          <p className="ea-dim text-xs leading-relaxed">Hide foods that do not fit from the food finder, the ideas and the pantry.</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Diet filters">
            {(
              [
                ['vegetarian', 'Vegetarian'],
                ['vegan', 'Vegan'],
                ['glutenFree', 'Gluten-free'],
                ['dairyFree', 'Dairy-free'],
                ['nutFree', 'Nut-free'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" className="ea-chip" aria-pressed={prefs.diet[k]} onClick={() => set({ diet: { ...prefs.diet, [k]: !prefs.diet[k] } })}>
                {label}
              </button>
            ))}
          </div>
          <label htmlFor="ea-avoid" className="ea-eyebrow mt-4 block">
            Also leave out
          </label>
          <input id="ea-avoid" className="ea-input mt-2" placeholder="shellfish, soy, mushrooms" defaultValue={prefs.diet.avoid} onBlur={(e) => set({ diet: { ...prefs.diet, avoid: e.target.value } })} />
          {dietActive(prefs.diet) && <p className="mt-3 text-sm">Hiding: {dietLabel(prefs.diet)}.</p>}
          <p className="fa-note ea-note mt-3 text-xs leading-relaxed">This goes by food groups and the words in names, so it is a convenience, not allergy safety. A name does not list every ingredient: always read the label.</p>
        </section>

        <SectionTitle eyebrow="Make it yours">Look</SectionTitle>
        <LookPicker app="eat" p="ea" look={ctx.miniLook.look} onChange={ctx.miniLook.setLook} appAccent={ctx.appAccent} />

        <SectionTitle eyebrow="The way you see it">View</SectionTitle>
        <div className="ea-card !p-0">
          <EaToggle label="Week view" sub="Show the week as the budget: a day over is balanced by the days around it" on={prefs.flex} onChange={(v) => set({ flex: v })} />
          <EaToggle label="Add activity calories" sub="Workout calories are added to the day's budget" on={prefs.activity} onChange={(v) => set({ activity: v })} />
          <EaToggle label="Calm view" sub="No calorie numbers on Today, only words. Everything is still logged" on={prefs.calm} onChange={(v) => set({ calm: v })} />
        </div>

        <SectionTitle eyebrow="Gentle nudges">Reminders</SectionTitle>
        <div className="ea-card !p-0">
          <EaToggle label="Remind me to log" sub="A short note at the times you choose" on={prefs.reminders.on} onChange={(v) => setRemind({ on: v })} />
          {prefs.reminders.on &&
            KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: '1px solid var(--ea-line)' }}>
                <button type="button" role="checkbox" aria-checked={prefs.reminders.which[k]} className="flex min-h-11 flex-1 items-center gap-3 text-left" onClick={() => setRemind({ which: { ...prefs.reminders.which, [k]: !prefs.reminders.which[k] } })}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-md border" style={{ borderColor: prefs.reminders.which[k] ? 'var(--ea-accent)' : 'rgba(var(--ea-tint),0.35)', background: prefs.reminders.which[k] ? 'var(--ea-accent)' : 'transparent', color: 'var(--ea-accent-ink)' }} aria-hidden="true">
                    {prefs.reminders.which[k] ? '✓' : ''}
                  </span>
                  <span className="text-sm font-semibold">{KEY_LABEL[k]}</span>
                </button>
                <label className="sr-only" htmlFor={`ea-time-${k}`}>
                  {KEY_LABEL[k]} time
                </label>
                <input id={`ea-time-${k}`} type="time" className="ea-input !w-auto" value={prefs.reminders.times[k]} onChange={(e) => e.target.value && setRemind({ times: { ...prefs.reminders.times, [k]: e.target.value } })} disabled={!prefs.reminders.which[k]} />
              </div>
            ))}
        </div>
        <p className="ea-dim mt-3 px-1 text-xs leading-relaxed">Units follow the rest of the app (Settings). If counting ever feels stressful, it is fine to log less or stop for a while; a doctor or dietitian can help with a relationship with food.</p>
        <div className="h-4" />
      </div>
    </div>
  );
};
