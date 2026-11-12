import { PhaseKind } from '../lib/breathing';

/**
 * Soft chimes for each part of the breath, made with the browser's own audio (no sound files, nothing downloaded). One tone for the
 * in-breath, a lower one for the out-breath and a quiet one for a hold, each fading away, so it can be followed with the eyes closed.
 */
let ctx: AudioContext | null = null;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Call from a tap (starting a session): browsers only let sound begin after one. */
export const prepareAudio = (): void => {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    void ctx.resume();
  } catch {
    // audio unavailable
  }
};

const FREQ: Record<PhaseKind, number> = { in: 392, topup: 440, hold: 330, out: 262 };
const LOUD: Record<PhaseKind, number> = { in: 0.16, topup: 0.12, hold: 0.07, out: 0.16 };

export const chime = (kind: PhaseKind, volume = 1): void => {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, LOUD[kind] * volume), now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    for (const [mult, level] of [[1, 1], [2, 0.18]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = FREQ[kind] * mult;
      g.gain.value = level;
      osc.connect(g);
      g.connect(gain);
      osc.start(now);
      osc.stop(now + 1.7);
    }
  } catch {
    // audio unavailable
  }
};

/** A slightly longer, lower tone for the end of a session. */
export const endChime = (): void => {
  chime('out', 1.3);
  window.setTimeout(() => chime('in', 1), 450);
};

/** A meditation bell: a low tone with a few softer partials, ringing for several seconds. */
export const bell = (volume = 1): void => {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.22 * volume), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);
    for (const [mult, level] of [[1, 1], [2.76, 0.35], [5.4, 0.14]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 220 * mult;
      g.gain.value = level;
      osc.connect(g);
      g.connect(gain);
      osc.start(now);
      osc.stop(now + 5.6);
    }
  } catch {
    // audio unavailable
  }
};

// ---- ambient sound: noise made on the spot and shaped, so there is nothing to download ----

type Kind = 'rain' | 'ocean' | 'wind' | 'brown';

let amb: { nodes: AudioNode[]; stop: () => void; gain: GainNode } | null = null;

const noiseBuffer = (c: AudioContext, kind: 'pink' | 'brown'): AudioBuffer => {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  return buf;
};

/** Starts a soft sound that loops until stopAmbient. Call after a tap (see prepareAudio). */
export const startAmbient = (kind: Kind, volume = 0.5): void => {
  stopAmbient();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const c = ctx;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, kind === 'rain' || kind === 'wind' ? 'pink' : 'brown');
    src.loop = true;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, c.currentTime);
    out.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.5 * volume), c.currentTime + 2);
    out.connect(c.destination);
    const nodes: AudioNode[] = [src, out];
    const stops: (() => void)[] = [() => src.stop()];
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = rate;
      g.gain.value = depth;
      o.connect(g);
      g.connect(target);
      o.start();
      nodes.push(o, g);
      stops.push(() => o.stop());
    };
    if (kind === 'rain') {
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(out);
      nodes.push(hp, lp);
    } else if (kind === 'ocean') {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      const swell = c.createGain();
      swell.gain.value = 0.6;
      src.connect(lp);
      lp.connect(swell);
      swell.connect(out);
      lfo(0.09, 0.4, swell.gain);
      nodes.push(lp, swell);
    } else if (kind === 'wind') {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 650;
      bp.Q.value = 0.7;
      src.connect(bp);
      bp.connect(out);
      lfo(0.07, 260, bp.frequency);
      nodes.push(bp);
    } else {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      src.connect(lp);
      lp.connect(out);
      nodes.push(lp);
    }
    src.start();
    amb = {
      nodes,
      gain: out,
      stop: () => {
        for (const s of stops) {
          try {
            s();
          } catch {
            // already stopped
          }
        }
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            // already disconnected
          }
        }
      },
    };
  } catch {
    // audio unavailable
  }
};

/** Fades the ambient sound out and stops it. */
export const stopAmbient = (): void => {
  if (!amb || !ctx) {
    amb = null;
    return;
  }
  const cur = amb;
  amb = null;
  try {
    cur.gain.gain.cancelScheduledValues(ctx.currentTime);
    cur.gain.gain.setValueAtTime(Math.max(0.0001, cur.gain.gain.value), ctx.currentTime);
    cur.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
  } catch {
    // ignore
  }
  window.setTimeout(() => cur.stop(), 1400);
};

/** Changes the loudness of what is playing. */
export const setAmbientVolume = (volume: number): void => {
  if (!amb || !ctx) return;
  try {
    amb.gain.gain.setTargetAtTime(Math.max(0.0002, 0.5 * volume), ctx.currentTime, 0.2);
  } catch {
    // ignore
  }
};
