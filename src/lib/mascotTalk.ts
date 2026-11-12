/** What the Google-inspired theme's bot mascots say on Home, chosen from how the day is going. Tapping a bot moves to the next line. */
export interface TalkInput {
  /** The hour of the day, 0 to 23. */
  hour: number;
  /** Steps so far as a percentage of the goal. */
  stepsPct: number;
  /** Days in a row with a workout. */
  streak: number;
  workoutDoneToday: boolean;
  name?: string;
}

const pick = (lines: string[], n: number) => lines[((n % lines.length) + lines.length) % lines.length];

export const mascotLine = (i: TalkInput, n = 0): string => {
  const who = i.name?.trim() ? `, ${i.name.trim()}` : '';
  if (i.workoutDoneToday) {
    return pick([`Workout done${who}. Nice work!`, 'That one counts. Rest and drink some water.', `You showed up today${who}. That is the hard part.`], n);
  }
  if (i.stepsPct >= 100) return pick([`Step goal reached${who}!`, 'Goal smashed. Anything more is a bonus.', 'Every step past the goal is a gift to tomorrow.'], n);
  if (i.stepsPct >= 60) return pick([`More than halfway to your step goal${who}.`, 'A short walk would nearly finish it.', 'You are closer than you think.'], n);
  if (i.hour < 10) return pick([`Good morning${who}! Ready to move?`, 'A few minutes outside wakes everything up.', 'Water first, then a walk?'], n);
  if (i.hour >= 21) return pick(['Time to wind down. Sleep is training too.', 'Dim the lights and rest up.', `Good night soon${who}.`], n);
  if (i.streak >= 3) return pick([`${i.streak} days in a row${who}. Keep it rolling!`, 'The streak likes company. One more today?', 'Small and steady wins.'], n);
  return pick([`Let's go${who}!`, 'A short walk counts.', 'Pick one thing and start. We are here.'], n);
};
