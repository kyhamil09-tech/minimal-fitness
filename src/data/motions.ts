import { Pose, Pt } from '../lib/figure';

/**
 * The movement patterns behind the exercise demos. Each exercise in data/exercises.ts points at one pattern: a squat of any kind
 * plays the squat, a curl of any kind plays the curl. The figure is a stylised side view, so it shows what moves and where, with
 * three coaching cues, not a filmed demonstration.
 */
export type Prop = 'barbell' | 'dumbbell' | 'kettlebell' | 'handle' | 'none';

export type Shape = { t: 'line'; a: Pt; b: Pt; w?: number } | { t: 'circle'; c: Pt; r: number };

export interface Motion {
  frames: Pose[];
  /** Frames play in order and loop (burpee) instead of going out and back. */
  oneWay?: boolean;
  /** Scenery: bench, bar, seat. The floor is always drawn. */
  shapes?: Shape[];
  /** A cable runs from the hand to this point. */
  pulley?: Pt;
  prop: Prop;
  /** Three short cues: how to set up, how to move, what to watch for. */
  cues: [string, string, string];
  /** Shown under the figure when the side view cannot show the whole movement. */
  note?: string;
  /** A hold (plank, wall sit): the figure breathes instead of repping. */
  hold?: boolean;
}

export type PatternId =
  | 'squat' | 'squatfront' | 'deadlift' | 'rdl' | 'lunge' | 'legpress' | 'legext' | 'legcurl' | 'calf' | 'bridge' | 'wallsit'
  | 'bench' | 'incline' | 'fly' | 'crossover' | 'pushup' | 'dip' | 'seatedpress'
  | 'ohp' | 'raise' | 'facepull' | 'shrug' | 'uprightrow'
  | 'row' | 'seatedrow' | 'pulldown' | 'pullup' | 'superman'
  | 'curl' | 'pushdown' | 'skull' | 'ohext' | 'kickback'
  | 'plank' | 'crunch' | 'legraise' | 'hangraise' | 'climber' | 'deadbug' | 'rollout' | 'kneelcrunch' | 'twist' | 'pallof'
  | 'carry' | 'swing' | 'cleanpress' | 'thruster' | 'burpee' | 'slam' | 'donkey';

const S = { torso: 0, thigh: 180, shin: 180, ua: 180, fa: 180 };
const line = (a: Pt, b: Pt, w = 3): Shape => ({ t: 'line', a, b, w });
// Lying on a flat bench: hip at (90,119), thighs level, shins down to the floor.
const BENCH: Shape[] = [line([62, 126], [172, 126], 6), line([70, 126], [70, 153], 2), line([164, 126], [164, 153], 2)];
const LYING = { thigh: 270, shin: 180, torso: 90, root: 'hip' as const, at: [92, 119] as Pt };

export const MOTIONS: Record<PatternId, Motion> = {
  squat: {
    frames: [{ ...S, ua: 190, fa: 20 }, { torso: 35, thigh: 100, shin: 205, ua: 190, fa: 20 }],
    prop: 'barbell',
    cues: ['Feet about shoulder width, bar across your upper back, chest up.', 'Sit down and back, knees tracking over your toes, until your thighs are about level.', 'Keep your heels down and drive up through the whole foot.'],
  },
  squatfront: {
    frames: [{ ...S, ua: 120, fa: 330 }, { torso: 15, thigh: 100, shin: 205, ua: 120, fa: 330 }],
    prop: 'dumbbell',
    cues: ['Hold the weight at your chest with your elbows pointing forward.', 'Squat straight down between your knees, keeping your chest tall.', 'Do not let the weight pull you forward. Stand up fully at the top.'],
  },
  deadlift: {
    frames: [{ torso: 60, thigh: 140, shin: 190, ua: 180, fa: 180 }, { ...S, torso: 5 }],
    prop: 'barbell',
    cues: ['Bar over mid-foot, hips back, back flat, arms straight down.', 'Push the floor away, then bring your hips forward once the bar passes your knees.', 'Keep the bar against your legs and never round your lower back.'],
  },
  rdl: {
    frames: [S, { torso: 70, thigh: 165, shin: 185, ua: 180, fa: 180 }],
    prop: 'barbell',
    cues: ['Stand tall with a slight bend in your knees and the weight at your thighs.', 'Push your hips straight back and slide the weight down your legs.', 'Stop when you feel your hamstrings stretch, then squeeze your glutes to stand.'],
    note: 'Back extensions and good mornings use the same hip hinge.',
  },
  lunge: {
    frames: [S, { torso: 0, thigh: 90, shin: 180, thigh2: 200, shin2: 270, ua: 180, fa: 180 }],
    prop: 'dumbbell',
    cues: ['Stand tall and take a long step forward.', 'Lower straight down until both knees are bent about 90 degrees.', 'Keep your front knee over your ankle and push through your front heel to stand.'],
  },
  legpress: {
    frames: [
      { root: 'hip', at: [60, 118], torso: 305, thigh: 55, shin: 55, ua: 120, fa: 120 },
      { root: 'hip', at: [60, 118], torso: 305, thigh: 15, shin: 105, ua: 120, fa: 120 },
    ],
    shapes: [line([36, 100], [66, 130], 6), line([40, 128], [100, 128], 3)],
    prop: 'none',
    cues: ['Sit back into the pad with your feet shoulder width on the platform.', 'Lower until your knees are bent about 90 degrees, then press the platform away.', 'Never lock your knees hard at the top, and keep your hips and lower back on the pad.'],
  },
  legext: {
    frames: [
      { root: 'hip', at: [85, 115], torso: 5, thigh: 90, shin: 180, ua: 160, fa: 100 },
      { root: 'hip', at: [85, 115], torso: 5, thigh: 90, shin: 92, ua: 160, fa: 100 },
    ],
    shapes: [line([70, 124], [112, 124], 5), line([76, 70], [76, 124], 4)],
    prop: 'none',
    cues: ['Sit back with the pad resting just above your ankles.', 'Straighten your legs until they are level, pause, and squeeze your thighs.', 'Lower slowly and do not swing the weight up.'],
  },
  legcurl: {
    frames: [
      { root: 'hip', at: [112, 133], torso: 90, thigh: 270, shin: 270, ua: 90, fa: 90 },
      { root: 'hip', at: [112, 133], torso: 90, thigh: 270, shin: 345, ua: 90, fa: 90 },
    ],
    shapes: [line([60, 141], [170, 141], 6)],
    prop: 'none',
    cues: ['Lie face down with the pad just above your heels.', 'Curl your heels toward your glutes.', 'Keep your hips pressed down and lower slowly.'],
    note: 'Seated leg curls use the same movement.',
  },
  calf: {
    frames: [
      { ...S, at: [95, 150], foot: 90 },
      { ...S, at: [95, 142], foot: 130 },
    ],
    prop: 'dumbbell',
    cues: ['Stand with the balls of your feet on the floor or a step.', 'Rise as high as you can onto your toes and pause.', 'Lower fully so you feel a stretch, and keep your knees almost straight.'],
  },
  bridge: {
    frames: [
      { root: 'ankle', at: [60, 150], torso: 88, thigh: 320, shin: 205, ua: 90, fa: 90 },
      { root: 'ankle', at: [60, 150], torso: 108, thigh: 292, shin: 190, ua: 90, fa: 90 },
    ],
    prop: 'none',
    cues: ['Lie on your back with your knees bent and your feet flat.', 'Press through your heels and lift your hips until your body is a straight line from shoulders to knees.', 'Squeeze your glutes at the top and do not arch your lower back.'],
    note: 'Hip thrusts use the same movement with your upper back on a bench.',
  },
  wallsit: {
    frames: [{ root: 'ankle', at: [80, 150], torso: 0, thigh: 90, shin: 180, ua: 160, fa: 100 }],
    shapes: [line([43, 50], [43, 153], 5)],
    hold: true,
    prop: 'none',
    cues: ['Put your back flat against a wall and slide down.', 'Stop when your thighs are level with your knees over your ankles.', 'Hold, breathe steadily, and keep your whole back on the wall.'],
  },
  bench: {
    frames: [
      { ...LYING, ua: 0, fa: 0 },
      { ...LYING, ua: 235, fa: 5 },
    ],
    shapes: BENCH,
    prop: 'barbell',
    cues: ['Lie with your eyes under the bar, feet flat and shoulder blades pulled together.', 'Lower the weight to your mid-chest, then press it straight up.', 'Keep your wrists stacked over your elbows and your feet planted.'],
  },
  incline: {
    frames: [
      { root: 'hip', at: [85, 118], torso: 60, thigh: 280, shin: 190, ua: 10, fa: 10 },
      { root: 'hip', at: [85, 118], torso: 60, thigh: 280, shin: 190, ua: 215, fa: 15 },
    ],
    shapes: [line([76, 124], [112, 124], 5), line([80, 124], [118, 70], 6)],
    prop: 'dumbbell',
    cues: ['Set the bench to a low incline and sit back with your shoulder blades pinched.', 'Lower the weights to your upper chest, then press up and slightly back.', 'Do not let your shoulders roll forward at the top.'],
  },
  fly: {
    frames: [
      { ...LYING, ua: 235, fa: 235 },
      { ...LYING, ua: 5, fa: 5 },
    ],
    shapes: BENCH,
    prop: 'dumbbell',
    note: 'In real life your arms travel out to the sides, which a side view cannot show.',
    cues: ['Lie on the bench with the weights above your chest and a slight bend in your elbows.', 'Open your arms in a wide arc until you feel a stretch across your chest.', 'Bring the weights back together like hugging a tree, without letting your elbows straighten.'],
  },
  crossover: {
    frames: [
      { ...S, torso: 15, thigh: 170, shin: 190, ua: 245, fa: 245 },
      { ...S, torso: 15, thigh: 170, shin: 190, ua: 125, fa: 125 },
    ],
    pulley: [60, 18],
    prop: 'handle',
    note: 'The handles travel in from the sides, which a side view cannot show.',
    cues: ['Stand in a split stance with a slight lean and the handles out to your sides.', 'Sweep your hands together in front of your chest in a hugging arc.', 'Keep a soft bend in your elbows and squeeze your chest at the end.'],
  },
  pushup: {
    frames: [
      { root: 'ankle', at: [48, 142], foot: 140, torso: 76, thigh: 256, shin: 256, ua: 180, fa: 180 },
      { root: 'ankle', at: [48, 142], foot: 140, torso: 88, thigh: 268, shin: 268, ua: 240, fa: 150 },
    ],
    prop: 'none',
    cues: ['Hands under your shoulders, body in one straight line from head to heels.', 'Lower your chest to just above the floor with your elbows about 45 degrees from your body.', 'Push the floor away and do not let your hips sag or pike.'],
    note: 'Knee, incline and wide push-ups use the same movement.',
  },
  dip: {
    frames: [
      { root: 'wrist', at: [100, 62], torso: 0, thigh: 215, shin: 270, ua: 180, fa: 180 },
      { root: 'wrist', at: [100, 62], torso: 15, thigh: 215, shin: 270, ua: 270, fa: 0 },
    ],
    shapes: [line([84, 62], [118, 62], 5), line([101, 62], [101, 153], 3)],
    prop: 'none',
    cues: ['Support yourself on straight arms with your shoulders pulled down.', 'Lower until your elbows are about 90 degrees, leaning slightly forward for the chest.', 'Press back up without shrugging, and stop if your shoulders hurt.'],
  },
  seatedpress: {
    frames: [
      { root: 'hip', at: [85, 118], torso: 0, thigh: 90, shin: 180, ua: 255, fa: 85 },
      { root: 'hip', at: [85, 118], torso: 0, thigh: 90, shin: 180, ua: 92, fa: 92 },
    ],
    shapes: [line([72, 126], [112, 126], 5), line([76, 70], [76, 126], 5)],
    prop: 'handle',
    cues: ['Adjust the seat so the handles are at mid-chest height.', 'Press the handles straight out until your arms are almost straight.', 'Keep your back on the pad and return slowly.'],
  },
  ohp: {
    frames: [
      { ...S, ua: 140, fa: 340 },
      { ...S, ua: 4, fa: 4 },
    ],
    prop: 'barbell',
    cues: ['Hold the weight at your shoulders with your elbows just in front of the bar.', 'Press straight up, moving your head through as the weight passes your face.', 'Squeeze your glutes and ribs down so you do not lean back.'],
  },
  raise: {
    frames: [
      { ...S },
      { ...S, ua: 95, fa: 95 },
    ],
    prop: 'dumbbell',
    note: 'Lateral raises lift out to the sides, which a side view cannot show.',
    cues: ['Stand tall with a light weight in each hand and a slight bend in your elbows.', 'Raise your arms until they are level with your shoulders.', 'Lead with your elbows, do not swing, and lower slowly.'],
  },
  facepull: {
    frames: [
      { ...S, ua: 90, fa: 90 },
      { ...S, ua: 265, fa: 45 },
    ],
    pulley: [185, 70],
    prop: 'handle',
    cues: ['Set the cable at face height and hold the rope with your arms straight.', 'Pull the rope toward your face, splitting it apart with your elbows high.', 'Squeeze your shoulder blades together and keep your ribs down.'],
  },
  shrug: {
    frames: [{ ...S, lift: 0 }, { ...S, lift: 9 }],
    prop: 'dumbbell',
    cues: ['Stand tall holding the weights at your sides.', 'Lift your shoulders straight up toward your ears and pause.', 'Lower slowly and do not roll your shoulders.'],
  },
  uprightrow: {
    frames: [
      { ...S },
      { ...S, ua: 45, fa: 200 },
    ],
    prop: 'barbell',
    cues: ['Hold the bar with your hands about shoulder width apart.', 'Pull it up along your body, leading with your elbows, to about chest height.', 'Keep it close and stop if your shoulders pinch.'],
  },
  row: {
    frames: [
      { root: 'ankle', torso: 65, thigh: 160, shin: 190, ua: 180, fa: 180 },
      { root: 'ankle', torso: 65, thigh: 160, shin: 190, ua: 280, fa: 185 },
    ],
    prop: 'barbell',
    cues: ['Hinge forward with a flat back and the weight hanging below your shoulders.', 'Pull the weight to your lower ribs, driving your elbows behind you.', 'Keep your torso still and squeeze your shoulder blades together.'],
    note: 'Rear-delt flies and inverted rows pull the same way.',
  },
  seatedrow: {
    frames: [
      { root: 'hip', at: [85, 120], torso: 5, thigh: 90, shin: 100, ua: 90, fa: 90 },
      { root: 'hip', at: [85, 120], torso: 5, thigh: 90, shin: 100, ua: 250, fa: 90 },
    ],
    shapes: [line([70, 128], [100, 128], 5)],
    pulley: [185, 120],
    prop: 'handle',
    cues: ['Sit tall with your knees slightly bent and your arms straight.', 'Pull the handle to your stomach, bringing your elbows back past your torso.', 'Keep your chest up, then let your arms straighten under control.'],
  },
  pulldown: {
    frames: [
      { root: 'hip', at: [92, 122], torso: 354, thigh: 85, shin: 180, ua: 8, fa: 8 },
      { root: 'hip', at: [92, 122], torso: 354, thigh: 85, shin: 180, ua: 215, fa: 22 },
    ],
    shapes: [line([84, 130], [116, 130], 5)],
    pulley: [118, 6],
    prop: 'handle',
    cues: ['Sit with your thighs under the pad and reach up to the bar.', 'Pull the bar down to your upper chest, driving your elbows down and back.', 'Lean back only slightly and control the bar on the way up.'],
  },
  pullup: {
    frames: [
      { root: 'wrist', at: [100, 22], torso: 0, thigh: 190, shin: 225, ua: 0, fa: 0 },
      { root: 'wrist', at: [100, 22], torso: 0, thigh: 190, shin: 225, ua: 195, fa: 5, head: 12 },
    ],
    shapes: [line([70, 22], [130, 22], 5)],
    prop: 'none',
    cues: ['Hang from the bar with your shoulders pulled down away from your ears.', 'Pull your chest toward the bar by driving your elbows down.', 'Lower all the way under control. Do not kick or swing.'],
  },
  superman: {
    frames: [
      { root: 'hip', at: [100, 144], torso: 90, thigh: 270, shin: 270, ua: 90, fa: 90 },
      { root: 'hip', at: [100, 144], torso: 74, thigh: 282, shin: 285, ua: 74, fa: 74 },
    ],
    shapes: [],
    prop: 'none',
    cues: ['Lie face down with your arms reaching forward.', 'Lift your arms, chest and legs off the floor together.', 'Keep your neck long, pause for a second, and lower slowly.'],
  },
  curl: {
    frames: [{ ...S }, { ...S, fa: 20 }],
    prop: 'dumbbell',
    cues: ['Stand tall with your elbows pinned to your sides.', 'Curl the weight up toward your shoulders.', 'Do not swing your body, and lower fully under control.'],
  },
  pushdown: {
    frames: [
      { ...S, torso: 5, ua: 180, fa: 55 },
      { ...S, torso: 5, ua: 180, fa: 180 },
    ],
    pulley: [118, 10],
    prop: 'handle',
    cues: ['Stand close to the cable with your elbows tucked at your sides.', 'Press the handle down until your arms are straight.', 'Keep your elbows still and let the handle rise slowly.'],
  },
  skull: {
    frames: [
      { ...LYING, ua: 0, fa: 0 },
      { ...LYING, ua: 0, fa: 112 },
    ],
    shapes: BENCH,
    prop: 'barbell',
    cues: ['Lie on the bench with the weight held above your chest and your elbows pointing up.', 'Bend only at the elbows to lower the weight toward your forehead.', 'Keep your upper arms still, then extend back to the top.'],
  },
  ohext: {
    frames: [
      { ...S, ua: 0, fa: 0 },
      { ...S, ua: 0, fa: 205 },
    ],
    prop: 'dumbbell',
    cues: ['Hold one weight overhead with both hands and your elbows pointing up.', 'Lower the weight behind your head by bending your elbows.', 'Keep your upper arms close to your ears and extend back to the top.'],
  },
  kickback: {
    frames: [
      { root: 'ankle', torso: 70, thigh: 160, shin: 190, ua: 270, fa: 180 },
      { root: 'ankle', torso: 70, thigh: 160, shin: 190, ua: 270, fa: 270 },
    ],
    prop: 'dumbbell',
    cues: ['Hinge forward with your upper arm held parallel to your body.', 'Straighten your elbow to push the weight back.', 'Keep your upper arm still and squeeze your triceps at the end.'],
  },
  plank: {
    frames: [
      { root: 'ankle', at: [50, 143], foot: 140, torso: 80, thigh: 260, shin: 260, ua: 180, fa: 92 },
      { root: 'ankle', at: [50, 143], foot: 140, torso: 82, thigh: 262, shin: 262, ua: 180, fa: 92 },
    ],
    hold: true,
    prop: 'none',
    cues: ['Rest on your forearms with your elbows under your shoulders.', 'Make a straight line from your head to your heels and squeeze your glutes and abs.', 'Breathe steadily. Stop when your hips start to sag.'],
    note: 'Side planks and shoulder taps are variations of this hold.',
  },
  crunch: {
    frames: [
      { root: 'hip', at: [100, 147], torso: 90, thigh: 310, shin: 200, ua: 20, fa: 140 },
      { root: 'hip', at: [100, 147], torso: 55, thigh: 310, shin: 200, ua: 20, fa: 140 },
    ],
    prop: 'none',
    cues: ['Lie on your back with your knees bent and your hands by your head.', 'Curl your ribs toward your hips, lifting only your shoulder blades.', 'Do not pull on your neck, and lower slowly.'],
  },
  legraise: {
    frames: [
      { root: 'hip', at: [118, 147], torso: 90, thigh: 272, shin: 272, ua: 270, fa: 270 },
      { root: 'hip', at: [118, 147], torso: 90, thigh: 358, shin: 358, ua: 270, fa: 270 },
    ],
    prop: 'none',
    cues: ['Lie flat with your legs straight and your lower back pressed down.', 'Raise your legs until they point at the ceiling.', 'Lower slowly and stop before your back arches.'],
  },
  hangraise: {
    frames: [
      { root: 'wrist', at: [100, 12], torso: 0, thigh: 180, shin: 195, ua: 0, fa: 0 },
      { root: 'wrist', at: [100, 12], torso: 0, thigh: 88, shin: 100, ua: 0, fa: 0 },
    ],
    shapes: [line([70, 12], [130, 12], 5)],
    prop: 'none',
    cues: ['Hang from the bar with your shoulders engaged.', 'Raise your legs, tilting your pelvis up, until they are about level.', 'Lower without swinging.'],
  },
  climber: {
    frames: [
      { root: 'ankle', at: [48, 142], foot: 140, torso: 78, thigh: 258, shin: 258, thigh2: 258, shin2: 258, ua: 180, fa: 180 },
      { root: 'ankle', at: [48, 142], foot: 140, torso: 78, thigh: 258, shin: 258, thigh2: 105, shin2: 235, ua: 180, fa: 180 },
    ],
    prop: 'none',
    cues: ['Start in a high plank with your hands under your shoulders.', 'Drive one knee toward your chest, then switch legs quickly.', 'Keep your hips level and your core tight.'],
  },
  deadbug: {
    frames: [
      { root: 'hip', at: [100, 133], torso: 90, thigh: 0, shin: 270, ua: 0, fa: 0 },
      { root: 'hip', at: [100, 133], torso: 90, thigh: 285, shin: 275, thigh2: 0, shin2: 270, ua: 85, fa: 85 },
    ],
    prop: 'none',
    cues: ['Lie on your back with your arms up and your knees bent over your hips.', 'Lower one arm overhead and the opposite leg toward the floor.', 'Keep your lower back pressed down, then switch sides.'],
  },
  rollout: {
    frames: [
      { root: 'ankle', at: [60, 150], torso: 0, thigh: 180, shin: 270, ua: 170, fa: 170 },
      { root: 'ankle', at: [60, 150], torso: 76, thigh: 200, shin: 270, ua: 85, fa: 85 },
    ],
    prop: 'handle',
    cues: ['Kneel with the wheel just in front of you and your core braced.', 'Roll forward slowly until your body is nearly straight.', 'Pull back using your abs, not your hips, and stop before your back sags.'],
  },
  kneelcrunch: {
    frames: [
      { root: 'ankle', at: [60, 150], torso: 5, thigh: 180, shin: 270, ua: 30, fa: 120 },
      { root: 'ankle', at: [60, 150], torso: 62, thigh: 180, shin: 270, ua: 30, fa: 120 },
    ],
    pulley: [100, 6],
    prop: 'handle',
    cues: ['Kneel under the cable holding the rope at your head.', 'Curl your ribs down toward your hips.', 'Move at your spine, not your hips, and return with control.'],
  },
  twist: {
    frames: [
      { root: 'hip', at: [100, 135], torso: 330, thigh: 55, shin: 125, ua: 45, fa: 60 },
      { root: 'hip', at: [100, 135], torso: 330, thigh: 55, shin: 125, ua: 105, fa: 110 },
    ],
    prop: 'dumbbell',
    note: 'The twist turns your torso side to side, which a side view cannot show.',
    cues: ['Sit leaning back with your feet lifted and your chest tall.', 'Rotate your torso to bring the weight beside each hip.', 'Turn your ribs, not just your arms, and keep your back long.'],
  },
  pallof: {
    frames: [
      { ...S, ua: 170, fa: 70 },
      { ...S, ua: 90, fa: 90 },
    ],
    pulley: [185, 100],
    prop: 'handle',
    cues: ['Stand side-on to the cable with the handle at your chest.', 'Press it straight out and hold for a second.', 'Do not let the cable twist you. Resist it with your core.'],
  },
  carry: {
    frames: [
      { root: 'hip', at: [100, 88], torso: 0, thigh: 160, shin: 170, thigh2: 205, shin2: 235, ua: 180, fa: 180 },
      { root: 'hip', at: [100, 88], torso: 0, thigh: 205, shin: 235, thigh2: 160, shin2: 170, ua: 180, fa: 180 },
    ],
    prop: 'dumbbell',
    cues: ['Pick up heavy weights and stand tall with your shoulders back.', 'Walk with short, quick steps and keep your core braced.', 'Do not lean or let the weights swing.'],
  },
  swing: {
    frames: [
      { root: 'ankle', torso: 58, thigh: 150, shin: 190, ua: 200, fa: 200 },
      { ...S, torso: 3, ua: 90, fa: 90 },
    ],
    prop: 'kettlebell',
    cues: ['Hike the bell back between your legs with your hips pushed back.', 'Snap your hips forward so the bell floats to chest height.', 'The power comes from your hips, not your arms. Keep your back flat.'],
  },
  cleanpress: {
    frames: [
      { ...S },
      { ...S, ua: 140, fa: 340 },
      { ...S, ua: 4, fa: 4 },
    ],
    prop: 'dumbbell',
    cues: ['Start with the weights at your sides and a flat back.', 'Pull them up to your shoulders in one smooth motion, then press overhead.', 'Lower to your shoulders and then back down with control.'],
  },
  thruster: {
    frames: [
      { torso: 15, thigh: 100, shin: 205, ua: 140, fa: 340 },
      { ...S, ua: 4, fa: 4 },
    ],
    prop: 'barbell',
    cues: ['Hold the weight at your shoulders and squat down.', 'Drive up out of the squat and press the weight overhead in one motion.', 'Lower it back to your shoulders as you squat again.'],
  },
  burpee: {
    oneWay: true,
    frames: [
      { ...S, ua: 180, fa: 180 },
      { torso: 45, thigh: 100, shin: 205, ua: 180, fa: 180 },
      { root: 'ankle', at: [48, 142], foot: 140, torso: 78, thigh: 258, shin: 258, ua: 180, fa: 180 },
      { torso: 45, thigh: 100, shin: 205, ua: 180, fa: 180 },
      { ...S, ua: 10, fa: 10, at: [95, 138] },
    ],
    prop: 'none',
    cues: ['Squat down and place your hands on the floor.', 'Jump or step your feet back into a plank, and add a push-up if you like.', 'Jump your feet back in, then jump up with your arms overhead.'],
  },
  slam: {
    frames: [
      { ...S, ua: 4, fa: 4, at: [95, 150] },
      { torso: 40, thigh: 150, shin: 190, ua: 150, fa: 165 },
    ],
    prop: 'kettlebell',
    cues: ['Lift the ball overhead, rising onto your toes.', 'Slam it down hard in front of your feet, bending at your hips and knees.', 'Pick it up with a flat back and repeat.'],
  },
  donkey: {
    frames: [
      { root: 'hip', at: [95, 118], torso: 86, thigh: 180, shin: 270, thigh2: 180, shin2: 270, ua: 180, fa: 180 },
      { root: 'hip', at: [95, 118], torso: 86, thigh: 180, shin: 270, thigh2: 255, shin2: 355, ua: 180, fa: 180 },
    ],
    prop: 'none',
    cues: ['Start on your hands and knees with a flat back.', 'Kick one heel up toward the ceiling, keeping your knee bent.', 'Squeeze your glute at the top and do not arch your lower back.'],
  },
};
