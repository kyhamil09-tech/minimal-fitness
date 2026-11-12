/**
 * Guided sessions: a few lines of calm, spoken or read at set moments. The phone's own voice says them when Voice is on; they are also
 * shown on the screen, so a session works with no sound at all. They are for relaxation, not treatment.
 */
export interface GuidedLine {
  /** Seconds from the start. */
  at: number;
  text: string;
}

export interface GuidedSession {
  id: string;
  title: string;
  line: string;
  minutes: number;
  hue: string;
  lines: GuidedLine[];
}

const spaced = (start: number, gap: number, texts: string[]): GuidedLine[] => texts.map((text, i) => ({ at: start + i * gap, text }));

export const GUIDED: GuidedSession[] = [
  {
    id: 'guided-reset',
    title: 'Three-minute reset',
    line: 'A short pause in the middle of a busy day.',
    minutes: 3,
    hue: '#5EEAD4',
    lines: spaced(2, 14, [
      'Stop what you are doing. Let your hands rest.',
      'Take a slow breath in through your nose.',
      'And let it go with a long breath out.',
      'Notice where you are sitting. Feel the chair beneath you.',
      'Let your shoulders drop, just a little.',
      'Unclench your jaw. Let your tongue rest.',
      'Breathe in slowly. Breathe out slowly.',
      'There is nothing you need to do right now.',
      'If your mind wanders, that is fine. Gently come back to the breath.',
      'Notice how you feel, without trying to change it.',
      'One more slow breath in.',
      'And a long breath out.',
      'When you are ready, open your eyes and carry this calm with you.',
    ]),
  },
  {
    id: 'guided-thanks',
    title: 'A moment of thanks',
    line: 'Bring to mind what is going well.',
    minutes: 5,
    hue: '#FBBF24',
    lines: spaced(3, 18, [
      'Sit comfortably and close your eyes if you like.',
      'Take three slow breaths. In through the nose, out through the mouth.',
      'Let your body feel supported by whatever is holding you up.',
      'Bring to mind one thing from today that was good, however small.',
      'Stay with it. Notice how it feels in your body.',
      'Now think of a person you are glad to have in your life.',
      'Picture them, and let a quiet thank you rise.',
      'Think of something about your body that works for you today.',
      'Maybe your legs that carry you, or your breath that keeps going on its own.',
      'Notice any warmth or lightness, and let it grow a little.',
      'If you feel nothing in particular, that is perfectly all right.',
      'Take a slow breath in, and let it out with a sigh.',
      'Let the day, and what is in it, rest for a moment.',
      'When you are ready, gently open your eyes.',
    ]),
  },
  {
    id: 'guided-winddown',
    title: 'Evening wind-down',
    line: 'Let the day go before sleep.',
    minutes: 7,
    hue: '#A78BFA',
    lines: spaced(3, 20, [
      'Lie down comfortably and let your eyes close.',
      'Take a slow breath in, and a long breath out.',
      'Let the bed take the weight of your body.',
      'Feel your head resting. Let your forehead soften.',
      'Let your eyes feel heavy, and your jaw loosen.',
      'Let your neck and shoulders sink down.',
      'Feel your arms grow heavy, all the way to your fingertips.',
      'Let your chest rise and fall on its own.',
      'Soften your belly. There is nothing to hold in.',
      'Let your hips and legs grow heavy and warm.',
      'Feel your feet, and let them rest.',
      'If thoughts about tomorrow appear, let them drift past like clouds.',
      'You do not need to solve anything tonight.',
      'With each breath out, sink a little deeper into the bed.',
      'Breathing in slowly. Breathing out even more slowly.',
      'You are safe, and the day is done.',
      'Let sleep come when it comes.',
      'Rest here for as long as you like.',
    ]),
  },
  {
    id: 'guided-bodyscan',
    title: 'Body scan',
    line: 'Move your attention slowly through the body, head to toe.',
    minutes: 10,
    hue: '#7DD3FC',
    lines: spaced(3, 20, [
      'Lie down or sit comfortably. Let your eyes close.',
      'Take a slow breath in through your nose, and a long breath out.',
      'We will move through the body one part at a time. Just notice, without changing anything.',
      'Start with the top of your head. Notice any feeling there.',
      'Move to your forehead and the space around your eyes.',
      'Notice your cheeks and your jaw. Let them soften if they can.',
      'Notice your neck and the back of your head resting.',
      'Bring your attention to your shoulders. Let them drop.',
      'Move down your right arm, through the elbow, the wrist, the hand and each finger.',
      'Now your left arm: the elbow, the wrist, the hand and each finger.',
      'Notice your chest. Feel it rise and fall with each breath.',
      'Notice your upper back, and your lower back against what holds you.',
      'Bring your attention to your belly. Let it be soft.',
      'Move to your hips and the base of your spine.',
      'Notice your right leg: the thigh, the knee, the calf and the foot.',
      'Now your left leg: the thigh, the knee, the calf and the foot.',
      'Let your attention rest on both feet, and all your toes.',
      'Now feel your whole body at once, breathing.',
      'If you notice tension anywhere, breathe gently towards it. There is no need to fix it.',
      'If your mind has wandered, that is normal. Each time you notice, come back.',
      'Take a slow breath in. Wiggle your fingers and toes.',
      'When you are ready, open your eyes, and take your time getting up.',
    ]),
  },
];

export const guidedById = (id: string): GuidedSession | undefined => GUIDED.find((g) => g.id === id);

/** The line to show at a moment: the latest one whose time has come (empty before the first). */
export const lineAt = (s: GuidedSession, t: number): GuidedLine | null => {
  let cur: GuidedLine | null = null;
  for (const l of s.lines) if (l.at <= t) cur = l;
  return cur;
};
