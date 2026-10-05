import React, { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { ActivityLevel, Goals, Sex, UnitSystem, UserProfile } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { Modal, fieldClass, labelClass } from './ui/Modal';
import {
  cmToFtIn,
  displayToKg,
  displayToMl,
  ftInToCm,
  kgToDisplay,
  lengthUnit,
  mlToDisplay,
  volumeUnit,
  weightUnit,
} from '../lib/units';
import { estimateMaxHr, tdee } from '../lib/calc';
import { suggestedGoals } from '../data/defaults';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  goals: Goals;
  /** First-run flow: can't be dismissed and shows a welcome message. */
  isOnboarding?: boolean;
  onSave: (profile: UserProfile, goals: Goals) => void;
  theme: ColorPalette;
}

const num = (s: string, fallback = 0) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  goals,
  isOnboarding = false,
  onSave,
  theme,
}) => {
  const [units, setUnits] = useState<UnitSystem>(profile.units);
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel);
  const [heightCm, setHeightCm] = useState(String(Math.round(profile.heightCm)));
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('9');
  const [weight, setWeight] = useState(String(kgToDisplay(profile.weightKg, profile.units)));
  const [restingHr, setRestingHr] = useState(String(profile.restingHr));

  const [steps, setSteps] = useState(String(goals.dailySteps));
  const [weekly, setWeekly] = useState(String(goals.weeklyWorkouts));
  const [targetWeight, setTargetWeight] = useState(String(kgToDisplay(goals.targetWeightKg, profile.units)));
  const [calories, setCalories] = useState(String(goals.dailyCalories));
  const [protein, setProtein] = useState(String(goals.dailyProteinG));
  const [water, setWater] = useState(String(mlToDisplay(goals.dailyWaterMl, profile.units)));
  const [error, setError] = useState('');

  // Re-seed the form whenever the dialog is (re)opened.
  useEffect(() => {
    if (!isOpen) return;
    setUnits(profile.units);
    setName(profile.name);
    setAge(String(profile.age));
    setSex(profile.sex);
    setActivity(profile.activityLevel);
    setHeightCm(String(Math.round(profile.heightCm)));
    const ftIn = cmToFtIn(profile.heightCm);
    setHeightFt(String(ftIn.ft));
    setHeightIn(String(ftIn.inch));
    setWeight(String(kgToDisplay(profile.weightKg, profile.units)));
    setRestingHr(String(profile.restingHr));
    setSteps(String(goals.dailySteps));
    setWeekly(String(goals.weeklyWorkouts));
    setTargetWeight(String(kgToDisplay(goals.targetWeightKg, profile.units)));
    setCalories(String(goals.dailyCalories));
    setProtein(String(goals.dailyProteinG));
    setWater(String(mlToDisplay(goals.dailyWaterMl, profile.units)));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const currentHeightCm = () => (units === 'imperial' ? ftInToCm(num(heightFt), num(heightIn)) : num(heightCm));

  const switchUnits = (next: UnitSystem) => {
    if (next === units) return;
    const kg = displayToKg(num(weight), units);
    const targetKg = displayToKg(num(targetWeight), units);
    const ml = displayToMl(num(water), units);
    const cm = currentHeightCm();
    setWeight(String(kgToDisplay(kg, next)));
    setTargetWeight(String(kgToDisplay(targetKg, next)));
    setWater(String(mlToDisplay(ml, next)));
    setHeightCm(String(Math.round(cm)));
    const ftIn = cmToFtIn(cm);
    setHeightFt(String(ftIn.ft));
    setHeightIn(String(ftIn.inch));
    setUnits(next);
  };

  const draftProfile = (): UserProfile => ({
    ...profile,
    name: name.trim(),
    age: clamp(Math.round(num(age, 30)), 10, 100),
    sex,
    heightCm: clamp(currentHeightCm() || 175, 100, 250),
    weightKg: clamp(displayToKg(num(weight, 75), units), 30, 300),
    activityLevel: activity,
    units,
    restingHr: clamp(Math.round(num(restingHr, 55)), 30, 100),
    onboarded: true,
  });

  const useSuggestedCalories = () => setCalories(String(tdee(draftProfile())));

  const handleSave = () => {
    if (num(weight) <= 0 || currentHeightCm() <= 0 || num(age) <= 0) {
      setError('Please enter your age, height and weight.');
      return;
    }
    const p = draftProfile();
    const g: Goals = {
      dailySteps: clamp(Math.round(num(steps, 10000)), 1000, 50000),
      weeklyWorkouts: clamp(Math.round(num(weekly, 4)), 1, 14),
      targetWeightKg: clamp(displayToKg(num(targetWeight, kgToDisplay(p.weightKg, units)), units), 30, 300),
      dailyCalories: clamp(Math.round(num(calories, tdee(p))), 800, 8000),
      dailyProteinG: clamp(Math.round(num(protein, 100)), 10, 500),
      dailyWaterMl: clamp(displayToMl(num(water, 2500), units), 500, 8000),
    };
    if (isOnboarding) {
      // Untouched body-dependent defaults should follow the weight/height the user just entered.
      const s = suggestedGoals(p, { dailySteps: g.dailySteps, weeklyWorkouts: g.weeklyWorkouts });
      if (g.dailyCalories === goals.dailyCalories) g.dailyCalories = s.dailyCalories;
      if (g.dailyProteinG === goals.dailyProteinG) g.dailyProteinG = s.dailyProteinG;
      if (g.dailyWaterMl === goals.dailyWaterMl) g.dailyWaterMl = s.dailyWaterMl;
      if (Math.abs(g.targetWeightKg - goals.targetWeightKg) < 0.05) g.targetWeightKg = p.weightKg;
    }
    onSave(p, g);
  };

  const draft = draftProfile();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!isOnboarding}
      title={isOnboarding ? 'Welcome to Minimal Fitness' : 'Profile & Goals'}
      icon={<UserRound className="w-4 h-4" style={{ color: theme.primary }} />}
      footer={
        <div className="space-y-2">
          {error && (
            <p role="alert" className="text-xs text-rose-400">
              {error}
            </p>
          )}
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-xl font-bold text-xs text-black transition-colors"
            style={{ backgroundColor: theme.primary }}
          >
            {isOnboarding ? 'Get started' : 'Save profile & goals'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {isOnboarding && (
          <p className="text-xs text-[#7E889B] leading-relaxed">
            A few details let the app size your heart-rate zones, calorie burn and daily targets. Everything is
            stored only on this device.
          </p>
        )}

        <div className="grid grid-cols-2 gap-1 p-1 bg-black/60 rounded-xl border border-[#1A1E26]" role="group" aria-label="Units">
          {(['metric', 'imperial'] as UnitSystem[]).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={units === u}
              onClick={() => switchUnits(u)}
              className={`py-1.5 rounded-lg text-xs font-semibold ${
                units === u ? 'bg-neutral-900 border border-neutral-700' : 'text-neutral-400'
              }`}
              style={{ color: units === u ? theme.primary : undefined }}
            >
              {u === 'metric' ? 'Metric (kg, km)' : 'Imperial (lb, mi)'}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className={labelClass} htmlFor="pf-name">
            Name (optional)
          </label>
          <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pf-age">
              Age
            </label>
            <input id="pf-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className={fieldClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pf-sex">
              Sex (for calorie math)
            </label>
            <select id="pf-sex" value={sex} onChange={(e) => setSex(e.target.value as Sex)} className={fieldClass}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className={labelClass}>Height ({lengthUnit(units) === 'in' ? 'ft / in' : 'cm'})</span>
            {units === 'imperial' ? (
              <div className="grid grid-cols-2 gap-1">
                <input aria-label="Height feet" inputMode="numeric" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} className={fieldClass} />
                <input aria-label="Height inches" inputMode="numeric" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} className={fieldClass} />
              </div>
            ) : (
              <input aria-label="Height in centimetres" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={fieldClass} />
            )}
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pf-weight">
              Weight ({weightUnit(units)})
            </label>
            <input id="pf-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className={fieldClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pf-act">
              Activity level
            </label>
            <select id="pf-act" value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className={fieldClass}>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light (1-3 days)</option>
              <option value="moderate">Moderate (3-5 days)</option>
              <option value="active">Very active (6-7 days)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pf-rhr">
              Resting HR (bpm)
            </label>
            <input id="pf-rhr" inputMode="numeric" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} className={fieldClass} />
          </div>
        </div>

        <p className="text-[11px] text-[#7E889B] font-mono">
          Estimated max HR {estimateMaxHr(draft.age)} bpm · maintenance ≈ {tdee(draft)} kcal/day
        </p>

        <div className="pt-2 border-t border-[#1A1E26] space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">Daily & weekly goals</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={labelClass} htmlFor="g-steps">
                Steps / day
              </label>
              <input id="g-steps" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="g-weekly">
                Workouts / week
              </label>
              <input id="g-weekly" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="g-cal">
                Calories / day
              </label>
              <input id="g-cal" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} className={fieldClass} />
              <button type="button" onClick={useSuggestedCalories} className="text-[10px] underline" style={{ color: theme.primary }}>
                Use maintenance estimate
              </button>
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="g-protein">
                Protein (g / day)
              </label>
              <input id="g-protein" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="g-water">
                Water ({volumeUnit(units)} / day)
              </label>
              <input id="g-water" inputMode="numeric" value={water} onChange={(e) => setWater(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="g-tw">
                Target weight ({weightUnit(units)})
              </label>
              <input id="g-tw" inputMode="decimal" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} className={fieldClass} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
