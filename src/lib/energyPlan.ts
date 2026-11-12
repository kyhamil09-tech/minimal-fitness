import { bmi, bmr, tdee } from './calc';
import type { UserProfile } from '../types/tracking';
import type { MessageKey } from '../locales/en';

/** A thing worth saying plainly: a message key and its fill-ins, shown in the app's language. */
export interface PlanNote {
  key: MessageKey;
  vars?: Record<string, string | number>;
}

/**
 * A calorie target for losing weight, keeping it, or gaining, worked out from your own profile. General guidance, not medical advice.
 * Maintenance is the Mifflin-St Jeor resting need times your activity level (see calc.ts). A change of about 7,700 kcal is taken as 1 kg
 * of body weight, which is a rough rule: real bodies adapt, so treat the date as a guide and adjust from what the scale does.
 */
export type GoalMode = 'lose' | 'maintain' | 'gain';

export const KCAL_PER_KG = 7700;

/** Weekly change choices, in kg a week. */
export const RATES_KG = { lose: [0.25, 0.5, 0.75], gain: [0.25, 0.5] } as const;

export interface EnergyInput {
  profile: Pick<UserProfile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activityLevel'>;
  /** The weight now (the latest logged), which may differ from the profile's. */
  currentKg: number;
  targetKg: number;
  mode: GoalMode;
  /** kg a week, for lose and gain. */
  weeklyKg: number;
  /** Your measured maintenance (see adaptiveTdee), used instead of the profile formula when given. */
  maintenanceKcal?: number;
  /** Today, only used to name the estimated date. */
  today?: Date;
}

export interface EnergyPlan {
  bmi: number;
  healthyMinKg: number;
  healthyMaxKg: number;
  bmr: number;
  maintenance: number;
  /** The daily calories to aim for. */
  target: number;
  /** Target minus maintenance: negative to lose, positive to gain. */
  dailyDelta: number;
  /** True when the rate asked for was brought up to the safe floor or down to a safe pace. */
  adjusted: boolean;
  /** Estimated weeks to reach the target weight at this pace, when it makes sense. */
  weeks?: number;
  /** Estimated date (YYYY-MM-DD) to reach the target weight. */
  reachBy?: string;
  /** Protein to aim for, g a day. */
  proteinG: number;
  /** Things worth saying plainly, such as a target below the healthy range. */
  notes: PlanNote[];
}

/** The lowest daily calories this tool will suggest. Many dietitians use 1,200 for women and 1,500 for men as a floor without supervision. */
export const calorieFloor = (sex: UserProfile['sex']): number => (sex === 'female' ? 1200 : sex === 'male' ? 1500 : 1350);

const round5 = (n: number) => Math.round(n / 5) * 5;

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const planEnergy = (i: EnergyInput): EnergyPlan => {
  const { profile, currentKg, targetKg, mode } = i;
  const m = Math.max(0.5, profile.heightCm / 100);
  const maintenance = i.maintenanceKcal && i.maintenanceKcal > 0 ? Math.round(i.maintenanceKcal) : tdee({ ...profile, weightKg: currentKg });
  const notes: PlanNote[] = [];
  let adjusted = false;
  let weekly = mode === 'maintain' ? 0 : Math.max(0.1, i.weeklyKg);

  // No more than 1% of body weight a week when losing, and gaining stays gentle.
  const cap = mode === 'lose' ? Math.max(0.25, currentKg * 0.01) : 0.5;
  if (weekly > cap) {
    weekly = cap;
    adjusted = true;
  }

  let delta = mode === 'lose' ? -(weekly * KCAL_PER_KG) / 7 : mode === 'gain' ? (weekly * KCAL_PER_KG) / 7 : 0;
  let target = round5(maintenance + delta);
  if (mode === 'lose') {
    const floor = calorieFloor(profile.sex);
    if (target < floor) {
      target = floor;
      adjusted = true;
      notes.push({ key: 'cal.note.floor', vars: { floor: floor.toLocaleString() } });
    }
  }
  delta = target - maintenance;
  if (mode !== 'maintain') weekly = Math.abs((delta * 7) / KCAL_PER_KG);

  const healthyMinKg = Math.round(18.5 * m * m * 10) / 10;
  const healthyMaxKg = Math.round(24.9 * m * m * 10) / 10;
  const bmiNow = bmi(currentKg, profile.heightCm);

  if (profile.age < 18) notes.push({ key: 'cal.note.under18' });
  if (mode === 'lose' && bmiNow < 18.5) notes.push({ key: 'cal.note.alreadyUnder' });
  if (mode === 'lose' && targetKg < healthyMinKg) notes.push({ key: 'cal.note.belowHealthy', vars: { min: healthyMinKg, max: healthyMaxKg } });
  if (mode === 'lose' && targetKg >= currentKg) notes.push({ key: 'cal.note.loseWrong' });
  if (mode === 'gain' && targetKg <= currentKg) notes.push({ key: 'cal.note.gainWrong' });

  let weeks: number | undefined;
  let reachBy: string | undefined;
  const away = Math.abs(targetKg - currentKg);
  const rightWay = (mode === 'lose' && targetKg < currentKg) || (mode === 'gain' && targetKg > currentKg);
  if (rightWay && weekly > 0.01 && away > 0.05) {
    weeks = Math.max(1, Math.ceil(away / weekly));
    if (weeks <= 156) {
      const d = new Date(i.today ?? new Date());
      d.setDate(d.getDate() + weeks * 7);
      reachBy = dateKey(d);
    } else weeks = undefined;
  }

  // About 1.6 g per kg of body weight suits people who train, whether losing, keeping or gaining.
  const basisKg = Math.min(currentKg, healthyMaxKg + 10);
  const proteinG = Math.round(1.6 * basisKg);

  return { bmi: bmiNow, healthyMinKg, healthyMaxKg, bmr: bmr({ ...profile, weightKg: currentKg }), maintenance, target, dailyDelta: delta, adjusted, weeks, reachBy, proteinG, notes };
};
