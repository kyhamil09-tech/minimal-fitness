import React, { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import type { ColorPalette } from '../types/theme';
import type { BodyEntry, FoodEntry, Goals, UserProfile } from '../types/tracking';
import { adaptiveTdee, intakeByDay } from '../lib/adaptiveTdee';
import { tdee } from '../lib/calc';
import { todayKey } from '../lib/dates';
import { GoalMode, RATES_KG, planEnergy } from '../lib/energyPlan';
import { formatWeight, kgToDisplay, weightUnit } from '../lib/units';
import { useLang, useT } from '../lib/i18n';
import { Choice } from './ui/SettingsParts';

interface Props {
  theme: ColorPalette;
  profile: UserProfile;
  goals: Goals;
  currentKg: number;
  body: BodyEntry[];
  food: FoodEntry[];
  onSetGoals: (patch: Partial<Goals>) => void;
}

/**
 * Your BMI, the weight range that is healthy for your height, what keeping your weight takes, and a daily calorie target for losing or
 * gaining at a gentle pace. It all comes from your own profile. A button copies the target into your daily goals.
 */
export const CalorieGuide: React.FC<Props> = ({ theme, profile, goals, currentKg, body, food, onSetGoals }) => {
  const units = profile.units;
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<GoalMode>(goals.targetWeightKg < currentKg - 0.5 ? 'lose' : goals.targetWeightKg > currentKg + 0.5 ? 'gain' : 'maintain');
  const [rate, setRate] = useState(0.5);
  const [done, setDone] = useState(false);
  const [source, setSource] = useState<'measured' | 'formula'>('measured');
  const formula = tdee({ ...profile, weightKg: currentKg });
  const adaptive = useMemo(() => adaptiveTdee(body, intakeByDay(food), todayKey(), formula), [body, food, formula]);
  const useMeasured = adaptive.confidence === 'locked' && source === 'measured';

  const rates = mode === 'gain' ? RATES_KG.gain : RATES_KG.lose;
  const weekly = rates.includes(rate as never) ? rate : rates[1] ?? rates[0];
  const plan = planEnergy({ profile, currentKg, targetKg: goals.targetWeightKg, mode, weeklyKg: weekly, maintenanceKcal: useMeasured ? adaptive.maintenanceKcal : undefined });
  /** A weekly change in kg or lb with up to two decimals, so 0.25 reads as 0.25 and not 0.3. */
  const pace = (kg: number) => `${Math.round((units === 'imperial' ? kg * 2.20462 : kg) * 100) / 100} ${weightUnit(units)}`;
  const w = (kg: number) => `${kgToDisplay(kg, units)} ${weightUnit(units)}`;
  const sameAsGoals = goals.dailyCalories === plan.target && goals.dailyProteinG === plan.proteinG;
  const paceLabel = (r: number) => t(r === 0.5 ? 'cal.pace.steady' : r < 0.5 ? 'cal.pace.gentle' : 'cal.pace.faster', { pace: pace(r) });
  const date = plan.reachBy ? new Date(`${plan.reachBy}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const modes: GoalMode[] = ['lose', 'maintain', 'gain'];

  return (
    <section className="rounded-3xl border p-5 space-y-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label={t('cal.title')}>
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4" style={{ color: theme.primary }} aria-hidden="true" />
        <h2 className="text-sm font-bold text-neutral-200">{t('cal.title')}</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
          <div className="text-xs text-neutral-400 uppercase">{t('cal.healthy')}</div>
          <div className="text-sm font-bold font-mono text-white">
            {kgToDisplay(plan.healthyMinKg, units)}–{kgToDisplay(plan.healthyMaxKg, units)} {weightUnit(units)}
          </div>
          <div className="text-xs text-neutral-400">{t('cal.healthyNote')}</div>
        </div>
        <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
          <div className="text-xs text-neutral-400 uppercase">{t('cal.keep')}</div>
          <div className="text-lg font-bold font-mono text-white">{plan.maintenance.toLocaleString(lang)}</div>
          <div className="text-xs text-neutral-400">{t('cal.keepNote', { bmr: plan.bmr.toLocaleString(lang) })}</div>
        </div>
      </div>

      {adaptive.confidence === 'locked' ? (
        <div className="rounded-2xl border border-neutral-900 bg-black/50 p-3 space-y-2">
          <div className="text-xs font-bold text-neutral-200">{t('cal.measured.title')}</div>
          <p className="text-xs text-neutral-300">{t('cal.measured.body', { kcal: (adaptive.maintenanceKcal ?? 0).toLocaleString(lang), formula: formula.toLocaleString(lang) })}</p>
          <p className="text-xs text-neutral-400">
            {t('cal.measured.trend', { weight: w(adaptive.latestTrendKg ?? currentKg), change: `${(adaptive.weeklyChangeKg ?? 0) > 0 ? '+' : ''}${Math.round(kgToDisplay(adaptive.weeklyChangeKg ?? 0, units, 2) * 100) / 100} ${weightUnit(units)}` })}
          </p>
          {adaptive.clamped && <p className="text-xs text-amber-300">{t('cal.measured.clamped')}</p>}
          <Choice<'measured' | 'formula'>
            label={t('cal.src')}
            value={source}
            onChange={(s) => {
              setSource(s);
              setDone(false);
            }}
            options={[
              { id: 'measured', label: t('cal.src.measured') },
              { id: 'formula', label: t('cal.src.formula') },
            ]}
          />
        </div>
      ) : (
        <p className="text-xs text-neutral-400">{t('cal.calibrating', { food: Math.min(adaptive.foodDays, 10), weigh: Math.min(adaptive.weighIns, 5) })}</p>
      )}

      <div className="space-y-2">
        <Choice<GoalMode>
          label={t('cal.aim')}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setDone(false);
          }}
          options={modes.map((m) => ({ id: m, label: t(`cal.mode.${m}` as 'cal.mode.lose') }))}
        />
        {mode !== 'maintain' && (
          <Choice<number>
            label={t('cal.pace')}
            value={weekly}
            onChange={(r) => {
              setRate(r);
              setDone(false);
            }}
            options={rates.map((r) => ({ id: r, label: paceLabel(r) }))}
          />
        )}
      </div>

      <div className="rounded-2xl border border-neutral-900 bg-black/50 p-4 space-y-1">
        <div className="text-xs text-neutral-400 uppercase">{t('cal.target')}</div>
        <div className="text-3xl font-bold font-mono" style={{ color: theme.primary }}>
          {plan.target.toLocaleString(lang)} <span className="text-sm text-neutral-300">kcal</span>
        </div>
        <div className="text-xs text-neutral-300">
          {mode === 'maintain' ? t('cal.maintainLine') : t(plan.dailyDelta < 0 ? 'cal.below' : 'cal.above', { n: Math.abs(Math.round(plan.dailyDelta)).toLocaleString(lang) })} {t('cal.protein', { g: plan.proteinG })}
        </div>
        {plan.reachBy && plan.weeks && <div className="text-xs text-neutral-300">{t('cal.eta', { n: plan.weeks, weight: formatWeight(goals.targetWeightKg, units), date })}</div>}
        {plan.adjusted && <div className="text-xs text-amber-300">{t('cal.adjusted')}</div>}
        {plan.notes.map((n) => (
          <div key={n.key} className="text-xs text-amber-300" role="note">
            {t(n.key, n.vars)}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={sameAsGoals}
        onClick={() => {
          onSetGoals({ dailyCalories: plan.target, dailyProteinG: plan.proteinG });
          setDone(true);
        }}
        className="w-full min-h-11 rounded-xl text-xs font-bold text-black disabled:opacity-50"
        style={{ backgroundColor: theme.primary }}
      >
        {sameAsGoals ? (done ? t('cal.saved') : t('cal.already')) : t('cal.use', { kcal: plan.target.toLocaleString(lang), g: plan.proteinG })}
      </button>
      <p className="text-xs text-neutral-400">{t('cal.disclaimer')}</p>
    </section>
  );
};
