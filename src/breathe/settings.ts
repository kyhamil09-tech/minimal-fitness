/** The cues for a breathing session, kept on the phone. */
export type Ambient = 'off' | 'rain' | 'ocean' | 'wind' | 'brown';

export const AMBIENTS: { id: Ambient; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'wind', label: 'Wind' },
  { id: 'brown', label: 'Soft hum' },
];

export interface BreatheSettings {
  /** A buzz at each part of the breath. */
  haptics: boolean;
  /** A soft chime at each part of the breath. */
  tones: boolean;
  /** A spoken cue for the first breaths. */
  voice: boolean;
  /** The screen goes black during a session (chimes and buzz carry it), tap to look. */
  eyesClosed: boolean;
  /** A soft sound under the session. */
  ambient: Ambient;
  /** 0 to 1. */
  ambientVolume: number;
  /** A bell to begin and end a silent or guided sit. */
  bells: boolean;
  /** A bell every this many minutes during a silent sit (0 for none). */
  bellEvery: 0 | 5 | 10;
}

export const DEFAULT_SETTINGS: BreatheSettings = { haptics: true, tones: false, voice: false, eyesClosed: false, ambient: 'off', ambientVolume: 0.5, bells: true, bellEvery: 0 };

/** Stored settings from before a setting existed lack it: fill the gaps with the defaults. */
export const withDefaults = (stored: Partial<BreatheSettings> | null | undefined): BreatheSettings => ({ ...DEFAULT_SETTINGS, ...(stored ?? {}) });
