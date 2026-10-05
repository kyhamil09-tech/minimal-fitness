/**
 * A tiny stick-figure rig for exercise demos. The figure faces right and is posed with absolute angles (degrees, 0 = straight up,
 * 90 = pointing right, 180 = down, 270 = left), so limb lengths never change while it moves between poses. One joint is pinned to
 * a fixed spot (the ankle for standing work, the hip for lying work, the wrist for hanging work) and everything else is
 * worked out from it.
 */
export type Pt = [number, number];

export interface Pose {
  /** Hip to shoulder. */
  torso: number;
  /** Head direction from the shoulder (defaults to the torso's). */
  head?: number;
  /** Near leg: hip to knee, knee to ankle. */
  thigh: number;
  shin: number;
  /** Far leg (defaults to the near leg). */
  thigh2?: number;
  shin2?: number;
  /** Ankle to toe (defaults to flat, pointing forward). */
  foot?: number;
  /** Arm: shoulder to elbow, elbow to wrist. */
  ua: number;
  fa: number;
  /** Which joint is pinned, and where it is in the picture. */
  root?: 'ankle' | 'hip' | 'wrist';
  at?: Pt;
  /** Shoulders raised by this many units (a shrug). */
  lift?: number;
}

export interface Joints {
  head: Pt;
  neck: Pt;
  shoulder: Pt;
  elbow: Pt;
  wrist: Pt;
  hip: Pt;
  knee: Pt;
  ankle: Pt;
  toe: Pt;
  knee2: Pt;
  ankle2: Pt;
  toe2: Pt;
}

export const L = { thigh: 32, shin: 30, torso: 40, ua: 20, fa: 19, foot: 11, neck: 5, headR: 7 } as const;
export const FLOOR = 153;

const vec = (deg: number, len: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r) * len, -Math.cos(r) * len];
};
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

const DEFAULT_AT: Record<NonNullable<Pose['root']>, Pt> = { ankle: [95, 150], hip: [95, 100], wrist: [100, 18] };

/** Works out every joint's position for a pose. */
export const solve = (p: Pose): Joints => {
  const hip: Pt = [0, 0];
  const knee = add(hip, vec(p.thigh, L.thigh));
  const ankle = add(knee, vec(p.shin, L.shin));
  const toe = add(ankle, vec(p.foot ?? 90, L.foot));
  const knee2 = add(hip, vec(p.thigh2 ?? p.thigh, L.thigh));
  const ankle2 = add(knee2, vec(p.shin2 ?? p.shin, L.shin));
  const toe2 = add(ankle2, vec(p.foot ?? 90, L.foot));
  const shoulder = add(add(hip, vec(p.torso, L.torso)), [0, -(p.lift ?? 0)]);
  const elbow = add(shoulder, vec(p.ua, L.ua));
  const wrist = add(elbow, vec(p.fa, L.fa));
  const neck = add(shoulder, vec(p.head ?? p.torso, L.neck));
  const head = add(neck, vec(p.head ?? p.torso, L.headR));

  const root = p.root ?? 'ankle';
  const anchor = p.at ?? DEFAULT_AT[root];
  const pinned = root === 'ankle' ? ankle : root === 'wrist' ? wrist : hip;
  const d: Pt = [anchor[0] - pinned[0], anchor[1] - pinned[1]];
  const mv = (q: Pt): Pt => [q[0] + d[0], q[1] + d[1]];
  return {
    head: mv(head), neck: mv(neck), shoulder: mv(shoulder), elbow: mv(elbow), wrist: mv(wrist), hip: mv(hip),
    knee: mv(knee), ankle: mv(ankle), toe: mv(toe), knee2: mv(knee2), ankle2: mv(ankle2), toe2: mv(toe2),
  };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A pose a fraction t of the way from a to b. Angles blend numerically (so 180 to 20 sweeps through 100, the way an arm curls). */
export const blend = (a: Pose, b: Pose, t: number): Pose => {
  const num = (x: number | undefined, y: number | undefined, fallback: number) => lerp(x ?? fallback, y ?? fallback, t);
  const rootA = a.root ?? 'ankle';
  const atA = a.at ?? DEFAULT_AT[rootA];
  const atB = b.at ?? DEFAULT_AT[b.root ?? rootA];
  return {
    torso: lerp(a.torso, b.torso, t),
    head: a.head === undefined && b.head === undefined ? undefined : lerp(a.head ?? a.torso, b.head ?? b.torso, t),
    thigh: lerp(a.thigh, b.thigh, t),
    shin: lerp(a.shin, b.shin, t),
    thigh2: lerp(a.thigh2 ?? a.thigh, b.thigh2 ?? b.thigh, t),
    shin2: lerp(a.shin2 ?? a.shin, b.shin2 ?? b.shin, t),
    foot: num(a.foot, b.foot, 90),
    ua: lerp(a.ua, b.ua, t),
    fa: lerp(a.fa, b.fa, t),
    root: rootA,
    at: [lerp(atA[0], atB[0], t), lerp(atA[1], atB[1], t)],
    lift: num(a.lift, b.lift, 0),
  };
};

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The pose at a moment in a looping animation. The frames play in order and back again (a rep goes down and comes up), with each
 * leg of the trip eased and a short pause at the ends.
 */
export const poseAt = (frames: Pose[], loopMs: number, nowMs: number, oneWay = false): Pose => {
  if (frames.length === 1) return frames[0];
  const n = frames.length;
  // Timeline positions: 0..1 over the whole cycle. For ping-pong the cycle is out and back; for a one-way loop it wraps.
  const cycle = (nowMs % loopMs) / loopMs;
  const steps = oneWay ? n : 2 * (n - 1);
  const x = cycle * steps;
  const seg = Math.min(steps - 1, Math.floor(x));
  const local = x - seg;
  // Hold for the first 15% of each leg and ease the rest, so the ends read as a pause.
  const t = ease(Math.min(1, Math.max(0, (local - 0.15) / 0.85)));
  const idx = (s: number) => (oneWay ? s % n : s < n ? s : 2 * (n - 1) - s);
  const from = frames[idx(seg)];
  const to = frames[idx(seg + 1)];
  return blend(from, to, t);
};
