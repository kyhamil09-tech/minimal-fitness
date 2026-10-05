import { HealthLogEntry } from '../types/tracking';

export type Tone = 'good' | 'watch' | 'high' | 'low';

export interface Reading {
  label: string;
  tone: Tone;
}

/** American Heart Association blood-pressure categories (a guide, not a diagnosis). */
export const classifyBp = (systolic: number, diastolic: number): Reading => {
  if (systolic > 180 || diastolic > 120) return { label: 'Very high: get medical advice now', tone: 'high' };
  if (systolic >= 140 || diastolic >= 90) return { label: 'High (stage 2)', tone: 'high' };
  if (systolic >= 130 || diastolic >= 80) return { label: 'High (stage 1)', tone: 'watch' };
  if (systolic >= 120) return { label: 'Elevated', tone: 'watch' };
  if (systolic < 90 || diastolic < 60) return { label: 'Low', tone: 'low' };
  return { label: 'Normal', tone: 'good' };
};

export type GlucoseRelation = 'fasting' | 'before' | 'after' | 'general';

/** Typical ranges from the American Diabetes Association for adults (a guide, not a diagnosis). */
export const classifyGlucose = (mgdl: number, relation: GlucoseRelation): Reading => {
  if (mgdl < 70) return { label: 'Low', tone: 'low' };
  if (relation === 'fasting' || relation === 'before') {
    if (mgdl < 100) return { label: 'In the usual range', tone: 'good' };
    if (mgdl < 126) return { label: 'Above the usual range', tone: 'watch' };
    return { label: 'High', tone: 'high' };
  }
  if (relation === 'after') {
    if (mgdl < 140) return { label: 'In the usual range', tone: 'good' };
    if (mgdl < 180) return { label: 'Above the usual range', tone: 'watch' };
    return { label: 'High', tone: 'high' };
  }
  if (mgdl < 140) return { label: 'In the usual range', tone: 'good' };
  if (mgdl < 200) return { label: 'Above the usual range', tone: 'watch' };
  return { label: 'High', tone: 'high' };
};

export const mgdlToMmol = (mgdl: number) => Math.round((mgdl / 18.0182) * 10) / 10;

/** Adds readings that arrived from Health Connect without duplicating ones already in the log. */
export const mergeImportedLogs = (existing: HealthLogEntry[], incoming: HealthLogEntry[]): HealthLogEntry[] => {
  const have = new Set(existing.map((e) => e.id));
  const add = incoming.filter((e) => !have.has(e.id));
  if (add.length === 0) return existing;
  return [...existing, ...add].sort((a, b) => b.at - a.at);
};

/** Medication and symptom names used before, most recent first, for one-tap re-logging. */
export const recentNames = (entries: HealthLogEntry[], kind: 'med' | 'symptom', max = 6): string[] => {
  const out: string[] = [];
  for (const e of [...entries].sort((a, b) => b.at - a.at)) {
    if (e.kind === kind && e.name && !out.includes(e.name)) out.push(e.name);
    if (out.length >= max) break;
  }
  return out;
};
