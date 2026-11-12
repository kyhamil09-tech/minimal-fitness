import { useCallback, useState } from 'react';
import { KEY_PREFIX, readStored } from '../hooks/usePersistentState';
import { ProgressionRule, ProgressionRules } from './progression';

const KEY = 'exercise_progress';

/** The saved rules, read fresh each time (the workout screen and the routine editor both change them). */
export const getRules = (): ProgressionRules => {
  const raw = readStored<ProgressionRules>(KEY, {});
  const out: ProgressionRules = {};
  // A rule being typed (a step of 0 for a moment) is kept; it simply does nothing until it is valid.
  for (const [id, r] of Object.entries(raw ?? {})) if (r && typeof r.step === 'number' && typeof r.reps === 'number') out[id] = r;
  return out;
};

const save = (rules: ProgressionRules) => {
  try {
    localStorage.setItem(KEY_PREFIX + KEY, JSON.stringify(rules));
  } catch {
    // storage full: the rule works until the app is closed
  }
};

/** Sets (or, with null, removes) an exercise's rule. */
export const setRule = (exerciseId: string, rule: ProgressionRule | null): ProgressionRules => {
  const rules = getRules();
  if (rule) rules[exerciseId] = rule;
  else delete rules[exerciseId];
  save(rules);
  return rules;
};

/** The rules as React state that follows changes made through this hook. */
export const useProgressionRules = (): [ProgressionRules, (exerciseId: string, rule: ProgressionRule | null) => void] => {
  const [rules, setRules] = useState<ProgressionRules>(getRules);
  const change = useCallback((id: string, rule: ProgressionRule | null) => setRules(setRule(id, rule)), []);
  return [rules, change];
};
