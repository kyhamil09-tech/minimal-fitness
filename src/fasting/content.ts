/**
 * What the Fasting side says: the protocols, the stages of a fast, what does and does not break one, how to break a fast, and the safety
 * wording. The stage and food notes are general and approximate: bodies differ a lot, and some of what is claimed online about fasting
 * is not well established in people. They are not medical advice.
 */

export type ProtocolLevel = 'Gentle' | 'Standard' | 'Advanced' | 'Extended';

export interface Protocol {
  id: string;
  /** What the fast is called in the history (kept in the same field the older fasts used). */
  name: string;
  fastHours: number;
  level: ProtocolLevel;
  tagline: string;
  about: string;
  /** A typical day, in order. */
  day: string[];
  goodFor: string[];
  /** A note of care, shown on the page and before starting. */
  care: string;
  /** Fasts of a day or more ask for an extra confirmation before they start. */
  gated: boolean;
  hue: string;
}

export const MAX_FAST_HOURS = 48;

export const PROTOCOLS: Protocol[] = [
  {
    id: '12-12',
    name: '12:12 Rhythm',
    fastHours: 12,
    level: 'Gentle',
    tagline: 'A twelve-hour night break',
    about: 'Eat during twelve hours of the day and rest from food for the other twelve, mostly overnight. The easiest way to start, and for many people it is simply a tidy-up of the evening snack.',
    day: ['Breakfast at 8:00', 'Meals through the day', 'Last bite at 20:00', 'Overnight break until 8:00'],
    goodFor: ['A first try', 'Cutting late-night snacking', 'A steady daily rhythm'],
    care: 'Gentle for most healthy adults. Skip it and eat if you feel faint or unwell.',
    gated: false,
    hue: '#86EFAC',
  },
  {
    id: '14-10',
    name: '14:10 Gentle',
    fastHours: 14,
    level: 'Gentle',
    tagline: 'Fourteen hours off, ten to eat',
    about: 'A small step beyond the overnight break. Finish dinner a little earlier or have breakfast a little later, and you are there.',
    day: ['Breakfast at 9:00', 'Meals and snacks until 19:00', 'Overnight break and a morning without food until 9:00'],
    goodFor: ['Easing in', 'A calmer evening', 'People who get hungry early'],
    care: 'Gentle for most healthy adults. Drink water and stop if you feel unwell.',
    gated: false,
    hue: '#7DD3FC',
  },
  {
    id: '16-8',
    name: '16:8 Classic',
    fastHours: 16,
    level: 'Standard',
    tagline: 'The most popular: skip one meal',
    about: 'Eat within an eight-hour window, for example noon to 8 pm, and fast for the other sixteen. Most people do it by moving breakfast later.',
    day: ['Water or black coffee in the morning', 'First meal at 12:00', 'Second meal or snacks in the afternoon', 'Last meal by 20:00'],
    goodFor: ['A regular routine', 'Fewer meals to plan', 'Many people who have done 14:10 comfortably'],
    care: 'Not for children, pregnancy, breastfeeding, a history of eating disorders, or diabetes treatment without a doctor. Eat enough in the window.',
    gated: false,
    hue: '#FFB547',
  },
  {
    id: '18-6',
    name: '18:6 Warrior',
    fastHours: 18,
    level: 'Advanced',
    tagline: 'Two meals in a six-hour window',
    about: 'A shorter eating window, usually two proper meals. It needs more planning to get enough protein and nutrients in.',
    day: ['Morning: water, black coffee or tea', 'First meal at 13:00', 'Second meal at 18:00', 'Fast from 19:00'],
    goodFor: ['People already comfortable with 16:8', 'A tight daily window'],
    care: 'Make sure the two meals are real meals. If you are tired, cold, irritable or training hard, go back to a shorter fast.',
    gated: false,
    hue: '#FB923C',
  },
  {
    id: '20-4',
    name: '20:4 One big window',
    fastHours: 20,
    level: 'Advanced',
    tagline: 'One or two meals in four hours',
    about: 'A narrow window, often one large meal and a snack. It can be hard to get enough nutrition in, so build the meal well.',
    day: ['Fast with water, tea or black coffee', 'Meal at 17:00', 'A smaller second meal or snack', 'Fast from 21:00'],
    goodFor: ['Experienced fasters', 'People who prefer one evening meal'],
    care: 'Not for everyone. Skip hard training on this kind of day, and break the fast gently.',
    gated: false,
    hue: '#F97316',
  },
  {
    id: '23-1',
    name: '23:1 One meal a day',
    fastHours: 23,
    level: 'Advanced',
    tagline: 'OMAD: a single meal',
    about: 'One meal a day. Getting protein, fiber and enough energy into a single meal takes thought, and many people find it too much over time.',
    day: ['Water, tea, black coffee all day', 'One complete meal at around 18:00', 'Overnight break'],
    goodFor: ['Occasional use', 'People who already do 20:4 comfortably'],
    care: 'Not recommended for many people, and not a daily habit for most. Talk to a doctor first if you have any health condition.',
    gated: true,
    hue: '#EF4444',
  },
  {
    id: '24-0',
    name: '24 h Full day',
    fastHours: 24,
    level: 'Extended',
    tagline: 'Dinner to dinner, once or twice a week',
    about: 'Stop eating after one meal and eat again the next day at the same time. Done once or twice a week, not on consecutive days.',
    day: ['Finish dinner at 19:00', 'Water, tea and black coffee through the next day', 'Break the fast with a light meal at 19:00'],
    goodFor: ['Experienced fasters', 'A weekly reset'],
    care: 'Ask a doctor first if you take any medicine, have any health condition, are active or older. Stop if you feel faint, confused or unwell. Break it gently.',
    gated: true,
    hue: '#DC2626',
  },
  {
    id: '36-0',
    name: '36 h Extended',
    fastHours: 36,
    level: 'Extended',
    tagline: 'A day and a half, occasionally',
    about: 'A long fast that covers a whole day and the nights either side. Not an everyday approach, and the longest the app offers. Anything longer needs a doctor.',
    day: ['Finish dinner on day one', 'All of day two with water, tea and black coffee', 'Light breakfast on day three'],
    goodFor: ['Only people who have done 24 h fasts comfortably', 'Occasional use'],
    care: 'Talk to a doctor first. Not for anyone with a health condition, taking medicines, underweight, pregnant, or with any history of disordered eating. Include electrolytes and stop if you feel unwell.',
    gated: true,
    hue: '#B91C1C',
  },
];

export const protocolById = (id: string): Protocol | undefined => PROTOCOLS.find((p) => p.id === id);

/** The protocol a stored fast belongs to, by the name it was saved with (older fasts used a name only). */
export const protocolByName = (name: string): Protocol | undefined => PROTOCOLS.find((p) => p.name === name) ?? PROTOCOLS.find((p) => name.startsWith(p.name.split(' ')[0]));

// ---------------------------------------------------------------------------------------------
// Stages: general, approximate, and said as such
// ---------------------------------------------------------------------------------------------

export interface StageInfo {
  id: string;
  from: number;
  to: number;
  name: string;
  /** One line for the dial. */
  line: string;
  /** What commonly happens, in a few sentences, hedged. */
  detail: string;
  /** What you might feel. */
  feel: string;
  hue: string;
}

export const STAGES: StageInfo[] = [
  {
    id: 'digest',
    from: 0,
    to: 4,
    name: 'Digesting',
    line: 'Your last meal is still being absorbed',
    detail: 'Blood sugar and insulin are higher while food is digested and the energy is used or stored.',
    feel: 'Usually comfortable. Hunger is rarely a problem yet.',
    hue: '#FDBA74',
  },
  {
    id: 'settle',
    from: 4,
    to: 8,
    name: 'Settling',
    line: 'Blood sugar and insulin are coming down',
    detail: 'Absorption is finishing. Insulin drifts down and the body starts drawing on its stored sugar (glycogen) in the liver.',
    feel: 'Hunger can arrive in waves around your usual meal times, and then pass.',
    hue: '#FBBF24',
  },
  {
    id: 'switch',
    from: 8,
    to: 12,
    name: 'Switching over',
    line: 'Leaning more on stored energy',
    detail: 'Liver sugar stores are being used and the body begins to rely a little more on fat for fuel. How quickly depends on your last meal, your activity and you.',
    feel: 'Many people feel fine. Some feel a dip in energy or mood, especially if they are not yet used to fasting.',
    hue: '#F59E0B',
  },
  {
    id: 'burn',
    from: 12,
    to: 16,
    name: 'Fat use rising',
    line: 'Fat is a bigger part of the fuel mix',
    detail: 'Fat use rises and the liver begins making small amounts of ketones. It is a gradual change, not a switch at a set hour.',
    feel: 'Hunger often eases or comes and goes. Some people notice steadier energy.',
    hue: '#F97316',
  },
  {
    id: 'ketone',
    from: 16,
    to: 24,
    name: 'Ketones rising',
    line: 'More ketones are in your blood',
    detail: 'Ketone levels climb. Cell clean-up processes such as autophagy are an active area of research, but how much happens in people at these times is not well established.',
    feel: 'Hunger is often manageable. Headaches, light-headedness and tiredness are common signs to eat or drink something.',
    hue: '#EA580C',
  },
  {
    id: 'deep',
    from: 24,
    to: Infinity,
    name: 'A longer fast',
    line: 'Beyond a day without food',
    detail: 'Ketones are higher and the body is conserving protein. Electrolytes (sodium, potassium, magnesium) matter more, and the risks are higher. This is where medical advice counts.',
    feel: 'It varies a lot. Dizziness, weakness, cold or palpitations are reasons to stop and break the fast.',
    hue: '#DC2626',
  },
];

export const stageAt = (hours: number): StageInfo => STAGES.find((s) => hours >= s.from && hours < s.to) ?? STAGES[STAGES.length - 1];

export const stageIndexAt = (hours: number): number => STAGES.findIndex((s) => hours >= s.from && hours < s.to);

/** The next stage and how long until it, or null in the last one. */
export const nextStage = (hours: number): { stage: StageInfo; inHours: number } | null => {
  const i = stageIndexAt(hours);
  const next = STAGES[i + 1];
  return next ? { stage: next, inHours: next.from - hours } : null;
};

// ---------------------------------------------------------------------------------------------
// Does it break a fast?
// ---------------------------------------------------------------------------------------------

export type Verdict = 'fine' | 'depends' | 'breaks';

export interface DrinkNote {
  id: string;
  label: string;
  verdict: Verdict;
  note: string;
}

export const VERDICTS: Record<Verdict, { label: string; color: string }> = {
  fine: { label: 'Fine', color: '#86EFAC' },
  depends: { label: 'Depends', color: '#FDE047' },
  breaks: { label: 'Breaks it', color: '#FCA5A5' },
};

export const WHAT_BREAKS: DrinkNote[] = [
  { id: 'water', label: 'Water and sparkling water', verdict: 'fine', note: 'Drink plenty. Thirst is often mistaken for hunger.' },
  { id: 'coffee', label: 'Black coffee', verdict: 'fine', note: 'No sugar, milk or cream. Caffeine can mask hunger and, on an empty stomach, upset some stomachs.' },
  { id: 'tea', label: 'Plain tea (green, black, herbal)', verdict: 'fine', note: 'Unsweetened and without milk.' },
  { id: 'salt', label: 'Salt, or electrolytes with no sugar or calories', verdict: 'fine', note: 'Helpful on longer fasts. Check the label for sugar and sweeteners.' },
  { id: 'milk-coffee', label: 'Coffee with a splash of milk or cream', verdict: 'depends', note: 'A few calories. Fine for a looser fast aimed at routine, not for a strict one.' },
  { id: 'broth', label: 'Bone or vegetable broth', verdict: 'depends', note: 'Has some calories and protein, so it strictly ends a fast. Some people use it to get through a long fast.' },
  { id: 'diet', label: 'Diet soda and zero-calorie sweeteners', verdict: 'depends', note: 'No calories, but evidence is mixed on whether sweet tastes raise cravings.' },
  { id: 'acv', label: 'Apple cider vinegar in water', verdict: 'depends', note: 'Only a few calories. Dilute it well, as it can irritate the throat and stomach.' },
  { id: 'gum', label: 'Sugar-free gum', verdict: 'depends', note: 'Almost no calories, but chewing can stir up hunger for some people.' },
  { id: 'vitamins', label: 'Plain vitamin or mineral capsules', verdict: 'depends', note: 'Usually fine, but some are best taken with food and can upset an empty stomach.' },
  { id: 'meds', label: 'Your regular medicines', verdict: 'depends', note: 'Take them as prescribed. If a medicine must be taken with food, or you use insulin or other diabetes medicines, ask your doctor before fasting.' },
  { id: 'gummies', label: 'Gummy vitamins, BCAAs, protein powder', verdict: 'breaks', note: 'They contain sugar, calories or protein.' },
  { id: 'juice', label: 'Juice, smoothies, soda, sweetened drinks', verdict: 'breaks', note: 'Sugar and calories. They raise blood sugar and end the fast.' },
  { id: 'milk', label: 'Milk, oat milk, creamers, lattes', verdict: 'breaks', note: 'Calories and sugars or protein.' },
  { id: 'alcohol', label: 'Alcohol', verdict: 'breaks', note: 'It has calories, hits harder on an empty stomach and dehydrates.' },
  { id: 'food', label: 'Any food, even a small snack', verdict: 'breaks', note: 'A bite ends the fast. If you ate, that is fine: log it and start again when you are ready.' },
];

// ---------------------------------------------------------------------------------------------
// Breaking a fast
// ---------------------------------------------------------------------------------------------

export interface RefeedStep {
  title: string;
  text: string;
}

export interface RefeedGuide {
  id: string;
  label: string;
  minHours: number;
  maxHours: number;
  steps: RefeedStep[];
  avoid: string[];
  care?: string;
}

export const REFEED: RefeedGuide[] = [
  {
    id: 'short',
    label: 'Under 16 hours',
    minHours: 0,
    maxHours: 16,
    steps: [
      { title: 'Start with water', text: 'A glass of water before you eat, and sit down to eat.' },
      { title: 'A normal, balanced meal', text: 'Protein, vegetables or fruit, and some whole grains or healthy fats. Eat at a normal pace.' },
    ],
    avoid: ['Eating very fast', 'A huge, sugary or very greasy first meal'],
  },
  {
    id: 'daily',
    label: '16 to 24 hours',
    minHours: 16,
    maxHours: 24,
    steps: [
      { title: 'Water first', text: 'Have a glass of water, and some salt or electrolytes if you have been fasting hard.' },
      { title: 'Start with something light', text: 'Protein and fiber: eggs, yogurt, a small salad or soup, cooked vegetables.' },
      { title: 'Wait, then eat properly', text: 'Give it 20 to 30 minutes, then have a regular balanced meal.' },
    ],
    avoid: ['Large sugary foods and drinks first thing', 'Very big portions at once', 'Alcohol on an empty stomach'],
  },
  {
    id: 'day',
    label: '24 to 36 hours',
    minHours: 24,
    maxHours: 36,
    steps: [
      { title: 'Drink and replace salts', text: 'Water, plus electrolytes or a little salt in broth.' },
      { title: 'A small, gentle meal', text: 'Soup, eggs, plain yogurt, cooked vegetables, a little rice or bread. Chew well.' },
      { title: 'Wait up to an hour', text: 'If you feel fine, follow with a regular meal. If you feel queasy, wait longer and eat less.' },
      { title: 'Eat normally next', text: 'Get back to regular meals over the next day.' },
    ],
    avoid: ['A large, rich or sugary meal straight away', 'Alcohol', 'Hard exercise right after eating'],
    care: 'If you feel unwell, dizzy or very weak afterwards, rest and talk to a doctor.',
  },
  {
    id: 'long',
    label: '36 to 48 hours',
    minHours: 36,
    maxHours: 48,
    steps: [
      { title: 'Go slowly', text: 'Start with water and electrolytes, then a very small portion of something plain and easy: broth, a few spoonfuls of cooked vegetables or rice.' },
      { title: 'Build up over hours', text: 'Add small portions every 30 to 60 minutes through the first few hours.' },
      { title: 'Rest', text: 'Take it easy for the rest of the day.' },
    ],
    avoid: ['Big meals', 'Sugary foods and drinks', 'Alcohol', 'Strenuous exercise'],
    care: 'After a long fast, very rarely, eating too much too fast can cause dangerous shifts in body salts. If you have symptoms such as swelling, a racing heart, severe weakness or confusion, get medical help.',
  },
];

export const refeedFor = (hours: number): RefeedGuide => REFEED.find((g) => hours >= g.minHours && hours < g.maxHours) ?? REFEED[REFEED.length - 1];

// ---------------------------------------------------------------------------------------------
// Hydration and salts, hunger, stop rules
// ---------------------------------------------------------------------------------------------

export const ELECTROLYTES = {
  why: 'When you are not eating, you also stop taking in salts (sodium, potassium, magnesium). On a longer fast, low salts are a common reason for headaches, cramps, light-headedness and fatigue.',
  tips: [
    'Drink water through the day, not all at once.',
    'A pinch of salt in water, or an electrolyte drink with no sugar, is what many people use on fasts over a day.',
    'Read the label: some electrolyte products contain sugar or calories.',
    'Follow the directions on any product. More is not better.',
  ],
  care: 'If you have kidney disease, high blood pressure, heart disease or take water tablets or blood-pressure medicines, ask your doctor before adding salt or potassium.',
};

export const HUNGER_TIPS: string[] = [
  'Hunger comes in waves. Most of the time, a wave rises, peaks and fades whether or not you eat.',
  'Have a glass of water or a cup of tea. Thirst and hunger can feel alike.',
  'Breathe slowly: in for four, out for six. It settles the stomach and the mind.',
  'Do something with your hands or go for a short walk. Ten minutes of anything else helps.',
  'Notice the hunger without fighting it. Where do you feel it? What does it do next?',
  'Remember your reason for fasting today, and that you can stop at any time.',
];

export const STOP_RULES = {
  stopNow: ['Fainting, or feeling about to faint', 'Confusion or trouble thinking', 'Chest pain or a racing, pounding or irregular heartbeat', 'Severe weakness or shakiness with sweating', 'Persistent vomiting', 'Severe stomach pain'],
  action: 'End the fast, sit or lie down, and drink water. Eat something light with a little sugar if you feel shaky. If it does not pass quickly, or any of the first four happen, get medical help.',
};

// ---------------------------------------------------------------------------------------------
// Before you start
// ---------------------------------------------------------------------------------------------

export interface ScreenQuestion {
  id: string;
  text: string;
  /** What to say when answered yes. */
  advice: string;
  /** A yes here means fasting is not for you, however it is framed. */
  stop: boolean;
}

export const SCREEN_QUESTIONS: ScreenQuestion[] = [
  { id: 'age', text: 'Are you under 18?', advice: 'Fasting is not recommended for children and teenagers, who are still growing.', stop: true },
  { id: 'pregnant', text: 'Are you pregnant, breastfeeding, or trying to conceive?', advice: 'Fasting is generally not advised in pregnancy or while breastfeeding. Please talk to your doctor or midwife.', stop: true },
  { id: 'ed', text: 'Have you ever had an eating disorder, or does food or weight take up a lot of your thoughts?', advice: 'Fasting can feed restrictive patterns. Please do not use fasting, and consider talking to your doctor or an eating-disorder service.', stop: true },
  { id: 'diabetes', text: 'Do you have diabetes, or take insulin or other medicines that lower blood sugar?', advice: 'Fasting can cause dangerous low blood sugar with these. Only fast under your doctor\'s guidance.', stop: false },
  { id: 'meds', text: 'Do you take medicines that must be taken with food, or are you on blood-pressure or water tablets?', advice: 'Ask your doctor or pharmacist how fasting fits with your medicines.', stop: false },
  { id: 'weight', text: 'Are you underweight (BMI under 18.5), or have you lost weight without trying?', advice: 'Fasting is not advised when underweight. Please see your doctor about unplanned weight loss.', stop: false },
  { id: 'health', text: 'Do you have a heart, kidney, liver or other long-term condition, a recent surgery, or are you frail or over 70?', advice: 'Please check with your doctor before fasting.', stop: false },
];

export const GENERAL_NOTE = 'This app tracks fasting. It does not give medical advice and is not a treatment. Fasting is not right for everyone. Stop at any time and eat if you feel unwell.';
