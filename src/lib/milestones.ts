/**
 * Spoken milestones toward a distance or time goal: halfway, a quarter to go, the last kilometer or the last five minutes. Each
 * one is said once. The live screen calls {@link nextMilestone} every second with how far along the goal you are.
 */

export interface MilestoneInput {
  type: 'distance' | 'time';
  /** Goal in kilometers (distance) or minutes (time). */
  goal: number;
  /** Done so far, in the same unit as the goal. */
  done: number;
  said: ReadonlySet<string>;
  miles?: boolean;
}

export interface Milestone {
  id: string;
  text: string;
}

const KM_PER_MI = 1.609344;

const spokenDist = (km: number, miles: boolean): string => {
  const v = miles ? km / KM_PER_MI : km;
  const unit = miles ? 'mile' : 'kilometer';
  if (v < 0.95) return `${Math.round((v * (miles ? 1760 : 1000)) / 50) * 50} ${miles ? 'yards' : 'meters'}`;
  const r = Math.round(v * 10) / 10;
  return `${r} ${unit}${r === 1 ? '' : 's'}`;
};

/** Candidate cues from earliest to latest; the most advanced one not yet said and already reached is returned. */
export const nextMilestone = (i: MilestoneInput): Milestone | null => {
  if (!(i.goal > 0) || i.done <= 0) return null;
  const miles = !!i.miles;
  const frac = i.done / i.goal;
  const remaining = i.goal - i.done;
  const cues: { id: string; reached: boolean; text: string }[] = [];

  // Short goals do not need a running commentary.
  const long = i.type === 'distance' ? i.goal >= 3 : i.goal >= 20;
  if (long) {
    cues.push({ id: 'quarter', reached: frac >= 0.25, text: 'A quarter done.' });
    cues.push({ id: 'half', reached: frac >= 0.5, text: 'Halfway.' });
    cues.push({ id: 'three-quarter', reached: frac >= 0.75, text: 'Three quarters done. Stay strong.' });
  } else {
    cues.push({ id: 'half', reached: frac >= 0.5, text: 'Halfway.' });
  }
  if (i.type === 'distance') {
    const lastUnit = miles ? KM_PER_MI : 1;
    if (i.goal > lastUnit * 2) cues.push({ id: 'last-unit', reached: remaining <= lastUnit, text: `Last ${miles ? 'mile' : 'kilometer'}.` });
    cues.push({ id: 'last-500', reached: remaining <= 0.5 && i.goal > 1, text: `${spokenDist(Math.max(remaining, 0.05), miles)} to go.` });
  } else {
    if (i.goal > 15) cues.push({ id: 'last-5', reached: remaining <= 5, text: 'Five minutes to go.' });
    cues.push({ id: 'last-1', reached: remaining <= 1 && i.goal > 5, text: 'One minute to go. Finish strong.' });
  }
  // Skip over a cue once a later one has been reached (a missed fix should not replay "halfway" at the finish).
  const reachedIdx = cues.map((c, k) => (c.reached ? k : -1)).filter((k) => k >= 0);
  if (!reachedIdx.length) return null;
  const latest = cues[Math.max(...reachedIdx)];
  if (i.said.has(latest.id)) return null;
  return { id: latest.id, text: latest.text };
};
