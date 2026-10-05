/**
 * Fitness, fatigue and form from daily training load (the Banister impulse-response model, as used by TrainingPeaks and others).
 * Every workout adds load. Fitness is a slow average of that load (about 6 weeks), fatigue a fast one (about a week); form is
 * the gap between them: positive means rested, strongly negative means you are carrying a lot of tiredness.
 */
export interface BanisterDay {
  date: string;
  load: number;
  /** Chronic training load: the 42-day exponentially weighted average ("fitness"). */
  fitness: number;
  /** Acute training load: the 7-day exponentially weighted average ("fatigue"). */
  fatigue: number;
  /** Form, fitness minus fatigue, both as they stood the morning of that day. */
  form: number;
}

export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;

/**
 * Runs the model over daily loads, oldest first. {@code seed} is the fitness and fatigue to start from (0 when there is no
 * earlier history; start the run far enough back for the numbers to settle).
 */
export const banister = (days: { date: string; load: number }[], seed: { fitness: number; fatigue: number } = { fitness: 0, fatigue: 0 }): BanisterDay[] => {
  let ctl = seed.fitness;
  let atl = seed.fatigue;
  return days.map((d) => {
    const form = ctl - atl; // before today's load is added
    ctl += (d.load - ctl) / FITNESS_DAYS;
    atl += (d.load - atl) / FATIGUE_DAYS;
    return { date: d.date, load: d.load, fitness: ctl, fatigue: atl, form };
  });
};

export type FormState = 'fresh' | 'ready' | 'neutral' | 'productive' | 'tired' | 'overreaching';

/** Plain-language reading of form, relative to how much training you normally do (form 10 means more to a light trainer). */
export const formState = (form: number, fitness: number): { id: FormState; label: string; message: string; tone: 'good' | 'neutral' | 'warn' | 'bad' } => {
  // Scale by fitness so a small training base is not judged by a big base's numbers.
  const rel = fitness > 5 ? form / fitness : form / 5;
  if (rel > 0.3) return { id: 'fresh', label: 'Very fresh', message: 'Well rested. If you have not trained for a while, fitness is slipping: time to build again.', tone: 'neutral' };
  if (rel > 0.05) return { id: 'ready', label: 'Fresh', message: 'Rested with your fitness intact. A good time for a hard session or a race.', tone: 'good' };
  if (rel > -0.1) return { id: 'neutral', label: 'Balanced', message: 'Fatigue matches your fitness. A steady week.', tone: 'neutral' };
  if (rel > -0.3) return { id: 'productive', label: 'Building', message: 'Carrying some fatigue while building fitness: the productive zone for most training blocks.', tone: 'good' };
  if (rel > -0.5) return { id: 'tired', label: 'Heavy', message: 'A lot of recent load against your fitness. Keep easy days easy.', tone: 'warn' };
  return { id: 'overreaching', label: 'Overreaching', message: 'Fatigue far above fitness. Rest or a very light week will let the training take effect.', tone: 'bad' };
};
