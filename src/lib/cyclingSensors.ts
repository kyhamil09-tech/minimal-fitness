import { WorkoutSession } from '../types/health';

/**
 * Decodes Bluetooth cycling sensors and works out power numbers. The phone side (BleCyclingPlugin.java) only forwards the raw
 * bytes of each reading, so everything that can go wrong with the maths lives here, where it is tested.
 *
 *  - Cycling Speed and Cadence (0x2A5B): wheel and crank revolution counters with event times in 1/1024 s.
 *  - Cycling Power (0x2A63): instantaneous watts, optionally with crank revolutions (cadence) and wheel revolutions.
 */

export const hexToBytes = (hex: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
};

const u16 = (b: number[], o: number) => b[o] | (b[o + 1] << 8);
const s16 = (b: number[], o: number) => {
  const v = u16(b, o);
  return v & 0x8000 ? v - 0x10000 : v;
};
const u32 = (b: number[], o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export interface Counters {
  /** Cumulative revolutions and the time of the last event, in 1/1024 s (wheel events from a power meter use 1/2048 s). */
  wheelRevs?: number;
  wheelTime?: number;
  crankRevs?: number;
  crankTime?: number;
}

export const parseCsc = (b: number[]): Counters | null => {
  if (b.length < 1) return null;
  const flags = b[0];
  let o = 1;
  const out: Counters = {};
  if (flags & 0x01) {
    if (b.length < o + 6) return null;
    out.wheelRevs = u32(b, o);
    out.wheelTime = u16(b, o + 4);
    o += 6;
  }
  if (flags & 0x02) {
    if (b.length < o + 4) return null;
    out.crankRevs = u16(b, o);
    out.crankTime = u16(b, o + 2);
  }
  return out;
};

export interface PowerReading extends Counters {
  watts: number;
}

export const parsePower = (b: number[]): PowerReading | null => {
  if (b.length < 4) return null;
  const flags = u16(b, 0);
  const out: PowerReading = { watts: s16(b, 2) };
  let o = 4;
  if (flags & 0x01) o += 1; // pedal power balance
  if (flags & 0x04) o += 2; // accumulated torque
  if (flags & 0x10) {
    if (b.length < o + 6) return out;
    out.wheelRevs = u32(b, o);
    // Power meters count wheel time in 1/2048 s; scale to 1/1024 so one rule fits both.
    out.wheelTime = Math.round(u16(b, o + 4) / 2) & 0xffff;
    o += 6;
  }
  if (flags & 0x20) {
    if (b.length < o + 4) return out;
    out.crankRevs = u16(b, o);
    out.crankTime = u16(b, o + 2);
  }
  return out;
};

/** Difference of a counter that wraps at {@code mod}. */
const delta = (now: number, before: number, mod: number) => (now - before + mod) % mod;

export interface Live {
  powerW?: number;
  cadenceRpm?: number;
  speedKmh?: number;
}

/**
 * Turns successive readings into live numbers. Speed needs the wheel's rollout; cadence comes from whichever sensor reports crank
 * revolutions. A reading with no new crank or wheel event leaves that number as it was; the caller zeroes it when events stop.
 */
export class CyclingDecoder {
  private last: { crank?: [number, number]; wheel?: [number, number] } = {};
  private wheelM: number;
  live: Live = {};

  constructor(wheelMm = 2105) {
    this.wheelM = wheelMm / 1000;
  }

  setWheel(mm: number) {
    this.wheelM = mm / 1000;
  }

  reset() {
    this.last = {};
    this.live = {};
  }

  private counters(c: Counters) {
    if (c.crankRevs !== undefined && c.crankTime !== undefined) {
      const prev = this.last.crank;
      if (prev) {
        const dt = delta(c.crankTime, prev[1], 65536) / 1024;
        const dr = delta(c.crankRevs, prev[0], 65536);
        // A new event with revolutions in it; an old one repeats the same time.
        if (dt > 0 && dt < 5 && dr > 0 && dr < 20) this.live.cadenceRpm = Math.round((dr / dt) * 60);
        else if (dt > 0 && dr === 0 && dt < 5) this.live.cadenceRpm = 0;
      }
      if (!prev || c.crankTime !== prev[1] || c.crankRevs !== prev[0]) this.last.crank = [c.crankRevs, c.crankTime];
    }
    if (c.wheelRevs !== undefined && c.wheelTime !== undefined) {
      const prev = this.last.wheel;
      if (prev) {
        const dt = delta(c.wheelTime, prev[1], 65536) / 1024;
        const dr = delta(c.wheelRevs, prev[0], 0x100000000);
        if (dt > 0 && dt < 5 && dr < 200) this.live.speedKmh = Math.round(((dr * this.wheelM) / dt) * 3.6 * 10) / 10;
      }
      if (!prev || c.wheelTime !== prev[1] || c.wheelRevs !== prev[0]) this.last.wheel = [c.wheelRevs, c.wheelTime];
    }
  }

  /** Feed one notification. {@code char} is "2a63" (power) or "2a5b" (speed and cadence). */
  push(char: string, bytes: number[]): Live {
    if (char === '2a63') {
      const p = parsePower(bytes);
      if (p) {
        this.live.powerW = Math.max(0, p.watts);
        this.counters(p);
      }
    } else if (char === '2a5b') {
      const c = parseCsc(bytes);
      if (c) this.counters(c);
    }
    return { ...this.live };
  }
}

// ---------------------------------------------------------------------------------------------
// Power numbers for a ride
// ---------------------------------------------------------------------------------------------

export interface PowerSummary {
  avgW: number;
  maxW: number;
  /** Normalised power: the steady power that would cost the same, which weighs surges more than the plain average. */
  npW: number;
  /** Seconds of data. */
  seconds: number;
}

/** One-second power samples to an average, max and normalised power (30-second rolling mean, fourth power). */
export const summarizePower = (samples: number[]): PowerSummary | null => {
  const s = samples.filter((v) => Number.isFinite(v) && v >= 0 && v < 3000);
  if (s.length < 30) return null;
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  const roll: number[] = [];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum += s[i];
    if (i >= 30) sum -= s[i - 30];
    if (i >= 29) roll.push(sum / 30);
  }
  const np = Math.pow(roll.reduce((a, b) => a + b ** 4, 0) / roll.length, 0.25);
  return { avgW: Math.round(avg), maxW: Math.round(Math.max(...s)), npW: Math.round(np), seconds: s.length };
};

/** Training Stress Score: an hour at your threshold power scores 100. */
export const powerLoad = (npW: number, seconds: number, ftpW: number): number => {
  if (!(ftpW > 0) || !(npW > 0) || !(seconds > 0)) return 0;
  const intensity = npW / ftpW;
  return Math.round(((seconds * npW * intensity) / (ftpW * 3600)) * 100);
};

/** The best average over any {@code window} seconds, or null when the ride is shorter. */
export const bestAverage = (samples: number[], window: number): number | null => {
  if (samples.length < window) return null;
  let sum = 0;
  let best = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i];
    if (i >= window) sum -= samples[i - window];
    if (i >= window - 1) best = Math.max(best, sum / window);
  }
  return best;
};

/** Threshold power from your rides: 95 percent of the best 20-minute average, or 70 percent of the best hour-long normalised power. */
export const estimateFtp = (workouts: Pick<WorkoutSession, 'bestPower20W' | 'normPowerW' | 'durationSec' | 'durationMinutes'>[]): number | null => {
  const twenty = Math.max(0, ...workouts.map((w) => w.bestPower20W ?? 0));
  if (twenty > 0) return Math.round(twenty * 0.95);
  const long = workouts.filter((w) => (w.normPowerW ?? 0) > 0 && (w.durationSec ?? w.durationMinutes * 60) >= 40 * 60);
  if (long.length) return Math.round(Math.max(...long.map((w) => w.normPowerW as number)) * 0.9);
  return null;
};

export const POWER_ZONES = [
  { name: 'Recovery', from: 0, to: 0.55 },
  { name: 'Endurance', from: 0.55, to: 0.75 },
  { name: 'Tempo', from: 0.75, to: 0.9 },
  { name: 'Threshold', from: 0.9, to: 1.05 },
  { name: 'VO2 max', from: 1.05, to: 1.2 },
  { name: 'Anaerobic', from: 1.2, to: 99 },
] as const;

/** Seconds in each of the six power zones, as a share of FTP. */
export const powerZoneSeconds = (samples: number[], ftpW: number): number[] => {
  const out: number[] = POWER_ZONES.map(() => 0);
  if (!(ftpW > 0)) return out;
  for (const w of samples) {
    const r = w / ftpW;
    const i = POWER_ZONES.findIndex((z) => r >= z.from && r < z.to);
    if (i >= 0) out[i] += 1;
  }
  return out;
};
