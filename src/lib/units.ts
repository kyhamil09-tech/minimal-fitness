import { UnitSystem } from '../types/tracking';

export const KG_PER_LB = 0.45359237;
export const KM_PER_MI = 1.609344;
export const CM_PER_IN = 2.54;
export const ML_PER_FLOZ = 29.5735;

const round = (n: number, digits: number) => {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
};

export const weightUnit = (u: UnitSystem) => (u === 'imperial' ? 'lb' : 'kg');
export const distanceUnit = (u: UnitSystem) => (u === 'imperial' ? 'mi' : 'km');
export const lengthUnit = (u: UnitSystem) => (u === 'imperial' ? 'in' : 'cm');
export const volumeUnit = (u: UnitSystem) => (u === 'imperial' ? 'fl oz' : 'ml');

export const kgToDisplay = (kg: number, u: UnitSystem, digits = 1) =>
  round(u === 'imperial' ? kg / KG_PER_LB : kg, digits);
export const displayToKg = (v: number, u: UnitSystem) => (u === 'imperial' ? v * KG_PER_LB : v);

export const kmToDisplay = (km: number, u: UnitSystem, digits = 2) =>
  round(u === 'imperial' ? km / KM_PER_MI : km, digits);

export const cmToDisplay = (cm: number, u: UnitSystem, digits = 1) =>
  round(u === 'imperial' ? cm / CM_PER_IN : cm, digits);
export const displayToCm = (v: number, u: UnitSystem) => (u === 'imperial' ? v * CM_PER_IN : v);

export const mlToDisplay = (ml: number, u: UnitSystem) =>
  u === 'imperial' ? Math.round(ml / ML_PER_FLOZ) : Math.round(ml);
export const displayToMl = (v: number, u: UnitSystem) =>
  u === 'imperial' ? Math.round(v * ML_PER_FLOZ) : Math.round(v);

export const formatWeight = (kg: number, u: UnitSystem, digits = 1) =>
  `${kgToDisplay(kg, u, digits)} ${weightUnit(u)}`;
export const formatDistance = (km: number, u: UnitSystem, digits = 2) =>
  `${kmToDisplay(km, u, digits)} ${distanceUnit(u)}`;

export const cmToFtIn = (cm: number) => {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, inch };
};
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * CM_PER_IN;

/** Pace in min per display-distance-unit, formatted m:ss. */
export const formatPace = (minutes: number, km: number, u: UnitSystem) => {
  const dist = u === 'imperial' ? km / KM_PER_MI : km;
  if (dist <= 0 || minutes <= 0) return '--:--';
  const pace = minutes / dist;
  let m = Math.floor(pace);
  let s = Math.round((pace - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};
